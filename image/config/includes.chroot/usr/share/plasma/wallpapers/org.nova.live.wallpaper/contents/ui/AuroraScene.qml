// Aurora: the NOVA mountain lake artwork with living, breathing curtains of light above the ridge.
import QtQuick

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62

    Image {
        anchors.fill: parent
        source: Qt.resolvedUrl("../images/aurora.jpg")
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: scene.width
        asynchronous: true
    }

    // Curtains live above the mountains (top 42 % of the screen) and fade out at the bottom
    Item {
        id: sky
        width: scene.width
        height: scene.height * 0.42
        clip: true
        Repeater {
            model: 9
            Rectangle {
                readonly property real k: index / 9
                readonly property real wave: Math.sin(scene.t * (0.12 + k * 0.05) + index * 1.7)
                width: scene.width * (0.18 + 0.08 * Math.sin(index * 2.1))
                height: sky.height * (0.7 + 0.25 * Math.abs(Math.sin(index * 1.3 + scene.t * 0.07)))
                x: scene.width * (k * 1.05 - 0.05) + wave * scene.width * 0.04
                y: sky.height - height
                rotation: wave * 6
                opacity: 0.22 + 0.22 * Math.sin(scene.t * 0.3 + index * 2.4)
                gradient: Gradient {
                    GradientStop { position: 0.0; color: "#00000000" }
                    GradientStop { position: 0.35; color: index % 3 === 2 ? "#50b18cff" : "#4038bdf8" }
                    GradientStop { position: 0.7; color: "#803ee6b0" }
                    GradientStop { position: 1.0; color: "#00000000" }
                }
            }
        }
    }

    // Ripples on the lake
    Repeater {
        model: 20
        Rectangle {
            readonly property real k: (index * 7919) % 1000 / 1000
            x: scene.width * ((k + scene.t * 0.004) % 1)
            y: scene.height * (0.71 + 0.27 * ((index * 0.41) % 1))
            width: scene.width * (0.03 + k * 0.08)
            height: 2
            radius: 1
            color: "#4debc5"
            opacity: 0.08 + 0.08 * Math.max(0, Math.sin(scene.t + index))
        }
    }
}
