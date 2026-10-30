#!/usr/bin/env python3
"""
Встраивание готового QEMU (из репозитория Termux) в APK DroidVM.

Что делает скрипт:
  1. Скачивает индекс пакетов Termux для нужной архитектуры телефона.
  2. Находит пакеты QEMU (system-x86_64, system-aarch64, qemu-img, прошивки)
     и рекурсивно все их зависимости, скачивает .deb и проверяет SHA-256.
  3. Распаковывает их, собирает ровно те .so, которые реально нужны бинарникам.
  4. Переименовывает всё в lib*.so (Android разрешает запускать только файлы
     из lib/<abi>/ внутри APK) и правит в ELF версии имён библиотек
     (libz.so.1 -> libz.so), т.к. в APK можно положить только *.so.
  5. Кладёт результат в app/src/main/jniLibs/<abi>/ и прошивки в
     app/src/main/assets/qemu-data.zip.

Нужен только Python 3.8+ (стандартная библиотека). Если пакеты Termux окажутся
сжаты zstd, понадобится `pip install zstandard`.

Примеры:
  python3 scripts/fetch_qemu.py                 # arm64-v8a (почти все телефоны)
  python3 scripts/fetch_qemu.py --abi arm64-v8a --abi x86_64
"""
import argparse
import fnmatch
import gzip
import hashlib
import io
import lzma
import os
import posixpath
import re
import shutil
import struct
import sys
import tarfile
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "src", "main")
CACHE = os.path.join(ROOT, "build", "termux-cache")

MIRRORS = [
    "https://packages-cf.termux.dev/apt/termux-main",
    "https://packages.termux.dev/apt/termux-main",
    "https://grimler.se/termux/termux-main",
    "https://mirror.mwt.me/termux/main",
]

ABI_TO_ARCH = {"arm64-v8a": "aarch64", "x86_64": "x86_64"}
PREFIX = "data/data/com.termux/files/usr/"

# пакет -> список запасных имён
WANTED = [
    ["qemu-system-x86-64-headless", "qemu-system-x86-64"],
    ["qemu-system-aarch64-headless", "qemu-system-aarch64"],
    ["qemu-utils"],
    ["qemu-common"],
]

BINARIES = {
    "bin/qemu-system-x86_64": "libqemu-system-x86_64.so",
    "bin/qemu-system-aarch64": "libqemu-system-aarch64.so",
    "bin/qemu-img": "libqemu-img.so",
}

# Какие файлы из share/qemu нужны для x86_64 и aarch64
DATA_KEEP = [
    "bios.bin", "bios-256k.bin", "bios-microvm.bin", "qboot.rom", "sgabios.bin",
    "vgabios*.bin", "kvmvapic.bin", "linuxboot*.bin", "multiboot*.bin", "pvh.bin",
    "efi-*.rom", "pxe-*.rom",
    "edk2-x86_64-code.fd", "edk2-i386-vars.fd", "edk2-aarch64-code.fd", "edk2-arm-vars.fd",
    "edk2-licenses.txt", "keymaps/*", "firmware/*",
]

SYSTEM_LIBS = {
    "libc.so", "libm.so", "libdl.so", "liblog.so", "libandroid.so", "libz.so",
    "libEGL.so", "libGLESv1_CM.so", "libGLESv2.so", "libGLESv3.so", "libvulkan.so",
    "libOpenSLES.so", "libaaudio.so", "libmediandk.so", "libjnigraphics.so", "libnativewindow.so",
    "libsync.so", "libstdc++.so", "libcamera2ndk.so", "libicu.so", "libneuralnetworks.so",
}


def log(*a):
    print(*a, flush=True)


def http_get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "DroidVM-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


# ---------------------------------------------------------------- индекс пакетов

def load_index(arch):
    last_err = None
    for mirror in MIRRORS:
        base = f"{mirror}/dists/stable/main/binary-{arch}/"
        for name, dec in (("Packages.xz", lzma.decompress), ("Packages.gz", gzip.decompress), ("Packages", lambda b: b)):
            try:
                data = dec(http_get(base + name)).decode("utf-8", "replace")
                log(f"  индекс: {base}{name}")
                return mirror, parse_packages(data)
            except Exception as e:  # noqa
                last_err = e
    sys.exit(f"Не удалось скачать индекс пакетов Termux для {arch}: {last_err}")


