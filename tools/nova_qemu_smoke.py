#!/usr/bin/env python3
"""Headless boot test of a NOVA OS ISO in QEMU (BIOS or UEFI).

What it proves when it passes:
  * the ISO boots with the chosen firmware, GRUB starts the live system,
  * systemd reaches the point where the QEMU guest agent runs,
  * SDDM auto-logs into a KDE Plasma session (plasmashell running),
  * `nova-selftest --json` inside the VM: network, audio device, screens…
  * screenshots at several Plasma resolutions (1366×768 … 3840×2160@200 %).

Only temporary files in --out are created. No host disk is attached; an
optional blank qcow2 *virtual* disk can be added with --blank-disk.
Requires: qemu-system-x86_64, (OVMF for --firmware uefi), Python 3 stdlib.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import time
import zlib
from pathlib import Path

OVMF_CANDIDATES = (
    ('/usr/share/OVMF/OVMF_CODE_4M.fd', '/usr/share/OVMF/OVMF_VARS_4M.fd'),
    ('/usr/share/OVMF/OVMF_CODE.fd', '/usr/share/OVMF/OVMF_VARS.fd'),
    ('/usr/share/ovmf/OVMF.fd', None),
    ('/usr/share/edk2/ovmf/OVMF_CODE.fd', '/usr/share/edk2/ovmf/OVMF_VARS.fd'),
)
RESOLUTIONS = (('1366x768', 1.0), ('1920x1080', 1.0), ('2560x1440', 1.25), ('3840x2160', 2.0))

# ---------------------------------------------------------------------------
# Image conversion: PPM (QMP screendump) -> PNG, stdlib only
# ---------------------------------------------------------------------------

def _ppm_tokens(data: bytes, count: int):
    tokens, i = [], 0
    while len(tokens) < count:
        while data[i:i + 1].isspace():
            i += 1
        if data[i:i + 1] == b'#':
            while data[i:i + 1] not in (b'\n', b''):
                i += 1
            continue
        start = i
        while not data[i:i + 1].isspace():
            i += 1
        tokens.append(data[start:i])
    return tokens, i + 1


def ppm_to_png(ppm: bytes) -> bytes:
    tokens, offset = _ppm_tokens(ppm, 4)
    if tokens[0] != b'P6':
        raise ValueError('only binary PPM (P6) is supported')
    width, height, maxval = int(tokens[1]), int(tokens[2]), int(tokens[3])
    if maxval != 255:
        raise ValueError('only 8-bit PPM is supported')
    pixels = ppm[offset:offset + width * height * 3]
    if len(pixels) != width * height * 3:
        raise ValueError('truncated PPM')
    raw = b''.join(b'\x00' + pixels[y * width * 3:(y + 1) * width * 3] for y in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


def image_stats(ppm: bytes) -> dict:
    """Very small heuristic: fraction of non-black pixels, number of distinct colours (sampled)."""
    tokens, offset = _ppm_tokens(ppm, 4)
    width, height = int(tokens[1]), int(tokens[2])
    px = ppm[offset:]
    step = max(1, (width * height) // 20000)
    colours, lit, total = set(), 0, 0
    for i in range(0, width * height, step):
        r, g, b = px[i * 3:i * 3 + 3]
        total += 1
        if r + g + b > 60:
            lit += 1
        colours.add((r >> 4, g >> 4, b >> 4))
    return {'width': width, 'height': height, 'lit_fraction': round(lit / max(total, 1), 3), 'colours': len(colours)}

# ---------------------------------------------------------------------------
# QMP / QGA JSON line protocols
# ---------------------------------------------------------------------------

class JsonSocket:
    def __init__(self, path: str, timeout: float = 10.0):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(timeout)
        self.sock.connect(path)
        self.buf = b''

    def send(self, obj) -> None:
        self.sock.sendall(json.dumps(obj).encode() + b'\n')

    def recv(self) -> dict:
        while b'\n' not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError('socket closed')
            self.buf += chunk
        line, self.buf = self.buf.split(b'\n', 1)
        line = line.strip().lstrip(b'\xff')
        return json.loads(line) if line else self.recv()

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


class QMP:
    def __init__(self, path: str):
        self.js = JsonSocket(path, timeout=30)
        greeting = self.js.recv()
        if 'QMP' not in greeting:
            raise ConnectionError(f'unexpected QMP greeting: {greeting}')
        self.cmd('qmp_capabilities')

    def cmd(self, name: str, **arguments):
        self.js.send({'execute': name, 'arguments': arguments} if arguments else {'execute': name})
        while True:
            reply = self.js.recv()
            if 'event' in reply:
                continue
            if 'error' in reply:
                raise RuntimeError(f'QMP {name}: {reply["error"]}')
            return reply.get('return')

    def screendump(self, path: Path) -> None:
        self.cmd('screendump', filename=str(path))

    def key(self, *qcodes: str) -> None:
        self.cmd('send-key', keys=[{'type': 'qcode', 'data': q} for q in qcodes])


class QGA:
    """QEMU guest agent client; every call opens a fresh connection with guest-sync."""
    def __init__(self, path: str):
        self.path = path

    def call(self, name: str, timeout: float = 10.0, **arguments):
        js = JsonSocket(self.path, timeout=timeout)
        try:
            sync_id = int(time.time() * 1000) % 2_000_000_000
            js.sock.sendall(b'\xff')
            js.send({'execute': 'guest-sync-delimited', 'arguments': {'id': sync_id}})
            while True:
                reply = js.recv()
                if reply.get('return') == sync_id:
                    break
            js.send({'execute': name, 'arguments': arguments} if arguments else {'execute': name})
            reply = js.recv()
            if 'error' in reply:
                raise RuntimeError(f'QGA {name}: {reply["error"]}')
            return reply.get('return')
        finally:
            js.close()

    def ping(self) -> bool:
        try:
            self.call('guest-ping', timeout=5)
            return True
        except (OSError, ConnectionError, RuntimeError, ValueError, socket.timeout):
            return False

    def exec(self, argv: list[str], timeout: float = 120.0) -> tuple[int, str]:
        started = self.call('guest-exec', path=argv[0], arg=argv[1:], **{'capture-output': True})
        pid = started['pid']
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = self.call('guest-exec-status', pid=pid)
            if status.get('exited'):
                out = base64.b64decode(status.get('out-data', '') or b'').decode('utf-8', 'replace')
                err = base64.b64decode(status.get('err-data', '') or b'').decode('utf-8', 'replace')
                return int(status.get('exitcode', -1)), out + (('\n' + err) if err.strip() else '')
            time.sleep(1)
        return 124, f'timeout after {timeout}s'

# ---------------------------------------------------------------------------
# QEMU process
# ---------------------------------------------------------------------------

def find_ovmf():
    for code, vars_ in OVMF_CANDIDATES:
        if Path(code).is_file() and (vars_ is None or Path(vars_).is_file()):
            return code, vars_
    return None, None


def kvm_usable() -> bool:
    return os.access('/dev/kvm', os.R_OK | os.W_OK)


def qemu_command(iso: Path, out: Path, firmware: str, memory: int, cpus: int, blank_disk: Path | None,
                 accel: str) -> list[str]:
    argv = ['qemu-system-x86_64', '-name', f'nova-{firmware}', '-machine', f'q35,accel={accel}',
            '-cpu', 'host' if accel == 'kvm' else 'max', '-m', str(memory), '-smp', str(cpus),
            '-display', 'none', '-device', 'virtio-vga,xres=1920,yres=1080',
            '-qmp', f'unix:{out}/qmp.sock,server=on,wait=off',
            '-chardev', f'socket,id=qga0,path={out}/qga.sock,server=on,wait=off',
            '-device', 'virtio-serial-pci', '-device', 'virtserialport,chardev=qga0,name=org.qemu.guest_agent.0',
            '-serial', f'file:{out}/serial.log',
            '-audiodev', 'none,id=snd0', '-device', 'ich9-intel-hda', '-device', 'hda-output,audiodev=snd0',
            '-device', 'qemu-xhci', '-device', 'usb-tablet', '-device', 'usb-kbd',
            '-nic', 'user,model=virtio-net-pci',
            '-drive', f'file={iso},media=cdrom,readonly=on,if=none,id=cd0', '-device', 'ide-cd,drive=cd0,bootindex=0']
    if blank_disk is not None:
        argv += ['-drive', f'file={blank_disk},if=virtio,format=qcow2']
    if firmware == 'uefi':
        code, vars_ = find_ovmf()
        if not code:
            raise SystemExit('OVMF not found: install the ovmf package')
        if vars_:
            local_vars = out / 'OVMF_VARS.fd'
            shutil.copyfile(vars_, local_vars)
            argv += ['-drive', f'if=pflash,format=raw,unit=0,readonly=on,file={code}',
                     '-drive', f'if=pflash,format=raw,unit=1,file={local_vars}']
        else:
            argv += ['-bios', code]
    return argv


STYLES = ('air-dark', 'aurora', 'sakura', 'ocean', 'horizon', 'neon', 'air-light')


def shot(qmp: QMP, out: Path, name: str, results: dict) -> None:
    ppm = out / f'{name}.ppm'
    try:
        qmp.screendump(ppm)
        time.sleep(1.0)
        data = ppm.read_bytes()
        (out / f'{name}.png').write_bytes(ppm_to_png(data))
        results.setdefault('screenshots', {})[name] = image_stats(data)
        ppm.unlink()
    except (OSError, RuntimeError, ValueError, IndexError) as exc:
        results.setdefault('screenshots', {})[name] = {'error': str(exc)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--iso', required=True, type=Path)
    ap.add_argument('--firmware', choices=('bios', 'uefi'), default='uefi')
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--memory', type=int, default=4096)
    ap.add_argument('--cpus', type=int, default=2)
    ap.add_argument('--boot-timeout', type=int, default=0, help='seconds (default 900 with KVM, 2400 without)')
    ap.add_argument('--blank-disk', action='store_true', help='attach an empty 20G qcow2 virtual disk')
    ap.add_argument('--resolutions', action='store_true', help='switch Plasma resolutions and take screenshots')
    ap.add_argument('--styles', action='store_true', help='apply every NOVA style and take screenshots')
    args = ap.parse_args(argv)

    if not args.iso.is_file():
        print(f'ISO not found: {args.iso}', file=sys.stderr)
        return 2
    if not shutil.which('qemu-system-x86_64'):
        print('qemu-system-x86_64 not installed', file=sys.stderr)
        return 2
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    accel = 'kvm' if kvm_usable() else 'tcg'
    boot_timeout = args.boot_timeout or (900 if accel == 'kvm' else 2400)
    blank = None
    if args.blank_disk:
        blank = out / 'blank-virtual-disk.qcow2'
        subprocess.run(['qemu-img', 'create', '-f', 'qcow2', str(blank), '20G'], check=True,
                       stdout=subprocess.DEVNULL)
    results = {'iso': args.iso.name, 'firmware': args.firmware, 'accel': accel, 'checks': {}}
    cmd = qemu_command(args.iso.resolve(), out, args.firmware, args.memory, args.cpus, blank, accel)
    (out / 'qemu-command.txt').write_text(' '.join(cmd) + '\n')
    started = time.time()
    proc = subprocess.Popen(cmd, stdout=open(out / 'qemu.log', 'w'), stderr=subprocess.STDOUT)
    qmp = None
    try:
        for _ in range(60):
            if (out / 'qmp.sock').exists():
                break
            time.sleep(0.5)
        qmp = QMP(str(out / 'qmp.sock'))
        time.sleep(20 if accel == 'kvm' else 45)
        shot(qmp, out, '01-boot-menu', results)
        qmp.key('ret')  # choose the default GRUB entry (harmless if it already booted)
        qga = QGA(str(out / 'qga.sock'))
        while time.time() - started < boot_timeout and proc.poll() is None:
            if qga.ping():
                break
            time.sleep(10)
        results['checks']['guest_agent'] = qga.ping()
        results['seconds_to_userspace'] = round(time.time() - started)
        if not results['checks']['guest_agent']:
            shot(qmp, out, '02-no-guest-agent', results)
            results['verdict'] = 'fail'
            results['reason'] = 'guest agent never answered (boot failed, hung, or qemu-guest-agent missing)'
            return finish(results, out, 1)

        plasma = False
        while time.time() - started < boot_timeout + 300:
            code, text = qga.exec(['/usr/bin/pgrep', '-x', 'plasmashell'], timeout=20)
            if code == 0:
                plasma = True
                break
            time.sleep(10)
        results['checks']['plasmashell'] = plasma
        if not plasma:      # collect what the display stack said, so a failure can be diagnosed from CI
            for fname, argv in (('sddm-journal.txt', ['/bin/journalctl', '-b', '-u', 'sddm', '--no-pager', '-q']),
                                ('session-journal.txt', ['/bin/journalctl', '-b', '--no-pager', '-q', '-n', '400',
                                                         '_COMM=kwin_wayland', '+', '_COMM=startplasma-wayland',
                                                         '+', '_COMM=sddm-helper', '+', '_COMM=plasmashell']),
                                ('drm.txt', ['/bin/sh', '-c', 'ls -l /dev/dri; cat /sys/class/drm/*/status; '
                                             'loginctl list-sessions; ps -eo pid,user,comm | grep -Ei "kwin|plasma|sddm|Xorg"'])):
                code, text = qga.exec(argv, timeout=60)
                (out / fname).write_text(text)
        results['seconds_to_plasma'] = round(time.time() - started)
        time.sleep(25)
        shot(qmp, out, '03-desktop', results)

        code, text = qga.exec(['/usr/local/bin/nova-selftest', '--json'], timeout=180)
        (out / 'selftest.json').write_text(text)
        try:
            selftest = json.loads(text)
            results['selftest_summary'] = selftest.get('summary')
        except ValueError:
            results['selftest_summary'] = {'error': text[:500]}
        code, text = qga.exec(['/bin/journalctl', '-b', '-p', 'err', '--no-pager', '-q'], timeout=60)
        (out / 'journal-errors.txt').write_text(text)
        code, text = qga.exec(['/bin/systemctl', '--failed', '--no-legend', '--plain'], timeout=30)
        (out / 'failed-units.txt').write_text(text)
        results['failed_units'] = [line.split()[0] for line in text.splitlines() if line.strip()]

        if args.resolutions and plasma:
            results['resolutions'] = {}
            code, text = qga.exec(['/usr/local/bin/nova-selftest', '--session-exec', 'kscreen-doctor', '-j'], timeout=30)
            try:
                outputs = json.loads(text).get('outputs', [])
            except ValueError:
                outputs = []
            name = next((o.get('name') for o in outputs if o.get('enabled')), None)
            mode_ids = {}
            for o in outputs:
                if o.get('name') == name:
                    for m in o.get('modes', []):
                        size = m.get('size') or {}
                        mode_ids.setdefault(f"{size.get('width')}x{size.get('height')}", m.get('id'))
            for res, scale in RESOLUTIONS:
                if not name or res not in mode_ids:
                    results['resolutions'][res] = 'mode not offered by the virtual GPU'
                    continue
                cmd_args = ['/usr/local/bin/nova-selftest', '--session-exec', 'kscreen-doctor',
                            f'output.{name}.mode.{mode_ids[res]}', f'output.{name}.scale.{scale}']
                code, text = qga.exec(cmd_args, timeout=40)
                time.sleep(8)
                shot(qmp, out, f'04-plasma-{res}-{int(scale * 100)}', results)
                results['resolutions'][res] = 'ok' if code == 0 else f'kscreen-doctor exit {code}: {text[:200]}'

        if args.styles and plasma:
            results['styles'] = {}
            session = ['/usr/local/bin/nova-selftest', '--session-exec']
            for style in STYLES:
                code, text = qga.exec([*session, 'nova-style', 'apply', style], timeout=120)
                time.sleep(14)
                shot(qmp, out, f'05-style-{style}', results)
                if style == 'neon':          # system-monitor widgets fill in after a while
                    time.sleep(30)
                    shot(qmp, out, '05-style-neon-later', results)
                results['styles'][style] = 'ok' if code == 0 else f'exit {code}: {text[-300:]}'
            qga.exec([*session, 'nova-style', 'apply', 'horizon'], timeout=120)
            qga.exec([*session, 'sh', '-c', 'nova-styles >/dev/null 2>&1 &'], timeout=20)
            time.sleep(12)
            shot(qmp, out, '06-styles-app', results)
            code, text = qga.exec([*session, 'nova-style', 'revert'], timeout=120)
            time.sleep(14)
            shot(qmp, out, '07-reverted', results)
            results['styles']['revert'] = 'ok' if code == 0 else f'exit {code}: {text[-300:]}'

        ok = results['checks']['guest_agent'] and plasma
        desk = results.get('screenshots', {}).get('03-desktop', {})
        if desk.get('colours', 0) < 8:
            results['warning'] = 'desktop screenshot looks almost uniform (black/blank screen?)'
        st = results.get('selftest_summary') or {}
        if isinstance(st, dict) and st.get('fail'):
            ok = False
            results['reason'] = 'nova-selftest reported failures (see selftest.json)'
        results['verdict'] = 'pass' if ok else 'fail'
        return finish(results, out, 0 if ok else 1)
    except (OSError, ConnectionError, RuntimeError) as exc:
        results['verdict'] = 'fail'
        results['reason'] = f'harness error: {exc}'
        return finish(results, out, 1)
    finally:
        if qmp is not None:
            try:
                qmp.cmd('quit')
            except (OSError, RuntimeError, ConnectionError):
                pass
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
        if blank is not None:
            blank.unlink(missing_ok=True)


def finish(results: dict, out: Path, code: int) -> int:
    (out / 'result.json').write_text(json.dumps(results, ensure_ascii=False, indent=1))
    print(json.dumps(results, ensure_ascii=False, indent=1))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
