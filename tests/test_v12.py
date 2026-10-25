"""NOVA OS 0.12 — System Experience & ISO Readiness regression tests.

These tests EXECUTE code where possible (hooks in a sandbox, verify-iso.sh
against stubbed tools, Plasma layout scripts in Node with a mock API, the
QEMU guest-agent protocol against a fake socket). They still do not replace
an ISO build, a VM boot or real hardware tests.
"""
import io
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
BIN = O / 'usr/local/bin'
HOOKS = ROOT / 'image/config/hooks/live'
sys.path.insert(0, str(BIN))
sys.path.insert(0, str(ROOT / 'tools'))
VERSION = (ROOT / 'VERSION').read_text().strip()

import nova_layout_core as layout  # noqa: E402
import nova_selftest_core as st  # noqa: E402
import nova_ui as ui  # noqa: E402
import nova_qemu_smoke as qs  # noqa: E402


def items(path):
    return [x.strip() for x in Path(path).read_text().splitlines() if x.strip() and not x.startswith('#')]


class Manifest(unittest.TestCase):
    def test_spectacle_name_fixed(self):
        pack = items(ROOT / 'image/config/package-lists/nova.list.chroot')
        self.assertIn('kde-spectacle', pack)
        self.assertNotIn('spectacle', pack)

    def test_installer_pool_split_bios_uefi(self):
        bios = items(ROOT / 'image/config/package-lists/nova-installer-bios.list.binary')
        efi = items(ROOT / 'image/config/package-lists/nova-installer-efi.list.binary')
        self.assertIn('grub-pc', bios)
        self.assertIn('grub-efi-amd64', efi)
        self.assertIn('shim-signed', efi)
        self.assertFalse({'grub-efi-amd64', 'grub-efi-amd64-signed', 'shim-signed'} & set(bios))
        self.assertNotIn('grub-pc', efi)

    def test_live_and_vm_essentials(self):
        pack = set(items(ROOT / 'image/config/package-lists/nova.list.chroot'))
        for name in ('live-config-systemd', 'user-setup', 'sudo', 'qt6-wayland', 'kwin-x11', 'sddm-theme-breeze',
                     'libkscreen-bin', 'libkf6config-bin', 'qemu-guest-agent', 'fonts-inter', 'maliit-keyboard',
                     'firmware-intel-graphics', 'firmware-nvidia-graphics'):
            self.assertIn(name, pack)
        self.assertFalse({'nvidia-driver', 'nvidia-kernel-dkms', 'waydroid', 'libreoffice'} & pack)


class BuildScripts(unittest.TestCase):
    def test_build_options(self):
        s = (ROOT / 'tools/build-iso.sh').read_text()
        for needle in ("--bootloaders 'grub-pc,grub-efi'", '--firmware-binary false', '--uefi-secure-boot auto',
                       'ISO_NAME="NOVA-OS-${VERSION}-amd64.iso"', 'verify-iso.sh', 'build-manifest.txt',
                       'MIN_FREE_GB', 'NOVA_REBUILD', '--one-file-system', 'keyboard-layouts=us,ru'):
            self.assertIn(needle, s)
        for bad in ('wipefs', 'mkfs.', 'dd if=', 'parted', '/dev/sd', '/dev/nvme'):
            self.assertNotIn(bad, s)

    def test_qemu_scripts_never_touch_host_disks(self):
        for name in ('test-qemu.sh', 'test-qemu-uefi.sh', 'qemu-boot-test.sh', 'nova_qemu_smoke.py'):
            s = (ROOT / 'tools' / name).read_text()
            for bad in ('/dev/sd', '/dev/nvme', '/dev/mmcblk', 'if=none,file=/dev'):
                self.assertNotIn(bad, s, name)

    def test_workflow_jobs(self):
        w = (ROOT / '.github/workflows/build-iso.yml').read_text()
        for job in ('validate:', 'ui-smoke:', 'build-iso:', 'boot-test:'):
            self.assertIn(job, w)
        self.assertIn('99-kvm4all.rules', w)
        self.assertIn('firmware: [bios, uefi]', w)
        self.assertIn('nova_qemu_smoke.py', w)
        self.assertIn("tr -d '[:space:]' < VERSION", w)

    def test_version_consistency(self):
        self.assertIn(f'NOVA_OS_VERSION={VERSION}', (O / 'etc/nova-release').read_text())


