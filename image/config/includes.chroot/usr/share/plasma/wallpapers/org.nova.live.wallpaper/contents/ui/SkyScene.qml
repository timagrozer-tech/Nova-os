// Living Sky: the sky, sun, moon (with its real phase) and stars follow the actual time and place.
import QtQuick
import "sky.js" as Sky

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62

    readonly property var sun: Sky.sunPosition(now, latitude, longitude)
    readonly property var colors: Sky.skyColors(sun.elevation)
    readonly property real night: Sky.nightFactor(sun.elevation)
    readonly property real phase: Sky.moonPhase(now)
    readonly property real horizon: height * 0.72
    // the moon is roughly opposite the sun (good enough for a wallpaper)
    readonly property var moon: Sky.sunPosition(now + 12.4 * 3600000, latitude, longitude)

    function rng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    }

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: scene.colors[0] }
            GradientStop { position: 0.55; color: scene.colors[1] }
            GradientStop { position: 0.72; color: scene.colors[2] }
            GradientStop { position: 1.0; color: scene.colors[2] }
        }
    }

    // Stars (static positions, twinkle through t), only at night
    Canvas {
        id: stars
        anchors.fill: parent
        opacity: scene.night
        visible: opacity > 0.01
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d"), r = scene.rng(99);
            c.clearRect(0, 0, width, height);
            for (var i = 0; i < 260; i++) {
                var x = r() * width, y = r() * scene.horizon * 0.95, s = r() < 0.08 ? 2.2 : 1.2;
                c.fillStyle = "rgba(255,255,255," + (0.35 + r() * 0.6) + ")";
                c.fillRect(x, y, s, s);
            }
        }
    }
    Repeater {     // a few twinkling bright stars
        model: 14
        Rectangle {
            readonly property real k: (index * 7919) % 1000 / 1000
            x: scene.width * ((index * 0.137 + 0.05) % 1)
            y: scene.horizon * (0.08 + ((index * 0.311) % 0.7))
            width: 3; height: 3; radius: 1.5
            color: "#ffffff"
            opacity: scene.night * (0.5 + 0.5 * Math.sin(scene.t * (1.5 + k) + k * 9))
        }
    }

    // Sun with glow
    Item {
        visible: scene.sun.elevation > -8
        x: scene.width * Sky.screenX(scene.sun.azimuth, scene.latitude) - width / 2
        y: scene.horizon - (scene.horizon * 0.9) * Math.max(-0.1, Math.sin(Math.max(-8, scene.sun.elevation) * Math.PI / 180) / 0.9) - height / 2
        width: scene.height * 0.07
        height: width
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 5; height: width; radius: width / 2
            color: scene.sun.elevation < 8 ? "#ffb070" : "#fff6d8"
            opacity: 0.12
        }
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 2.2; height: width; radius: width / 2
            color: scene.sun.elevation < 8 ? "#ffc58a" : "#fffbe8"
            opacity: 0.25
        }
        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: scene.sun.elevation < 4 ? "#ffd2a0" : "#fffdf4"
        }
    }

    // Moon with its real phase (lit part painted on a canvas)
    Canvas {
        id: moonCanvas
        property real size: scene.height * 0.06
        visible: scene.night > 0.05 && scene.moon.elevation > -3
        opacity: Math.min(1, scene.night * 1.4)
        width: size * 3
        height: size * 3
        x: scene.width * Sky.screenX(scene.moon.azimuth, scene.latitude) - width / 2
        y: scene.horizon - scene.horizon * 0.85 * Math.max(0.05, Math.sin(Math.max(0, scene.moon.elevation) * Math.PI / 180)) - height / 2
        property real phaseValue: scene.phase
        onPhaseValueChanged: requestPaint()
        onSizeChanged: requestPaint()
        onPaint: {
            var c = getContext("2d"), r = size / 2, cx = width / 2, cy = height / 2;
            c.clearRect(0, 0, width, height);
            var glow = c.createRadialGradient(cx, cy, r, cx, cy, r * 3);
            glow.addColorStop(0, "rgba(220,230,255,0.25)");
            glow.addColorStop(1, "rgba(220,230,255,0)");
            c.fillStyle = glow;
            c.fillRect(0, 0, width, height);
            c.fillStyle = "rgba(40,48,72,0.9)";              // dark side
            c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
            // lit side: right while waxing, left while waning; terminator is a half-ellipse
            var k = Math.cos(phaseValue * 2 * Math.PI);   // 1 new … 0 quarter … -1 full
            var s = phaseValue < 0.5 ? 1 : -1;
            c.fillStyle = "#eef2ff";
            c.beginPath();
            c.moveTo(cx, cy - r);
            c.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, s < 0);
            for (var i = 0; i <= 24; i++) {
                var a = Math.PI / 2 - Math.PI * i / 24;          // bottom → top
                c.lineTo(cx + s * k * r * Math.cos(a), cy + r * Math.sin(a));
            }
            c.closePath();
            c.fill();
        }
    }

    // Drifting clouds (lit by the sky)
    Repeater {
        model: 6
        Item {
            readonly property real k: index / 6
            readonly property real speedK: 0.004 + k * 0.004
            x: ((k * 1.7 + scene.t * speedK) % 1.4 - 0.2) * scene.width
            y: scene.horizon * (0.12 + (index % 3) * 0.13)
            width: scene.width * (0.18 + k * 0.1)
            height: width * 0.22
            opacity: 0.25 + 0.25 * (1 - scene.night)
            Repeater {
                model: 4
                Rectangle {
                    width: parent.width * (0.35 + index * 0.08)
                    height: parent.height * (0.7 + (index % 2) * 0.3)
                    radius: height / 2
                    x: parent.width * index * 0.18
                    y: parent.height * (index % 2 === 0 ? 0.2 : 0)
                    color: scene.night > 0.6 ? "#3a4568" : (scene.sun.elevation < 8 ? "#ffd6b8" : "#ffffff")
                }
            }
        }
    }

    // Hills silhouette and a calm lake
    Canvas {
        anchors.fill: parent
        property color tone: Qt.darker(scene.colors[2], 2.6)
        onToneChanged: requestPaint()
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d"), w = width, h = height, hz = scene.horizon;
            c.clearRect(0, 0, w, h);
            c.fillStyle = Qt.darker(tone, 0.8);
            c.beginPath(); c.moveTo(0, hz);
            for (var i = 0; i <= 30; i++) {
                var x = i * w / 30;
                c.lineTo(x, hz - h * (0.05 + 0.04 * Math.sin(i * 0.9) + 0.03 * Math.sin(i * 2.3)));
            }
            c.lineTo(w, hz); c.closePath(); c.fill();
            c.fillStyle = tone;
            c.beginPath(); c.moveTo(0, hz);
            for (var j = 0; j <= 20; j++) {
                var x2 = j * w / 20;
                c.lineTo(x2, hz - h * (0.02 + 0.025 * Math.abs(Math.sin(j * 1.3 + 2))));
            }
            c.lineTo(w, hz); c.closePath(); c.fill();
        }
    }
    Rectangle {    // lake mirrors the sky
        x: 0
        y: scene.horizon
        width: scene.width
        height: scene.height - scene.horizon
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.darker(scene.colors[2], 1.4) }
            GradientStop { position: 1.0; color: Qt.darker(scene.colors[0], 1.6) }
        }
    }
    Repeater {     // shimmer on the water
        model: 24
        Rectangle {
            readonly property real k: (index * 104729) % 1000 / 1000
            x: scene.width * ((k + scene.t * 0.003 * (1 + k)) % 1)
            y: scene.horizon + (scene.height - scene.horizon) * (0.1 + 0.85 * ((index * 0.37) % 1))
            width: scene.width * (0.02 + k * 0.05)
            height: 2
            radius: 1
            color: "#ffffff"
            opacity: 0.08 + 0.1 * Math.sin(scene.t * 1.2 + index)
        }
    }
}
