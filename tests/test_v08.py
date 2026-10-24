"""NOVA 0.8: bounded settings, read-only telemetry and safe user process actions."""
import json
import math
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
BIN=ROOT/'image/config/includes.chroot/usr/local/bin'
sys.path.insert(0,str(BIN))
import nova_performance_core as pc

class SensorTests(unittest.TestCase):
    def test_millidegree_filter(self):
        self.assertEqual(pc.normalize_millidegrees('65000'),65.0)
        for bad in ('x','nan','-100',0,'450000',float('inf'),None):
            self.assertIsNone(pc.normalize_millidegrees(bad))
    def test_celsius_filter(self):
        self.assertEqual(pc.valid_celsius(80.12),80.1)
        self.assertIsNone(pc.valid_celsius(float('nan')))
    def test_thermal_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            zone=Path(temp)/'thermal_zone0';zone.mkdir()
            (zone/'temp').write_text('72000')
            (zone/'type').write_text('x86_pkg_temp')
            rows=pc.thermal_observations(reader={},base=Path(temp))
            self.assertEqual(rows,[('x86_pkg_temp',72.0)])
    def test_psutil_priority_order(self):
        rows=[types.SimpleNamespace(info={'pid':55,'cpu_percent':10,'memory_percent':9,'name':'a'}),
              types.SimpleNamespace(info={'pid':50,'cpu_percent':70,'memory_percent':1,'name':'b'})]
        self.assertEqual(pc.top_processes(iterator=rows)[0]['pid'],50)

class PowerTests(unittest.TestCase):
    def test_profiles_parsed_without_false_positive(self):
        s='  performance:\n  * balanced:\n  power-saver:\n  turbo: \n'
        self.assertEqual(pc.parse_profile_list(s),['performance','balanced','power-saver'])
    def test_profile_is_rejected_if_not_supported(self):
        with patch.object(pc,'supported_profiles',return_value=['balanced']),patch.object(pc,'run_fixed') as run:
            self.assertFalse(pc.set_profile('performance')[0])
            self.assertFalse(pc.set_profile('overclock')[0])
            run.assert_not_called()
    def test_supported_profile_uses_fixed_argv(self):
        with patch.object(pc,'supported_profiles',return_value=['balanced']),patch.object(pc,'run_fixed',return_value=(0,'','')) as run:
            self.assertTrue(pc.set_profile('balanced')[0]);run.assert_called_once_with(['powerprofilesctl','set','balanced'],timeout=7)

class PriorityTests(unittest.TestCase):
    class Fake:
        pid=43210
        def __init__(self,owner=999,created=12,nice=0):
            self.owner=owner;self.created=created;self.value=nice;self.written=None
        def uids(self):return types.SimpleNamespace(real=self.owner)
        def create_time(self):return self.created
        def nice(self,value=None):
            if value is None:return self.value
            self.written=value
    def test_denies_process_owned_by_someone_else(self):
        f=self.Fake(owner=999)
        self.assertFalse(pc.lower_priority(f,12,real_uid=1000)[0]);self.assertIsNone(f.written)
    def test_pid_reuse_denied(self):
        f=self.Fake(owner=1000,created=15)
        self.assertFalse(pc.lower_priority(f,12,real_uid=1000)[0]);self.assertIsNone(f.written)
    def test_only_lowers_priority(self):
        f=self.Fake(owner=1000,created=12,nice=-4)
        self.assertTrue(pc.lower_priority(f,12,real_uid=1000)[0]);self.assertEqual(f.written,5)
    def test_does_not_change_max_priority(self):
        f=self.Fake(owner=1000,created=12,nice=19)
        self.assertFalse(pc.lower_priority(f,12,real_uid=1000)[0]);self.assertIsNone(f.written)

class SettingsTests(unittest.TestCase):
    def test_restricted_temperature_and_permissions(self):
        with tempfile.TemporaryDirectory() as temp:
            self.assertEqual(pc.read_threshold(temp),90)
            path=pc.write_threshold(89,temp)
            self.assertEqual(pc.read_threshold(temp),89)
            self.assertEqual(path.stat().st_mode&0o777,0o600)
            self.assertEqual(path.parent.stat().st_mode&0o777,0o700)
            with self.assertRaises(ValueError):pc.write_threshold(150,temp)
            with self.assertRaises(ValueError):pc.write_threshold(True,temp)
    def test_bad_settings_revert_to_safe_default(self):
        with tempfile.TemporaryDirectory() as temp:
            path=pc.settings_path(temp);path.write_text('{not json')
            self.assertEqual(pc.read_threshold(temp),90)

class IntegrationTests(unittest.TestCase):
    def test_menu_and_build_are_updated(self):
        self.assertTrue((BIN/'nova-performance').is_file())
        self.assertIn('NOVA Performance',(BIN/'nova-control').read_text())
        self.assertIn('nova-performance',(BIN/'nova-gaming').read_text())
        self.assertTrue((ROOT/'image/config/includes.chroot/usr/share/applications/nova-performance.desktop').is_file())
        # 0.12: ISO name derives from the single VERSION file.
        self.assertIn('ISO_NAME="NOVA-OS-${VERSION}-amd64.iso"',(ROOT/'tools/build-iso.sh').read_text())
        self.assertIn('NOVA-OS-${{ steps.version.outputs.version }}-amd64.iso',(ROOT/'.github/workflows/build-iso.yml').read_text())
        self.assertTrue((ROOT/'nova-docs/PERFORMANCE_RU.md').is_file())

if __name__=='__main__':unittest.main()
