// Living Sky: the NOVA lake at night, dawn, day and sunset, blended by the REAL sun elevation;
// the sun and the moon (with its real phase) are placed where they actually are. All computed locally.
import QtQuick
import "sky.js" as Sky

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62

    readonly property var sun: Sky.sunPosition(now, latitude, longitude)
    readonly property bool morning: sun.hourAngle < 0
    readonly property real night: Math.max(0, Math.min(1, (-2 - sun.elevation) / 8))     // 1 below -10°
    readonly property real day: Math.max(0, Math.min(1, (sun.elevation - 3) / 7))        // 1 above +10°
    readonly property real phase: Sky.moonPhase(now)
    readonly property var moon: Sky.sunPosition(now + 12.4 * 3600000, latitude, longitude)
    readonly property real horizon: height * 0.634          // lake shore in the artwork
    readonly property real skyTop: height * 0.04

    function imageUrl(name) { return Qt.resolvedUrl("../images/" + name + ".jpg"); }
    function skyY(elevation) {
        var k = Math.max(-0.08, Math.sin(Math.max(-8, elevation) * Math.PI / 180));
        return horizon - (horizon - skyTop) * k / 0.95;
    }

    // Four artworks of the same landscape; stacked so the blend is always opaque.
    Image {
        anchors.fill: parent
        source: scene.imageUrl("sky-night")
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: scene.width
        asynchronous: true
    }
    Image {
        anchors.fill: parent
        source: scene.imageUrl(scene.morning ? "sky-dawn" : "sky-sunset")
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: scene.width
        asynchronous: true
        opacity: 1 - scene.night
        visible: opacity > 0.005
    }
    Image {
        anchors.fill: parent
        source: scene.imageUrl("sky-day")
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: scene.width
        asynchronous: true
        opacity: scene.day
        visible: opacity > 0.005
    }

    // Twinkling stars on top of the painted ones
    Repeater {
        model: 18
        Rectangle {
            readonly property real k: (index * 7919) % 1000 / 1000
            x: scene.width * ((index * 0.137 + 0.03) % 1)
            y: scene.skyTop + (scene.horizon * 0.62) * ((index * 0.311) % 1)
            width: 2.5; height: 2.5; radius: 1.25
            color: "#ffffff"
            opacity: scene.night * (0.4 + 0.6 * Math.max(0, Math.sin(scene.t * (1.2 + k) + k * 9)))
            visible: scene.night > 0.02
        }
    }

    // Sun glow is not clipped: near the horizon it spills over the ridge like real haze
    Item {
        id: sunGlow
        visible: scene.sun.elevation > -6
        opacity: Math.max(0, Math.min(1, (scene.sun.elevation + 6) / 6))
        width: Math.max(40, scene.height * 0.075)
        height: width
        x: scene.width * Sky.screenX(scene.sun.azimuth, scene.latitude) - width / 2
        y: Math.min(scene.skyY(scene.sun.elevation), scene.height * 0.57) - height / 2
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 4.5; height: width; radius: width / 2
            color: scene.sun.elevation < 8 ? "#ffb070" : "#fff3c9"
            opacity: 0.12
        }
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 2; height: width; radius: width / 2
            color: scene.sun.elevation < 8 ? "#ffca80" : "#ffefba"
            opacity: 0.26
        }
    }

    // The sun disc and the moon are clipped above the mountains, so a low sun sets behind the ridge
    Item {
        id: skyArea
        x: 0
        y: 0
        width: scene.width
        height: scene.height * 0.57
        clip: true

        Item {     // sun
            visible: scene.sun.elevation > -6
            width: Math.max(40, scene.height * 0.075)
            height: width
            x: scene.width * Sky.screenX(scene.sun.azimuth, scene.latitude) - width / 2
            y: scene.skyY(scene.sun.elevation) - height / 2
            Rectangle {
                anchors.fill: parent
                radius: width / 2
                color: scene.sun.elevation < 6 ? "#ffddac" : "#ffefba"
            }
        }

        Canvas {   // moon with its real phase
            id: moonCanvas
            property real size: Math.max(36, scene.height * 0.065)
            property real phaseValue: scene.phase
            visible: scene.night > 0.05 && scene.moon.elevation > -4
            opacity: Math.min(1, scene.night * 1.5)
            width: size * 3
            height: size * 3
            x: scene.width * Sky.screenX(scene.moon.azimuth, scene.latitude) - width / 2
            y: scene.skyY(Math.max(4, scene.moon.elevation)) - height / 2
            onPhaseValueChanged: requestPaint()
            onSizeChanged: requestPaint()
            onPaint: {
                var c = getContext("2d"), r = size / 2, cx = width / 2, cy = height / 2;
                c.clearRect(0, 0, width, height);
                var glow = c.createRadialGradient(cx, cy, r, cx, cy, r * 3);
                glow.addColorStop(0, "rgba(229,231,255,0.30)");
                glow.addColorStop(1, "rgba(229,231,255,0)");
                c.fillStyle = glow;
                c.fillRect(0, 0, width, height);
                c.fillStyle = "rgba(38,48,74,0.92)";            // earthshine side
                c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
                // lit side: right while waxing, left while waning; terminator is a half-ellipse
                var k = Math.cos(phaseValue * 2 * Math.PI);    // 1 new … 0 quarter … -1 full
                var s = phaseValue < 0.5 ? 1 : -1;
                c.fillStyle = "#e5e7ff";
                c.beginPath();
                c.moveTo(cx, cy - r);
                c.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, s < 0);
                for (var i = 0; i <= 24; i++) {
                    var a = Math.PI / 2 - Math.PI * i / 24;     // bottom → top
                    c.lineTo(cx + s * k * r * Math.cos(a), cy + r * Math.sin(a));
                }
                c.closePath();
                c.fill();
            }
        }
    }

    // Reflection path on the lake under the sun (day/twilight) or the moon (night): broken glints, not a bar
    Item {
        id: reflection
        readonly property bool useMoon: scene.night > 0.5
        readonly property var body: useMoon ? scene.moon : scene.sun
        visible: body.elevation > -2 && opacity > 0.01
        x: scene.width * Sky.screenX(body.azimuth, scene.latitude)
        y: scene.horizon + scene.height * 0.012
        width: 1
        height: scene.height - y
        opacity: useMoon ? 0.55 * scene.night : 0.6 * (1 - scene.night)
        Repeater {
            model: 16
            Rectangle {
                readonly property real d: index / 16                         // 0 at the shore … 1 at the bottom
                readonly property real k: (index * 7919) % 100 / 100
                width: scene.width * (0.012 + d * 0.05) * (0.6 + 0.8 * Math.abs(Math.sin(scene.t * 0.9 + index * 1.7)))
                height: Math.max(1.5, 1.5 + d * 3)
                radius: height / 2
                x: -width / 2 + Math.sin(scene.t * 0.7 + index * 2.3) * scene.width * 0.004 * (1 + d * 4)
                y: reflection.height * d * d * 0.95
                color: reflection.useMoon ? "#e5e7ff" : "#fff3c9"
                opacity: (0.35 + 0.65 * k) * (1 - d * 0.55)
            }
        }
    }

    // Shimmer on the water
    Repeater {
        model: 22
        Rectangle {
            readonly property real k: (index * 104729) % 1000 / 1000
            x: scene.width * ((k + scene.t * 0.003 * (1 + k)) % 1)
            y: scene.horizon + (scene.height - scene.horizon) * (0.12 + 0.8 * ((index * 0.37) % 1))
            width: scene.width * (0.02 + k * 0.05)
            height: 2
            radius: 1
            color: "#ffffff"
            opacity: 0.05 + 0.08 * Math.max(0, Math.sin(scene.t * 1.2 + index))
        }
    }
}
