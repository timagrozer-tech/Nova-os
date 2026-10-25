"""NOVA 0.13 system polish: boot splash (Plymouth), compressed RAM swap (zram),
modernised UI kit. Hook blocks run in a temporary root with stubbed tools.
"""
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
HOOK = ROOT / 'image/config/hooks/live/090-nova.hook.chroot'
TUNE = O / 'usr/local/lib/nova/nova-zram-tune'
sys.path.insert(0, str(O / 'usr/local/bin'))

import nova_layout_core as layout  # noqa: E402
import nova_ui as ui  # noqa: E402


def hook_block(start: str, end: str) -> str:
    text = HOOK.read_text()
    return text[text.index(start):text.index(end)]


def run_block(block: str, tmp: Path, stubs: dict[str, str]) -> subprocess.CompletedProcess:
    bin_dir = tmp / 'stub'
    bin_dir.mkdir(exist_ok=True)
    for name, body in stubs.items():
        f = bin_dir / name
        f.write_text('#!/bin/sh\n' + body + '\n')
        f.chmod(0o755)
    block = (block.replace('/usr/share/plymouth', f'{tmp}/usr/share/plymouth')
                  .replace('/etc/default/zramswap', f'{tmp}/etc/default/zramswap')
                  .replace('/usr/local/lib/nova', f'{tmp}/usr/local/lib/nova'))
    script = 'set -eu\nlog() { echo "LOG: $*"; }\n' + block
    env = dict(os.environ, PATH=f'{bin_dir}:/usr/bin:/bin')
    return subprocess.run(['sh', '-c', script], capture_output=True, text=True, env=env, check=False)


class Packages(unittest.TestCase):
    def test_new_packages_listed_once(self):
        items = [l.strip() for l in (ROOT / 'image/config/package-lists/nova.list.chroot').read_text().splitlines()
                 if l.strip() and not l.startswith('#')]
        for name in ('plymouth', 'plymouth-themes', 'zram-tools'):
            self.assertEqual(items.count(name), 1, name)


class BootSplash(unittest.TestCase):
    BLOCK = ('# --- Boot splash', '# NEON//SYS: bundled OFL fonts')

    def test_theme_files(self):
        theme = (O / 'usr/share/plymouth/themes/nova/nova.plymouth').read_text()
        self.assertIn('ModuleName=two-step', theme)
        self.assertIn('ImageDir=/usr/share/plymouth/themes/nova', theme)
        self.assertIn('BackgroundStartColor=0x11161f', theme)        # NOVA Air dark bg
        png = (O / 'usr/share/plymouth/themes/nova/watermark.png').read_bytes()
        self.assertEqual(png[:8], b'\x89PNG\r\n\x1a\n')
        grub = (O / 'etc/default/grub.d/91-nova-splash.cfg').read_text()
        self.assertIn('splash', grub)

    def test_grub_dropin_adds_splash_once(self):
        cfg = O / 'etc/default/grub.d/91-nova-splash.cfg'
        for before, after in (('quiet', 'quiet splash'), ('quiet splash', 'quiet splash'), ('', 'quiet splash')):
            out = subprocess.run(['sh', '-c', f'GRUB_CMDLINE_LINUX_DEFAULT="{before}"; . "{cfg}"; '
                                  'echo "$GRUB_CMDLINE_LINUX_DEFAULT"'], capture_output=True, text=True, check=True)
            self.assertEqual(out.stdout.strip(), after, before)

    def test_hook_sets_theme_when_spinner_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp)
            spin = t / 'usr/share/plymouth/themes/spinner'
            spin.mkdir(parents=True)
            for n in ('throbber-0001.png', 'animation-0001.png', 'lock.png', 'entry.png', 'bullet.png'):
                (spin / n).write_bytes(b'png')
            nova = t / 'usr/share/plymouth/themes/nova'
            nova.mkdir(parents=True)
            (nova / 'nova.plymouth').write_text('[Plymouth Theme]\n')
            (nova / 'watermark.png').write_bytes(b'LOGO')
            log = t / 'calls'
            res = run_block(hook_block(*self.BLOCK), t, {
                'plymouth-set-default-theme': f'echo "theme $*" >> {log}',
                'update-initramfs': f'echo "initramfs $*" >> {log}'})
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertTrue((nova / 'throbber-0001.png').is_file())
            self.assertEqual((nova / 'watermark.png').read_bytes(), b'LOGO')    # our logo is never overwritten
            self.assertEqual(log.read_text().split('\n')[:2], ['theme nova', 'initramfs -u -k all'])

    def test_hook_is_fail_soft_without_plymouth(self):
        with tempfile.TemporaryDirectory() as tmp:
            res = run_block(hook_block(*self.BLOCK), Path(tmp), {})
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn('text boot', res.stdout)