class HookSandbox(unittest.TestCase):
    """Run the Calamares branding part of 090-nova.hook.chroot in a temp root."""

    def _run_block(self, tmp, with_logo=True):
        t = Path(tmp)
        deb = t / 'etc/calamares/branding/debian'
        deb.mkdir(parents=True)
        (deb / 'branding.desc').write_text(
            '---\ncomponentName:  debian\nstrings:\n    productName:         Debian\n'
            '    shortProductName:    Debian\n    version:             13\n    shortVersion:        13\n'
            '    versionedName:       Debian 13 "Trixie"\n    shortVersionedName:  Debian 13\n'
            '    bootloaderEntryName: Debian\nimages:\n    productLogo:         "logo.png"\n'
            '    productIcon:         "logo.png"\n    productWelcome:      "languages.png"\n'
            'style:\n   SidebarBackground:    "#2c3133"\n   SidebarText:          "#FFFFFF"\n')
        (deb / 'show.qml').write_text('// debian slideshow')
        (t / 'etc/calamares/settings.conf').write_text('---\nmodules-search: [ local ]\nbranding: debian\n')
        (t / 'etc/nova-release').write_text(f'NOVA_OS_VERSION={VERSION}\n')
        art = t / 'usr/share/nova/branding'
        art.mkdir(parents=True)
        if with_logo:
            (art / 'logo.png').write_bytes(b'LOGO')
            (art / 'welcome.png').write_bytes(b'WELCOME')
        hook = (HOOKS / '090-nova.hook.chroot').read_text()
        start = hook.index('NOVA_VERSION=$(')
        end = hook.index('# Calamares launcher name')
        block = hook[start:end].replace('/etc/', f'{t}/etc/').replace('/usr/share/nova', f'{t}/usr/share/nova')
        script = 'set -eu\nlog() { echo "LOG: $*"; }\n' + block
        res = subprocess.run(['sh', '-c', script], capture_output=True, text=True, check=False)
        return t, res

    def test_branding_switches_to_nova(self):
        with tempfile.TemporaryDirectory() as tmp:
            t, res = self._run_block(tmp)
            self.assertEqual(res.returncode, 0, res.stderr)
            desc = (t / 'etc/calamares/branding/nova/branding.desc').read_text()
            self.assertIn('componentName:  nova', desc)
            self.assertIn(f'"NOVA OS {VERSION}"', desc)
            self.assertIn('bootloaderEntryName: Debian', desc)  # Secure Boot path /EFI/debian kept
            self.assertIn('branding: nova', (t / 'etc/calamares/settings.conf').read_text())
            self.assertEqual((t / 'etc/calamares/branding/nova/logo.png').read_bytes(), b'LOGO')
            self.assertEqual((t / 'etc/calamares/branding/nova/languages.png').read_bytes(), b'WELCOME')
            self.assertTrue((t / 'etc/calamares/branding/nova/show.qml').exists())
            self.assertIn('branding: debian', '---\nbranding: debian\n')  # sanity

    def test_branding_skipped_without_artwork(self):
        with tempfile.TemporaryDirectory() as tmp:
            t, res = self._run_block(tmp, with_logo=False)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn('branding: debian', (t / 'etc/calamares/settings.conf').read_text())
            self.assertFalse((t / 'etc/calamares/branding/nova').exists())

    def test_hook_enables_firewall_and_keeps_safety(self):
        s = (HOOKS / '090-nova.hook.chroot').read_text()
        self.assertIn("sed -i 's/^ENABLED=.*/ENABLED=yes/' /etc/ufw/ufw.conf", s)
        for bad in ('ufw disable', 'aa-teardown', 'apparmor=0', 'curl ', 'wget ', 'nvidia-driver'):
            self.assertNotIn(bad, s)


