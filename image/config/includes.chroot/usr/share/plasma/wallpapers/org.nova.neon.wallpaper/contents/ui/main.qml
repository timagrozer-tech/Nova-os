/*
 * NEON//SYS live wallpaper for KDE Plasma 6 (NOVA OS).
 * Pure QML: no Wallpaper Engine, no Lively, no browser engine.
 *
 * Performance rules:
 *  - one Timer drives every scene (Fps setting, 30 by default), no per-frame Animation objects;
 *  - static layers (stars, skyline, circuit traces) are painted once per resize;
 *  - frozen in GAME mode (Paused) and, by default, on battery power (PauseOnBattery).
 */
import QtQuick
import org.kde.plasma.core as PlasmaCore
import org.kde.plasma.plasmoid

WallpaperItem {
    id: root

    readonly property var sceneFiles: ({ synth: "SynthScene.qml", city: "CityScene.qml",
                                         rain: "RainScene.qml", circuit: "CircuitScene.qml" })
    readonly property var sceneOrder: ["auto", "synth", "city", "rain", "circuit"]
    readonly property string sceneSetting: sceneOrder.indexOf(String(root.configuration.Scene)) >= 0
                                           ? String(root.configuration.Scene) : "auto"
    readonly property int fps: Math.max(5, Math.min(60, Number(root.configuration.Fps) || 30))
    readonly property real speed: Number(root.configuration.Speed) > 0 ? Number(root.configuration.Speed) : 1.0
    property int hour: new Date().getHours()
    // Same rule as nova_neon_core.scene_for_hour (tested).
    readonly property string scene: sceneSetting !== "auto" ? sceneSetting
                                    : (hour >= 7 && hour < 18 ? "synth" : (hour >= 18 && hour < 23 ? "city" : "rain"))
    readonly property bool onBattery: power.status === Loader.Ready && power.item ? power.item.onBattery : false
    readonly property bool frozen: root.configuration.Paused === true
                                   || (root.configuration.PauseOnBattery !== false && onBattery)
    property real t: 0

    function nextScene() {
        var i = sceneOrder.indexOf(sceneSetting);
        root.configuration.Scene = sceneOrder[(i + 1) % sceneOrder.length];
    }

    contextualActions: [
        PlasmaCore.Action {
            text: "NEON//SYS: следующие обои"
            icon.name: "media-skip-forward"
            onTriggered: root.nextScene()
        },
        PlasmaCore.Action {
            text: root.configuration.Paused === true ? "NEON//SYS: продолжить анимацию" : "NEON//SYS: пауза анимации"
            icon.name: root.configuration.Paused === true ? "media-playback-start" : "media-playback-pause"
            onTriggered: root.configuration.Paused = !(root.configuration.Paused === true)
        }
    ]

    Rectangle {
        anchors.fill: parent
        color: "#0b0714"
    }

    // Battery state through Plasma's own data engine; if it is missing, the wallpaper simply never pauses.
    Loader {
        id: power
        source: "PowerWatch.qml"
        asynchronous: true
    }

    Timer {
        interval: 60000
        running: true
        repeat: true
        onTriggered: root.hour = new Date().getHours()
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
        source: root.sceneFiles[root.scene] || "SynthScene.qml"
    }

    Binding {
        target: sceneLoader.item
        property: "t"
        value: root.t
        when: sceneLoader.status === Loader.Ready
    }

    // Optional clock (off by default: the NEON desktop already has a clock widget).
    Column {
        visible: root.configuration.ShowClock === true
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.rightMargin: parent.width * 0.04
        anchors.bottomMargin: parent.height * 0.08
        spacing: 4

        Text {
            id: clockText
            anchors.right: parent.right
            font.family: "Orbitron"
            font.weight: Font.Black
            font.pixelSize: Math.max(28, root.height * 0.09)
            color: "#eafcff"
            style: Text.Outline
            styleColor: "#3300f0ff"
            text: Qt.formatTime(new Date(), "hh:mm")
        }
        Text {
            id: dateText
            anchors.right: parent.right
            font.family: "Share Tech Mono"
            font.pixelSize: Math.max(12, root.height * 0.018)
            font.letterSpacing: 4
            color: "#fcee0a"
            text: Qt.formatDate(new Date(), "dddd, d MMMM").toUpperCase()
        }
        Timer {
            interval: 10000
            running: parent.visible
            repeat: true
            triggeredOnStart: true
            onTriggered: {
                clockText.text = Qt.formatTime(new Date(), "hh:mm");
                dateText.text = Qt.formatDate(new Date(), "dddd, d MMMM").toUpperCase();
            }
        }
    }
}