class Zram(unittest.TestCase):
    BLOCK = ('# --- Performance: swap in compressed RAM', '# --- Boot splash')

    def test_hook_configures_and_enables(self):
        self.assertIn('zramswap.service', HOOK.read_text().split('# --- Firewall')[0])
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp)
            (t / 'etc/default').mkdir(parents=True)
            cfg = t / 'etc/default/zramswap'
            cfg.write_text('# Compression algorithm\n#ALGO=lz4\n# Percent of RAM\n#PERCENT=50\n#PRIORITY=100\n')
            (t / 'usr/local/lib/nova').mkdir(parents=True)
            (t / 'usr/local/lib/nova/nova-zram-tune').write_text('')
            res = run_block(hook_block(*self.BLOCK), t, {})
            self.assertEqual(res.returncode, 0, res.stderr)
            text = cfg.read_text()
            for line in ('ALGO=zstd', 'PERCENT=50', 'PRIORITY=100'):
                self.assertEqual(len(re.findall(f'^{line}$', text, re.M)), 1, line)

    def run_tune(self, swaps: str):
        with tempfile.TemporaryDirectory() as tmp:
            t = Path(tmp)
            (t / 'swaps').write_text('Filename\t\t\t\tType\t\tSize\t\tUsed\t\tPriority\n' + swaps)
            stub = t / 'bin'
            stub.mkdir()
            (stub / 'sysctl').write_text(f'#!/bin/sh\necho "$*" > {t}/sysctl\n')
            (stub / 'sysctl').chmod(0o755)
            env = dict(os.environ, NOVA_PROC_SWAPS=str(t / 'swaps'), PATH=f'{stub}:{os.environ["PATH"]}')
            res = subprocess.run(['bash', str(TUNE)], capture_output=True, text=True, env=env, check=False)
            called = (t / 'sysctl').read_text() if (t / 'sysctl').exists() else ''
            return res, called

    def test_tune_only_with_zram_only(self):
        res, called = self.run_tune('/dev/zram0  partition\t8G\t0\t100\n')
        self.assertEqual(res.returncode, 0)
        self.assertIn('vm.swappiness=150', called)
        res, called = self.run_tune('/dev/zram0  partition\t8G\t0\t100\n/dev/nvme0n1p3  partition\t16G\t0\t-2\n')
        self.assertEqual((res.returncode, called), (0, ''))          # disk swap present: defaults kept
        res, called = self.run_tune('')
        self.assertEqual((res.returncode, called), (0, ''))
        dropin = (O / 'etc/systemd/system/zramswap.service.d/nova-tune.conf').read_text()
        self.assertIn('ExecStartPost=-/usr/local/lib/nova/nova-zram-tune', dropin)   # '-': never fails the unit


class ModernUi(unittest.TestCase):
    def test_indicators_and_controls_are_styled(self):
        for variant in ui.ALL_VARIANTS:
            qss = ui.build_stylesheet(variant)
            for rule in ('QRadioButton::indicator:checked', 'QCheckBox::indicator:checked', 'QSlider::handle:horizontal',
                         'QGroupBox::title', 'QListWidget::item:selected { border-left'):
                self.assertIn(rule, qss, f'{variant}: {rule}')
            self.assertIn('text-align: center', qss)

    def test_no_shouting_english_window_titles(self):
        bin_dir = O / 'usr/local/bin'
        for app in bin_dir.glob('nova-*'):
            text = app.read_text(errors='replace')
            self.assertNotRegex(text, r"QLabel\('NOVA\s+/\s+[A-Z &]+'\)", app.name)
            self.assertNotRegex(text, r"QLabel\('NOVA [A-Z ]+\s+\|", app.name)

    def test_windows_like_panel_floats(self):
        js = layout.plasma_script('windows')
        self.assertIn('p.floating = true', js)


if __name__ == '__main__':
    unittest.main()
