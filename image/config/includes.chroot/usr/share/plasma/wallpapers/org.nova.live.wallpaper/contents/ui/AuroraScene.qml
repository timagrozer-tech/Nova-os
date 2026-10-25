// Aurora: northern lights over a mountain lake (curtains are mirrored in the water).
import QtQuick

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62
    readonly property real horizon: height * 0.66

    function rng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    }

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#02070d" }
            GradientStop { position: 0.45; color: "#061a24" }
            GradientStop { position: 0.66; color: "#0b2a33" }
            GradientStop { position: 1.0; color: "#020a0e" }
        }
    }

    Canvas {
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d"), r = scene.rng(7);
            c.clearRect(0, 0, width, height);
            for (var i = 0; i < 220; i++) {
                c.fillStyle = "rgba(220,255,245," + (0.25 + r() * 0.6) + ")";
                var s = r() < 0.06 ? 2 : 1.2;
                c.fillRect(r() * width, r() * scene.horizon * 0.9, s, s);
            }
        }
    }

    // One set of curtains; drawn twice (sky + reflection)
    Component {
        id: curtains
        Item {
            id: curtainSet
            property real t: 0
            width: scene.width
            height: scene.horizon
            Repeater {
                model: 9
                Rectangle {
                    readonly property real k: index / 9
                    readonly property real wave: Math.sin(curtainSet.t * (0.12 + k * 0.05) + index * 1.7)
                    width: scene.width * (0.18 + 0.08 * Math.sin(index * 2.1))
                    height: curtainSet.height * (0.55 + 0.25 * Math.abs(Math.sin(index * 1.3 + curtainSet.t * 0.07)))
                    x: scene.width * (k * 1.05 - 0.05) + wave * scene.width * 0.04
                    y: curtainSet.height - height - curtainSet.height * 0.06
                    rotation: wave * 6
                    opacity: 0.35 + 0.3 * Math.sin(curtainSet.t * 0.3 + index * 2.4)
                    gradient: Gradient {
                        GradientStop { position: 0.0; color: "#00000000" }
                        GradientStop { position: 0.35; color: index % 3 === 2 ? "#40b18cff" : "#3038bdf8" }
                        GradientStop { position: 0.75; color: "#703ee6b0" }
                        GradientStop { position: 1.0; color: "#00000000" }
                    }
                }
            }
        }
    }
    Loader {
        id: sky
        sourceComponent: curtains
        onLoaded: item.t = Qt.binding(function () { return scene.t; })
    }

    // Mountains
    Canvas {
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d"), w = width, h = height, hz = scene.horizon;
            c.clearRect(0, 0, w, h);
            c.fillStyle = "#04121a";
            c.beginPath(); c.moveTo(0, hz);
            var peaks = [0, 0.09, 0.16, 0.12, 0.2, 0.08, 0.14, 0.22, 0.11, 0.05, 0.13, 0.07, 0];
            for (var i = 0; i < peaks.length; i++)
                c.lineTo(i * w / (peaks.length - 1), hz - h * peaks[i]);
            c.lineTo(w, hz); c.closePath(); c.fill();
            c.fillStyle = "#020a10";
            c.beginPath(); c.moveTo(0, hz);
            for (var j = 0; j <= 16; j++)
                c.lineTo(j * w / 16, hz - h * (0.02 + 0.03 * Math.abs(Math.sin(j * 1.9))));
            c.lineTo(w, hz); c.closePath(); c.fill();
        }
    }

    // Lake with the mirrored aurora
    Rectangle {
        x: 0
        y: scene.horizon
        width: scene.width
        height: scene.height - scene.horizon
        color: "#03121a"
        clip: true
        Loader {
            sourceComponent: curtains
            opacity: 0.35
            onLoaded: item.t = Qt.binding(function () { return scene.t; })
            transform: Scale { yScale: -1; origin.y: scene.horizon / 2 }
            y: 0      // flipped around its centre: the bottom of the curtains touches the shore
        }
    }
    Repeater {     // ripples
        model: 18
        Rectangle {
            readonly property real k: (index * 7919) % 1000 / 1000
            x: scene.width * ((k + scene.t * 0.004) % 1)
            y: scene.horizon + (scene.height - scene.horizon) * (0.08 + 0.9 * ((index * 0.41) % 1))
            width: scene.width * (0.03 + k * 0.06)
            height: 2
            radius: 1
            color: "#9ff5dc"
            opacity: 0.06 + 0.06 * Math.sin(scene.t + index)
        }
    }
}