def parse_packages(text):
    pkgs = {}
    for stanza in text.split("\n\n"):
        fields, key = {}, None
        for line in stanza.splitlines():
            if line.startswith((" ", "\t")) and key:
                fields[key] += "\n" + line.strip()
            elif ":" in line:
                key, _, val = line.partition(":")
                key = key.strip()
                fields[key] = val.strip()
        if "Package" in fields:
            pkgs[fields["Package"]] = fields
    return pkgs


def dep_names(field):
    out = []
    for group in (field or "").split(","):
        alts = [re.sub(r"\(.*?\)|\[.*?\]", "", a).strip() for a in group.split("|")]
        alts = [a.split(":")[0] for a in alts if a]
        if alts:
            out.append(alts)
    return out


def resolve(pkgs):
    roots = []
    for alts in WANTED:
        found = next((a for a in alts if a in pkgs), None)
        if not found:
            cands = sorted(p for p in pkgs if "qemu" in p)
            sys.exit(f"В репозитории нет пакета {alts}. Есть: {cands}")
        roots.append(found)
    seen, order, stack = set(), [], list(roots)
    while stack:
        p = stack.pop()
        if p in seen:
            continue
        seen.add(p)
        order.append(p)
        f = pkgs[p]
        for alts in dep_names(f.get("Depends")) + dep_names(f.get("Pre-Depends")):
            hit = next((a for a in alts if a in pkgs), None)
            if hit:
                stack.append(hit)
            else:
                log(f"  (пропущена зависимость {alts} пакета {p})")
    return order


# ---------------------------------------------------------------- .deb

def download_deb(mirror, fields):
    os.makedirs(CACHE, exist_ok=True)
    fn = fields["Filename"]
    dst = os.path.join(CACHE, os.path.basename(fn))
    sha = fields.get("SHA256", "").lower()
    if os.path.exists(dst) and sha and hashlib.sha256(open(dst, "rb").read()).hexdigest() == sha:
        return dst
    data = http_get(f"{mirror}/{fn}")
    if sha and hashlib.sha256(data).hexdigest() != sha:
        sys.exit(f"Неверная контрольная сумма {fn}")
    with open(dst, "wb") as f:
        f.write(data)
    return dst


def ar_members(path):
    with open(path, "rb") as f:
        if f.read(8) != b"!<arch>\n":
            raise ValueError(f"{path}: не ar-архив")
        while True:
            hdr = f.read(60)
            if len(hdr) < 60:
                return
            name = hdr[:16].decode().strip().rstrip("/")
            size = int(hdr[48:58].decode().strip())
            data = f.read(size)
            if size % 2:
                f.read(1)
            yield name, data


def open_data_tar(deb):
    for name, data in ar_members(deb):
        if not name.startswith("data.tar"):
            continue
        if name.endswith(".xz"):
            raw = lzma.decompress(data)
        elif name.endswith(".gz"):
            raw = gzip.decompress(data)
        elif name.endswith(".zst"):
            try:
                import zstandard
            except ImportError:
                sys.exit("Пакеты сжаты zstd: выполните `pip install zstandard` и повторите.")
            raw = zstandard.ZstdDecompressor().decompressobj().decompress(data)
        else:
            raw = data
        return tarfile.open(fileobj=io.BytesIO(raw))
    raise ValueError(f"{deb}: нет data.tar")


class Tree:
    """Файлы префикса Termux: относительный путь -> байты или ('link', цель)."""

    def __init__(self):
        self.files = {}
        self.links = {}

    def add_deb(self, deb):
        tf = open_data_tar(deb)
        for m in tf.getmembers():
            name = m.name.lstrip("./")
            if not name.startswith(PREFIX):
                continue
            rel = name[len(PREFIX):]
            if m.isfile():
                self.files[rel] = tf.extractfile(m).read()
            elif m.issym():
                tgt = m.linkname
                if tgt.startswith("/"):
                    tgt = tgt.lstrip("/")
                    tgt = tgt[len(PREFIX):] if tgt.startswith(PREFIX) else None
                else:
                    tgt = posixpath.normpath(posixpath.join(posixpath.dirname(rel), tgt))
                if tgt:
                    self.links[rel] = tgt

    def real(self, rel, depth=0):
        if rel in self.files:
            return rel
        if rel in self.links and depth < 20:
            return self.real(self.links[rel], depth + 1)
        return None


