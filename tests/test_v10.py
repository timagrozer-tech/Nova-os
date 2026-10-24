"""Tests for read-only GPU preflight and conservative driver install recovery journal."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / 'image/config/includes.chroot/usr/local/bin'
sys.path.insert(0, str(BIN))
from nova_gpu_safety import (assess, gpu_vendors, parse_apt_candidate,
                             parse_secure_boot, scan, format_gpu_report)
from nova_driver_transaction import inspect_apt_simulation, summarize_history


class GpuSafetyTests(unittest.TestCase):
    def test_gpu_pci_only(self):
        pci = ('01:00.0 VGA compatible controller: NVIDIA Corporation GA107 [10de:28a1]\n'
               '00:02.0 Display controller: Intel Corporation [8086:1234]\n'
               '03:00.0 Ethernet controller: Intel [8086:1234]')
        self.assertEqual(gpu_vendors(pci), ['Intel', 'NVIDIA'])
    def test_secure_boot_states(self):
        self.assertEqual(parse_secure_boot(True, 'SecureBoot enabled'), 'enabled')
        self.assertEqual(parse_secure_boot(True, 'SecureBoot disabled'), 'disabled')
        self.assertEqual(parse_secure_boot(False, 'SecureBoot enabled'), 'unknown')
    def test_candidate_parse(self):
        self.assertEqual(parse_apt_candidate(' Candidate: 550.163-1'), '550.163-1')
        self.assertIsNone(parse_apt_candidate(' Candidate: (none)'))
    def test_nvidia_always_manual(self):
        report = assess({'gpu_vendors': ['NVIDIA'], 'secure_boot':'enabled',
                         'module_signer':None, 'nvidia_module_present':False,
                         'kernel_headers':False, 'dkms_nvidia':'not verified'})
        self.assertTrue(report['manual_review_required'])
        self.assertFalse(report['automatic_nvidia_allowed'])
        self.assertTrue(any('Secure Boot' in x for x in report['warnings']))
    def test_non_nvidia_not_auto_claim(self):
        report = assess({'gpu_vendors': ['AMD'], 'secure_boot':'disabled'})
        self.assertFalse(report['automatic_nvidia_allowed'])
        self.assertFalse(report['manual_review_required'])
    def test_bounded_read_only_probes(self):
        def fake_runner(command):
            table = {
                'lspci': (True,'01:00.0 VGA compatible controller: NVIDIA [10de:28a1]'),
                'mokutil': (True,'SecureBoot enabled'),
                'apt-cache': (True, ' Candidate: (none)'),
                'modinfo': (False,''),
            }
            return table.get(command[0],(False,''))
        with tempfile.TemporaryDirectory() as tmp:
            report = scan(runner=fake_runner, kernel='6.12-test', modules_root=Path(tmp))
        self.assertIn('NVIDIA', report['gpu_vendors'])
        self.assertFalse(report['automatic_nvidia_allowed'])
        self.assertFalse(report['kernel_headers'])
        self.assertIn('только чтение', format_gpu_report(report))


class DriverTransactions(unittest.TestCase):
    def test_allowed_firmware(self):
        self.assertEqual(inspect_apt_simulation('Inst firmware-realtek (2025 repo [all])\nConf firmware-realtek (2025 repo [all])'), [])
    def test_prevent_removal(self):
        self.assertTrue(inspect_apt_simulation('Remv plasma-desktop [1]\nInst firmware-realtek (1)'))
    def test_prevent_kernel_or_nvidia_update(self):
        self.assertTrue(inspect_apt_simulation('Inst firmware-realtek (1)\nInst linux-image-amd64 (2)'))
        self.assertTrue(inspect_apt_simulation('Inst nvidia-driver (600)'))
    def test_empty_plan_blocked(self):
        self.assertTrue(inspect_apt_simulation('0 newly installed'))
    def test_history_no_raw_logs(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            tx = base/'tx-20261024-ABCD'
            tx.mkdir()
            (tx/'status').write_text('failed\n')
            (tx/'apt-install.log').write_text('SECRET_ACCOUNT_NAME')
            self.assertEqual(summarize_history(base), ['tx-20261024-ABCD: ошибка'])
            self.assertNotIn('SECRET', ''.join(summarize_history(base)))


class IntegratedSafety(unittest.TestCase):
    def test_root_helper_journals_not_rollback(self):
        admin = (ROOT/'image/config/includes.chroot/usr/local/lib/nova/nova-driver-admin').read_text()
        for phrase in ('mktemp -d', 'dpkg-query -W', 'apt-get -s install',
                       'check-plan', '--no-remove', 'boot=live', 'inspect_package'):
            self.assertIn(phrase, admin)
        self.assertNotIn('eval ', admin)
        self.assertNotIn('apt-get purge', admin)
    def test_gui_has_gpu_recovery_sections(self):
        ui = (BIN/'nova-driver-center').read_text()
        for phrase in ('Безопасность GPU','Восстановление','scan_gpu',
                       'pkexec', "'history'", 'Открыть Timeshift'):
            self.assertIn(phrase, ui)
    def test_no_unattended_nvidia(self):
        manifest=(ROOT/'image/config/package-lists/nova.list.chroot').read_text()
        self.assertNotIn('\nnvidia-driver\n',manifest)
        self.assertNotIn('\nnvidia-open\n',manifest)


if __name__ == '__main__':
    unittest.main()
