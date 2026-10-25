/*
 * NOVA Live — living wallpapers for KDE Plasma 6 (NOVA OS styles).
 *   sky     — Living Sky: real sun position, moon phase and stars for your time zone (computed locally)
 *   aurora  — northern lights over a mountain lake
 *   sakura  — falling petals at a warm sunrise
 *   ocean   — moonlit sea with a shimmering path
 * One timer drives the scene (Fps, 30 by default); frozen on battery (PauseOnBattery) and on Paused.
 */
import QtQuick
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

WallpaperItem {
    id: root

    readonly property var sceneFiles: ({ sky: "SkyScene.qml", aurora: "AuroraScene.qml",
                                         sakura: "SakuraScene.qml", ocean: "OceanScene.qml" })
    readonly property var sceneOrder: ["sky", "aurora", "sakura", "ocean"]
    readonly property string scene: sceneOrder.indexOf(String(root.configuration.Scene)) >= 0
                                    ? String(root.configuration.Scene) : "sky"
    readonly property int fps: Math.max(5, Math.min(60, Number(root.configuration.Fps) || 30))
    readonly property real speed: Number(root.configuration.Speed) > 0 ? Number(root.configuration.Speed) : 1.0
    readonly property real latitude: isFinite(Number(root.configuration.Latitude)) ? Number(root.configuration.Latitude) : 55.75
    readonly property real longitude: isFinite(Number(root.configuration.Longitude)) ? Number(root.configuration.Longitude) : 37.62
    readonly property bool onBattery: power.status === Loader.Ready && power.item ? power.item.onBattery : false
    readonly property bool frozen: root.configuration.Paused === true
                                   || (root.configuration.PauseOnBattery !== false && onBattery)
    property real t: 0
    property real now: Date.now()

    function nextScene() {
        root.configuration.Scene = sceneOrder[(sceneOrder.indexOf(scene) + 1) % sceneOrder.length];
    }

    contextualActions: [
        PlasmaCore.Action {
            text: "NOVA Live: следующие обои"
            icon.name: "media-skip-forward"
            onTriggered: root.nextScene()
        },
        PlasmaCore.Action {
            text: root.configuration.Paused === true ? "NOVA Live: продолжить анимацию" : "NOVA Live: пауза анимации"
            icon.name: root.configuration.Paused === true ? "media-playback-start" : "media-playback-pause"
            onTriggered: root.configuration.Paused = !(root.configuration.Paused === true)
        }
    ]

    Rectangle {
        anchors.fill: parent
        color: "#06101f"
    }

    Loader {
        id: power
        source: "PowerWatch.qml"
        asynchronous: true
    }

    Timer {      // the sky follows real time even when the animation is frozen
        interval: 60000
        running: true
        repeat: true
        onTriggered: root.now = Date.now()
    }

    Timer {
        interval: Math.round(1000 / root.fps)
        running: !root.frozen && root.visible
        repeat: true
        onTriggered: root.t += interval / 1000 * root.speed
    }

    Loader {
        id: sceneLoader
        anchors.fill: parent
        source: root.sceneFiles[root.scene] || "SkyScene.qml"
    }

    Binding { target: sceneLoader.item; property: "t"; value: root.t; when: sceneLoader.status === Loader.Ready }
    Binding { target: sceneLoader.item; property: "now"; value: root.now; when: sceneLoader.status === Loader.Ready }
    Binding { target: sceneLoader.item; property: "latitude"; value: root.latitude; when: sceneLoader.status === Loader.Ready }
    Binding { target: sceneLoader.item; property: "longitude"; value: root.longitude; when: sceneLoader.status === Loader.Ready }

    Column {
        visible: root.configuration.ShowClock === true
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.rightMargin: parent.width * 0.04
        anchors.bottomMargin: parent.height * 0.1
        Text {
            anchors.right: parent.right
            font.pixelSize: Math.max(28, root.height * 0.08)
            font.weight: Font.Light
            color: "#ffffff"
            opacity: 0.9
            text: Qt.formatTime(new Date(root.now), "hh:mm")
        }
        Text {
            anchors.right: parent.right
            font.pixelSize: Math.max(12, root.height * 0.02)
            color: "#ffffff"
            opacity: 0.75
            text: Qt.formatDate(new Date(root.now), "dddd, d MMMM")
        }
    }
}