class PoolHook(unittest.TestCase):
    def _make_binary_tree(self, tmp, debs=('grub-pc_2.12_amd64.deb', 'grub-efi-amd64_2.12_amd64.deb',
                                            'grub-efi-amd64-signed_1_amd64.deb')):
        b = Path(tmp) / 'binary'
        (b / 'pool/main/g/grub2').mkdir(parents=True)
        for d in debs:
            (b / 'pool/main/g/grub2' / d).write_bytes(b'!<arch>\n')
        stub = Path(tmp) / 'stub'
        stub.mkdir()
        f = stub / 'apt-ftparchive'
        f.write_text('#!/bin/sh\nif [ "$1" = packages ]; then echo "Package: grub-pc"; else echo "Origin: test"; fi\n')
        f.chmod(0o755)
        return b, stub

    def test_generates_indices_and_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            b, stub = self._make_binary_tree(tmp)
            env = dict(os.environ, PATH=f'{stub}:{os.environ["PATH"]}')
            res = subprocess.run(['sh', str(HOOKS / '095-nova-pool-indices.hook.binary')], cwd=b, env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn('Package: grub-pc', (b / 'dists/trixie/main/binary-amd64/Packages').read_text())
            self.assertTrue((b / 'dists/trixie/main/binary-amd64/Packages.gz').is_file())
            self.assertTrue((b / 'dists/trixie/Release').is_file())
            self.assertTrue((b / '.disk/nova-offline-bootloader').read_text().startswith('ok '))

    def test_incomplete_pool_is_reported_not_fatal(self):
        with tempfile.TemporaryDirectory() as tmp:
            b, stub = self._make_binary_tree(tmp, debs=('grub-pc_2.12_amd64.deb',))
            env = dict(os.environ, PATH=f'{stub}:{os.environ["PATH"]}')
            res = subprocess.run(['sh', str(HOOKS / '095-nova-pool-indices.hook.binary')], cwd=b, env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 0)
            self.assertTrue((b / '.disk/nova-offline-bootloader').read_text().startswith('incomplete'))


class VerifyIsoScript(unittest.TestCase):
    """Run tools/verify-iso.sh against stubbed xorriso/unsquashfs output."""

    TREE = ["'/live/vmlinuz-6.12.0-amd64'", "'/live/initrd.img-6.12.0-amd64'", "'/live/filesystem.squashfs'",
            "'/boot/grub/grub.cfg'", "'/EFI/boot/bootx64.efi'", "'/EFI/boot/grubx64.efi'",
            "'/pool/main/g/grub2/grub-pc_2.12_amd64.deb'", "'/pool/main/g/grub2/grub-efi-amd64_2.12_amd64.deb'",
            "'/dists/trixie/main/binary-amd64/Packages.gz'"]
    FILES = ['/usr/bin/calamares', '/usr/bin/startplasma-wayland', '/usr/bin/startplasma-x11', '/usr/bin/sddm',
             '/usr/sbin/NetworkManager', '/usr/bin/wireplumber', '/usr/bin/kwin_wayland',
             '/usr/lib/live/config/0030-user-setup', '/etc/calamares/settings.conf',
             '/etc/calamares/branding/nova/branding.desc',
             '/usr/share/plasma/look-and-feel/org.nova.air.light.desktop/metadata.json',
             '/usr/share/plasma/look-and-feel/org.nova.air.dark.desktop/metadata.json',
             '/usr/share/color-schemes/NovaAirLight.colors', '/usr/local/bin/nova_ui.py', '/etc/nova-release',
             '/usr/share/plasma/look-and-feel/org.nova.neon.desktop/metadata.json',
             '/usr/share/plasma/wallpapers/org.nova.neon.wallpaper/contents/ui/main.qml',
             '/usr/share/color-schemes/NovaNeon.colors',
             '/usr/share/plasma/wallpapers/org.nova.live.wallpaper/contents/ui/main.qml',
             '/usr/share/plasma/plasmoids/org.nova.neon.stats/contents/ui/main.qml',
             '/usr/sbin/qemu-ga', '/etc/xdg/kglobalshortcutsrc', '/usr/bin/kscreen-doctor', '/usr/bin/ddcutil',
             ] + [f'/usr/local/bin/{a}' for a in (
                 'nova-display', 'nova-hotkeys', 'nova-game-bar', 'nova-key', 'nova-control', 'nova-personalize', 'nova-layout', 'nova-selftest', 'nova-first-run', 'nova-defender',
                 'nova-task-manager', 'nova-update-center', 'nova-driver-center', 'nova-android-hub', 'nova-dualboot',
                 'nova-migration', 'nova-sound-studio', 'nova-gaming', 'nova-phone-hub', 'nova-health', 'nova-performance',
                 'nova-neon', 'nova-neon-center', 'nova-styles')]

    def _stubs(self, tmp, uefi=True, files=None):
        stub = Path(tmp) / 'stub'
        stub.mkdir()
        tree = '\n'.join(self.TREE)
        eltorito = ('El Torito boot img :   1  BIOS  y   none  0x0000  0x00      4         2\n'
                    + ('El Torito boot img :   2  UEFI  y   none  0x0000  0x00   8192       1234\n' if uefi else ''))
        (stub / 'xorriso').write_text(f'''#!/bin/sh
case "$*" in
  *report_el_torito*) printf '%s' "{eltorito}" ;;
  *report_system_area*) echo "System area summary: MBR isohybrid cyl-align-off GPT" ;;
  *"-find / -type f"*) printf '%s\\n' "{tree}" ;;
  *"-extract /boot/grub/grub.cfg"*) eval last=\\${{$#}}; echo "linux /live/vmlinuz boot=live components quiet splash" > "$last" ;;
  *"-extract /.disk/nova-offline-bootloader"*) eval last=\\${{$#}}; echo "ok grub-pc=1 grub-efi-amd64=1 grub-efi-amd64-signed=1" > "$last" ;;
  *"-extract /live/filesystem.squashfs"*) eval last=\\${{$#}}; : > "$last" ;;
esac
''')
        listing = '\n'.join('squashfs-root' + f for f in (files if files is not None else self.FILES))
        (stub / 'unsquashfs').write_text(f'#!/bin/sh\nprintf "%s\\n" "{listing}"\n')
        for f in stub.iterdir():
            f.chmod(0o755)
        return stub

    def _run(self, tmp, **kw):
        stub = self._stubs(tmp, **kw)
        iso = Path(tmp) / f'NOVA-OS-{VERSION}-amd64.iso'
        iso.write_bytes(b'\0' * 2048)
        env = dict(os.environ, PATH=f'{stub}:{os.environ["PATH"]}', TMPDIR=tmp)
        return subprocess.run(['bash', str(ROOT / 'tools/verify-iso.sh'), str(iso)], env=env,
                              capture_output=True, text=True, check=False)

    def test_complete_iso_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            res = self._run(tmp)
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            self.assertIn('PASS  UEFI El Torito boot image present', res.stdout)
            self.assertIn('PASS  offline GRUB packages', res.stdout)
            self.assertIn('SUMMARY fail=0', res.stdout)

    def test_missing_uefi_and_app_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            files = [f for f in self.FILES if f != '/usr/local/bin/nova-control']
            res = self._run(tmp, uefi=False, files=files)
            self.assertNotEqual(res.returncode, 0)
            self.assertIn('FAIL  no UEFI El Torito boot image', res.stdout)
            self.assertIn('FAIL  nova-control', res.stdout)


class UiKit(unittest.TestCase):
    def test_text_contrast_wcag_aa(self):
        pairs = [('text', 'bg'), ('text', 'surface'), ('text_muted', 'bg'), ('text_muted', 'surface'),
                 ('accent_text', 'accent'), ('accent_soft_text', 'accent_soft'), ('danger', 'surface'),
                 ('danger_text', 'danger'), ('brand', 'bg'), ('success', 'surface'), ('warning', 'surface'),
                 ('text', 'selection')]
        for variant, t in ui.TOKENS.items():
            for a, b in pairs:
                self.assertGreaterEqual(ui.contrast_ratio(t[a], t[b]), 4.5, f'{variant}: {a} on {b}')

    def test_fit_size_small_and_hidpi_screens(self):
        self.assertEqual(ui.fit_size((1180, 760), (1366, 720)), (1180, 676))
        w, h = ui.fit_size((1080, 800), (1366, 720))
        self.assertLessEqual(h, 720)
        self.assertEqual(ui.fit_size((900, 600), (3840, 2160)), (900, 600))
        self.assertEqual(ui.fit_size((900, 600), (320, 300), minimum=(360, 420)), (300, 282))

    def test_parse_size_and_breakpoints(self):
        self.assertEqual(ui.parse_size('1366x768'), (1366, 768))
        self.assertEqual(ui.parse_size('1920×1080'), (1920, 1080))
        self.assertIsNone(ui.parse_size('big'))
        self.assertTrue(ui.is_compact(800))
        self.assertFalse(ui.is_compact(1000))
        self.assertEqual(ui.grid_columns(500), 1)
        self.assertEqual(ui.grid_columns(700), 2)
        self.assertEqual(ui.grid_columns(2000), 3)

    def test_theme_choice_and_plasma_detection(self):
        with tempfile.TemporaryDirectory() as home:
            old = os.environ.pop('NOVA_THEME', None)
            try:
                self.assertEqual(ui.read_choice(home), 'auto')
                ui.save_choice('dark', home)
                self.assertEqual(ui.read_choice(home), 'dark')
                with self.assertRaises(ValueError):
                    ui.save_choice('sepia', home)
                cfg = Path(home) / '.config/kdeglobals'
                cfg.write_text('[Colors:Window]\nBackgroundNormal=32,35,38\n')
                self.assertEqual(ui.detect_plasma_variant(home, system_file='/nonexistent'), 'dark')
                cfg.write_text('[General]\nColorScheme=NovaAirLight\n')
                self.assertEqual(ui.detect_plasma_variant(home, system_file='/nonexistent'), 'light')
                ui.save_choice('auto', home)
                cfg.write_text('[General]\nColorScheme=BreezeDark\n')
                self.assertEqual(ui.resolve_variant(home), 'dark')
                os.environ['NOVA_THEME'] = 'light'
                self.assertEqual(ui.resolve_variant(home), 'light')
            finally:
                os.environ.pop('NOVA_THEME', None)
                if old is not None:
                    os.environ['NOVA_THEME'] = old

    def test_reduced_motion(self):
        with tempfile.TemporaryDirectory() as home:
            (Path(home) / '.config').mkdir()
            (Path(home) / '.config/kdeglobals').write_text('[KDE]\nAnimationDurationFactor=0\n')
            self.assertTrue(ui.reduced_motion(home))

    def test_qss_has_focus_and_variants_and_dark_tabs(self):
        dark = ui.build_stylesheet('dark')
        self.assertIn('QPushButton:focus', dark)
        self.assertIn('QPushButton[variant="danger"]', dark)
        self.assertNotIn('background: #fff', dark)  # 0.11 bug: white tab pane in dark theme
        for v in ('light', 'dark'):
            self.assertEqual((O / f'usr/share/nova/themes/air-{v}.qss').read_text(), ui.build_stylesheet(v))

    def test_every_gui_app_uses_shared_window_setup(self):
        for app in st.UI_APPS:
            s = (BIN / app).read_text()
            self.assertIn('setup_window(', s, app)
            self.assertNotIn('self.resize(', s, app)
            self.assertNotIn('shell=True', s, app)

    def test_version_reader(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / 'r'
            f.write_text('NOVA_OS_VERSION=0.12\n')
            self.assertEqual(ui.nova_version(f), '0.12')
            f.write_text('NOVA_OS_VERSION=$(evil)\n')
            self.assertEqual(ui.nova_version(f), 'dev')


class LayoutCore(unittest.TestCase):
    def test_validation(self):
        for bad in ('windowz', '', 'dock;rm'):
            with self.assertRaises(ValueError):
                layout.validate_mode(bad)
        with self.assertRaises(ValueError):
            layout.validate_accent('red')
        self.assertEqual(layout.accent_rgb('#1F6FEB'), '31,111,235')

    def test_accent_palette_contrast(self):
        for name, light, dark in layout.ACCENTS:
            self.assertGreaterEqual(ui.contrast_ratio('#ffffff', light), 4.5, name)
            self.assertGreaterEqual(ui.contrast_ratio(ui.TOKENS['dark']['accent_text'], dark), 4.5, name)

    def test_scripts_have_no_user_interpolation(self):
        for mode in layout.MODES:
            js = layout.plasma_script(mode, 'touch')
            self.assertIn('novaRemovePanels();', js)
            self.assertNotIn('%WALLPAPER%', js)
            self.assertNotIn('`', js)
        self.assertNotIn('novaRemovePanels();', layout.lnf_layout_script())

    @unittest.skipUnless(shutil.which('node'), 'node not installed')
    def test_scripts_execute_against_plasma_mock(self):
        mock = r'''
const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
const st={panels:[],removed:0,log:[]};
function W(t){this.type=t;this.config={};this.currentConfigGroup=[];}
W.prototype.writeConfig=function(k,v){this.config[this.currentConfigGroup.join('/')+'/'+k]=v;};
function Panel(){this.widgets=[];st.panels.push(this);}
Panel.prototype.addWidget=function(t){const w=new W(t);this.widgets.push(w);return w;};
Panel.prototype.remove=function(){st.removed++;st.panels=st.panels.filter(p=>p!==this);};
new Panel();new Panel();const ds=[new W('desktop')];
new Function('Panel','panels','desktops','print',src)(Panel,()=>st.panels.slice(),()=>ds,(m)=>st.log.push(m));
console.log(JSON.stringify({removed:st.removed,log:st.log,wall:ds[0].config['Wallpaper/org.kde.image/General/Image'],
panels:st.panels.map(p=>({loc:p.location,h:p.height,len:p.lengthMode,fl:p.floating,w:p.widgets.map(x=>x.type)}))}));
'''
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'mock.js').write_text(mock)
            results = {}
            for mode in layout.MODES:
                (Path(tmp) / f'{mode}.js').write_text(layout.plasma_script(mode, 'standard'))
                out = subprocess.run(['node', str(Path(tmp) / 'mock.js'), str(Path(tmp) / f'{mode}.js')],
                                     capture_output=True, text=True, check=True).stdout
                results[mode] = json.loads(out)
        for mode, r in results.items():
            self.assertEqual(r['removed'], 2, mode)
            self.assertEqual(r['log'], [], mode)
            self.assertEqual(r['wall'], layout.WALLPAPER)
        win = results['windows']['panels']
        self.assertEqual(len(win), 1)
        self.assertEqual(win[0]['w'][0], 'org.kde.plasma.panelspacer')  # centred tasks
        self.assertIn('org.kde.plasma.icontasks', win[0]['w'])
        self.assertEqual((win[0]['loc'], win[0]['h'], win[0]['len']), ('bottom', 48, 'fill'))
        dock = results['dock']['panels']
        self.assertEqual([p['loc'] for p in dock], ['top', 'bottom'])
        self.assertEqual((dock[1]['len'], dock[1]['fl'], dock[1]['w']), ('fit', True, ['org.kde.plasma.icontasks']))
        hyb = results['hybrid']['panels']
        self.assertEqual((len(hyb), hyb[0]['len'], hyb[0]['fl']), (1, 'fit', True))

    def test_backup_restore_roundtrip(self):
        with tempfile.TemporaryDirectory() as home:
            cfg = Path(home) / '.config'
            cfg.mkdir()
            self.assertIsNone(layout.make_backup(home))
            (cfg / 'plasma-org.kde.plasma.desktop-appletsrc').write_text('ORIGINAL')
            b1 = layout.make_backup(home, 'before-dock', now=0)
            b2 = layout.make_backup(home, 'before-dock', now=0)
            self.assertNotEqual(b1, b2)  # never overwrite
            (cfg / 'plasma-org.kde.plasma.desktop-appletsrc').write_text('CHANGED')
            self.assertEqual(layout.restore_files(b1, home), ['plasma-org.kde.plasma.desktop-appletsrc'])
            self.assertEqual((cfg / 'plasma-org.kde.plasma.desktop-appletsrc').read_text(), 'ORIGINAL')
            outside = Path(home) / 'evil'
            outside.mkdir()
            with self.assertRaises(ValueError):
                layout.restore_files(outside, home)
            with self.assertRaises(ValueError):
                layout.make_backup(home, '../x')

    def test_preferences_are_filtered(self):
        with tempfile.TemporaryDirectory() as home:
            layout.save_preferences({'mode': 'dock', 'density': 'touch', 'accent': '#7B3FD6', 'evil': 'x'}, home)
            self.assertEqual(layout.load_preferences(home), {'mode': 'dock', 'density': 'touch', 'accent': '#7b3fd6'})
            (Path(home) / '.config/nova/desktop.json').write_text('{"mode": "rm -rf"}')
            self.assertEqual(layout.load_preferences(home), {})

    def test_command_builders(self):
        self.assertEqual(layout.lookandfeel_command('kde-default', True),
                         ['plasma-apply-lookandfeel', '--apply', 'org.kde.breeze.desktop', '--resetLayout'])
        self.assertNotIn('--resetLayout', layout.lookandfeel_command('dark'))
        self.assertEqual(layout.animation_command('off')[-1], '0')
        with self.assertRaises(ValueError):
            layout.lookandfeel_command('sepia')

    def test_cli_dry_run(self):
        with tempfile.TemporaryDirectory() as home:
            env = dict(os.environ, HOME=home, PYTHONDONTWRITEBYTECODE='1')
            res = subprocess.run([sys.executable, str(BIN / 'nova-layout'), '--dry-run', 'reset-kde'], env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 0, res.stderr)
            self.assertIn('plasma-apply-lookandfeel --apply org.kde.breeze.desktop --resetLayout', res.stdout)
            res = subprocess.run([sys.executable, str(BIN / 'nova-layout'), 'accent', 'blue'], env=env,
                                 capture_output=True, text=True, check=False)
            self.assertEqual(res.returncode, 2)


class PlasmaAssets(unittest.TestCase):
    def test_generated_assets_in_sync(self):
        res = subprocess.run([sys.executable, str(ROOT / 'tools/gen-plasma-theme.py'), '--check'],
                             capture_output=True, text=True, check=False)
        self.assertEqual(res.returncode, 0, res.stdout)

    def test_lnf_packages(self):
        kdeglobals = (O / 'etc/xdg/kdeglobals').read_text()
        for variant, pid in layout.LNF.items():
            base = O / 'usr/share/plasma/look-and-feel' / pid
            meta = json.loads((base / 'metadata.json').read_text())
            self.assertEqual(meta['KPlugin']['Id'], pid)
            self.assertEqual(meta['KPackageStructure'], 'Plasma/LookAndFeel')
            self.assertIn('new Panel', (base / 'contents/layouts/org.kde.plasma.desktop-layout.js').read_text())
            self.assertTrue((base / 'contents/previews/preview.png').is_file())
        self.assertIn(f'LookAndFeelPackage={layout.LNF["dark"]}', kdeglobals)  # default style: NOVA Air dark
        for scheme in ('NovaAirLight', 'NovaAirDark'):
            text = (O / f'usr/share/color-schemes/{scheme}.colors').read_text()
            for group in ('Window', 'View', 'Button', 'Selection', 'Tooltip', 'Complementary', 'Header'):
                self.assertIn(f'[Colors:{group}]', text)
        self.assertTrue((O / 'usr/share/wallpapers/NOVA/metadata.json').is_file())
        self.assertIn('LayoutList=us,ru', (O / 'etc/xdg/kxkbrc').read_text())

    def test_launchers_for_new_tools(self):
        for name in ('nova-personalize', 'nova-selftest'):
            d = (O / f'usr/share/applications/{name}.desktop').read_text()
            self.assertIn('[Desktop Entry]', d)
        self.assertTrue((O / 'usr/share/nova/branding/logo.png').is_file())


class SelftestCore(unittest.TestCase):
    KSCREEN = json.dumps({'outputs': [{'name': 'eDP-1', 'connected': True, 'enabled': True, 'scale': 1.25,
                                       'currentModeId': '2', 'modes': [
                                           {'id': '1', 'size': {'width': 1920, 'height': 1080}, 'refreshRate': 60.0},
                                           {'id': '2', 'size': {'width': 2560, 'height': 1600}, 'refreshRate': 165.0}]}]})
    LSPCI = ('00:02.0 VGA compatible controller [0300]: Intel Corporation Raptor Lake-P [Iris Xe Graphics] [8086:a7a0] (rev 04)\n'
             '\tSubsystem: ASUSTeK Computer Inc. Device [1043:1e13]\n\tKernel driver in use: i915\n\tKernel modules: i915, xe\n'
             '01:00.0 VGA compatible controller [0300]: NVIDIA Corporation AD107M [GeForce RTX 4060 Max-Q / Mobile] [10de:28e0] (rev a1)\n'
             '\tKernel driver in use: nouveau\n\tKernel modules: nouveau\n')
    WPCTL = ('PipeWire \'pipewire-0\' [1.4.2]\n └─ Clients:\n\nAudio\n ├─ Devices:\n │      45. Built-in Audio [alsa]\n'
             ' ├─ Sinks:\n │  *   52. Built-in Audio Analog Stereo        [vol: 0.40]\n │      60. Dummy Output [vol: 1.00]\n'
             ' ├─ Sources:\n │  *   53. Built-in Audio Analog Stereo        [vol: 1.00]\n\nVideo\n ├─ Devices:\n')

    def test_kscreen(self):
        outs = st.parse_kscreen_json(self.KSCREEN)
        self.assertEqual((outs[0]['width'], outs[0]['height'], outs[0]['refresh'], outs[0]['scale']), (2560, 1600, 165.0, 1.25))
        self.assertEqual(outs[0]['mode_ids']['1920x1080'], '1')
        self.assertEqual(st.parse_kscreen_json('garbage'), [])

    def test_hybrid_gpu(self):
        gpus = st.parse_lspci_gpus(self.LSPCI)
        self.assertEqual([g['vendor'] for g in gpus], ['intel', 'nvidia'])
        self.assertEqual(gpus[1]['driver'], 'nouveau')
        res = st.gpu_assessment(gpus)
        self.assertTrue(res['hybrid'])
        self.assertEqual(res['status'], st.WARN)
        self.assertIn('Гибридная графика', res['detail'])
        # Regression: 'Corporation' contains 'ati' — vendor must come from the PCI ID.
        self.assertEqual(st.gpu_vendor('Intel Corporation Iris Xe', '8086:a7a0'), 'intel')
        self.assertEqual(st.gpu_vendor('Intel Corporation Iris Xe'), 'intel')
        self.assertEqual(st.gpu_vendor('Advanced Micro Devices, Inc. [AMD/ATI] Phoenix1', '1002:15bf'), 'amd')
        self.assertEqual(st.gpu_vendor('Red Hat, Inc. Virtio 1.0 GPU', '1af4:1050'), 'virtual')
        ok = st.gpu_assessment([{'vendor': 'amd', 'name': 'Radeon', 'driver': 'amdgpu', 'slot': '', 'ids': ''}])
        self.assertEqual(ok['status'], st.PASS)

    def test_audio_and_inputs(self):
        self.assertEqual(st.parse_wpctl_sinks(self.WPCTL), ['Built-in Audio Analog Stereo'])
        devices = 'N: Name="ELAN0712:00 04F3:30FD Touchpad"\nN: Name="AT Translated Set 2 keyboard"\n'
        d = st.parse_input_devices(devices)
        self.assertTrue(d['touchpad'] and d['keyboard'])
        self.assertFalse(d['touchscreen'])

    def test_firmware_errors(self):
        log = ('kernel: iwlwifi 0000:00:14.3: Direct firmware load for iwlwifi-so-a0-gf-a0-89.ucode failed with error -2\n'
               'kernel: iwlwifi 0000:00:14.3: Direct firmware load for iwlwifi-so-a0-gf-a0-89.ucode failed with error -2\n')
        self.assertEqual(st.parse_firmware_errors(log), ['iwlwifi-so-a0-gf-a0-89.ucode'])

    def test_resolution_classes_and_summary(self):
        self.assertEqual(st.classify_resolution(1366, 768), 'HD (1366×768)')
        self.assertEqual(st.classify_resolution(3840, 2160, 2.0), '4K, масштаб 200 %')
        s = st.summarize([st.check('a', 'A', st.PASS), st.check('b', 'B', st.WARN)])
        self.assertEqual(s['verdict'], st.WARN)
        self.assertEqual(st.cmdline_flags('quiet boot=live toram')['toram'], True)

    def test_ui_result(self):
        good = {'fits_screen': True, 'content_fits_window': True, 'window': [1000, 650], 'available': [1366, 720],
                'minimum_size_hint': [600, 400], 'device_pixel_ratio': 1.0}
        self.assertEqual(st.ui_result(good, True, 'hd', 'nova-control')['status'], st.PASS)
        bad = dict(good, content_fits_window=False)
        self.assertEqual(st.ui_result(bad, True, 'hd', 'nova-control')['status'], st.WARN)
        self.assertEqual(st.ui_result(None, False, 'hd', 'nova-control')['status'], st.FAIL)
        self.assertEqual(len(st.UI_MATRIX), 4)

    def test_selftest_cli_outputs_json(self):
        res = subprocess.run([sys.executable, str(BIN / 'nova-selftest'), '--json'], capture_output=True, text=True,
                             env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'), timeout=120, check=False)
        report = json.loads(res.stdout)
        self.assertIn('summary', report)
        self.assertTrue(any(c['id'] == 'nova-apps' and c['status'] == st.PASS for c in report['checks']))


class QemuHarness(unittest.TestCase):
    def test_ppm_to_png(self):
        w, h = 3, 2
        pixels = bytes([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90])
        ppm = b'P6\n# comment\n3 2\n255\n' + pixels
        png = qs.ppm_to_png(ppm)
        self.assertTrue(png.startswith(b'\x89PNG\r\n\x1a\n'))
        idat = png[png.index(b'IDAT') + 4:png.index(b'IEND') - 8]
        raw = zlib.decompress(idat)
        self.assertEqual(raw, b'\x00' + pixels[:9] + b'\x00' + pixels[9:])
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(png))
            self.assertEqual(img.size, (w, h))
            self.assertEqual(img.getpixel((2, 0)), (0, 0, 255))
        except ImportError:
            pass
        stats = qs.image_stats(ppm)
        self.assertEqual((stats['width'], stats['height']), (3, 2))

    def test_qemu_command_is_isolated(self):
        with tempfile.TemporaryDirectory() as tmp:
            argv = qs.qemu_command(Path('/tmp/nova.iso'), Path(tmp), 'bios', 4096, 2, None, 'tcg')
        joined = ' '.join(argv)
        self.assertIn('media=cdrom,readonly=on', joined)
        self.assertIn('org.qemu.guest_agent.0', joined)
        self.assertNotIn('/dev/', joined)
        self.assertNotIn('pflash', joined)

    def test_guest_agent_protocol(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / 'qga.sock')
            srv = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            srv.bind(path)
            srv.listen(5)

            def serve():
                for _ in range(3):
                    conn, _addr = srv.accept()
                    f = conn.makefile('rb')
                    first = f.readline().lstrip(b'\xff')
                    sync = json.loads(first)
                    conn.sendall(b'\xff' + json.dumps({'return': sync['arguments']['id']}).encode() + b'\n')
                    req = json.loads(f.readline())
                    if req['execute'] == 'guest-ping':
                        reply = {'return': {}}
                    elif req['execute'] == 'guest-exec':
                        reply = {'return': {'pid': 42}}
                    else:
                        import base64
                        reply = {'return': {'exited': True, 'exitcode': 0,
                                            'out-data': base64.b64encode(b'plasmashell\n').decode()}}
                    conn.sendall(json.dumps(reply).encode() + b'\n')
                    conn.close()

            t = threading.Thread(target=serve, daemon=True)
            t.start()
            qga = qs.QGA(path)
            self.assertTrue(qga.ping())
            code, out = qga.exec(['/usr/bin/pgrep', '-x', 'plasmashell'], timeout=10)
            self.assertEqual((code, out.strip()), (0, 'plasmashell'))
            t.join(5)
            srv.close()


class AppFixes(unittest.TestCase):
    def test_control_memory_line_is_safe(self):
        s = (BIN / 'nova-control').read_text()
        self.assertIn('def memory_line', s)
        self.assertNotIn("cmd(['free','-h']).splitlines()[1]", s)
        self.assertIn('page_personalize', s)
        self.assertIn('adaptive_nav', s)

    def test_task_manager_reads_pid_from_column_zero(self):
        s = (BIN / 'nova-task-manager').read_text()
        self.assertIn('def selected_pid', s)
        self.assertIn('self.table.item(selected[0].row(), 0)', s)
        self.assertNotIn('int(selected[0].text())', s)

    def test_sound_daemon_survives_missing_upower(self):
        self.assertIn('except dbus.DBusException', (BIN / 'nova-sound-daemon').read_text())


if __name__ == '__main__':
    unittest.main()
