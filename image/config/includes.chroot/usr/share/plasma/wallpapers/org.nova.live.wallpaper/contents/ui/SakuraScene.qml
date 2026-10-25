// Sakura: a warm sunrise over a mountain, petals drifting in the wind.
import QtQuick

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62
    readonly property real horizon: height * 0.7
    property var petals: []

    function rng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    }
    function makePetals() {
        var r = rng(31), out = [];
        for (var i = 0; i < 70; i++)
            out.push({ x: r(), y: r(), s: 0.5 + r() * 0.9, v: 0.02 + r() * 0.035, sway: r() * 6.28, spin: 20 + r() * 80 });
        petals = out;
    }
    Component.onCompleted: makePetals()

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#f6d6e2" }
            GradientStop { position: 0.45; color: "#fde4d8" }
            GradientStop { position: 0.7; color: "#ffe9cf" }
            GradientStop { position: 1.0; color: "#f3d3dc" }
        }
    }

    Rectangle {      // sun
        width: scene.height * 0.22
        height: width
        radius: width / 2
        x: scene.width * 0.62
        y: scene.horizon - height * 0.85
        color: "#ffb4a2"
        opacity: 0.85
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 1.9; height: width; radius: width / 2
            color: "#ffc9b8"
            opacity: 0.35 + 0.05 * Math.sin(scene.t * 0.5)
            z: -1
        }
    }

    Canvas {         // a distant mountain and soft hills
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var c = getContext("2d"), w = width, h = height, hz = scene.horizon;
            c.clearRect(0, 0, w, h);
            c.fillStyle = "#d9a9bd";
            c.beginPath(); c.moveTo(w * 0.05, hz);
            c.lineTo(w * 0.33, hz - h * 0.3); c.lineTo(w * 0.37, hz - h * 0.31); c.lineTo(w * 0.42, hz - h * 0.29);
            c.lineTo(w * 0.72, hz); c.closePath(); c.fill();
            c.fillStyle = "#f7ecef";                          // snow cap
            c.beginPath(); c.moveTo(w * 0.29, hz - h * 0.255); c.lineTo(w * 0.33, hz - h * 0.3);
            c.lineTo(w * 0.37, hz - h * 0.31); c.lineTo(w * 0.42, hz - h * 0.29); c.lineTo(w * 0.455, hz - h * 0.255);
            c.lineTo(w * 0.42, hz - h * 0.265); c.lineTo(w * 0.38, hz - h * 0.25); c.lineTo(w * 0.34, hz - h * 0.262);
            c.closePath(); c.fill();
            c.fillStyle = "#c58aa3";
            c.beginPath(); c.moveTo(0, hz + h * 0.02);
            for (var i = 0; i <= 20; i++) c.lineTo(i * w / 20, hz - h * (0.02 + 0.03 * Math.sin(i * 0.8 + 1)));
            c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
            c.fillStyle = "#a86b86";
            c.beginPath(); c.moveTo(0, h * 0.86);
            for (var j = 0; j <= 14; j++) c.lineTo(j * w / 14, h * (0.82 + 0.03 * Math.sin(j * 1.4)));
            c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
        }
    }

    Repeater {       // petals
        model: scene.petals.length
        Rectangle {
            readonly property var p: scene.petals[index] || { x: 0, y: 0, s: 1, v: 0.03, sway: 0, spin: 40 }
            readonly property real fall: (p.y + scene.t * p.v) % 1.1 - 0.05
            width: scene.height * 0.012 * p.s
            height: width * 0.65
            radius: height / 2
            x: scene.width * (((p.x + scene.t * p.v * 0.6) % 1.2) - 0.1) + Math.sin(scene.t * 0.8 + p.sway) * scene.width * 0.02
            y: scene.height * fall
            rotation: scene.t * p.spin + p.sway * 57
            color: index % 4 === 0 ? "#ffffff" : "#ff9fbf"
            opacity: 0.85
        }
    }
}
