"""NOVA 0.5 isolated behavioural tests, no external devices required."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/'image/config/includes.chroot/usr/local/bin'

def module(name):
    spec=importlib.util.spec_from_file_location(name,BIN/(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m

sound=module('nova_sound_core')
phone=module('nova_phone_core')

class SoundTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.home=Path(self.tmp.name)
    def test_power_transition(self):
        self.assertIsNone(sound.power_transition(None,True))
        self.assertEqual(sound.power_transition(True,False),'power.connected')
        self.assertEqual(sound.power_transition(False,True),'power.disconnected')
        self.assertIsNone(sound.power_transition(False,False))
    def test_mapping_config_private(self):
        c=sound.load_settings(self.home)
        c['events']['power.connected']='off'
        c['volume']=22
        sound.save_settings(c,self.home)
        after=sound.load_settings(self.home)
        self.assertEqual(after['events']['power.connected'],'off')
        self.assertEqual(after['volume'],22)
        self.assertIsNone(sound.resolve_sound('power.connected',after,self.home))
        self.assertEqual(sound.config_path(self.home).stat().st_mode & 0o777,0o600)
    def test_import_no_overwrite_and_size(self):
        f=self.home/'custom.wav';f.write_bytes(b'RIFF example')
        a=sound.import_sound(f,self.home);b=sound.import_sound(f,self.home)
        self.assertNotEqual(a,b)
        self.assertEqual(a.read_bytes(),f.read_bytes())
        with self.assertRaises(ValueError):sound.import_sound(self.home/'notexist.wav',self.home)
    def test_edit_command_validation_and_no_shell(self):
        argv=sound.edit_command('/tmp/input.mp3','/tmp/output.ogg',2,6,.5,1)
        self.assertEqual(argv[0],'ffmpeg');self.assertNotIn('sh',argv)
        self.assertIn('-n',argv)
        with self.assertRaises(ValueError):sound.edit_command('/tmp/in.wav','/tmp/out.ogg',0,2,1.5,1.5)
        with self.assertRaises(ValueError):sound.edit_command('/tmp/in.wav','/tmp/out.sh',0,2)

class PhoneTests(unittest.TestCase):
    def test_endpoint_and_injection(self):
        self.assertEqual(phone.valid_endpoint('192.168.0.11:4123'),'192.168.0.11:4123')
        for item in ['example.com:4444','127.0.0.1:99999','127.0.0.1:1;touch /tmp/pwn', 'abc','1.2.3.4:0']:
            with self.assertRaises(ValueError):phone.valid_endpoint(item)
    def test_pair(self):
        self.assertEqual(phone.pairing_command('192.168.0.10:44112','123456'),
                         ['adb','pair','192.168.0.10:44112'])
        with self.assertRaises(ValueError):phone.pairing_command('192.168.0.10:44112','12;45')
    def test_usb_device_parser_and_mirror(self):
        raw='List of devices attached\nABC123 device usb:1-1 product:a\nZZZ unauthorized\nweird;id device\n'
        self.assertEqual(phone.parse_adb_devices(raw),[('ABC123','device'),('ZZZ','unauthorized')])
        self.assertIn('--new-display=1920x1080',phone.mirror_command('ABC123','desktop'))
        with self.assertRaises(ValueError):phone.mirror_command('abc;rm -rf /')
    def test_samsung_dex_not_claimed_as_native(self):
        src=(BIN/'nova-phone-hub').read_text()
        self.assertIn('не оригинальный Samsung DeX',src)

class IntegrationTests(unittest.TestCase):
    def test_manifest_launchers_and_autostart(self):
        manifest=(ROOT/'image/config/package-lists/nova.list.chroot').read_text()
        for dep in ('ffmpeg','python3-dbus','python3-gi','adb'):
            self.assertIn('\n'+dep+'\n',manifest)
        for name in ('nova-sound-studio','nova-gaming','nova-phone-hub'):
            self.assertTrue((BIN/name).exists())
            self.assertTrue((ROOT/'image/config/includes.chroot/usr/share/applications'/(name+'.desktop')).exists())
        self.assertTrue((ROOT/'image/config/includes.chroot/etc/xdg/autostart/nova-sound-daemon.desktop').exists())
    def test_original_dualboot_stays(self):
        self.assertTrue((BIN/'nova-migration').exists())
        self.assertTrue((BIN/'nova-dualboot').exists())
        self.assertTrue((BIN/'nova-android-hub').exists())

if __name__=='__main__':unittest.main()
