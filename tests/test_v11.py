"""Tests for non-destructive update plan and privileged helper integration."""
import sys, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/'image/config/includes.chroot/usr/local/bin'
sys.path.insert(0,str(BIN))
from nova_update_core import parse_plan,formatted_plan,live_boot,recent_history,host_state

class Plans(unittest.TestCase):
    def test_upgrade_plan(self):
        plan=parse_plan('Reading package lists...\nThe following packages will be upgraded:\n x\n1 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nInst firefox-esr [1] (2 repo [amd64])\nConf firefox-esr (2 repo [amd64])\n')
        self.assertTrue(plan['valid'])
        self.assertEqual(plan['upgrades'],['firefox-esr'])
    def test_empty_plan_valid(self):
        plan=parse_plan('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.')
        self.assertTrue(plan['valid']);self.assertFalse(plan['upgrades'])
    def test_removal_blocked(self):
        p=parse_plan('1 upgraded, 0 newly installed, 1 to remove and 0 not upgraded.\nRemv plasma-desktop\nInst x (2)')
        self.assertFalse(p['valid']);self.assertEqual(p['removals'],['plasma-desktop'])
    def test_addition_blocked(self):
        p=parse_plan('1 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.\nInst x (2)')
        self.assertFalse(p['valid']);self.assertTrue(p['new_packages'])
    def test_downgrade_blocked(self):
        p=parse_plan('0 upgraded, 0 newly installed, 0 to remove and 1 downgraded.')
        self.assertFalse(p['valid'])
    def test_malformed_blocked(self):
        self.assertFalse(parse_plan('network error').get('valid'))
    def test_critical_flags(self):
        plan=parse_plan('2 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\nInst linux-image-amd64 (1)\nInst network-manager (2)')
        self.assertEqual(plan['sensitive'],['linux-image-amd64','network-manager'])
        self.assertIn('ядро',formatted_plan(plan))
    def test_output_bounded(self):
        text='82 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.\n'+'\n'.join(f'Inst foo{i} (1)' for i in range(82))
        self.assertIn('остальные пакеты не показаны',formatted_plan(parse_plan(text)))
    def test_live_detection(self):
        self.assertTrue(live_boot('quiet splash boot=live components'))
        self.assertFalse(live_boot('quiet boot=liveness'))
    def test_json_config_requirements(self):
        from nova_update_core import valid_timeshift_config
        with tempfile.TemporaryDirectory() as tmp:
            f=Path(tmp)/'t.json'
            self.assertFalse(valid_timeshift_config(f))
            f.write_text('{bad json')
            self.assertFalse(valid_timeshift_config(f))
            f.write_text('{"backup_device_uuid":"UUID","do_first_run":"true"}')
            self.assertFalse(valid_timeshift_config(f))
            f.write_text('{"backup_device_uuid":"UUID","do_first_run":"false"}')
            self.assertTrue(valid_timeshift_config(f))
    def test_history_no_raw_private_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/'tx-20261024-A';p.mkdir()
            (p/'status').write_text('failed')
            (p/'apt.log').write_text('secret account')
            self.assertEqual(recent_history(root),['tx-20261024-A: ошибка'])
    def test_timeshift_config_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);cmd=root/'cmdline';cfg=root/'timeshift.json'
            cmd.write_text('boot=live')
            st=host_state(cmd,cfg)
            self.assertTrue(st['live']);self.assertFalse(st['timeshift_configured'])
            cfg.write_text('{"some":"config"}')
            self.assertFalse(host_state(cmd,cfg)['timeshift_configured'])
            cfg.write_text('{"backup_device_uuid":"abc-123","do_first_run":"false"}')
            self.assertTrue(host_state(cmd,cfg)['timeshift_configured'])

class Integration(unittest.TestCase):
    def test_maintainer_wrapper_does_not_restore(self):
        s=(ROOT/'image/config/includes.chroot/usr/local/lib/nova/nova-update-admin').read_text()
        for item in ('apt-get -s','--no-remove','timeshift --create','--check','boot=live','pkexec' if False else 'DEBIAN_FRONTEND'):
            self.assertIn(item,s)
        self.assertLess(s.index('timeshift --create --comments "NOVA OS: перед обновлением'),s.index('apt-get -y --no-remove upgrade'))
        self.assertNotIn('timeshift --restore',s)
        self.assertNotIn('eval ',s)
        self.assertNotIn('apt-get dist-upgrade',s)
        self.assertNotIn('rm -rf',s)
    def test_commands_allowlist(self):
        s=(ROOT/'image/config/includes.chroot/usr/local/lib/nova/nova-update-admin').read_text()
        for action in ('refresh)', 'snapshots)', 'history)', 'snapshot)', 'apply)'):self.assertIn(action,s)
        self.assertIn('(( $# == 1 ))',s)
    def test_gui_and_launcher(self):
        s=(BIN/'nova-update-center').read_text()
        for action in ('Timeshift', 'Flatpak', 'Ядро', 'plan_ok','QMessageBox.question','nova-update-admin'):
            self.assertIn(action,s)
        launcher=(ROOT/'image/config/includes.chroot/usr/share/applications/nova-update-center.desktop').read_text()
        self.assertIn('Exec=/usr/local/bin/nova-update-center',launcher)
    def test_control_routes(self):
        s=(BIN/'nova-control').read_text()
        self.assertIn("self.open('nova-update-center')",s)
        # 0.12: version shown from /etc/nova-release instead of a hard-coded string.
        self.assertIn("f'NOVA OS {VERSION}",s)
        self.assertIn('nova_version()',s)
    def test_manifest_has_timeshift_and_discover(self):
        s=(ROOT/'image/config/package-lists/nova.list.chroot').read_text()
        for name in ('\ntimeshift\n','\nplasma-discover\n','\nflatpak\n'):self.assertIn(name,s)

if __name__=='__main__':unittest.main()
