#!/usr/bin/env python3
"""Render NOVA/NEON QML (live wallpaper scenes, KSplash, installer slides) offscreen with PyQt6.

Plasma's own QML modules are not available on CI runners, so tiny stand-ins
for org.kde.plasma.plasmoid (WallpaperItem), org.kde.plasma.core (Action) and
org.kde.plasma.plasma5support (DataSource) are generated in a temp dir. The
real wallpaper/splash QML is loaded unchanged. Any QML warning or error fails
the run; every scene is saved as PNG for a visual check.

  python3 tools/neon_qml_smoke.py OUTPUT_DIR
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OVERLAY = ROOT / 'image/config/includes.chroot'
WALLPAPER = OVERLAY / 'usr/share/plasma/wallpapers/org.nova.neon.wallpaper/contents/ui/main.qml'
SPLASH = OVERLAY / 'usr/share/plasma/look-and-feel/org.nova.neon.desktop/contents/splash/Splash.qml'
SLIDES = OVERLAY / 'usr/share/nova/calamares/show.qml'
FONTS = OVERLAY / 'usr/share/fonts/truetype/nova-neon'
SCENES = ('synth', 'city', 'rain', 'circuit')

STUBS = {
    'org/kde/plasma/plasmoid/qmldir': 'module org.kde.plasma.plasmoid\nWallpaperItem 1.0 WallpaperItem.qml\n',
    'org/kde/plasma/plasmoid/WallpaperItem.qml': '''import QtQuick
Item {
    property list<QtObject> contextualActions
    property QtObject configuration: QtObject {
        property string Scene: neonTestScene
        property int Fps: 30
        property real Speed: 1.0
        property bool Paused: false
        property bool PauseOnBattery: true
        property bool ShowClock: true
    }
}
''',
    'org/kde/plasma/core/qmldir': 'module org.kde.plasma.core\nAction 1.0 Action.qml\n',
    'org/kde/plasma/core/Action.qml': '''import QtQuick
QtObject {
    property string text
    property QtObject icon: QtObject { property string name }
    signal triggered()
}
''',
    'calamares/slideshow/qmldir': 'module calamares.slideshow\nPresentation 1.0 Presentation.qml\nSlide 1.0 Slide.qml\n',
    'calamares/slideshow/Presentation.qml': '''import QtQuick
Item {
    default property alias content: holder.data
    property int currentSlide: 0
    property var slides: []
    property bool activatedInCalamares: true
    function goToNextSlide() { currentSlide = currentSlide + 1 }
    Item { id: holder; anchors.fill: parent }
    Component.onCompleted: {
        var list = [];
        for (var i = 0; i < holder.children.length; i++)
            if (holder.children[i].isSlide === true) list.push(holder.children[i]);
        slides = list;
        for (var j = 0; j < list.length; j++) list[j].visible = (j === 0);
    }
}
''',
    'calamares/slideshow/Slide.qml': 'import QtQuick\nItem { property bool isSlide: true; anchors.fill: parent }\n',
    'org/kde/plasma/plasma5support/qmldir': 'module org.kde.plasma.plasma5support\nDataSource 1.0 DataSource.qml\n',
    'org/kde/plasma/plasma5support/DataSource.qml': '''import QtQuick
QtObject {
    property string engine
    property var connectedSources: []
    property int interval: 0
    property var data: ({})
    signal newData(string sourceName, var data)
}
''',
}


def main(argv):
    out = Path(argv[1] if len(argv) > 1 else 'output/neon-qml')
    out.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
    from PyQt6.QtCore import QEventLoop, QTimer, QUrl, qInstallMessageHandler
    from PyQt6.QtGui import QFontDatabase, QGuiApplication
    from PyQt6.QtQuick import QQuickView

    messages = []

    def handler(mode, _context, message):
        messages.append(str(message))
    qInstallMessageHandler(handler)
    app = QGuiApplication(sys.argv)
    for font in FONTS.glob('*.ttf'):
        QFontDatabase.addApplicationFont(str(font))

    stubs = Path(tempfile.mkdtemp(prefix='neon-qml-'))
    for rel, text in STUBS.items():
        path = stubs / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def wait(ms):
        loop = QEventLoop()
        QTimer.singleShot(ms, loop.quit)
        loop.exec()

    report = {}
    jobs = [(f'wallpaper-{s}', WALLPAPER, {'neonTestScene': s}) for s in SCENES]
    jobs.append(('splash', SPLASH, {'neonTestScene': 'auto'}))
    jobs.append(('installer-slides', SLIDES, {'neonTestScene': 'auto'}))
    for name, qml, context in jobs:
        before = len(messages)
        view = QQuickView()
        view.engine().addImportPath(str(stubs))
        for key, value in context.items():
            view.rootContext().setContextProperty(key, value)
        view.setResizeMode(QQuickView.ResizeMode.SizeRootObjectToView)
        view.resize(1280, 720)
        view.setSource(QUrl.fromLocalFile(str(qml)))
        errors = [e.toString() for e in view.errors()]
        if view.rootObject() is not None and name == 'splash':
            view.rootObject().setProperty('stage', 4)
        view.show()
        wait(1500)          # let the scene's timer run ~45 frames
        image = view.grabWindow()
        image.save(str(out / f'{name}.png'))
        new = [m for m in messages[before:] if 'QFont' not in m]   # font fallback notes are not errors
        report[name] = {'errors': errors, 'messages': new, 'image': f'{name}.png',
                        'size': [image.width(), image.height()]}
        view.close()
        view.deleteLater()
    (out / 'neon-qml-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    failed = {k: v for k, v in report.items() if v['errors'] or v['messages']}
    for k, v in report.items():
        print(('FAIL ' if k in failed else 'OK   ') + k, *(v['errors'] + v['messages'])[:6], sep='\n    ')
    del app
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
