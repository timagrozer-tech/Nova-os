"""NOVA styles, NOVA Live wallpapers and the day/night autopilot — regression tests.

Pure logic runs in Python; Plasma scripts run in Node against the same mock
as the NEON tests; sky.js is executed in Node and compared with the Python
astronomy; the CLI runs in --dry-run against a temporary HOME. QML itself is
rendered in CI by tools/neon_qml_smoke.py.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
BIN = O / 'usr/local/bin'
LIVE = O / 'usr/share/plasma/wallpapers/org.nova.live.wallpaper'
sys.path.insert(0, str(BIN))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import nova_layout_core as layout  # noqa: E402
import nova_sky_core as sky  # noqa: E402
import nova_styles_core as core  # noqa: E402
import nova_ui as ui  # noqa: E402
from test_v13_neon import run_node  # noqa: E402

MSK = (55.7558, 37.6176)


def lum(hex_colour):
    c = [int(hex_colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


class Catalogue(unittest.TestCase):
    def test_seven_styles_complete(self):
        self.assertEqual(core.STYLE_ORDER, ('air-light', 'air-dark', 'neon', 'aurora', 'sakura', 'ocean', 'horizon'))
        for sid, st in core.STYLES.items():
            for key in ('title', 'note', 'scheme', 'variant', 'lnf', 'mode', 'wallpaper', 'palette', 'layout_title'):
                self.assertIn(key, st, sid)
            self.assertIn(st['lnf'], layout.LNF, sid)
            self.assertTrue((O / f'usr/share/color-schemes/{st["scheme"]}.colors').is_file(), sid)
            self.assertTrue(st['variant'] == 'auto' or st['variant'] in ui.ALL_VARIANTS, sid)
            self.assertTrue(core.thumbnail(sid).is_file(), sid)
            for colour in st['palette']:
                self.assertRegex(colour, r'^#[0-9a-f]{6}$')
            self.assertRegex(st['note'], '[а-яё]', sid)                     # Russian everywhere

    def test_validation(self):
        for bad in ('', 'sepia', '../x', 'NEON'):
            with self.assertRaises(ValueError):
                core.validate_style(bad)
        with self.assertRaises(ValueError):
            core.validate_feature('telemetry')

    def test_tokens_contrast(self):
        for variant in ui.ALL_VARIANTS:
            t = ui.TOKENS[variant]
            for key in ('focus_ring', 'border_strong', 'accent', 'text', 'surface', 'bg'):
                self.assertIn(key, t, variant)
            self.assertGreaterEqual(contrast(t['text'], t['surface']), 4.5, variant)
            self.assertGreaterEqual(contrast(t['text'], t['bg']), 4.5, variant)
            self.assertGreaterEqual(contrast(t['focus_ring'], t['surface']), 3.0, variant)
            self.assertGreaterEqual(contrast(t['border_strong'], t['surface']), 3.0, variant)

    def test_qss_files_match_generator(self):
        for variant, name in (('aurora', 'aurora'), ('sakura', 'sakura'), ('ocean', 'ocean')):
            self.assertEqual((O / f'usr/share/nova/themes/{name}.qss').read_text(), ui.build_stylesheet(variant))


class Generated(unittest.TestCase):
    def test_lookandfeel_packages(self):
        for sid in core.NEW_LNF:
            pkg = O / f'usr/share/plasma/look-and-feel/org.nova.{sid}.desktop'
            meta = json.loads((pkg / 'metadata.json').read_text())
            self.assertEqual(meta['KPlugin']['Id'], layout.LNF[sid])
            self.assertIn(f'ColorScheme={core.STYLES[sid]["scheme"]}', (pkg / 'contents/defaults').read_text())
            js = (pkg / 'contents/layouts/org.kde.plasma.desktop-layout.js').read_text()
            self.assertIn(core.LIVE_PLUGIN, js)
            self.assertIn('new Panel', js)

    def test_live_plugin_metadata_and_config(self):
        meta = json.loads((LIVE / 'metadata.json').read_text())
        self.assertEqual(meta['KPlugin']['Id'], core.LIVE_PLUGIN)
        self.assertEqual(meta['KPackageStructure'], 'Plasma/Wallpaper')
        kcfg = (LIVE / 'contents/config/main.xml').read_text()
        for key in ('Scene', 'Fps', 'Speed', 'Paused', 'PauseOnBattery', 'ShowClock', 'Latitude', 'Longitude'):
            self.assertIn(f'name="{key}"', kcfg)
        config_qml = (LIVE / 'contents/ui/config.qml').read_text()
        for key in ('Scene', 'Fps', 'Paused', 'PauseOnBattery', 'Latitude', 'Longitude'):
            self.assertIn(f'cfg_{key}', config_qml)

    def test_live_qml_sources(self):
        ui_dir = LIVE / 'contents/ui'
        main = (ui_dir / 'main.qml').read_text()
        self.assertIn('WallpaperItem', main)
        for scene in ('SkyScene', 'AuroraScene', 'SakuraScene', 'OceanScene'):
            self.assertTrue((ui_dir / f'{scene}.qml').is_file(), scene)
            self.assertIn(scene, main)
        for name in ('sky-night', 'sky-dawn', 'sky-day', 'sky-sunset', 'aurora', 'sakura', 'ocean'):
            path = LIVE / f'contents/images/{name}.jpg'
            self.assertTrue(path.is_file(), name)
            self.assertLess(path.stat().st_size, 900_000, name)
            self.assertIn(f'"{name}"' if name.startswith('sky') else name,
                          ''.join((ui_dir / f).read_text() for f in os.listdir(ui_dir) if f.endswith('.qml')))
        for qml in ui_dir.glob('*.qml'):
            text = re.sub(r'"(?:\\.|[^"\\])*"', '""', qml.read_text())
            text = re.sub(r'//[^\n]*', '', text)
            self.assertEqual(text.count('{'), text.count('}'), qml.name)
            self.assertNotRegex(qml.read_text(), r'https?://(?!www\.kde)', qml.name)   # nothing loaded from the net

    def test_wallpaper_packages(self):
        for pkg in ('NOVA-Aurora', 'NOVA-Sakura', 'NOVA-Ocean', 'NOVA-Horizon'):
            base = O / f'usr/share/wallpapers/{pkg}'
            self.assertTrue((base / 'contents/images/1920x1080.jpg').is_file(), pkg)
            self.assertTrue((base / 'contents/screenshot.png').is_file(), pkg)
            self.assertEqual(json.loads((base / 'metadata.json').read_text())['KPlugin']['Id'], pkg)

    def test_generator_is_in_sync(self):
        out = subprocess.run([sys.executable, str(ROOT / 'tools/gen-plasma-theme.py'), '--check'],
                             capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)


class PlasmaScripts(unittest.TestCase):
    def test_live_styles_in_mock(self):
        for sid in ('aurora', 'sakura', 'ocean', 'horizon'):
            res = run_node(core.plasma_script(sid, *MSK), known=None)
            self.assertEqual(res['plugin'], core.LIVE_PLUGIN, sid)
            cfg = res['config']
            self.assertEqual(cfg[f'Wallpaper/{core.LIVE_PLUGIN}/General/Scene'], core.STYLES[sid]['wallpaper'][1])
            self.assertAlmostEqual(cfg[f'Wallpaper/{core.LIVE_PLUGIN}/General/Latitude'], MSK[0], 3)
            self.assertFalse(cfg[f'Wallpaper/{core.LIVE_PLUGIN}/General/Paused'])
            self.assertTrue(res['userWidgetAlive'], sid)
            self.assertEqual(len(res['panels']), 2 if core.STYLES[sid]['mode'] == 'dock' else 1, sid)

    def test_static_style_and_keep_layout(self):
        res = run_node(core.plasma_script('air-dark', *MSK))
        self.assertEqual(res['plugin'], 'org.kde.image')
        self.assertIn('NOVA', res['config']['Wallpaper/org.kde.image/General/Image'])
        kept = run_node(core.plasma_script('ocean', *MSK, keep_layout=True))
        self.assertEqual(kept['removed'], 0)                      # the user's panel is untouched
        self.assertEqual(kept['plugin'], core.LIVE_PLUGIN)

    def test_neon_is_delegated(self):
        with self.assertRaises(ValueError):
            core.plasma_script('neon', *MSK)


class Sky(unittest.TestCase):
    def test_coordinates_and_timezone(self):
        self.assertEqual(sky.parse_coordinates('+5545+03735'), (55.75, 37.583333333333336))
        lat, lon = sky.parse_coordinates('-3352+15113')
        self.assertLess(lat, 0)
        with self.assertRaises(ValueError):
            sky.parse_coordinates('moscow')
        lat, lon, tz = sky.location('Europe/Moscow')
        self.assertAlmostEqual(lat, 55.75, 1)
        self.assertEqual(sky.location('Nowhere/Atlantis', table='/nonexistent'), sky.DEFAULT)

    def test_manual_location_override(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertEqual(sky.location_info(home)['source'], 'timezone')
            sky.save_override(59.94, 30.31, 'Санкт-Петербург', home)
            info = sky.location_info(home)
            self.assertEqual((info['source'], info['label']), ('manual', 'Санкт-Петербург'))
            with self.assertRaises(ValueError):
                sky.save_override(95, 0, home=home)
            sky.override_path(home).write_text('{"lat": "x"}')
            self.assertEqual(sky.location_info(home)['source'], 'timezone')   # broken file → honest fallback
        self.assertEqual(sky.parse_latlon(' 55,75 ; 37,62 '), (55.75, 37.62))
        for bad in ('', 'Москва', '91, 10', '10, 181'):
            with self.assertRaises(ValueError):
                sky.parse_latlon(bad)

    def test_sun_events_moscow(self):
        msk = timezone(timedelta(hours=3))
        ev = sky.sun_events(datetime(2026, 10, 25, tzinfo=msk), *MSK)
        self.assertEqual(ev['sunrise'].astimezone(msk).strftime('%H:%M')[:4], '07:2')
        self.assertEqual(ev['sunset'].astimezone(msk).strftime('%H:%M')[:4], '17:0')
        # polar night: no sunrise at all in Murmansk-like latitude in December
        polar = sky.sun_events(datetime(2026, 12, 21, tzinfo=msk), 69.0, 33.1)
        self.assertIsNone(polar['sunrise'])

    def test_is_day_and_autopilot(self):
        noon = datetime(2026, 10, 25, 9, 0, tzinfo=timezone.utc)
        night = datetime(2026, 10, 25, 21, 0, tzinfo=timezone.utc)
        self.assertTrue(sky.is_day(noon, *MSK))
        self.assertFalse(sky.is_day(night, *MSK))
        self.assertEqual(core.autopilot_decision('NovaAirDark', True), 'NovaAirLight')
        self.assertIsNone(core.autopilot_decision('NovaAirLight', True))
        self.assertEqual(core.autopilot_decision(None, False), 'NovaAirDark')

    def test_moon_phase(self):
        full = datetime(2026, 10, 26, 4, 12, tzinfo=timezone.utc)        # full moon of October 2026
        self.assertAlmostEqual(sky.moon_phase(full), 0.5, delta=0.04)

    def test_sky_js_matches_python(self):
        src = (LIVE / 'contents/ui/sky.js').read_text().replace('.pragma library', '')
        cases = []
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        for i in range(40):
            when = start + timedelta(hours=i * 223 + 7)
            lat, lon = (-60 + 3 * i) % 140 - 70, (i * 37) % 360 - 180
            cases.append((when, lat, lon))
        js = src + '\nconst c=' + json.dumps([[w.timestamp() * 1000, la, lo] for w, la, lo in cases]) + \
            ';\nconsole.log(JSON.stringify(c.map(x=>[sunPosition(x[0],x[1],x[2]),moonPhase(x[0])])));'
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'p.js').write_text(js)
            res = json.loads(subprocess.run(['node', str(Path(tmp) / 'p.js')], capture_output=True,
                                            text=True, check=True).stdout)
        for (when, lat, lon), (sun, phase) in zip(cases, res):
            py = sky.sun_position(when, lat, lon)
            self.assertAlmostEqual(sun['elevation'], py['elevation'], 6)
            self.assertAlmostEqual(sun['azimuth'], py['azimuth'], 6)
            self.assertAlmostEqual(phase, sky.moon_phase(when), 6)


class State(unittest.TestCase):
    def test_state_is_sanitised(self):
        with tempfile.TemporaryDirectory() as home:
            core.save_state({'style': 'ocean', 'autopilot': True}, home)
            path = core.state_path(home)
            data = json.loads(path.read_text())
            data.update({'style': '../../etc', 'autopilot': 'yes', 'evil': 1})
            path.write_text(json.dumps(data))
            st = core.load_state(home)
            self.assertNotIn('evil', st)
            self.assertNotEqual(st.get('style'), '../../etc')
            self.assertNotEqual(st.get('autopilot'), 'yes')
            path.write_text('{broken')
            self.assertEqual(core.load_state(home), {})

    def test_feature_commands_restore_user_values(self):
        fid = core.FEATURE_ORDER[0]
        on = core.feature_commands(fid, True)
        self.assertTrue(all(c[0] == 'kwriteconfig6' for c in on))
        backup = {f'{f}/{g}/{k}': 'mine' for f, g, k, _v in core.FEATURES[fid][2]}
        off = core.feature_commands(fid, False, backup)
        self.assertTrue(all(c[-1] == 'mine' for c in off))
        off_default = core.feature_commands(fid, False, {})
        self.assertTrue(all('--delete' in c for c in off_default))      # back to KDE's own default

    def test_feature_detection_from_kwinrc(self):
        with tempfile.TemporaryDirectory() as home:
            cfg = Path(home) / '.config'
            cfg.mkdir()
            self.assertTrue(core.feature_enabled('blur', home))          # KDE default on
            (cfg / 'kwinrc').write_text('[Plugins]\nblurEnabled=false\nshakecursorEnabled=true\n')
            self.assertFalse(core.feature_enabled('blur', home))
            self.assertTrue(core.feature_enabled('shake', home))


class Cli(unittest.TestCase):
    def cli(self, *args, home):
        env = dict(os.environ, HOME=home, PYTHONDONTWRITEBYTECODE='1',
                   PYTHONPATH=str(BIN), PATH=f'{BIN}:{os.environ["PATH"]}')
        return subprocess.run([sys.executable, str(BIN / 'nova-style'), *args], env=env,
                              capture_output=True, text=True)

    def test_dry_run_apply_revert(self):
        with tempfile.TemporaryDirectory() as home:
            out = self.cli('list', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertEqual(len(out.stdout.strip().splitlines()), 7)
            out = self.cli('--dry-run', 'apply', 'horizon', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertIn('plasma-apply-lookandfeel', out.stdout)
            self.assertIn('evaluateScript', out.stdout)
            self.assertIn('enable --now nova-autopilot.timer', out.stdout)
            self.assertFalse(core.state_path(home).exists())              # dry run writes nothing
            out = self.cli('--dry-run', 'revert', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertIn('disable --now nova-autopilot.timer', out.stdout)
            self.assertNotEqual(self.cli('apply', 'sepia', home=home).returncode, 0)

    def test_feature_and_location(self):
        with tempfile.TemporaryDirectory() as home:
            out = self.cli('--dry-run', 'feature', 'cube', 'on', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertIn('kwriteconfig6', out.stdout)
            out = self.cli('location', '59.94, 30.31', '--label', 'СПб', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            self.assertEqual(sky.location_info(home)['label'], 'СПб')
            self.assertIn('задано вручную', self.cli('location', 'show', home=home).stdout)
            self.assertEqual(self.cli('location', 'Москва', home=home).returncode, 2)
            self.cli('location', 'clear', home=home)
            self.assertIn('приближённо', self.cli('location', 'show', home=home).stdout)


class Integration(unittest.TestCase):
    def test_autopilot_units(self):
        unit = (O / 'usr/lib/systemd/user/nova-autopilot.service').read_text()
        timer = (O / 'usr/lib/systemd/user/nova-autopilot.timer').read_text()
        self.assertIn('nova-style autopilot tick', unit)
        self.assertIn('OnUnitActiveSec=10min', timer)

    def test_app_is_wired_everywhere(self):
        desktop = (O / 'usr/share/applications/nova-styles.desktop').read_text()
        self.assertIn('Exec=nova-styles', desktop)
        self.assertIn('Name[ru]=NOVA — стили и функции', desktop)
        for app in ('nova-control', 'nova-personalize'):
            self.assertIn('nova-styles', (BIN / app).read_text(), app)
        gui = (BIN / 'nova-styles').read_text()
        self.assertIn('Вернуть как было', gui)
        self.assertIn('приближённ', gui)                                  # honest about the location
        self.assertIn("app_id='nova-styles'", gui.replace('"', "'"))


class AutopilotAndExtras(unittest.TestCase):
    def test_schedule(self):
        at = lambda h, m: datetime(2026, 10, 25, h, m)   # noqa: E731
        self.assertTrue(core.schedule_is_day(at(12, 0), '07:00', '20:00'))
        self.assertFalse(core.schedule_is_day(at(20, 0), '07:00', '20:00'))
        self.assertFalse(core.schedule_is_day(at(6, 59), '07:00', '20:00'))
        self.assertTrue(core.schedule_is_day(at(23, 0), '22:00', '06:00'))     # night-shift schedule wraps
        self.assertFalse(core.schedule_is_day(at(12, 0), '22:00', '06:00'))
        self.assertEqual(core.parse_hhmm('7:05'), '07:05')
        for bad in ('24:00', '7', 'утро', '12:60'):
            with self.assertRaises(ValueError):
                core.parse_hhmm(bad)

    def test_schedule_state_sanitised(self):
        with tempfile.TemporaryDirectory() as home:
            core.save_state({'autopilot_mode': 'schedule', 'schedule_light': '06:30'}, home)
            self.assertEqual(core.load_state(home)['schedule_light'], '06:30')
            data = json.loads(core.state_path(home).read_text())
            data.update({'autopilot_mode': 'moon', 'schedule_dark': '$(rm)'})
            core.state_path(home).write_text(json.dumps(data))
            st = core.load_state(home)
            self.assertNotIn('autopilot_mode', st)
            self.assertNotIn('schedule_dark', st)

    def test_cli_schedule(self):
        with tempfile.TemporaryDirectory() as home:
            out = Cli.cli(self, 'autopilot', 'schedule', '7:00', '21:30', home=home)
            self.assertEqual(out.returncode, 0, out.stderr)
            st = core.load_state(home)
            self.assertEqual((st['autopilot_mode'], st['schedule_light'], st['schedule_dark']),
                             ('schedule', '07:00', '21:30'))
            core.save_state({'autopilot': True}, home)
            self.assertIn('по графику 07:00–21:30', Cli.cli(self, 'status', home=home).stdout)
            self.assertEqual(Cli.cli(self, 'autopilot', 'schedule', '25:00', '1:00', home=home).returncode, 2)

    def test_revert_summary_lists_everything(self):
        st = {'style': 'sakura', 'backup': 'b', 'autopilot': True,
              'feature_backup': {'kwinrc/Plugins/cubeEnabled': None}}
        text = ' '.join(core.revert_summary(st))
        for word in ('Sakura', 'панели', 'куб', 'автопилот'):
            self.assertIn(word, text)

    def test_new_features(self):
        for fid in ('translucency', 'fastanim', 'reducemotion', 'eco', 'chameleon', 'warmlight'):
            self.assertIn(fid, core.FEATURES)
        anim = core.feature_commands('reducemotion', True)[0]
        self.assertIn('--notify', anim)                       # kdeglobals change applies live
        warm = core.feature_commands('warmlight', True, None, 59.94, 30.31)
        self.assertIn(['--key', 'LatitudeFixed', '59.9400'], [c[-3:] for c in warm])
        with tempfile.TemporaryDirectory() as home:
            cfg = Path(home) / '.config'
            cfg.mkdir()
            (cfg / 'kwinrc').write_text('[NightColor]\nActive=true\nMode=Location\nLatitudeFixed=1\nLongitudeFixed=2\n'
                                        '[Plugins]\nblurEnabled=false\nwobblywindowsEnabled=false\n'
                                        'translucencyEnabled=false\n')
            (cfg / 'kdeglobals').write_text('[KDE]\nAnimationDurationFactor=0.5\n')
            self.assertTrue(core.feature_enabled('warmlight', home))
            self.assertTrue(core.feature_enabled('eco', home))
            self.assertTrue(core.feature_enabled('fastanim', home))
            self.assertFalse(core.feature_enabled('blur', home))
            self.assertFalse(core.feature_enabled('reducemotion', home))

    def test_gui_has_preview_and_schedule(self):
        gui = (BIN / 'nova-styles').read_text()
        for text in ('Предпросмотр', 'По графику', 'Вернётся', 'refresh_features', 'Ничего не изменится'):
            self.assertIn(text, gui)


class BootMenu(unittest.TestCase):
    HOOK = ROOT / 'image/config/hooks/live/096-nova-bootmenu.hook.binary'

    def test_hook_applies_branding(self):
        with tempfile.TemporaryDirectory() as b:
            grub = Path(b) / 'boot/grub'
            (grub / 'nova').mkdir(parents=True)
            (grub / 'live-theme').mkdir()
            (grub / 'nova/splash.png').write_bytes(b'NOVA')
            (grub / 'splash.png').write_bytes(b'DEBIAN')
            (grub / 'live-theme/theme.txt').write_text('title-text: ""\ndesktop-image: "../splash.png"\n')
            (grub / 'grub.cfg').write_text('menuentry "Live system (amd64)" --hotkey=l {\n linux /live/vmlinuz boot=live\n}\n')
            for _ in range(2):                                         # idempotent
                res = subprocess.run(['sh', str(self.HOOK)], cwd=b, capture_output=True, text=True)
                self.assertEqual(res.returncode, 0, res.stderr)
            self.assertEqual((grub / 'splash.png').read_bytes(), b'NOVA')
            theme = (grub / 'live-theme/theme.txt').read_text()
            self.assertEqual(theme.count('desktop-image-scale-method: "crop"'), 1)
            cfg = (grub / 'grub.cfg').read_text()
            self.assertIn('menuentry "NOVA OS Live (amd64)"', cfg)
            self.assertIn('boot=live', cfg)
            self.assertEqual((Path(b) / '.disk/nova-bootmenu').read_text().strip(), 'applied')

    def test_hook_is_harmless_without_grub(self):
        with tempfile.TemporaryDirectory() as b:
            res = subprocess.run(['sh', str(self.HOOK)], cwd=b, capture_output=True, text=True)
            self.assertEqual(res.returncode, 0)
            self.assertEqual((Path(b) / '.disk/nova-bootmenu').read_text().strip(), 'skipped')

    def test_background_asset(self):
        from PIL import Image
        img = Image.open(ROOT / 'image/config/includes.binary/boot/grub/nova/splash.png')
        self.assertEqual(img.size, (1920, 1080))


if __name__ == '__main__':
    unittest.main()
