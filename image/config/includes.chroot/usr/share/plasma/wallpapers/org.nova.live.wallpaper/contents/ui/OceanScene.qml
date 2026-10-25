// Ocean: the NOVA moonlit sea artwork; swells roll and the moon path sparkles.
import QtQuick

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62
    readonly property real sea: height * (620 / 1080)          // sea line in the artwork
    readonly property real moonX: width * (1450 / 1920)

    Image {
        anchors.fill: parent
        source: Qt.resolvedUrl("../images/ocean.jpg")
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: scene.width
        asynchronous: true
    }

    Rectangle {      // the moon glow breathes
        width: scene.height * 0.3
        height: width
        radius: width / 2
        x: scene.moonX - width / 2
        y: scene.height * (285 / 1080) - height / 2
        color: "#badcff"
        opacity: 0.08 + 0.05 * Math.sin(scene.t * 0.6)
    }

    Repeater {       // slow swells: soft light lines that rise and fall
        model: 7
        Rectangle {
            readonly property real z: (index + 1) / 7
            x: -scene.width * 0.05
            width: scene.width * 1.1
            y: scene.sea + (scene.height - scene.sea) * z * z * 0.92
               + Math.sin(scene.t * (0.5 + z * 0.4) + index * 1.3) * scene.height * 0.005 * (1 + z * 3)
            height: Math.max(2, 2 + z * 3)
            radius: height / 2
            color: "#71b6dc"
            opacity: 0.08 + 0.1 * z
        }
    }

    Repeater {       // moon path glints
        model: 56
        Rectangle {
            readonly property real k: (index * 104729) % 1000 / 1000
            readonly property real z: (k + scene.t * 0.02) % 1
            x: scene.moonX + Math.sin(index * 12.9) * scene.width * (0.01 + z * 0.12) - width / 2
            y: scene.sea + (scene.height - scene.sea) * z * z
            width: scene.width * (0.006 + z * 0.03)
            height: Math.max(1.5, z * 4)
            radius: height / 2
            color: "#e8f1ff"
            opacity: (0.25 + 0.6 * Math.max(0, Math.sin(scene.t * 3 + index * 2.7))) * (1 - z * 0.4)
        }
    }
}
