"""NOVA 0.6 offline tests: sound themes, gamepad events, recording safety."""
import importlib.util
import os
import re
import shutil
import struct
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/'image/config/includes.chroot/usr/local/bin'

# Modules import peers by name in the installed /usr/local/bin namespace.
import sys
sys.path.insert(0,str(BIN))

def load(name):
    spec=importlib.util.spec_from_file_location(name,BIN/(name+'.py'))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

sound=load('nova_sound_core')
theme=load('nova_sound_theme')
phone=load('nova_phone_core')
gamepad=load('nova_gamepad_core')

class ThemeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.home=Path(self.tmp.name)
        self.bundled=ROOT/'image/config/includes.chroot/usr/share/nova/sounds'
    @unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg not installed')
    def test_theme_export_isolated_no_overwrite(self):
        before={p.name:p.stat().st_size for p in self.bundled.iterdir()}
        a=theme.export_theme(self.home,self.bundled)
        b=theme.export_theme(self.home,self.bundled)
        self.assertNotEqual(a,b)
        self.assertIn('Directories=stereo',(a/'index.theme').read_text())
        self.assertTrue((a/'stereo/power-plug.oga').is_file())
        self.assertTrue((a/'stereo/dialog-warning.oga').is_file())
        self.assertTrue((b/'stereo/power-unplug.oga').is_file())
        self.assertEqual(before,{p.name:p.stat().st_size for p in self.bundled.iterdir()})
        self.assertEqual(a.stat().st_mode & 0o777,0o700)
    @unittest.skipUnless(shutil.which('ffmpeg'),'ffmpeg not installed')
    def test_disabled_markers_do_not_touch_originals(self):
        settings=sound.load_settings(self.home)
        settings['events']['power.connected']='off'
        sound.save_settings(settings,self.home)
        a=theme.export_theme(self.home,self.bundled)
        self.assertTrue((a/'stereo/power-plug.disabled').is_file())
        self.assertFalse((a/'stereo/power-plug.oga').exists())
    def test_missing_ffmpeg_or_source_raises(self):
        with mock.patch.object(theme.shutil,'which', return_value=None):
            with self.assertRaises(RuntimeError):theme.export_theme(self.home,self.bundled)

class GamepadTests(unittest.TestCase):
    def test_button_and_axis_events(self):
        b=struct.pack('<IhBB',123,1,1,9)
        self.assertEqual(gamepad.decode_event(b)['number'],9)
        self.assertEqual(gamepad.decode_event(b)['kind'],'button')
        ax=struct.pack('<IhBB',124,-32767,0x82,0)
        self.assertTrue(gamepad.decode_event(ax)['initial'])
        self.assertEqual(gamepad.decode_event(ax)['value'],-32767)
    def test_bad_data_and_device(self):
        with self.assertRaises(ValueError):gamepad.decode_event(b'1')
        self.assertIsNone(gamepad.decode_event(struct.pack('<IhBB',0,0,0,0)))
        self.assertTrue(gamepad.valid_js_device('/dev/input/js12'))
        self.assertFalse(gamepad.valid_js_device('/dev/input/js0;rm -rf /'))

class PhoneRecordingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.folder=Path(self.tmp.name)
    def test_quality_and_recording(self):
        target=self.folder/'capture.mp4'
        cmd=phone.mirror_command('ABCDEF1','screen',quality='economy',record=str(target))
        self.assertIn('--max-size=1024',cmd)
        self.assertIn('--record='+str(target),cmd)
        self.assertFalse(target.exists())
        self.assertIn('--new-display=1920x1080',phone.mirror_command('ABCDEF1','desktop',quality='quality'))
        with self.assertRaises(ValueError):phone.mirror_command('ABCDEF1',quality='oops')
    def test_no_existing_recordings_overwritten(self):
        f=self.folder/'take.mkv';f.write_bytes(b'my recording')
        with self.assertRaises(ValueError):phone.mirror_command('ABCDEF1',record=f)
        self.assertEqual(f.read_bytes(),b'my recording')
        with self.assertRaises(ValueError):phone.mirror_command('ABCDEF1',record=self.folder/'evil.sh')
        with self.assertRaises(ValueError):phone.mirror_command('ABCDEF1',record='relative.mp4')
    def test_symlinks_blocked(self):
        victim=self.folder/'original.mp4';victim.write_bytes(b'important')
        symlink=self.folder/'link.mp4';symlink.symlink_to(victim)
        with self.assertRaises(ValueError):phone.validate_record_target(symlink)
        self.assertEqual(victim.read_bytes(),b'important')

class IntegrationTests(unittest.TestCase):
    def test_old_modules_and_new_ui(self):
        for name in ('nova-dualboot','nova-migration','nova-android-hub',
                     'nova-sound-studio','nova-gaming','nova-phone-hub',
                     'nova-export-sound-theme','nova-gamepad-test'):
            self.assertTrue((BIN/name).is_file(),name)
        self.assertIn('Экспортировать тему звуков',(BIN/'nova-sound-studio').read_text())
        self.assertIn('Тест кнопок и стиков',(BIN/'nova-gaming').read_text())
        self.assertIn('Записать трансляцию',(BIN/'nova-phone-hub').read_text())
        self.assertIn('initialPartitioningChoice: none',(ROOT/'image/config/includes.chroot/etc/calamares/modules/partition.conf').read_text())

if __name__=='__main__':unittest.main()
