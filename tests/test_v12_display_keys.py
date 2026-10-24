"""NOVA OS 0.12 (part 2): monitors / refresh rate / second screen, Windows-like
hotkeys and multimedia keys, Game Bar. Logic is executed, commands are dry-run
or sent to stub programs — no real monitors are touched."""
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
sys.path.insert(0, str(BIN))

import nova_display_core as dc  # noqa: E402
import nova_hotkeys_core as hk  # noqa: E402
import nova_layout_core as layout  # noqa: E402

KSCREEN = {'outputs': [
    {'name': 'eDP-1', 'connected': True, 'enabled': True, 'priority': 1, 'scale': 1.25, 'rotation': 1,
     'vrrPolicy': 2, 'pos': {'x': 0, 'y': 0}, 'currentModeId': '2', 'modes': [
         {'id': '1', 'size': {'width': 2560, 'height': 1600}, 'refreshRate': 60.0},
         {'id': '2', 'size': {'width': 2560, 'height': 1600}, 'refreshRate': 165.0},
         {'id': '3', 'size': {'width': 1920, 'height': 1080}, 'refreshRate': 60.0}]},
    {'name': 'HDMI-A-1', 'connected': True, 'enabled': True, 'priority': 2, 'scale': 1.0, 'rotation': 1,
     'vrrPolicy': 0, 'pos': {'x': 2048, 'y': 0}, 'currentModeId': '11', 'modes': [
         {'id': '10', 'size': {'width': 1920, 'height': 1080}, 'refreshRate': 144.0},
         {'id': '11', 'size': {'width': 1920, 'height': 1080}, 'refreshRate': 60.0},
         {'id': '12', 'size': {'width': 1920, 'height': 1080}, 'refreshRate': 59.94},
         {'id': '13', 'size': {'width': 1280, 'height': 720}, 'refreshRate': 60.0}]},
    {'name': 'DP-2', 'connected': False, 'enabled': False, 'modes': []},
]}


