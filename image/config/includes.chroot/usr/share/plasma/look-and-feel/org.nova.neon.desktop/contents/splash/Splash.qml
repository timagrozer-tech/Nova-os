// NEON//SYS boot splash (KSplash). Plasma sets `stage` from 1 to 6 while the session starts.
import QtQuick

Rectangle {
    id: root
    color: "#0b0714"
    property int stage

    // faint scanlines
    Column {
        anchors.fill: parent
        Repeater {
            model: Math.ceil(root.height / 4)
            Rectangle {
                width: root.width
                height: 1
                color: "#ffffff"
                opacity: 0.025
            }
        }
        spacing: 3
    }

    Item {
        id: logo
        anchors.centerIn: parent
        width: title.implicitWidth
        height: title.implicitHeight + 90

        Text {   // glitch shadow
            id: shadow
            x: title.x + 3
            y: title.y
            font: title.font
            color: "#ff2a6d"
            opacity: 0.7
            text: title.text
        }
        Text {
            id: title
            anchors.horizontalCenter: parent.horizontalCenter
            font.family: "Orbitron"
            font.weight: Font.Black
            font.pixelSize: Math.max(36, root.height * 0.08)
            font.letterSpacing: 4
            color: "#fcee0a"
            text: "NEON//SYS"
        }
        Text {
            anchors.top: title.bottom
            anchors.topMargin: 18
            anchors.horizontalCenter: parent.horizontalCenter
            font.family: "Share Tech Mono"
            font.pixelSize: Math.max(12, root.height * 0.018)
            font.letterSpacing: 3
            color: "#00f0ff"
            text: "BOOT SEQUENCE // " + Math.min(6, Math.max(1, root.stage)) + "/6"
        }
        Rectangle {
            id: track
            anchors.bottom: parent.bottom
            anchors.horizontalCenter: parent.horizontalCenter
            width: Math.max(240, root.width * 0.22)
            height: 4
            color: "#1d1433"
            Rectangle {
                height: parent.height
                width: parent.width * Math.min(1, Math.max(0, root.stage) / 6)
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: "#ff2a6d" }
                    GradientStop { position: 1.0; color: "#00f0ff" }
                }
                Behavior on width { NumberAnimation { duration: 400; easing.type: Easing.OutCubic } }
            }
        }
    }

    Timer {   // short glitch every ~1.5 s
        interval: 120
        running: true
        repeat: true
        property int tick: 0
        onTriggered: {
            tick = (tick + 1) % 13;
            shadow.x = title.x + (tick === 0 ? -6 : (tick === 1 ? 7 : 3));
        }
    }
}
