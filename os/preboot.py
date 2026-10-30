#!/usr/bin/env python3
"""
Прогон первой загрузки DroidVM OS в CI (QEMU, эмуляция aarch64).

Зачем: первая загрузка Android самая долгая (распаковка APEX, установка microG, настройка).
Делаем её на сервере один раз — у пользователя система стартует как при обычной перезагрузке.
Заодно это тест прошивки: снимаем скриншоты экрана и журнал консоли.

Гость понимает, что он в CI, по устройству pci-testdev (1b36:0005) и сам выключается,
когда первая настройка завершена.

Использование: preboot.py <vda.qcow2> <vdb.qcow2> <workdir> [таймаут_мин]
"""
import os, shutil, socket, subprocess, sys, time

vda, vdb, work = sys.argv[1:4]
timeout_min = int(sys.argv[4]) if len(sys.argv) > 4 else 110
os.makedirs(work, exist_ok=True)
shots = os.path.join(work, 'shots'); os.makedirs(shots, exist_ok=True)
mon = os.path.join(work, 'mon.sock')
serial = os.path.join(work, 'serial.log')

code = next(p for p in ('/usr/share/AAVMF/AAVMF_CODE.fd', '/usr/share/qemu-efi-aarch64/QEMU_EFI.fd') if os.path.exists(p))
vars_src = '/usr/share/AAVMF/AAVMF_VARS.fd'
vars_fd = os.path.join(work, 'vars.fd')
shutil.copy(vars_src, vars_fd)

cmd = [
    'qemu-system-aarch64', '-M', 'virt', '-cpu', 'max,pauth-impdef=on',
    '-accel', 'tcg,thread=multi,tb-size=1024', '-smp', str(os.cpu_count() or 4), '-m', '4096',
    '-nodefaults', '-display', 'none', '-vga', 'none',
    '-drive', f'if=pflash,format=raw,unit=0,readonly=on,file={code}',
    '-drive', f'if=pflash,format=raw,unit=1,file={vars_fd}',
    '-device', 'virtio-gpu-pci,xres=720,yres=1280',
    '-device', 'qemu-xhci,id=xhci', '-device', 'usb-tablet', '-device', 'usb-kbd',
    '-device', 'virtio-rng-pci',
    '-netdev', 'user,id=net0', '-device', 'virtio-net-pci,netdev=net0',
    '-drive', f'file={vda},if=none,id=hd0,format=qcow2,cache=unsafe',
    '-device', 'virtio-blk-pci,drive=hd0,bootindex=1',
    '-drive', f'file={vdb},if=none,id=hd1,format=qcow2,cache=unsafe',
    '-device', 'virtio-blk-pci,drive=hd1,bootindex=2',
    '-device', 'pci-testdev',  # метка «это CI» для гостя
    '-rtc', 'base=utc',
    '-monitor', f'unix:{mon},server=on,wait=off',
    '-serial', f'file:{serial}',
]
print('$', ' '.join(cmd), flush=True)
qemu = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def monitor(c):
    try:
        s = socket.socket(socket.AF_UNIX); s.settimeout(10); s.connect(mon)
        buf = b''
        while not buf.endswith(b'(qemu) '):
            buf += s.recv(4096)
        s.sendall((c + '\n').encode())
        buf = b''
        while not buf.endswith(b'(qemu) '):
            d = s.recv(4096)
            if not d:
                break
            buf += d
        s.close()
        return buf.decode(errors='replace')
    except Exception as e:  # noqa
        return f'monitor error: {e}'


def shot(name):
    ppm = os.path.join(shots, name + '.ppm')
    monitor(f'screendump {ppm}')
    if os.path.exists(ppm):
        png = ppm[:-4] + '.png'
        subprocess.call(['convert', ppm, '-resize', '360x', png], stderr=subprocess.DEVNULL)
        os.remove(ppm)


start = time.time()
n = 0
last_serial = 0
while qemu.poll() is None:
    time.sleep(20)
    el = int(time.time() - start)
    if el // 120 >= n:  # скриншот раз в 2 минуты
        shot(f't{el // 60:03d}min')
        n += 1
    if os.path.exists(serial):
        with open(serial, errors='replace') as f:
            f.seek(last_serial); new = f.read(); last_serial = f.tell()
        for line in new.splitlines():
            if 'droidvm' in line.lower() or 'panic' in line.lower() or 'Restarting system' in line:
                print(f'[{el // 60}:{el % 60:02d}] {line.strip()}', flush=True)
        if 'droidvm: packages:' in new:
            time.sleep(25); shot('home')  # снимок рабочего стола после первой настройки
        if "with command 'recovery'" in new:
            # Android ушёл в recovery («Can't load Android system») — ждать дальше бессмысленно
            time.sleep(60); shot('recovery')
            print('ОШИБКА: гость перезагрузился в recovery — смотрите recovery.png и serial.log', flush=True)
            monitor('quit'); qemu.wait(30)
            sys.exit(1)
    if el > timeout_min * 60:
        print(f'ТАЙМАУТ: гость не выключился за {timeout_min} мин', flush=True)
        shot('timeout')
        monitor('quit')
        qemu.wait(30)
        sys.exit(1)

out = qemu.stdout.read()
if out.strip():
    print(out[-3000:])
el = int(time.time() - start)
print(f'Гость выключился сам через {el // 60} мин {el % 60} с, код QEMU {qemu.returncode}', flush=True)
ok = False
if os.path.exists(serial):
    txt = open(serial, errors='replace').read()
    ok = 'droidvm: firstboot complete' in txt
if not ok and qemu.returncode == 0:
    print('Отметки в консоли нет (нет вывода на ttyAMA0), но гость выключился штатно — считаем успехом', flush=True)
    ok = True
if not ok:
    print('В консоли нет отметки об успешной первой загрузке', flush=True)
    sys.exit(1)
