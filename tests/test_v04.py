"""Safe migration tests using fake Windows profiles in temporary directories."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

BASE = Path(__file__).resolve().parents[1]
BIN = BASE/'image/config/includes.chroot/usr/local/bin'
spec = importlib.util.spec_from_file_location('nova_migrate_core', BIN/'nova_migrate_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)

class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.profile = self.root/'windows'/'Users'/'Alex'
        (self.profile/'AppData').mkdir(parents=True)
        (self.profile/'Documents').mkdir()
        (self.profile/'Documents'/'report.docx').write_bytes(b'original-docx')
        (self.profile/'Desktop').mkdir()
        (self.profile/'Desktop'/'test.txt').write_text('desk', encoding='utf-8')
        (self.profile/'Downloads').mkdir()
        (self.profile/'Downloads'/'setup.exe').write_bytes(b'MZ header - not installed')
        self.dest = self.root/'nova-home';self.dest.mkdir()
        links=self.profile/'AppData/Roaming/Microsoft/Windows/Start Menu/Programs'
        links.mkdir(parents=True)
        (links/'Office.lnk').write_bytes(b'link')
        chrome=self.profile/'AppData/Local/Google/Chrome/User Data/Default'
        chrome.mkdir(parents=True)
        (chrome/'Bookmarks').write_text(json.dumps({'roots':{'bookmark_bar':{'children':[
            {'type':'url','name':'Safe & sound','url':'https://example.org/?q=a&b=c'},
            {'type':'url','name':'malicious','url':'javascript:alert(1)'}]}}}),encoding='utf-8')

    def test_import_selected_and_avoid_unselected_or_overwrite(self):
        self.assertTrue(core.plausible_windows_profile(self.profile))
        result=core.migrate(self.profile, ['documents','bookmarks','programs'], self.dest)
        output=Path(result['destination'])
        self.assertEqual((output/'Данные'/'Документы'/'report.docx').read_bytes(), b'original-docx')
        self.assertFalse((output/'Данные'/'Рабочий стол').exists())
        self.assertEqual(result['bookmarks'],1)
        self.assertEqual(result['programs_catalogued'],1)
        bookmarks=(output/'Закладки браузеров'/'Chrome-Default.html').read_text()
        self.assertIn('NETSCAPE-Bookmark-file-1', bookmarks)
        self.assertIn('Safe &amp; sound', bookmarks)
        self.assertNotIn('javascript:',bookmarks)
        self.assertEqual((self.profile/'Documents'/'report.docx').read_bytes(),b'original-docx')
        self.assertTrue((output/'ОТЧЁТ-О-ПЕРЕНОСЕ.json').exists())
        again=core.migrate(self.profile,['documents'],self.dest)
        self.assertNotEqual(again['destination'],result['destination'])

    def test_links_skipped_and_extra_folder(self):
        external=self.root/'outside'
        external.mkdir();(external/'secrets.txt').write_text('secret')
        os.symlink(external/'secrets.txt',self.profile/'Documents'/'link.txt')
        extra=self.root/'games';extra.mkdir();(extra/'save.dat').write_bytes(b'save')
        result=core.migrate(self.profile,['documents','extra'],self.dest,extra)
        out=Path(result['destination'])
        self.assertFalse((out/'Данные'/'Документы'/'link.txt').exists())
        self.assertEqual((out/'Данные'/'Дополнительно'/'save.dat').read_bytes(),b'save')

    def test_reject_destination_inside_windows(self):
        with self.assertRaises(ValueError):
            core.migrate(self.profile,['documents'],self.profile/'Documents')

    def test_cancellation_and_manifest(self):
        status=core.migrate(self.profile,['documents'],self.dest,cancelled=lambda: True)
        self.assertTrue(status['cancelled'])
        self.assertEqual(status['copied'],0)
        self.assertTrue(Path(status['destination'],'ОТЧЁТ-О-ПЕРЕНОСЕ.json').exists())

    def test_no_disk_commands_in_advisor_and_grub_optin(self):
        s=(BIN/'nova-dualboot').read_text()
        for command in ('mkfs', 'wipefs', 'parted ', 'mount -o rw', 'bcdedit'):
            self.assertNotIn(command,s)
        self.assertIn('GRUB_DISABLE_OS_PROBER=false',
                     (BASE/'image/config/includes.chroot/etc/default/grub.d/90-nova-dualboot.cfg').read_text())
        pkg=(BASE/'image/config/package-lists/nova.list.chroot').read_text()
        self.assertIn('os-prober',pkg)
        self.assertIn('initialPartitioningChoice: none',
                      (BASE/'image/config/includes.chroot/etc/calamares/modules/partition.conf').read_text())

if __name__=='__main__': unittest.main()
