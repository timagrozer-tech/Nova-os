// Synth Grid: neon sun, mountains and an endless grid rolling towards the viewer.
import QtQuick

Item {
    id: scene
    property real t: 0
    readonly property real hz: height * 0.62          // horizon
    readonly property real sunR: height * 0.2
    readonly property real sunY: height * 0.42

    // Sky + floor
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0a0320" }
            GradientStop { position: 0.619; color: "#3a0a4a" }
            GradientStop { position: 0.62; color: "#05010d" }
            GradientStop { position: 1.0; color: "#05010d" }
        }
    }

    // Static layer: stars and perspective lines (painted once per resize)
    Canvas {
        id: still
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d");
            var w = width, h = height, hz = scene.hz;
            c.clearRect(0, 0, w, h);
            c.fillStyle = "rgba(210,225,255,0.75)";
            for (var i = 0; i < 180; i++) {
                c.fillRect((i * 7919) % Math.max(1, Math.floor(w)), (i * 104729) % Math.max(1, Math.floor(hz * 0.8)), 1.5, 1.5);
            }
            c.strokeStyle = "rgba(255,42,109,0.55)";
            c.lineWidth = Math.max(1, w / 1400);
            for (var j = -16; j <= 16; j++) {
                c.beginPath();
                c.moveTo(w / 2 + j * w * 0.012, hz);
                c.lineTo(w / 2 + j * w * 0.16, h);
                c.stroke();
            }
        }
    }

    // Sun glow (breathing)
    Rectangle {
        width: scene.sunR * 3.2
        height: width
        radius: width / 2
        x: (scene.width - width) / 2
        y: scene.sunY - height / 2
        color: "#ff2a6d"
        opacity: 0.10 + 0.04 * Math.sin(scene.t * 0.8)
    }

    // Sun with moving cut-out stripes (stripes are drawn only inside the circle)
    Item {
        id: sun
        width: scene.sunR * 2
        height: width
        x: (scene.width - width) / 2
        y: scene.sunY - scene.sunR

        Rectangle {
            anchors.fill: parent
            radius: width / 2
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#fcee0a" }
                GradientStop { position: 1.0; color: "#ff2a6d" }
            }
        }
        Repeater {
            model: 8
            Rectangle {
                readonly property real r: sun.width / 2
                readonly property real step: r / 7.5
                readonly property real dy: r * 0.08 + ((index * step + (scene.t * r * 0.05)) % (step * 8))
                readonly property real chord: 2 * Math.sqrt(Math.max(0, r * r - dy * dy))
                visible: dy < r * 0.98
                width: chord + 2
                height: Math.max(2, r * 0.012 + dy * 0.09)
                x: r - width / 2
                y: r + dy
                color: "#33093f"
            }
        }
    }

    // Mountains must cover the lower part of the sun: repaint the mountain silhouette above it.
    Canvas {
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d");
            var w = width, h = height, hz = scene.hz;
            c.clearRect(0, 0, w, h);
            c.fillStyle = "#12041f";
            c.beginPath();
            c.moveTo(0, hz);
            for (var k = 0; k <= 24; k++) {
                var x = k * w / 24;
                c.lineTo(x, hz - h * 0.08 * Math.abs(Math.sin(x * 0.011 + 1)) * (1 - Math.abs(x / w - 0.5) * 0.6));
            }
            c.lineTo(w, hz);
            c.closePath();
            c.fill();
        }
    }

    // Rolling horizontal grid lines
    Repeater {
        model: 18
        Rectangle {
            readonly property real z: (index + (scene.t * 0.25) % 1) / 18
            x: 0
            width: scene.width
            y: scene.hz + (scene.height - scene.hz) * z * z
            height: Math.max(1, scene.height / 900 + z * 1.5)
            color: "#ff2a6d"
            opacity: Math.min(1, z * 1.4)
        }
    }

    // Horizon glow line
    Rectangle {
        x: 0
        width: scene.width
        y: scene.hz - 1
        height: 2
        color: "#ff2a6d"
        opacity: 0.8
    }
}
