#!/usr/bin/env python3
"""Извлечь логический раздел (например, system) из образа super (Android dynamic partitions)."""
import struct, sys

def main(super_img, name, out):
    f = open(super_img, 'rb')
    f.seek(4096)
    magic, struct_size = struct.unpack('<II', f.read(8))
    assert magic == 0x616c4467, 'нет LP geometry'
    f.seek(4096 + 8 + 32)
    max_size, slots, block_size = struct.unpack('<III', f.read(12))
    base = 4096 + 4096 * 2  # первичная копия метаданных, слот 0
    f.seek(base)
    hdr = f.read(256)
    magic, major, minor, header_size = struct.unpack_from('<IHHI', hdr, 0)
    assert magic == 0x414C5030, 'нет LP metadata header'
    off = 4 + 2 + 2 + 4 + 32 + 4 + 32
    descs = [struct.unpack_from('<III', hdr, off + i * 12) for i in range(4)]
    f.seek(base + header_size)
    tables = f.read(max_size)
    p_off, p_n, p_sz = descs[0]
    e_off, e_n, e_sz = descs[1]
    extents = [struct.unpack_from('<QIQI', tables, e_off + i * e_sz) for i in range(e_n)]
    names = []
    for i in range(p_n):
        raw = tables[p_off + i * p_sz: p_off + (i + 1) * p_sz]
        pname = raw[:36].split(b'\0')[0].decode()
        attrs, first, num, group = struct.unpack_from('<IIII', raw, 36)
        names.append(pname)
        if pname != name:
            continue
        with open(out, 'wb') as o:
            for nsect, ttype, tdata, tsrc in extents[first:first + num]:
                if ttype == 0:
                    f.seek(tdata * 512)
                    left = nsect * 512
                    while left:
                        chunk = f.read(min(left, 1 << 24)); o.write(chunk); left -= len(chunk)
                else:
                    o.write(b'\0' * nsect * 512)
        print(f'{name}: {sum(e[0] for e in extents[first:first+num]) * 512} байт -> {out}')
        return
    sys.exit(f'раздела {name} нет; есть: {names}')

if __name__ == '__main__':
    main(*sys.argv[1:4])
