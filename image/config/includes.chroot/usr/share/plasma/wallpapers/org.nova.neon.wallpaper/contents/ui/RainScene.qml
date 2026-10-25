// Data Rain: falling columns of glyphs (ASCII only: the Latin mono font has no CJK glyphs) with bright heads and a faint NEON//SYS mark.
import QtQuick

Item {
    id: scene
    property real t: 0
    readonly property int fontPx: Math.max(14, Math.round(height / 48))
    readonly property int columns: Math.max(10, Math.floor(width / (fontPx * 1.1)))
    readonly property int trail: 14
    readonly property string glyphs: "0123456789ABCDEFXYZ<>/=+*#%$&@NEONSYS"
    property real lastSwap: 0

    function randomColumn() {
        var s = "";
        for (var i = 0; i < trail; i++) {
            s += glyphs.charAt(Math.floor(Math.random() * glyphs.length)) + (i < trail - 1 ? "\n" : "");
        }
        return s;
    }

    // A few columns change their glyphs ~8 times per second (cheap, no per-glyph items).
    onTChanged: {
        if (t - lastSwap < 0.12 && t >= lastSwap)
            return;
        lastSwap = t;
        for (var k = 0; k < 4; k++) {
            var item = columnsRepeater.itemAt(Math.floor(Math.random() * columns));
            if (item)
                item.chars = randomColumn();
        }
    }

    Rectangle {
        anchors.fill: parent
        color: "#04010a"
    }

    Text {
        anchors.centerIn: parent
        font.family: "Orbitron"
        font.weight: Font.Black
        font.pixelSize: Math.max(32, scene.height * 0.09)
        font.letterSpacing: 6
        color: "#00f0ff"
        opacity: 0.12
        text: "NEON//SYS"
    }

    Repeater {
        id: columnsRepeater
        model: scene.columns
        Item {
            id: col
            property string chars: scene.randomColumn()
            readonly property real seed: (index * 7919) % 1000 / 1000
            readonly property real speed: 0.35 + ((index * 104729) % 1000) / 1000 * 0.9
            readonly property real span: scene.height + scene.trail * scene.fontPx * 1.1
            x: index * scene.fontPx * 1.1
            y: ((seed * span + scene.t * speed * scene.height * 0.45) % span) - scene.trail * scene.fontPx * 1.1
            width: scene.fontPx
            height: scene.trail * scene.fontPx * 1.1

            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                font.family: "Share Tech Mono"
                font.pixelSize: scene.fontPx
                lineHeight: 1.1
                color: index % 9 === 0 ? "#fcee0a" : "#00f0ff"
                opacity: 0.55
                text: col.chars
            }
            Rectangle {   // bright head
                anchors.bottom: parent.bottom
                width: parent.width
                height: scene.fontPx
                radius: 2
                color: "#eafcff"
                opacity: 0.5
            }
        }
    }
}
