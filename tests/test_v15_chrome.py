"""NOVA window chrome (Fluent / Aqua frames), motion presets and app animations — regression tests."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
BIN = O / 'usr/local/bin'
sys.path.insert(0, str(BIN))

import nova_chrome_core as chrome  # noqa: E402
import nova_styles_core as styles  # noqa: E402
import nova_ui as ui  # noqa: E402

SIDES = ('topleft', 'top', 'topright', 'left', 'center', 'right', 'bottomleft', 'bottom', 'bottomright')
STATES = ('active', 'inactive', 'hover', 'hover-inactive', 'pressed', 'pressed-inactive', 'deactivated')


def ids(svg_text: str) -> set[str]:
    return {e.get('id') for e in ET.fromstring(svg_text.split('?>', 1)[1]).iter() if e.get('id')}


class Themes(unittest.TestCase):
    def test_every_theme_is_complete(self):
        for family in chrome.FAMILIES:
            for variant in chrome.VARIANTS:
                tid = chrome.theme_id(family, variant)
                base = O / f'usr/share/aurorae/themes/{tid}'
                meta = (base / 'metadata.desktop').read_text()
                self.assertIn(f'X-KDE-PluginInfo-Name={tid}', meta)
                rc = (base / f'{tid}rc').read_text()
                for key in ('Shadow=true', 'PaddingLeft=', 'TitleHeight=', 'ButtonWidth=', 'ActiveTextColor='):
                    self.assertIn(key, rc, tid)
                deco = ids((base / 'decoration.svg').read_text())
                for state in ('decoration', 'decoration-inactive'):
                    for side in SIDES:
                        self.assertIn(f'{state}-{side}', deco, tid)
                self.assertIn('decoration-maximized-center', deco)
                for kind in ('close', 'minimize', 'maximize', 'restore'):
                    names = ids((base / f'{kind}.svg').read_text())
                    for st in STATES:
                        self.assertIn(f'{st}-center', names, f'{tid}/{kind}')

    def test_design_languages(self):
        fluent = chrome.theme_rc('fluent', 'light')
        aqua = chrome.theme_rc('aqua', 'sakura')
        self.assertIn('ButtonWidth=46', fluent)                     # Windows 11 caption buttons 46×32
        self.assertIn('TitleHeight=32', fluent)
        self.assertIn('TitleAlignment=Left', fluent)
        self.assertIn('TitleAlignment=Center', aqua)                # macOS: centred title
        self.assertEqual(chrome.BUTTONS['aqua'], ('XIA', ''))       # traffic lights on the left
        self.assertEqual(chrome.BUTTONS['fluent'], ('M', 'IAX'))
        self.assertIn('#c42b1c', chrome.button_svg('fluent', 'light', 'close'))   # red close on hover
        self.assertNotIn('#c42b1c', chrome.button_svg('fluent', 'light', 'minimize'))
        close = chrome.button_svg('aqua', 'light', 'close')
        self.assertIn('#ff5f57', close)
        # inactive window: grey lights, no colour
        inactive = [e for e in ET.fromstring(close.split('?>', 1)[1]).iter() if e.get('id') == 'inactive-center'][0]
        self.assertNotIn('#ff5f57', ET.tostring(inactive, encoding='unicode'))

    def test_title_matches_app_background(self):
        for variant in chrome.VARIANTS:
            self.assertEqual(chrome.palette(variant)['title'], ui.TOKENS[variant]['bg'])

    def test_text_contrast(self):
        def lum(c):
            v = [int(c[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            v = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in v]
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
        for variant in chrome.VARIANTS:
            p = chrome.palette(variant)
            a, b = sorted((lum(p['text']), lum(p['title'])), reverse=True)
            self.assertGreaterEqual((a + 0.05) / (b + 0.05), 4.5, variant)

    def test_validation(self):
        with self.assertRaises(ValueError):
            chrome.theme_id('metro', 'light')
        with self.assertRaises(ValueError):
            chrome.theme_id('fluent', '../x')


class Integration(unittest.TestCase):
    def test_styles_have_frames(self):
        for sid, st in styles.STYLES.items():
            family, variant = st['chrome']
            chrome.validate(family, variant)
        self.assertEqual(styles.STYLES['sakura']['chrome'][0], 'aqua')
        self.assertEqual(styles.STYLES['ocean']['chrome'][0], 'fluent')
        for sid in styles.NEW_LNF:
            self.assertIn('org.kde.kwin.aurorae', styles.lnf_defaults(sid))

    def test_system_defaults(self):
        kwinrc = (O / 'etc/xdg/kwinrc').read_text()
        self.assertIn('theme=__aurorae__svg__NOVA-Fluent-Dark', kwinrc)        # NOVA Air dark is the default
        self.assertIn('squashEnabled=true', kwinrc)
        self.assertIn('AnimationDurationFactor=0.75', (O / 'etc/xdg/kdeglobals').read_text())
        self.assertIn('FreeFloating=true', (O / 'etc/xdg/krunnerrc').read_text())
        air = (O / 'usr/share/plasma/look-and-feel/org.nova.air.light.desktop/contents/defaults').read_text()
        self.assertIn('NOVA-Fluent-Light', air)

    def cli(self, *args, home):
        env = dict(os.environ, HOME=home, PYTHONDONTWRITEBYTECODE='1', PATH=f'{BIN}:{os.environ["PATH"]}')
        return subprocess.run([sys.executable, str(BIN / 'nova-style'), *args], env=env, capture_output=True, text=True)

    def test_apply_writes_frame_and_motion(self):
        with tempfile.TemporaryDirectory() as home:
            out = self.cli('--dry-run', 'apply', 'sakura', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertIn('--key theme __aurorae__svg__NOVA-Aqua-Sakura', out.stdout)
            self.assertIn('--key ButtonsOnLeft XIA', out.stdout)
            self.assertIn('--key magiclampEnabled true', out.stdout)
            out = self.cli('--dry-run', 'apply', 'ocean', home=home)
            self.assertIn('NOVA-Fluent-Ocean', out.stdout)
            self.assertIn('--key squashEnabled true', out.stdout)

    def test_autopilot_switches_frame_with_colours(self):
        with tempfile.TemporaryDirectory() as home:
            cfg = Path(home) / '.config'
            cfg.mkdir()
            (cfg / 'kwinrc').write_text('[org.kde.kdecoration2]\ntheme=__aurorae__svg__NOVA-Fluent-Light\n')
            (cfg / 'kdeglobals').write_text('[General]\nColorScheme=NovaAirLight\n')
            styles.save_state({'autopilot': True, 'autopilot_mode': 'schedule',
                               'schedule_light': '00:00', 'schedule_dark': '00:00'}, home)
            # light == dark → always «day»: nothing to change
            out = self.cli('--dry-run', 'autopilot', 'tick', home=home)
            self.assertNotIn('kdecoration2', out.stdout)
            (cfg / 'kdeglobals').write_text('[General]\nColorScheme=NovaAirDark\n')
            out = self.cli('--dry-run', 'autopilot', 'tick', home=home)
            self.assertIn('plasma-apply-colorscheme NovaAirLight', out.stdout)
            self.assertNotIn('NOVA-Fluent-Dark', out.stdout)
            (cfg / 'kwinrc').write_text('[org.kde.kdecoration2]\ntheme=__aurorae__svg__NOVA-Fluent-Dark\n')
            out = self.cli('--dry-run', 'autopilot', 'tick', home=home)
            self.assertIn('--key theme __aurorae__svg__NOVA-Fluent-Light', out.stdout)   # frame follows the day

    def test_revert_lists_frames(self):
        st = {'feature_backup': {'kwinrc/org.kde.kdecoration2/theme': 'Breeze'}}
        self.assertIn('прежние рамки окон и анимации', styles.revert_summary(st))

    def test_current_theme(self):
        with tempfile.TemporaryDirectory() as home:
            cfg = Path(home) / '.config'
            cfg.mkdir()
            (cfg / 'kwinrc').write_text('[org.kde.kdecoration2]\ntheme=__aurorae__svg__NOVA-Aqua-Dark\n')
            self.assertEqual(chrome.current_theme(home), ('aqua', 'dark'))
            (cfg / 'kwinrc').write_text('[org.kde.kdecoration2]\ntheme=Breeze\n')
            self.assertIsNone(chrome.current_theme(home))


class Motion(unittest.TestCase):
    def test_presets(self):
        fluent = {(f, g, k): v for f, g, k, v in chrome.MOTION['fluent']}
        aqua = {(f, g, k): v for f, g, k, v in chrome.MOTION['aqua']}
        self.assertEqual(fluent[('kwinrc', 'Plugins', 'squashEnabled')], 'true')
        self.assertEqual(aqua[('kwinrc', 'Plugins', 'magiclampEnabled')], 'true')
        self.assertLess(float(fluent[('kdeglobals', 'KDE', 'AnimationDurationFactor')]),
                        float(aqua[('kdeglobals', 'KDE', 'AnimationDurationFactor')]))

    def test_motion_factor(self):
        with tempfile.TemporaryDirectory() as home:
            cfg = Path(home) / '.config'
            cfg.mkdir()
            (cfg / 'kdeglobals').write_text('[KDE]\nAnimationDurationFactor=0\n')
            self.assertEqual(ui.motion_factor(home), 0.0)                 # «Уменьшить движение»
            (cfg / 'kdeglobals').write_text('[General]\nX=1\n[KDE]\nAnimationDurationFactor=0.5\n')
            self.assertEqual(ui.motion_factor(home), 0.5)
            (cfg / 'kdeglobals').write_text('[KDE]\nAnimationDurationFactor=abc\n')
            self.assertIn(ui.motion_factor(home), (0.75, 1.0))           # falls back to the system default
        old = os.environ.get('NOVA_REDUCE_MOTION')
        os.environ['NOVA_REDUCE_MOTION'] = '1'
        try:
            self.assertEqual(ui.motion_factor(), 0.0)
        finally:
            if old is None:
                os.environ.pop('NOVA_REDUCE_MOTION')
            else:
                os.environ['NOVA_REDUCE_MOTION'] = old

    def test_setup_window_enables_motion(self):
        src = (BIN / 'nova_ui.py').read_text()
        self.assertIn('enable_motion(window)', src)
        self.assertIn('QStackedWidget', src)


if __name__ == '__main__':
    unittest.main()