class DisplayCore(unittest.TestCase):
    def setUp(self):
        self.outs = dc.parse_outputs(json.dumps(KSCREEN))

    def test_parse_and_hz(self):
        self.assertEqual([o['name'] for o in self.outs], ['eDP-1', 'HDMI-A-1'])  # disconnected skipped
        e, h = self.outs
        self.assertTrue(e['builtin'])
        self.assertEqual((e['width'], e['refresh'], e['scale']), (2560, 165.0, 1.25))
        self.assertEqual(dc.refresh_rates(h, 1920, 1080), [144.0, 60.0, 59.94])
        self.assertEqual(dc.find_mode(h, 1920, 1080, 144)['id'], '10')
        self.assertEqual(dc.best_mode(h)['id'], '10')
        self.assertEqual(dc.hz_label(59.94), '59.94 Гц')
        self.assertEqual(dc.hz_label(144.0), '144 Гц')
        self.assertEqual(dc.resolutions(e)[0], (2560, 1600))
        self.assertEqual(dc.parse_outputs('not json'), [])

    def test_output_args_and_validation(self):
        args = dc.output_args('HDMI-A-1', enabled=True, mode_id='10', scale=1.25, rotation='left', x=2048, y=0,
                              priority=2, vrr='automatic')
        self.assertEqual(args, ['output.HDMI-A-1.enable', 'output.HDMI-A-1.mode.10', 'output.HDMI-A-1.scale.1.25',
                                'output.HDMI-A-1.rotation.left', 'output.HDMI-A-1.position.2048,0',
                                'output.HDMI-A-1.priority.2', 'output.HDMI-A-1.vrrpolicy.automatic'])
        self.assertEqual(dc.output_args('HDMI-A-1', enabled=False), ['output.HDMI-A-1.disable'])
        for bad in ('eDP-1;rm -rf', '../x', 'a b'):
            with self.assertRaises(ValueError):
                dc.output_args(bad, enabled=True)
        with self.assertRaises(ValueError):
            dc.output_args('eDP-1', scale=9)
        with self.assertRaises(ValueError):
            dc.mode_args('eDP-1', '1;reboot')

    def test_projection_like_win_p(self):
        pc = dc.project_args(self.outs, 'pc')
        self.assertIn('output.HDMI-A-1.disable', pc)
        self.assertIn('output.eDP-1.enable', pc)
        second = dc.project_args(self.outs, 'second')
        self.assertIn('output.eDP-1.disable', second)
        self.assertIn('output.HDMI-A-1.mode.10', second)  # best: 1920x1080@144
        dup = dc.project_args(self.outs, 'duplicate')
        self.assertIn('output.eDP-1.mode.3', dup)          # shared 1920x1080
        self.assertIn('output.HDMI-A-1.position.0,0', dup)
        ext = dc.project_args(self.outs, 'extend', 'right')
        self.assertIn('output.HDMI-A-1.position.2048,0', ext)  # 2560/1.25 = 2048 logical px
        left = dc.project_args(self.outs, 'extend', 'left')
        self.assertIn('output.HDMI-A-1.position.0,0', left)
        self.assertIn('output.eDP-1.position.1920,0', left)
        with self.assertRaises(ValueError):
            dc.project_args(self.outs[:1], 'extend')

    def test_snapshot_profiles(self):
        snap = dc.snapshot_args(self.outs)
        self.assertIn('output.eDP-1.mode.2', snap)
        self.assertIn('output.HDMI-A-1.position.2048,0', snap)
        with tempfile.TemporaryDirectory() as home:
            dc.save_profile('Дом', self.outs, home)
            self.assertEqual(dc.list_profiles(home), ['Дом'])
            args = dc.load_profile_args('Дом', self.outs, home)
            self.assertIn('output.HDMI-A-1.mode.11', args)
            with self.assertRaises(ValueError):
                dc.save_profile('../../etc/x', self.outs, home)
            with self.assertRaises(ValueError):
                dc.load_profile_args('Нет', self.outs, home)

    def test_battery_refresh_rate(self):
        on_ac = dc.power_hz_args(self.outs, on_battery=False)
        self.assertEqual(on_ac, [])                               # already at 165 Hz
        on_bat = dc.power_hz_args(self.outs, on_battery=True)
        self.assertEqual(on_bat, ['output.eDP-1.mode.1'])          # 2560x1600@60, same resolution
        self.assertFalse(any('HDMI' in a for a in on_bat))         # external monitors untouched
        low = [dict(o, refresh=60.0, mode_id='1') if o['builtin'] else o for o in self.outs]
        self.assertEqual(dc.power_hz_args(low, on_battery=False), ['output.eDP-1.mode.2'])
        self.assertIn('Exec=nova-display watch-power', dc.autostart_entry())

    def test_ddc(self):
        self.assertEqual(dc.parse_ddc_brightness('VCP code 0x10 (Brightness): current value = 35, max value = 70'), 50)
        self.assertEqual(dc.ddc_set_args(1, 150)[-1], '100')
        with self.assertRaises(ValueError):
            dc.ddc_set_args(99, 10)

    def test_cli_with_stub_kscreen_doctor(self):
        with tempfile.TemporaryDirectory() as tmp:
            stub = Path(tmp) / 'kscreen-doctor'
            data = Path(tmp) / 'data.json'
            data.write_text(json.dumps(KSCREEN))
            log = Path(tmp) / 'calls.log'
            stub.write_text(f'#!/bin/sh\nif [ "$1" = -j ]; then cat {data}; else echo "$@" >> {log}; fi\n')
            stub.chmod(0o755)
            env = dict(os.environ, PATH=f'{tmp}:{os.environ["PATH"]}', HOME=tmp, PYTHONDONTWRITEBYTECODE='1')
            out = subprocess.run([sys.executable, str(BIN / 'nova-display'), 'list'], env=env,
                                 capture_output=True, text=True, check=True).stdout
            self.assertIn('144 Гц', out)
            subprocess.run([sys.executable, str(BIN / 'nova-display'), 'max-hz', 'HDMI-A-1'], env=env, check=True,
                           capture_output=True)
            subprocess.run([sys.executable, str(BIN / 'nova-display'), 'project', 'extend', '--side', 'left'],
                           env=env, check=True, capture_output=True)
            calls = log.read_text()
            self.assertIn('output.HDMI-A-1.mode.10', calls.splitlines()[0])
            self.assertIn('output.eDP-1.position.1920,0', calls.splitlines()[1])
            bad = subprocess.run([sys.executable, str(BIN / 'nova-display'), 'hz', 'XYZ', '60'], env=env,
                                 capture_output=True, text=True)
            self.assertEqual(bad.returncode, 2)


