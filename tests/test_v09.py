"""NOVA Driver Center v0.9: package provenance, selection and privileged safety."""
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / 'image/config/includes.chroot/usr/local/bin'
sys.path.insert(0, str(BIN))
from nova_driver_catalog import (SAFE_PACKAGES, valid_package, infer_from_devices,
    vendor_pages, policy_candidate, inspect_package, validate_selection)

OFFICIAL = '''firmware-iwlwifi:
  Installed: 20250410-2
  Candidate: 20250410-2
  Version table:
 *** 20250410-2 500
        500 http://deb.debian.org/debian trixie/non-free-firmware amd64 Packages
            release v=13,o=Debian,a=stable,n=trixie,l=Debian,c=non-free-firmware,b=amd64
            origin deb.debian.org
        100 /var/lib/dpkg/status
'''
EVIL = OFFICIAL.replace('deb.debian.org', 'drivers-free-updates.example.com')

class CatalogTests(unittest.TestCase):
    def test_package_allowlist(self):
        self.assertTrue(valid_package('firmware-iwlwifi'))
        for name in ('nvidia-driver', 'bash', 'linux-image-amd64', 'firmware-iwlwifi;rm -rf /', 'firmware-nope', ''):
            self.assertFalse(valid_package(name), name)
    def test_detects_intel_wifi_and_amd_gpu(self):
        devices = [{'type':'Сеть','device':'Network controller: Intel Corporation Wi-Fi 6 [8086:2723]'},
                   {'type':'Графика','device':'VGA: Advanced Micro Devices Radeon [1002:abcd]'}]
        self.assertEqual([x['package'] for x in infer_from_devices(devices)],
                         ['firmware-iwlwifi','firmware-amd-graphics','mesa-vulkan-drivers'])
    def test_unknown_hardware_is_not_assigned_driver(self):
        self.assertEqual(infer_from_devices([{'type':'Сеть','device':'Unknown vendor XYZ'}]), [])
    def test_nvidia_is_not_auto_installed(self):
        devs = [{'type':'Графика','device':'NVIDIA RTX 4050 [10de:28a1]'}]
        self.assertEqual(infer_from_devices(devs), [])
        self.assertIn('NVIDIA', vendor_pages(devs))
    def test_debian_apt_origin(self):
        self.assertEqual(policy_candidate(OFFICIAL), ('20250410-2', True))
    def test_rejects_unofficial_origin(self):
        self.assertEqual(policy_candidate(EVIL), ('20250410-2', False))
    def test_rejects_unknown_candidate(self):
        self.assertEqual(policy_candidate('  Candidate: (none)\n Version table:'), (None, False))
    def test_rejects_mixed_candidate_sources(self):
        mixed = OFFICIAL.replace('        100 /var/lib/dpkg/status',
                                 '        500 https://host.example/driver trixie/main amd64 Packages\n        100 /var/lib/dpkg/status')
        self.assertEqual(policy_candidate(mixed), ('20250410-2', False))
    def test_bound_package_count(self):
        with self.assertRaises(ValueError): validate_selection([])
        with self.assertRaises(ValueError): validate_selection(['firmware-iwlwifi']*2)
        with self.assertRaises(ValueError): validate_selection(['firmware-iwlwifi']*9)
        with self.assertRaises(ValueError): validate_selection(['nvidia-driver'])
        self.assertEqual(validate_selection(['firmware-iwlwifi']), ['firmware-iwlwifi'])
    def test_probe_invokes_apt_without_shell(self):
        fake = Mock(return_value=types.SimpleNamespace(returncode=0, stdout=OFFICIAL))
        status = inspect_package('firmware-iwlwifi', run=fake)
        self.assertTrue(status['verified'])
        self.assertEqual(fake.call_args.args[0], ['apt-cache','policy','firmware-iwlwifi'])
        self.assertNotIn('shell', fake.call_args.kwargs)

class IntegratedProjectTests(unittest.TestCase):
    def test_admin_root_helper_checks_origin_and_refuses_removals(self):
        admin = (ROOT/'image/config/includes.chroot/usr/local/lib/nova/nova-driver-admin').read_text()
        self.assertIn('inspect_package', admin)
        self.assertIn('validate_selection', admin)
        self.assertIn('check-plan', admin) # v0.10 uses stricter Python preflight
        self.assertIn('--no-remove install', admin)
        self.assertIn('boot=live', admin)
        self.assertNotIn('eval ', admin)
    def test_ui_contains_official_download_and_explicit_approval(self):
        ui = (BIN/'nova-driver-center').read_text()
        for part in ('apt-get', 'download', 'pkexec', 'QMessageBox.question', 'fwupdmgr', 'vendor_pages'):
            self.assertIn(part, ui)
        self.assertNotIn('shell=True', ui)
    def test_package_manifest(self):
        manifest = (ROOT/'image/config/package-lists/nova.list.chroot').read_text()
        self.assertIn('fwupd', manifest)
        self.assertIn('firmware-iwlwifi', manifest)
        self.assertNotIn('\nnvidia-driver\n', manifest)

if __name__ == '__main__':
    unittest.main()
