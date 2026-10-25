// Ocean: a moonlit sea; swells roll in and the moon path shimmers.
import QtQuick

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62
    readonly property real horizon: height * 0.55

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#020814" }
            GradientStop { position: 0.4; color: "#0a1f3d" }
            GradientStop { position: 0.55; color: "#1b3a63" }
            GradientStop { position: 0.551; color: "#06142a" }
            GradientStop { position: 1.0; color: "#020a16" }
        }
    }

    Canvas {
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d");
            c.clearRect(0, 0, width, height);
            for (var i = 0; i < 180; i++) {
                c.fillStyle = "rgba(230,240,255," + (0.2 + ((i * 37) % 60) / 100) + ")";
                c.fillRect((i * 7919) % Math.max(1, Math.floor(width)), (i * 104729) % Math.max(1, Math.floor(scene.horizon * 0.85)), 1.4, 1.4);
            }
        }
    }

    Item {          // moon
        x: scene.width * 0.7 - width / 2
        y: scene.horizon * 0.32
        width: scene.height * 0.075
        height: width
        Rectangle { anchors.centerIn: parent; width: parent.width * 4; height: width; radius: width / 2; color: "#bcd4ff"; opacity: 0.08 }
        Rectangle { anchors.centerIn: parent; width: parent.width * 1.8; height: width; radius: width / 2; color: "#d8e6ff"; opacity: 0.18 }
        Rectangle { anchors.fill: parent; radius: width / 2; color: "#f2f6ff" }
    }

    // Swells: dark bands bobbing with depth-scaled amplitude
    Repeater {
        model: 9
        Rectangle {
            readonly property real z: (index + 1) / 9                       // 0 far … 1 near
            x: -scene.width * 0.05
            width: scene.width * 1.1
            y: scene.horizon + (scene.height - scene.horizon) * z * z * 0.95
               + Math.sin(scene.t * (0.6 + z * 0.5) + index * 1.3) * scene.height * 0.006 * (1 + z * 3)
            height: (scene.height - scene.horizon) * 0.12 * (0.4 + z)
            radius: height / 2
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#2a4f80" }
                GradientStop { position: 0.15; color: "#0c2140" }
                GradientStop { position: 1.0; color: "#04101f" }
            }
            opacity: 0.55 + z * 0.4
        }
    }

    // Moon path: glints that sparkle and drift towards the viewer
    Repeater {
        model: 60
        Rectangle {
            readonly property real k: (index * 104729) % 1000 / 1000
            readonly property real z: (k + scene.t * 0.02) % 1
            x: scene.width * 0.7 + (Math.sin(index * 12.9) * 0.5) * scene.width * (0.02 + z * 0.12) - width / 2
            y: scene.horizon + (scene.height - scene.horizon) * z * z
            width: scene.width * (0.006 + z * 0.03)
            height: Math.max(1.5, z * 4)
            radius: height / 2
            color: "#e8f1ff"
            opacity: (0.25 + 0.6 * Math.max(0, Math.sin(scene.t * 3 + index * 2.7))) * (1 - z * 0.4)
        }
    }

    Rectangle {     // horizon haze
        x: 0
        y: scene.horizon - 2
        width: scene.width
        height: 3
        color: "#9ec2ff"
        opacity: 0.25
    }
}
