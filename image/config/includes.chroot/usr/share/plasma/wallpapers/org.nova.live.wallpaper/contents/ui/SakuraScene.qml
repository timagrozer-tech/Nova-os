// Sakura: the NOVA sakura artwork with petals drifting on the wind.
import QtQuick

Item {
    id: scene
    property real t: 0
    property real now: Date.now()
    property real latitude: 55.75
    property real longitude: 37.62
    property var petals: []

    function rng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    }
    Component.onCompleted: {
        var r = rng(31), out = [];
        for (var i = 0; i < 60; i++)
            out.push({ x: r(), y: r(), s: 0.5 + r() * 0.9, v: 0.02 + r() * 0.035, sway: r() * 6.28, spin: 20 + r() * 80 });
        petals = out;
    }

    Image {
        anchors.fill: parent
        source: Qt.resolvedUrl("../images/sakura.jpg")
        fillMode: Image.PreserveAspectCrop
        sourceSize.width: scene.width
        asynchronous: true
    }

    Rectangle {      // the sun breathes softly
        width: scene.height * 0.32
        height: width
        radius: width / 2
        x: scene.width * (1310 / 1920) - width / 2
        y: scene.height * (330 / 1080) - height / 2
        color: "#ffebce"
        opacity: 0.12 + 0.06 * Math.sin(scene.t * 0.5)
    }

    Repeater {
        model: scene.petals.length
        Rectangle {
            readonly property var p: scene.petals[index] || { x: 0, y: 0, s: 1, v: 0.03, sway: 0, spin: 40 }
            readonly property real fall: (p.y + scene.t * p.v) % 1.1 - 0.05
            width: scene.height * 0.012 * p.s
            height: width * 0.6
            radius: height / 2
            x: scene.width * (((p.x + scene.t * p.v * 0.6) % 1.2) - 0.1) + Math.sin(scene.t * 0.8 + p.sway) * scene.width * 0.02
            y: scene.height * fall
            rotation: scene.t * p.spin + p.sway * 57
            color: index % 4 === 0 ? "#ffe6ea" : (index % 3 === 0 ? "#ffbad2" : "#ffd9e2")
            opacity: 0.85
        }
    }
}
