"""NOVA OS 0.12 «premium look» pass: vendored Fluent themes, NOVA wallpapers,
splash screens, login screen, user wallpapers. Executes the install script and
Plasma scripts; does not need KDE."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
BIN = O / 'usr/local/bin'
TP = ROOT / 'third_party'
sys.path.insert(0, str(BIN))

import nova_layout_core as layout  # noqa: E402
import nova_neon_core as neon  # noqa: E402
import nova_styles_core as core  # noqa: E402

WALLPAPERS = ('NOVA-NeonRain', 'NOVA-BlueSilk', 'NOVA-Signal', 'NOVA-Paper')


class Wallpapers(unittest.TestCase):
    def test_packages_complete(self):
        for pkg in WALLPAPERS:
            base = O / 'usr/share/wallpapers' / pkg
            meta = json.loads((base / 'metadata.json').read_text())
            self.assertEqual(meta['KPlugin']['Id'], pkg)
            for size in ('3840x2160', '2560x1440', '1920x1080'):
                self.assertTrue((base / f'contents/images/{size}.jpg').is_file(), (pkg, size))
            self.assertTrue((base / 'contents/screenshot.png').is_file())

    def test_artwork_is_generated_from_source(self):
        for scene in ('neon-rain.js', 'blue-silk.js', 'neon-signal.js', 'paper.js'):
            self.assertTrue((ROOT / 'tools/wallpapers' / scene).is_file(), scene)
        script = (ROOT / 'tools/gen-wallpapers.sh').read_text()
        for pkg in WALLPAPERS:
            self.assertIn(pkg, script)

    def test_styles_use_new_artwork(self):
        self.assertEqual(core.STYLES['air-dark']['wallpaper'], ('image', 'NOVA-NeonRain'))
        self.assertEqual(core.STYLES['air-light']['wallpaper'], ('image', 'NOVA-Paper'))
        self.assertEqual(core.STYLES['ocean']['wallpaper'], ('image', 'NOVA-BlueSilk'))
        self.assertEqual(core.STYLES['signal']['wallpaper'], ('image', 'NOVA-Signal'))
        self.assertIn('NOVA-NeonRain', layout.WALLPAPER)


class FluentLook(unittest.TestCase):
    def test_every_style_has_a_complete_look(self):
        for sid, st in core.STYLES.items():
            for key in ('plasma', 'deco', 'icons', 'cursor'):
                self.assertTrue(st.get(key), (sid, key))
            if sid == 'neon':
                continue
            d = core.lnf_defaults(sid)
            self.assertIn(f"name={st['plasma']}", d)
            self.assertIn(f"theme=__aurorae__svg__{st['deco']}", d)
            self.assertIn(f"cursorTheme={st['cursor']}", d)
            self.assertIn(f"Theme={layout.LNF[st['lnf']]}", d)          # NOVA splash

    @unittest.skipUnless(TP.is_dir(), 'third_party not vendored')
    def test_referenced_themes_are_vendored(self):
        k = TP / 'fluent-kde/root/.local/share'
        for sid, st in core.STYLES.items():
            self.assertTrue((k / 'plasma/desktoptheme' / st['plasma']).is_dir(), (sid, st['plasma']))
            self.assertTrue((k / 'aurorae/themes' / st['deco']).is_dir(), (sid, st['deco']))
            if st['icons'].startswith('Fluent'):
                self.assertTrue((TP / 'fluent-icons/icons' / st['icons'] / 'index.theme').is_file(), st['icons'])
        for name in ('fluent-kde', 'fluent-icons'):
            src = (TP / name / 'SOURCE.txt').read_text()
            self.assertRegex(src, r'commit=[0-9a-f]{40}')
            self.assertTrue((TP / name / 'LICENSE').is_file())

    @unittest.skipUnless(TP.is_dir(), 'third_party not vendored')
    def test_install_script_keeps_nova_login_background(self):
        with tempfile.TemporaryDirectory() as tmp:
            ours = Path(tmp) / 'usr/share/sddm/themes/Fluent/theme.conf.user'
            ours.parent.mkdir(parents=True)
            ours.write_text((O / 'usr/share/sddm/themes/Fluent/theme.conf.user').read_text())
            subprocess.run(['bash', str(ROOT / 'tools/install-third-party.sh'), tmp], check=True, capture_output=True)
            self.assertIn('NOVA-NeonRain', ours.read_text())
            self.assertTrue((Path(tmp) / 'usr/share/sddm/themes/Fluent/Main.qml').is_file())
            self.assertTrue((Path(tmp) / 'usr/share/icons/.Fluent-base').is_dir())
            self.assertTrue((Path(tmp) / 'usr/share/doc/nova-third-party/fluent-icons/LICENSE').is_file())

    def test_system_defaults_and_packages(self):
        self.assertIn('Current=Fluent', (O / 'etc/sddm.conf.d/10-nova.conf').read_text())
        self.assertIn('Fluent-round-dark', (O / 'etc/xdg/plasmarc').read_text())
        self.assertIn('Bibata-Modern-Ice', (O / 'etc/xdg/kcminputrc').read_text())
        self.assertIn('org.kde.kwin.aurorae', (O / 'etc/xdg/kwinrc').read_text())
        pack = (ROOT / 'image/config/package-lists/nova.list.chroot').read_text().split()
        for p in ('bibata-cursor-theme', 'qt6-style-kvantum', 'qml6-module-qt5compat-graphicaleffects'):
            self.assertIn(p, pack)
        self.assertIn('install-third-party.sh', (ROOT / 'tools/build-iso.sh').read_text())


class Splash(unittest.TestCase):
    def test_splash_per_style(self):
        for lnf in ('org.nova.air.dark.desktop', 'org.nova.air.light.desktop', 'org.nova.signal.desktop',
                    'org.nova.ocean.desktop', 'org.nova.aurora.desktop', 'org.nova.sakura.desktop'):
            qml = (O / f'usr/share/plasma/look-and-feel/{lnf}/contents/splash/Splash.qml').read_text()
            self.assertIn('property int stage', qml)
            self.assertIn('root.stage / 6', qml)
            self.assertIn('import Qt5Compat.GraphicalEffects', qml)
            self.assertEqual(qml.count('{'), qml.count('}'), lnf)


class NeonFix(unittest.TestCase):
    def test_no_broken_stock_applets(self):
        bad = {'org.kde.plasma.calendar', 'org.kde.plasma.mediacontroller', 'org.kde.plasma.notes', 'org.kde.plasma.timer'}
        self.assertFalse(bad & {p for p, *_ in neon.WIDGETS})
        js = (O / 'usr/share/plasma/look-and-feel/org.nova.neon.desktop/contents/layouts/org.kde.plasma.desktop-layout.js').read_text()
        for plugin in bad:
            self.assertNotIn(f'"{plugin}"', js)


class UserWallpapers(unittest.TestCase):
    def test_add_list_and_reject(self):
        with tempfile.TemporaryDirectory() as home:
            pic = Path(home) / 'мой фон.png'
            pic.write_bytes(b'\x89PNG\r\n\x1a\n')
            a = layout.add_user_wallpapers([pic], home)
            b = layout.add_user_wallpapers([pic], home)
            self.assertNotEqual(a[0], b[0])                       # never overwrites
            self.assertEqual(len(layout.list_user_wallpapers(home)), 2)
            self.assertTrue(str(a[0]).startswith(str(layout.user_wallpaper_dir(home))))
            with self.assertRaises(ValueError):
                layout.add_user_wallpapers([Path('/etc/passwd')], home)

    def test_slideshow_script(self):
        js = layout.slideshow_script('/home/u/.local/share/wallpapers/NOVA-My', 15)
        self.assertIn('org.kde.slideshow', js)
        self.assertIn('"file:///home/u/.local/share/wallpapers/NOVA-My"', js)
        self.assertIn('SlideInterval", 900', js)
        with self.assertRaises(ValueError):
            layout.slideshow_script('/x', 0)

    def test_cli_dry_run(self):
        with tempfile.TemporaryDirectory() as home:
            env = dict(os.environ, HOME=home, PYTHONDONTWRITEBYTECODE='1')
            r = subprocess.run([sys.executable, str(BIN / 'nova-layout'), '--dry-run', 'wallpaper', 'slideshow'],
                               env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 2)                    # nothing added yet: clear message
            self.assertIn('сначала добавьте', r.stderr)


class BootMenu(unittest.TestCase):
    def test_background_uses_default_artwork(self):
        self.assertIn('NOVA-NeonRain', (ROOT / 'tools/gen-bootmenu.py').read_text())
        self.assertTrue((ROOT / 'image/config/includes.binary/boot/grub/nova/splash.png').is_file())


if __name__ == '__main__':
    unittest.main()
