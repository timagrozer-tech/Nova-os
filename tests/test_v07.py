"""NOVA 0.7: first login state, read-only report, bounded commands."""
import tempfile
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/'image/config/includes.chroot/usr/local/bin'
sys.path.insert(0,str(BIN))
import nova_first_run_core as first
import nova_health_core as health

class WelcomeTests(unittest.TestCase):
    def test_defaults_then_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertFalse(first.is_complete(folder))
            first.mark_complete(folder)
            self.assertTrue(first.is_complete(folder))
            p=first.state_path(folder)
            self.assertEqual(p.stat().st_mode & 0o777,0o600)
            self.assertEqual(p.parent.stat().st_mode & 0o777,0o700)
    def test_invalid_state_does_not_claim_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            p=first.state_path(folder);p.parent.mkdir(parents=True)
            p.write_text('{broken',encoding='utf-8')
            self.assertFalse(first.is_complete(folder))
    def test_live_boot_detection(self):
        self.assertTrue(health.has_live_boot('quiet boot=live components'))
        self.assertFalse(health.has_live_boot('root=/dev/nvme0n1p1 quiet'))

class HealthTests(unittest.TestCase):
    def test_fixed_read_only_commands(self):
        for _,cmd in health.COMMANDS:
            self.assertIsInstance(cmd,list)
            self.assertTrue(cmd)
            self.assertNotIn('sudo',cmd)
            self.assertNotIn('pkexec',cmd)
            self.assertNotIn('rm',cmd)
            self.assertNotIn('dd',cmd)
        self.assertFalse(any(x[0] == 'lsblk' and '--delete' in x for _,x in health.COMMANDS))
    def test_render_scrubs_sensitive_data(self):
        rows=[('Сеть','информация','home /home/example 192.168.0.55 aa:bb:cc:dd:ee:ff')]
        report=health.render_report(rows,home='/home/example')
        self.assertNotIn('192.168.0.55',report)
        self.assertNotIn('aa:bb:cc:dd:ee:ff',report)
        self.assertNotIn('/home/example',report)
    def test_mocked_inventory_no_actual_commands(self):
        seen=[]
        def mock_run(cmd):
            seen.append(cmd[0]);return ('информация','ok')
        rows=health.gather(mock_run)
        self.assertEqual(len(seen),len(health.COMMANDS))
        self.assertEqual(len(rows),len(health.COMMANDS)+1)
        self.assertIn('информация',health.render_report(rows))
    def test_integration_and_autostart(self):
        self.assertTrue((BIN/'nova-health').exists())
        self.assertTrue((BIN/'nova-first-run').exists())
        d=ROOT/'image/config/includes.chroot/etc/xdg/autostart/nova-first-run.desktop'
        self.assertIn('--auto',d.read_text())
        self.assertIn('NOVA Health',(BIN/'nova-control').read_text())
        version=(ROOT/'VERSION').read_text().strip()
        self.assertIn(f'NOVA OS {version}',(ROOT/'README_RU.md').read_text())
        self.assertIn('NOVA-OS-${VERSION}-amd64.iso',(ROOT/'tools/test-qemu.sh').read_text())
        self.assertTrue((ROOT/'tools/test-qemu-uefi.sh').is_file())
        self.assertTrue((ROOT/'tools/verify-iso.sh').is_file())

if __name__=='__main__':unittest.main()
