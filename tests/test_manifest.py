"""Regression checks independent of KDE or a live ISO build environment."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
OVERLAY = ROOT / 'image/config/includes.chroot'

class ManifestTest(unittest.TestCase):
    def test_no_unwanted_office_suite(self):
        packages = (ROOT / 'image/config/package-lists/nova.list.chroot').read_text().splitlines()
        names = {x.strip() for x in packages if x.strip() and not x.startswith('#')}
        self.assertTrue({'wine', 'clamav', 'virt-manager', 'baloo6'} <= names)
        self.assertFalse({'libreoffice', 'calligra', 'kde-standard', 'task-kde-desktop', 'live-task-kde'} & names)

    def test_gui_executables_present(self):
        for name in ('nova-control', 'nova-defender', 'nova-task-manager', 'nova-uninstaller', 'nova-search', 'nova-open-windows'):
            script = OVERLAY / 'usr/local/bin' / name
            self.assertTrue(script.exists(), name)
            compile(script.read_text(), str(script), 'exec')

    def test_admin_has_fixed_dispatch_and_validation(self):
        program = (OVERLAY / 'usr/local/lib/nova/nova-admin').read_text()
        self.assertIn('case "$1" in', program)
        self.assertIn("[[ \"$pkg\" =~", program)
        self.assertIn('apt-get -s purge', program)
        self.assertIn('removals', program)
        self.assertNotIn('eval ', program)

    def test_installer_never_erases_disks(self):
        build = (ROOT / 'tools/build-iso.sh').read_text()
        self.assertNotIn('wipefs', build)
        self.assertNotIn('mkfs.', build)
        self.assertNotIn('dd if=', build)

if __name__ == '__main__':
    unittest.main()
