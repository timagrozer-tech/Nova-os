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
STATS = OVERLAY / 'usr/share/plasma/plasmoids/org.nova.neon.stats/contents/ui/StatsView.qml'
LIVE = OVERLAY / 'usr/share/plasma/wallpapers/org.nova.live.wallpaper/contents/ui'
# Living Sky over Moscow on 25 Oct 2026 (UTC ms): midnight, dawn, noon, sunset
SKY_TIMES = {'night': 1792962000000, 'dawn': 1792901100000, 'day': 1792918800000, 'sunset': 1792936800000}
FONTS = OVERLAY / 'usr/share/fonts/truetype/nova-neon'
SCENES = ('synth', 'city', 'rain', 'circuit')

STUBS = {
    'org/kde/plasma/plasmoid/qmldir': 'module org.kde.plasma.plasmoid\nWallpaperItem 1.0 WallpaperItem.qml\n',
    # Plasma's `configuration` is a KConfigPropertyMap with capitalised keys; a JS object behaves the same way here.
    'org/kde/plasma/plasmoid/WallpaperItem.qml': '''import QtQuick
Item {
    property list<QtObject> contextualActions
    property var configuration: ({ Scene: neonTestScene, Fps: 30, Speed: 1.0, Paused: false,
                                   PauseOnBattery: true, ShowClock: true, Latitude: 55.75, Longitude: 37.62 })
}
''',
    'org/kde/plasma/core/qmldir': 'module org.kde.plasma.core\nAction 1.0 Action.qml\nActionIcon 1.0 ActionIcon.qml\n',
    'org/kde/plasma/core/ActionIcon.qml': 'import QtQuick\nQtObject { property string name }\n',
    'org/kde/plasma/core/Action.qml': '''import QtQuick
QtObject {
    property string text
    property ActionIcon icon: ActionIcon {}
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
    jobs.append(('neon-stats', STATS, {'neonTestScene': 'auto', '_stats': True}))
    jobs += [(f'live-{s}', LIVE / 'main.qml', {'neonTestScene': s}) for s in ('aurora', 'sakura', 'ocean', 'sky')]
    jobs += [(f'sky-{name}', LIVE / 'SkyScene.qml', {'neonTestScene': 'sky', '_now': ms}) for name, ms in SKY_TIMES.items()]
    # The slides reference /usr/share/nova/...: point a temporary copy at the repository overlay.
    slides = stubs / 'show.qml'
    slides.write_text(SLIDES.read_text(encoding='utf-8').replace('file:///usr/share/', f'file://{OVERLAY}/usr/share/'),
                      encoding='utf-8')
    jobs.append(('installer-slides', slides, {'neonTestScene': 'auto'}))
    for name, qml, context in jobs:
        try:
            before = len(messages)
            view = QQuickView()
            view.engine().addImportPath(str(stubs))
            for key, value in context.items():
                if not key.startswith('_'):
                    view.rootContext().setContextProperty(key, value)
            view.setResizeMode(QQuickView.ResizeMode.SizeRootObjectToView)
            view.resize(1280, 720)
            view.setSource(QUrl.fromLocalFile(str(qml)))
            errors = [e.toString() for e in view.errors()]
            if view.rootObject() is not None and name == 'splash':
                view.rootObject().setProperty('stage', 4)
            if view.rootObject() is not None and '_stats' in context:      # sample values, not live data
                root = view.rootObject()
                for key, value in (('cpu', 37.0), ('memUsed', 6.2 * 2**30), ('memTotal', 15.6 * 2**30),
                                   ('rxRate', 1.4 * 2**20), ('txRate', 96 * 2**10), ('ready', True)):
                    root.setProperty(key, value)
                root.setProperty('cpuHistory', [12, 18, 25, 22, 40, 55, 48, 30, 26, 33, 61, 72, 50, 37, 29, 35, 44, 38, 31, 37])
            if view.rootObject() is not None and '_now' in context:
                view.rootObject().setProperty('now', float(context['_now']))
                view.rootObject().setProperty('latitude', 55.7558)
                view.rootObject().setProperty('longitude', 37.6176)
            view.show()
            wait(1500)          # let the scene's timer run ~45 frames
            image = view.grabWindow()
            image.save(str(out / f'{name}.png'))
            # Only QML problems count (Qt platform notes and font fallbacks are not errors).
            new = [m for m in messages[before:] if 'QFont' not in m
                   and ('.qml' in m or 'Error' in m or 'QML' in m or 'Cannot' in m)]
            report[name] = {'errors': errors, 'messages': new, 'image': f'{name}.png',
                            'size': [image.width(), image.height()]}
            view.close()
            view.deleteLater()
        except Exception as exc:  # noqa: BLE001 — report the job, keep rendering the others
            import traceback
            report[name] = {'errors': [f'{type(exc).__name__}: {exc}', traceback.format_exc()[-600:]],
                            'messages': [], 'image': None, 'size': None}
    (out / 'neon-qml-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')
    failed = {k: v for k, v in report.items() if v['errors'] or v['messages']}
    for k, v in report.items():
        print(('FAIL ' if k in failed else 'OK   ') + k, *(v['errors'] + v['messages'])[:6], sep='\n    ')
        if k in failed and os.environ.get('GITHUB_ACTIONS'):
            for line in (v['errors'] + v['messages'])[:8]:   # visible as run annotations
                print(f'::error title=QML {k}::' + line.replace('\n', ' ')[:400])
    del app
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