# ---------------------------------------------------------------- ELF

DT_NEEDED, DT_STRTAB, DT_SONAME, DT_RPATH, DT_RUNPATH = 1, 5, 14, 15, 29
DT_VERNEED, DT_VERNEEDNUM = 0x6FFFFFFE, 0x6FFFFFFF


def normalize(name):
    return re.sub(r"\.so(\.[0-9][0-9A-Za-z]*)+$", ".so", name)


class Elf:
    def __init__(self, data):
        self.b = bytearray(data)
        if self.b[:4] != b"\x7fELF" or self.b[4] != 2 or self.b[5] != 1:
            raise ValueError("не ELF64 LE")
        phoff = struct.unpack_from("<Q", self.b, 0x20)[0]
        phentsize, phnum = struct.unpack_from("<HH", self.b, 0x36)
        self.loads, dyn = [], None
        for i in range(phnum):
            off = phoff + i * phentsize
            p_type, _, p_offset, p_vaddr, _, p_filesz = struct.unpack_from("<IIQQQQ", self.b, off)
            if p_type == 1:
                self.loads.append((p_vaddr, p_offset, p_filesz))
            elif p_type == 2:
                dyn = (p_offset, p_filesz)
        self.entries = []
        if dyn:
            for i in range(dyn[1] // 16):
                tag, val = struct.unpack_from("<qQ", self.b, dyn[0] + i * 16)
                if tag == 0:
                    break
                self.entries.append((tag, val))
        d = dict((t, v) for t, v in self.entries if t in (DT_STRTAB, DT_VERNEED, DT_VERNEEDNUM))
        self.strtab = self.v2o(d[DT_STRTAB]) if DT_STRTAB in d else None
        self.verneed = []
        if DT_VERNEED in d and DT_VERNEEDNUM in d:
            off = self.v2o(d[DT_VERNEED])
            for _ in range(d[DT_VERNEEDNUM]):
                _, _, vn_file, _, vn_next = struct.unpack_from("<HHIII", self.b, off)
                self.verneed.append(vn_file)
                if not vn_next:
                    break
                off += vn_next

    def v2o(self, vaddr):
        for va, off, sz in self.loads:
            if va <= vaddr < va + sz:
                return vaddr - va + off
        raise ValueError("адрес вне сегментов")

    def s(self, off):
        start = self.strtab + off
        end = self.b.index(0, start)
        return self.b[start:end].decode()

    def needed(self):
        return [self.s(v) for t, v in self.entries if t == DT_NEEDED] if self.strtab is not None else []

    def soname(self):
        for t, v in self.entries:
            if t == DT_SONAME and self.strtab is not None:
                return self.s(v)
        return None

    def patch(self, rename):
        """Переименовать NEEDED/SONAME на месте и очистить RUNPATH."""
        if self.strtab is None:
            return
        refs = {v for t, v in self.entries if t in (DT_NEEDED, DT_SONAME, DT_RPATH, DT_RUNPATH)} | set(self.verneed)
        for t, v in self.entries:
            if t in (DT_NEEDED, DT_SONAME):
                old = self.s(v)
                new = rename(old)
                if new == old:
                    continue
                if len(new) > len(old):
                    raise ValueError(f"{new} длиннее {old}")
                if any(v < r < v + len(old) for r in refs):
                    raise ValueError(f"строка {old} разделяется с другой записью — нужен patchelf")
                pos = self.strtab + v
                self.b[pos:pos + len(old)] = new.encode() + b"\0" * (len(old) - len(new))
            elif t in (DT_RPATH, DT_RUNPATH):
                self.b[self.strtab + v] = 0


# ---------------------------------------------------------------- сборка

def build_abi(abi, data_written):
    arch = ABI_TO_ARCH[abi]
    log(f"\n=== {abi} (Termux {arch}) ===")
    mirror, pkgs = load_index(arch)
    order = resolve(pkgs)
    log(f"  пакетов: {len(order)}")
    for p in order:
        log(f"   - {p} {pkgs[p].get('Version', '')}")

    tree = Tree()
    for p in order:
        tree.add_deb(download_deb(mirror, pkgs[p]))

    # Карта библиотек: нормализованное имя -> реальный файл
    providers = {}
    for rel in list(tree.files) + list(tree.links):
        if not rel.startswith("lib/") or "/" in rel[4:] or ".so" not in rel:
            continue
        real = tree.real(rel)
        if not real:
            continue
        names = {normalize(posixpath.basename(rel))}
        try:
            so = Elf(tree.files[real]).soname()
            if so:
                names.add(normalize(so))
        except ValueError:
            continue
        for n in names:
            providers.setdefault(n, real)

    out_dir = os.path.join(APP, "jniLibs", abi)
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)

    queue, emitted, system_needed, missing = [], {}, set(), set()

    def emit(real, out_name):
        if out_name in emitted:
            return
        elf = Elf(tree.files[real])
        emitted[out_name] = real
        for n in elf.needed():
            nn = normalize(n)
            if nn in providers:
                queue.append(nn)
            elif nn in SYSTEM_LIBS:
                system_needed.add(nn)
            else:
                missing.add(nn)
        elf.patch(normalize)
        with open(os.path.join(out_dir, out_name), "wb") as f:
            f.write(elf.b)

    for src, dst in BINARIES.items():
        real = tree.real(src)
        if not real:
            log(f"  ! нет {src} — пропущено")
            continue
        emit(real, dst)

    modules = []
    for rel in sorted(tree.files):
        if rel.startswith("lib/qemu/") and rel.endswith(".so"):
            base = posixpath.basename(rel)
            out = "libqmod_" + base
            modules.append(f"{out}={base}")
            emit(rel, out)

    while queue:
        n = queue.pop()
        emit(providers[n], n)

    if missing:
        log(f"  ! не найдены (возможно, системные): {sorted(missing)}")
    log(f"  системные библиотеки Android: {sorted(system_needed)}")
    total = sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir))
    log(f"  записано {len(emitted)} файлов, {total / 1048576:.1f} МБ -> {out_dir}")

    if not data_written:
        os.makedirs(os.path.join(APP, "assets"), exist_ok=True)
        zpath = os.path.join(APP, "assets", "qemu-data.zip")
        n = 0
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for rel in sorted(set(tree.files) | set(tree.links)):
                if not rel.startswith("share/qemu/"):
                    continue
                sub = rel[len("share/qemu/"):]
                if not any(fnmatch.fnmatch(sub, pat) for pat in DATA_KEEP):
                    continue
                real = tree.real(rel)
                if real:
                    z.writestr(sub, tree.files[real])
                    n += 1
        log(f"  прошивки: {n} файлов -> {zpath} ({os.path.getsize(zpath) / 1048576:.1f} МБ)")
        with open(os.path.join(APP, "assets", "qemu-modules.txt"), "w") as f:
            f.write("\n".join(modules) + "\n")
        ver = next((pkgs[p].get("Version", "?") for p in order if p.startswith("qemu-system")), "?")
        with open(os.path.join(APP, "assets", "qemu-version.txt"), "w") as f:
            f.write(ver + "\n")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--abi", action="append", choices=sorted(ABI_TO_ARCH), help="ABI телефона (можно несколько)")
    ap.add_argument("--mirror", help="свой адрес репозитория Termux (…/apt/termux-main)")
    args = ap.parse_args()
    if args.mirror:
        MIRRORS.insert(0, args.mirror.rstrip("/"))
    abis = args.abi or ["arm64-v8a"]
    # убрать ABI, которые не просили
    jl = os.path.join(APP, "jniLibs")
    if os.path.isdir(jl):
        for d in os.listdir(jl):
            if d not in abis:
                shutil.rmtree(os.path.join(jl, d), ignore_errors=True)
    data = False
    for abi in abis:
        data = build_abi(abi, data) or data
    log("\nГотово. Теперь соберите APK: ./gradlew assembleRelease")


if __name__ == "__main__":
    main()
