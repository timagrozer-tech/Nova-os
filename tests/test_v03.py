"""Source-level checks only. These cannot prove the ISO boots or software runs."""
from pathlib import Path
import ast
import re
import unittest

ROOT=Path(__file__).resolve().parents[1]
O=ROOT/'image/config/includes.chroot'
P=O/'usr/local/bin'
L=O/'usr/local/lib/nova'

class V03Test(unittest.TestCase):
    def test_android_executables_are_implemented(self):
        for x in ('nova-android-hub','nova-preflight','nova-control','nova_theme.py'):
            ast.parse((P/x).read_text(encoding='utf-8'))
        self.assertIn("('◉ Android и Google', self.page_android)",(P/'nova-control').read_text())

    def test_android_admin_refuses_reset(self):
        s=(L/'nova-android-admin').read_text()
        self.assertIn('trixie-backports',s)
        self.assertIn('Signed-By:',s)
        self.assertIn('init-gapps',s)
        self.assertIn('init-vanilla',s)
        self.assertIn('Refusing to replace',s)
        self.assertNotIn('waydroid init -f',s)
        self.assertNotIn('rm -rf',s)
        self.assertNotIn('curl | bash',s)

    def test_theme_and_gui_separation(self):
        self.assertTrue((O/'usr/share/nova/themes/air-light.qss').exists())
        self.assertTrue((O/'usr/share/nova/themes/air-dark.qss').exists())
        for x in ('nova-defender','nova-uninstaller','nova-control','nova-task-manager'):
            text=(P/x).read_text()
            # 0.12: shared NOVA Air kit (nova_ui) or its compatibility wrapper.
            self.assertTrue('load_nova_stylesheet' in text or 'nova_ui' in text, x)
        # 0.12: system-wide Plasma defaults moved from /etc/skel to /etc/xdg (Breeze base + NOVA Air colours).
        kdeglobals=(O/'etc/xdg/kdeglobals').read_text()
        self.assertIn('ColorScheme=NovaAirLight', kdeglobals)
        self.assertIn('widgetStyle=Breeze', kdeglobals)

    def test_installer_preflight_has_no_disk_commands(self):
        s=(P/'nova-preflight').read_text()
        self.assertIn('all(ch.isChecked()',s)
        self.assertIn('boot=live',s)
        self.assertIn("self.proc.start('pkexec',['calamares'])",s)
        for bad in ('mkfs.', 'wipefs', 'parted --script','dd if=', 'shutil.rmtree'):
            self.assertNotIn(bad,s)

    def test_no_google_apps_are_bundled(self):
        packages=(ROOT/'image/config/package-lists/nova.list.chroot').read_text()
        self.assertNotRegex(packages,r'^\s*(waydroid|gapps|google-play|libreoffice)\s*$', 'packages should not ship office / Google binaries')

    def test_preview_assets_exist(self):
        self.assertEqual(len(list((ROOT/'design/mockups').glob('*.png'))),6)
        self.assertTrue((O/'usr/share/wallpapers/NOVA/contents/images/1920x1080.png').is_file())

if __name__=='__main__': unittest.main()