class Hotkeys(unittest.TestCase):
    def test_no_double_assignment_inside_component(self):
        seen = {}
        for comp, action, keys, *_rest in hk.COMPONENT_SHORTCUTS:
            for k in keys:
                self.assertNotIn((comp, k), seen, f'{k} twice in {comp}: {seen.get((comp, k))} / {action}')
                seen[(comp, k)] = action
        released = {(c, a) for c, a, keys, *_r in hk.COMPONENT_SHORTCUTS if not keys}
        self.assertIn(('kwin', 'Window Quick Tile Top'), released)
        self.assertIn(('plasmashell', 'next activity'), released)

    def test_system_file_and_generated_copy(self):
        text = hk.system_file()
        self.assertIn('Window Maximize=Meta+Up\tMeta+PgUp,Meta+PgUp,Maximize Window', text)
        self.assertIn('[services][nova-task-manager.desktop]\n_launch=Ctrl+Shift+Esc', text)
        self.assertIn('[services][nova-game-bar.desktop]\n_launch=Meta+G', text)
        self.assertEqual((O / 'etc/xdg/kglobalshortcutsrc').read_text(), text)
        self.assertIn('VolumeStep=2', (O / 'etc/xdg/plasmaparc').read_text())
        self.assertIn('i2c-dev', (O / 'etc/modules-load.d/nova-ddc.conf').read_text())

    def test_apply_and_reset_are_symmetric(self):
        apply = hk.apply_commands()
        reset = hk.reset_commands()
        self.assertEqual(len(apply), len(reset))
        for a, r in zip(apply, reset):
            self.assertEqual(a[:-1], r[:-1])  # same file/groups/key
        self.assertTrue(all(c[0] == 'kwriteconfig6' for c in apply + reset))
        self.assertIn('Alt+Space\tAlt+F2\tSearch', [c[-1] for c in reset])
        with self.assertRaises(ValueError):
            hk.volume_step_command(7)
        with self.assertRaises(ValueError):
            hk._keys(('Meta+X;rm',))

    def test_cheat_sheet_and_describe(self):
        rows = hk.cheat_sheet()
        self.assertTrue(any(k == 'Win+↑' for _g, k, _m in rows))
        self.assertTrue(any('Ctrl+Shift+Esc' in k for _g, k, _m in rows))
        self.assertEqual(hk.describe_key('Calculator'), 'открывает: Калькулятор')
        self.assertEqual(hk.describe_key('Meta+L'), 'заблокировать')

    def test_cli_dry_run(self):
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
        out = subprocess.run([sys.executable, str(BIN / 'nova-hotkeys'), '--dry-run', 'apply'], env=env,
                             capture_output=True, text=True, check=True).stdout
        self.assertIn('kwriteconfig6 --file kglobalshortcutsrc --group kwin --key Window Maximize', out)
        out = subprocess.run([sys.executable, str(BIN / 'nova-hotkeys'), '--dry-run', 'volume-step', '2'], env=env,
                             capture_output=True, text=True, check=True).stdout
        self.assertIn('VolumeStep 2', out)

    def test_desktop_shortcuts_and_media_keys(self):
        apps = O / 'usr/share/applications'
        self.assertIn('X-KDE-Shortcuts=Ctrl+Shift+Esc', (apps / 'nova-task-manager.desktop').read_text())
        self.assertIn('X-KDE-Shortcuts=Meta+I', (apps / 'nova-control.desktop').read_text())
        self.assertIn('X-KDE-Shortcuts=Meta+G', (apps / 'nova-game-bar.desktop').read_text())
        for desktop, key, _label, _exe, _t in hk.MEDIA_LAUNCHERS:
            text = (apps / desktop).read_text()
            self.assertIn(f'X-KDE-Shortcuts={key}', text)
            self.assertIn('Exec=nova-key ', text)
            self.assertIn('NoDisplay=true', text)
        res = subprocess.run(['bash', str(BIN / 'nova-key'), 'rm -rf /'], capture_output=True, text=True)
        self.assertEqual(res.returncode, 2)


class Extras(unittest.TestCase):
    def test_icon_themes(self):
        self.assertEqual(layout.icon_command('Papirus', exists=lambda p: False)[-1], 'Papirus')
        cmd = layout.icon_command('Papirus-Dark', exists=lambda p: p.endswith('plasma-changeicons'))
        self.assertTrue(cmd[0].endswith('plasma-changeicons'))
        with self.assertRaises(ValueError):
            layout.icon_command('Windows11')

    def test_packages_for_new_features(self):
        pack = {x.strip() for x in (ROOT / 'image/config/package-lists/nova.list.chroot').read_text().splitlines()
                if x.strip() and not x.startswith('#')}
        for name in ('ddcutil', 'kcalc', 'papirus-icon-theme', 'kwin-addons', 'plasma-widgets-addons', 'kinfocenter'):
            self.assertIn(name, pack)

    def test_game_bar_is_safe(self):
        s = (BIN / 'nova-game-bar').read_text()
        self.assertIn('WindowStaysOnTopHint', s)
        self.assertIn("ui.confirm(self, 'Максимальная производительность'", s)
        for bad in ('pkexec', 'sudo', 'shell=True', 'cpupower', 'nvidia-settings'):
            self.assertNotIn(bad, s)

    def test_new_apps_registered_everywhere(self):
        import nova_selftest_core as st
        for app in ('nova-display', 'nova-hotkeys', 'nova-game-bar'):
            self.assertIn(app, st.UI_APPS)
            self.assertIn(app, (ROOT / 'tools/verify-iso.sh').read_text())
        control = (BIN / 'nova-control').read_text()
        self.assertIn('page_keyboard', control)
        self.assertIn("self.open('nova-display')", control)


if __name__ == '__main__':
    unittest.main()
