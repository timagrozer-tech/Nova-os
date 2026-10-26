// Night City: skyline with lit windows, flickering neon signs, rain and a wet street.
import QtQuick

Item {
    id: scene
    property real t: 0
    property var drops: []

    function rng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    }
    function makeDrops() {
        var r = rng(4242), out = [];
        var n = Math.round(Math.min(220, Math.max(80, width * height / 12000)));
        for (var i = 0; i < n; i++) {
            out.push({ x: r() * width * 1.2, y: r() * height, l: 8 + r() * 22, v: 0.6 + r() * 0.9 });
        }
        drops = out;
    }
    onWidthChanged: makeDrops()
    onHeightChanged: makeDrops()

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#03010a" }
            GradientStop { position: 0.55; color: "#1a0630" }
            GradientStop { position: 0.8; color: "#2a0838" }
            GradientStop { position: 1.0; color: "#0a0418" }
        }
    }

    // Skyline (static, deterministic)
    Canvas {
        id: skyline
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d");
            var w = width, h = height, r = scene.rng(77);
            var ground = h * 0.86;
            c.clearRect(0, 0, w, h);
            for (var layer = 0; layer < 2; layer++) {
                var x = -10;
                while (x < w) {
                    var bw = w * (0.03 + r() * 0.06);
                    var bh = h * (layer === 0 ? 0.25 + r() * 0.35 : 0.15 + r() * 0.3);
                    c.fillStyle = layer === 0 ? "#0d0620" : "#070312";
                    c.fillRect(x, ground - bh, bw, bh);
                    var lit = layer === 0 ? 0.18 : 0.3;
                    for (var wy = ground - bh + 8; wy < ground - 8; wy += h * 0.022) {
                        for (var wx = x + 5; wx < x + bw - 6; wx += w * 0.007) {
                            if (r() < lit) {
                                c.fillStyle = r() < 0.6 ? "rgba(0,240,255,0.55)" : (r() < 0.5 ? "rgba(255,42,109,0.5)" : "rgba(252,238,10,0.45)");
                                c.fillRect(wx, wy, Math.max(2, w * 0.003), Math.max(2, h * 0.007));
                            }
                        }
                    }
                    x += bw + w * 0.004;
                }
            }
            c.fillStyle = "#05010d";
            c.fillRect(0, ground, w, h - ground);
        }
    }

    // Flickering neon signs
    Repeater {
        model: 6
        Rectangle {
            readonly property real seed: index * 1.7 + 0.3
            x: scene.width * (0.08 + index * 0.16)
            y: scene.height * (0.42 + (index % 3) * 0.08)
            width: scene.width * (index % 2 === 0 ? 0.05 : 0.008)
            height: scene.height * (index % 2 === 0 ? 0.008 : 0.08)
            radius: 2
            color: ["#ff2a6d", "#00f0ff", "#fcee0a", "#b967ff", "#00f0ff", "#ff2a6d"][index]
            opacity: Math.sin(scene.t * (3 + seed) + seed * 5) > -0.85 ? 0.9 : 0.15
        }
    }

    // Wet street reflections
    Rectangle {
        x: 0
        y: scene.height * 0.86
        width: scene.width
        height: scene.height * 0.14
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#40ff2a6d" }
            GradientStop { position: 0.4; color: "#1500f0ff" }
            GradientStop { position: 1.0; color: "#00000000" }
        }
        opacity: 0.6 + 0.15 * Math.sin(scene.t * 1.3)
    }

    // Rain
    Repeater {
        model: scene.drops.length
        Rectangle {
            readonly property var d: scene.drops[index] || { x: 0, y: 0, l: 10, v: 1 }
            readonly property real fall: (d.y + scene.t * d.v * scene.height * 0.9) % (scene.height + d.l)
            x: d.x - fall * 0.2
            y: fall - d.l
            width: Math.max(1, scene.width / 1600)
            height: d.l
            rotation: 11
            color: "#aad2ff"
            opacity: 0.35
        }
    }
}
