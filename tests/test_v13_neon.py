"""NEON//SYS for NOVA OS — regression tests.

NEON//SYS is built from what NOVA already ships (look-and-feel, colour scheme,
QML wallpaper plugin, stock Plasma widgets, Konsole profile, sound theme).
These tests execute the Plasma scripts in Node against a mock API, run the
CLI in --dry-run mode against a temporary HOME and check every generated
asset. QML itself is rendered in CI by tools/neon_qml_smoke.py (PyQt6).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
BIN = O / 'usr/local/bin'
WP = O / 'usr/share/plasma/wallpapers/org.nova.neon.wallpaper'
LNF = O / 'usr/share/plasma/look-and-feel/org.nova.neon.desktop'
sys.path.insert(0, str(BIN))

import nova_hotkeys_core as hotkeys  # noqa: E402
import nova_layout_core as layout  # noqa: E402
import nova_neon_core as neon  # noqa: E402
import nova_selftest_core as st  # noqa: E402
import nova_ui as ui  # noqa: E402

MOCK = r'''
const fs=require('fs');const src=fs.readFileSync(process.argv[2],'utf8');
const screen=JSON.parse(process.argv[3]);const known=JSON.parse(process.argv[4]);
const st={panels:[],removed:0,log:[]};
function W(t){this.type=t;this.config={};this.currentConfigGroup=[];this.geom=null;this.removed=false;}
W.prototype.writeConfig=function(k,v){this.config[this.currentConfigGroup.concat([k]).join('/')]=v;};
W.prototype.readConfig=function(k,d){const v=this.config[this.currentConfigGroup.concat([k]).join('/')];return v===undefined?d:v;};
W.prototype.reloadConfig=function(){};
W.prototype.remove=function(){this.removed=true;};
function Panel(){this.widgets=[];st.panels.push(this);}
Panel.prototype.addWidget=function(t){const w=new W(t);this.widgets.push(w);return w;};
Panel.prototype.remove=function(){st.removed++;st.panels=st.panels.filter(p=>p!==this);};
const desk=new W('desktop');desk.screen=0;desk.items=[];
const mine=new W('org.kde.plasma.notes');desk.items.push(mine);              // user's own widget: must survive
desk.widgets=function(){return this.items.filter(w=>!w.removed);};
desk.addWidget=function(t,x,y,w,h){const n=new W(t);n.geom=[x,y,w,h];this.items.push(n);return n;};
new Panel();
const run=()=>new Function('Panel','panels','desktops','print','knownWidgetTypes','screenGeometry',src)(
  Panel,()=>st.panels.slice(),()=>[desk],(m)=>st.log.push(m),()=>known,()=>screen);
run();run();                                    // applying twice must not duplicate NEON widgets
const ws=desk.widgets();
console.log(JSON.stringify({removed:st.removed,log:st.log,plugin:desk.wallpaperPlugin,config:desk.config,
 panels:st.panels.map(p=>({loc:p.location,h:p.height,len:p.lengthMode,fl:p.floating,w:p.widgets.map(x=>x.type),
   launchers:(p.widgets.find(x=>x.type==='org.kde.plasma.icontasks')||{config:{}}).config['General/launchers']})),
 widgets:ws.filter(w=>w.geom).map(w=>({t:w.type,g:w.geom,m:w.config['NovaNeon/managed']})),
 userWidgetAlive:!mine.removed}));
'''


def run_node(script: str, screen=(1920, 1080), known=None):
    known = list(known if known is not None else [p for p, _c, _h in neon.WIDGETS])
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / 'mock.js').write_text(MOCK)
        (Path(tmp) / 's.js').write_text(script)
        geo = json.dumps({'x': 0, 'y': 0, 'width': screen[0], 'height': screen[1]})
        out = subprocess.run(['node', str(Path(tmp) / 'mock.js'), str(Path(tmp) / 's.js'), geo, json.dumps(known)],
                             capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class Tokens(unittest.TestCase):
    def test_neon_variant_and_stylesheet(self):
        self.assertIn('neon', ui.TOKENS)
        self.assertEqual(set(ui.TOKENS['light']) - set(ui.TOKENS['neon']), set())  # same keys as NOVA Air
        qss = ui.build_stylesheet('neon')
        self.assertIn('NEON//SYS extras', qss)
        self.assertIn('Orbitron', qss)
        self.assertIn('QPushButton:focus', qss)
        self.assertNotIn('NEON//SYS extras', ui.build_stylesheet('dark'))
        self.assertEqual((O / 'usr/share/nova/themes/neon.qss').read_text(), qss)

    def test_neon_choice_and_detection(self):
        with tempfile.TemporaryDirectory() as home:
            old = os.environ.pop('NOVA_THEME', None)
            try:
                ui.save_choice('neon', home)
                self.assertEqual(ui.resolve_variant(home), 'neon')
                ui.save_choice('auto', home)
                cfg = Path(home) / '.config/kdeglobals'
                cfg.write_text('[General]\nColorScheme=NovaNeon\n\n[Colors:Window]\nBackgroundNormal=11,7,20\n')
                self.assertEqual(ui.resolve_variant(home), 'neon')   # scheme wins over "dark background"
                cfg.write_text('[General]\nColorScheme=NovaAirDark\n')
                self.assertEqual(ui.resolve_variant(home), 'dark')
            finally:
                if old is not None:
                    os.environ['NOVA_THEME'] = old

    def test_colour_scheme_generated(self):
        text = (O / 'usr/share/color-schemes/NovaNeon.colors').read_text()
        for group in ('Window', 'View', 'Button', 'Selection', 'Tooltip', 'Complementary', 'Header'):
            self.assertIn(f'[Colors:{group}]', text)
        self.assertIn('ColorScheme=NovaNeon', text)
        self.assertIn('BackgroundNormal=11,7,20', text)       # NEON bg #0b0714
        # NOVA Air stays the system default for new users
        self.assertIn('ColorScheme=NovaAirDark', (O / 'etc/xdg/kdeglobals').read_text())   # default style


class LookAndFeel(unittest.TestCase):
    def test_package(self):
        meta = json.loads((LNF / 'metadata.json').read_text())
        self.assertEqual(meta['KPlugin']['Id'], 'org.nova.neon.desktop')
        self.assertEqual(layout.LNF['neon'], meta['KPlugin']['Id'])
        defaults = (LNF / 'contents/defaults').read_text()
        self.assertIn('ColorScheme=NovaNeon', defaults)
        self.assertIn('Theme=org.nova.neon.desktop', defaults)        # NEON splash
        js = (LNF / 'contents/layouts/org.kde.plasma.desktop-layout.js').read_text()
        self.assertIn('new Panel', js)
        self.assertNotIn('novaRemovePanels();', js)                   # new users have no panels yet
        self.assertIn(neon.WALLPAPER_PLUGIN, js)
        self.assertTrue((LNF / 'contents/splash/Splash.qml').is_file())
        self.assertTrue((LNF / 'contents/previews/preview.png').is_file())
        self.assertTrue((LNF / 'contents/previews/fullscreenpreview.jpg').is_file())

    def test_static_wallpaper_and_fonts(self):
        self.assertTrue((O / 'usr/share/wallpapers/NOVA-NEON/contents/images/1920x1080.png').stat().st_size > 10000)
        fonts = O / 'usr/share/fonts/truetype/nova-neon'
        for name in ('Orbitron-Variable.ttf', 'ShareTechMono-Regular.ttf'):
            self.assertGreater((fonts / name).stat().st_size, 10000, name)
        for lic in ('OFL-Orbitron.txt', 'OFL-ShareTechMono.txt'):
            self.assertIn('SIL Open Font License', (fonts / lic).read_text())
        self.assertIn('fc-cache -f /usr/share/fonts/truetype/nova-neon',
                      (ROOT / 'image/config/hooks/live/090-nova.hook.chroot').read_text())

    def test_konsole_and_sounds(self):
        scheme = (O / 'usr/share/konsole/NovaNeon.colorscheme').read_text()
        for i in range(8):
            self.assertIn(f'[Color{i}]', scheme)
            self.assertIn(f'[Color{i}Intense]', scheme)
        profile = (O / f'usr/share/konsole/{neon.KONSOLE_PROFILE}').read_text()
        self.assertIn('ColorScheme=NovaNeon', profile)
        theme = O / f'usr/share/sounds/{neon.SOUND_THEME}'
        self.assertIn('Directories=stereo', (theme / 'index.theme').read_text())
        for name in neon.SOUND_EVENTS:
            f = theme / 'stereo' / f'{name}.oga'
            self.assertTrue(f.is_file() and f.stat().st_size > 1000, name)
            self.assertEqual(f.read_bytes()[:4], b'OggS', name)


class Wallpaper(unittest.TestCase):
    QML = sorted((WP / 'contents/ui').glob('*.qml'))
    ALLOWED_IMPORTS = {'QtQuick', 'QtQuick.Controls', 'QtQuick.Layouts', 'org.kde.plasma.core',
                       'org.kde.plasma.plasmoid', 'org.kde.plasma.plasma5support', 'org.kde.kirigami'}

    def test_metadata_and_config(self):
        meta = json.loads((WP / 'metadata.json').read_text())
        self.assertEqual(meta['KPackageStructure'], 'Plasma/Wallpaper')
        self.assertEqual(meta['KPlugin']['Id'], neon.WALLPAPER_PLUGIN)
        kcfg = (WP / 'contents/config/main.xml').read_text()
        entries = set(re.findall(r'<entry name="(\w+)"', kcfg))
        self.assertEqual(entries, {'Scene', 'Fps', 'Speed', 'Paused', 'PauseOnBattery', 'ShowClock'})
        config_qml = (WP / 'contents/ui/config.qml').read_text()
        self.assertEqual(set(re.findall(r'property \w+ cfg_(\w+)', config_qml)), entries)
        main = (WP / 'contents/ui/main.qml').read_text()
        used = set(re.findall(r'configuration\.(\w+)', main))
        self.assertLessEqual(used, entries)

    def test_qml_sources(self):
        names = {p.name for p in self.QML}
        for needed in ('main.qml', 'config.qml', 'PowerWatch.qml', 'SynthScene.qml', 'CityScene.qml',
                       'RainScene.qml', 'CircuitScene.qml'):
            self.assertIn(needed, names)
        main = (WP / 'contents/ui/main.qml').read_text()
        for scene in ('synth', 'city', 'rain', 'circuit'):
            self.assertIn(f'{scene}: "', main)
        self.assertIn('sceneOrder: ' + json.dumps(list(neon.SCENE_ORDER)), main)
        # 'auto' rule must match nova_neon_core.scene_for_hour
        self.assertIn('hour >= 7 && hour < 18 ? "synth" : (hour >= 18 && hour < 23 ? "city" : "rain")', main)
        self.assertEqual([neon.scene_for_hour(h) for h in (6, 7, 17, 18, 22, 23, 0)],
                         ['rain', 'synth', 'synth', 'city', 'city', 'rain', 'rain'])
        for path in self.QML + [LNF / 'contents/splash/Splash.qml']:
            text = path.read_text()
            imports = set(re.findall(r'^import ([\w.]+)', text, re.M))
            self.assertLessEqual(imports, self.ALLOWED_IMPORTS, path.name)
            code = re.sub(r'//[^\n]*|/\*.*?\*/', '', re.sub(r'"(?:\\.|[^"\\])*"', '""', text), flags=re.S)
            for a, b in ('{}', '()', '[]'):
                self.assertEqual(code.count(a), code.count(b), f'{path.name}: unbalanced {a}{b}')
            self.assertNotRegex(text, r'https?://|XMLHttpRequest|Qt\.openUrlExternally', path.name)  # no network

    def test_performance_guards(self):
        main = (WP / 'contents/ui/main.qml').read_text()
        self.assertIn('running: !root.frozen && root.visible', main)       # single driver timer
        self.assertIn('PauseOnBattery', main)
        for path in self.QML:
            text = path.read_text()
            self.assertNotIn('NumberAnimation on', text, path.name)          # no per-frame animations
            self.assertNotIn('loops: Animation.Infinite', text, path.name)


@unittest.skipUnless(shutil.which('node'), 'node not installed')
class PlasmaScripts(unittest.TestCase):
    def test_full_desktop_on_full_hd(self):
        r = run_node(neon.plasma_script('standard'))
        self.assertEqual(r['log'], [])
        self.assertEqual(r['removed'], 3)          # run 1 replaces the old panel, run 2 replaces NEON's own two
        self.assertEqual(r['plugin'], neon.WALLPAPER_PLUGIN)
        self.assertEqual(r['config']['Wallpaper/org.nova.neon.wallpaper/General/Scene'], 'auto')
        locs = [(p['loc'], p['len'], p['fl']) for p in r['panels']]
        self.assertEqual(locs, [('top', 'fill', False), ('bottom', 'fit', True)])     # HUD bar + floating dock
        self.assertIn('applications:nova-neon-center.desktop', r['panels'][-1]['launchers'])
        self.assertTrue(r['userWidgetAlive'])
        types = [w['t'] for w in r['widgets']]
        self.assertEqual(len(types), len(set(types)))                      # no duplicates after 2 runs
        self.assertEqual(sorted(types), sorted(p for p, _c, _h in neon.WIDGETS))
        for w in r['widgets']:
            x, y, wd, ht = w['g']
            self.assertEqual(w['m'], 'true')
            self.assertTrue(0 <= x and x + wd <= 1920 and y >= 30 and y + ht <= 1080, w)

    def test_small_and_narrow_screens(self):
        r = run_node(neon.widgets_script(), screen=(1366, 768))
        for w in r['widgets']:
            self.assertLessEqual(w['g'][1] + w['g'][3], 768 - layout.PANEL_HEIGHT['standard'] - 40, w)
        self.assertEqual(len(r['widgets']), len(neon.WIDGETS))             # 0.12: clock + stats both fit
        squeezed = run_node(neon.widgets_script(), screen=(1366, 420))
        self.assertLess(len(squeezed['widgets']), len(neon.WIDGETS))      # too low: the rest is skipped
        # broken-looking stock applets must never be placed on the desktop again
        self.assertFalse({'org.kde.plasma.calendar', 'org.kde.plasma.mediacontroller', 'org.kde.plasma.notes',
                          'org.kde.plasma.timer'} & {p for p, _c, _h in neon.WIDGETS})
        self.assertEqual(run_node(neon.widgets_script(), screen=(720, 1280))['widgets'], [])

    def test_missing_widget_types_are_skipped(self):
        r = run_node(neon.widgets_script(), known=['org.kde.plasma.digitalclock', 'something.else'])
        self.assertEqual([w['t'] for w in r['widgets']], ['org.kde.plasma.digitalclock'])

    def test_wallpaper_script(self):
        r = run_node(neon.wallpaper_script('rain', True))
        self.assertEqual(r['config']['Wallpaper/org.nova.neon.wallpaper/General/Scene'], 'rain')
        self.assertIs(r['config']['Wallpaper/org.nova.neon.wallpaper/General/Paused'], True)
        with self.assertRaises(ValueError):
            neon.wallpaper_script('evil"); rm -rf ~; ("')


class Shortcuts(unittest.TestCase):
    def test_no_conflicts_and_launchers(self):
        taken = set()
        for _c, _a, keys, default, *_r in hotkeys.COMPONENT_SHORTCUTS:
            taken |= set(keys) | set(default)
        for _d, keys, _x in hotkeys.SERVICE_SHORTCUTS:
            taken |= set(keys)
        system = (O / 'etc/xdg/kglobalshortcutsrc').read_text()
        for desktop, key, desc in neon.SHORTCUTS:
            self.assertNotIn(key, taken, desc)
            entry = (O / 'usr/share/applications' / desktop).read_text()
            self.assertIn(f'X-KDE-Shortcuts={key}', entry)
            self.assertRegex(entry, r'(?m)^Exec=nova-neon')
            self.assertIn(f'[services][{desktop}]\n_launch={key}', system)
        self.assertEqual(len({k for _d, k, _x in neon.SHORTCUTS}), len(neon.SHORTCUTS))

    def test_center_is_a_checked_ui_app(self):
        self.assertIn('nova-neon-center', st.UI_APPS)
        self.assertIn('setup_window(', (BIN / 'nova-neon-center').read_text())


class Core(unittest.TestCase):
    def test_validation_and_builders(self):
        with self.assertRaises(ValueError):
            neon.validate_scene('matrix')
        with self.assertRaises(ValueError):
            neon.validate_mode('party')
        with self.assertRaises(ValueError):
            neon.power_command('turbo; reboot')
        self.assertEqual(neon.next_scene('circuit'), 'auto')
        self.assertEqual(neon.kwrite('kwinrc', 'NightColor', 'Active', None)[-1], '--delete')
        dnd = neon.dnd_commands(True)[0]
        self.assertIn('--notify', dnd)
        self.assertEqual(dnd[-1], '2099,1,1,0,0,0')
        self.assertEqual(neon.dnd_commands(False, None)[0][-1], '--delete')
        self.assertEqual(neon.look_commands()[0], ['plasma-apply-lookandfeel', '--apply', 'org.nova.neon.desktop'])
        for argv in neon.look_commands() + neon.restore_look_commands({}):
            self.assertTrue(all(isinstance(a, str) for a in argv))

    def test_state_is_filtered_and_keys_can_be_cleared(self):
        with tempfile.TemporaryDirectory() as home:
            neon.save_state({'active': True, 'scene': 'rain', 'mode': 'game', 'prev_power': 'balanced',
                             'evil': 'x', 'prev_lnf': '$(reboot)'}, home)
            s = neon.load_state(home)
            self.assertEqual(s, {'active': True, 'scene': 'rain', 'mode': 'game', 'prev_power': 'balanced'})
            neon.save_state({'prev_power': None}, home)
            self.assertNotIn('prev_power', neon.load_state(home))
            neon.state_path(home).write_text('[1, 2]')
            self.assertEqual(neon.load_state(home), {})

    def test_previous_look_detection(self):
        with tempfile.TemporaryDirectory() as home:
            self.assertEqual(neon.current_lnf_variant(home), 'light')
            (Path(home) / '.config').mkdir()
            (Path(home) / '.config/kdeglobals').write_text('[KDE]\nLookAndFeelPackage=org.nova.air.dark.desktop\n')
            self.assertEqual(neon.current_lnf_variant(home), 'dark')
            (Path(home) / '.config/kdeglobals').write_text('[KDE]\nLookAndFeelPackage=org.kde.breeze.desktop\n')
            self.assertEqual(neon.current_lnf_variant(home), 'kde-default')


class Cli(unittest.TestCase):
    def run_cli(self, home, *args):
        env = dict(os.environ, HOME=home, PYTHONDONTWRITEBYTECODE='1', PATH=os.environ['PATH'])
        env.pop('NOVA_THEME', None)
        return subprocess.run([sys.executable, str(BIN / 'nova-neon'), *args], env=env,
                              capture_output=True, text=True, check=False)

    def test_dry_run_apply_and_modes(self):
        with tempfile.TemporaryDirectory() as home:
            r = self.run_cli(home, '--dry-run', 'apply')
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('plasma-apply-lookandfeel --apply org.nova.neon.desktop', r.stdout)
            self.assertIn('--key Theme nova-neon', r.stdout)
            self.assertIn('evaluateScript', r.stdout)
            self.assertFalse(neon.state_path(home).exists())               # dry run writes nothing
            neon.save_state({'active': True}, home)
            r = self.run_cli(home, '--dry-run', 'mode', 'game')
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('powerprofilesctl set performance', r.stdout)
            self.assertIn('--group DoNotDisturb --key Until 2099,1,1,0,0,0', r.stdout)
            r = self.run_cli(home, '--dry-run', 'wallpaper', 'next')
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(self.run_cli(home, 'wallpaper', 'matrix').returncode, 2)

    def test_modes_need_neon_and_revert_is_safe(self):
        with tempfile.TemporaryDirectory() as home:
            r = self.run_cli(home, 'mode', 'game')
            self.assertNotEqual(r.returncode, 0)
            self.assertIn('nova-neon apply', r.stderr)
            r = self.run_cli(home, 'revert')
            self.assertEqual(r.returncode, 0)
            self.assertIn('уже выключен', r.stdout)

    def test_nova_layout_theme_neon_delegates(self):
        with tempfile.TemporaryDirectory() as home:
            env = dict(os.environ, HOME=home, PYTHONDONTWRITEBYTECODE='1')
            r = subprocess.run([sys.executable, str(BIN / 'nova-layout'), '--dry-run', 'theme', 'neon'], env=env,
                               capture_output=True, text=True, check=False)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertIn('nova-neon --dry-run apply --look-only', r.stdout)


class Integration(unittest.TestCase):
    def test_entry_points(self):
        self.assertIn('nova-neon-center', (BIN / 'nova-control').read_text())
        self.assertIn("('neon', 'NEON//SYS", (BIN / 'nova-personalize').read_text())
        self.assertIn("('nova-neon','apply')", (BIN / 'nova-first-run').read_text())
        verify = (ROOT / 'tools/verify-iso.sh').read_text()
        self.assertIn('org\\.nova\\.neon\\.wallpaper', verify)
        self.assertIn('nova-neon nova-neon-center', verify)
        workflow = (ROOT / '.github/workflows/build-iso.yml').read_text()
        self.assertIn('--themes light,dark,neon', workflow)
        self.assertIn('tools/neon_qml_smoke.py', workflow)

    def test_nothing_is_downloaded(self):
        for name in ('nova-neon', 'nova-neon-center', 'nova_neon_core.py'):
            text = (BIN / name).read_text()
            for word in ('curl', 'wget', 'urllib', 'requests', 'apt-get', 'flatpak install', 'pip install', 'sudo',
                         'pkexec', 'shell=True'):
                self.assertNotIn(word, text, f'{name}: {word}')


if __name__ == '__main__':
    unittest.main()
