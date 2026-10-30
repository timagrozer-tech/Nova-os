#!/usr/bin/env python3
"""
Включить подмену подписи для microG в LineageOS user-сборке.

В LineageOS (frameworks/base, ComputerEngine.isMicrogSigned) подмена разрешена только если
нативная ComputerEngine.isDebuggable() вернёт true; в user-сборке она скомпилирована как
`return false`. Находим её через JNI-таблицу {"isDebuggable", "()Z", fn} в
libandroid_servers.so и меняем `mov w0, #0` на `mov w0, #1`. Больше ничего не трогаем.
"""
import re, struct, subprocess, sys
from elftools.elf.elffile import ELFFile

src, dst = sys.argv[1], sys.argv[2]
data = bytearray(open(src, 'rb').read())
elf = ELFFile(open(src, 'rb'))
loads = [(s['p_vaddr'], s['p_offset'], s['p_filesz']) for s in elf.iter_segments() if s['p_type'] == 'PT_LOAD']

def v2o(v):
    for va, off, sz in loads:
        if va <= v < va + sz:
            return v - va + off
    return None

def cstr(v):
    o = v2o(v)
    if o is None:
        return None
    e = data.index(0, o)
    return bytes(data[o:e])

# Все R_AARCH64_RELATIVE: смещение -> целевой адрес (RELA addend или значение на месте для RELR)
readelf = next(t for t in ('llvm-readelf', 'llvm-readelf-18', 'llvm-readelf-17', 'llvm-readelf-16')
               if subprocess.call(['which', t], stdout=subprocess.DEVNULL) == 0)
out = subprocess.run([readelf, '-r', src], capture_output=True, text=True).stdout
rel = {}
for line in out.splitlines():
    m = re.match(r'\s*([0-9a-f]+)\s+[0-9a-f]+\s+R_AARCH64_RELATIVE\s*([0-9a-f]+)?', line)
    if m:
        off = int(m.group(1), 16)
        if m.group(2):
            rel[off] = int(m.group(2), 16)
        else:
            o = v2o(off)
            rel[off] = struct.unpack_from('<Q', data, o)[0] if o is not None else None
print(f'релокаций RELATIVE: {len(rel)}')

cands = []
for off, val in rel.items():
    if val is None or cstr(val) != b'isDebuggable':
        continue
    sig, fn = rel.get(off + 8), rel.get(off + 16)
    if sig is not None and fn is not None and cstr(sig) == b'()Z':
        cands.append(fn)
print('кандидаты isDebuggable:', [hex(c) for c in cands])

BTI_PAC = {0xd503245f, 0xd503233f, 0xd503241f}
MOV0 = {0x2a1f03e0, 0x52800000}
RET = 0xd65f03c0
patched = []
for fn in cands:
    o = v2o(fn)
    i = 0
    w = lambda k: struct.unpack_from('<I', data, o + 4 * k)[0]
    while w(i) in BTI_PAC:
        i += 1
    if w(i) in MOV0 and w(i + 1) in (RET, 0xd65f0bff):
        struct.pack_into('<I', data, o + 4 * i, 0x52800020)  # mov w0, #1
        patched.append(fn)
    else:
        print(f'  {hex(fn)}: неожиданный код {[hex(w(k)) for k in range(4)]}')
if len(patched) != 1:
    sys.exit(f'ожидалась ровно одна функция для патча, найдено {len(patched)}')
open(dst, 'wb').write(data)
print(f'пропатчено: isDebuggable @ {hex(patched[0])} -> return true')
