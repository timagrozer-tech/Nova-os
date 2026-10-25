// NEON Stats — the HUD itself: plain QtQuick, rendered in CI with sample data.
import QtQuick
import "stats.js" as Stats

Rectangle {
    id: view
    property real cpu: 0                 // %
    property real memUsed: 0             // bytes
    property real memTotal: 1
    property real rxRate: 0              // bytes/s
    property real txRate: 0
    property var cpuHistory: []
    property var netHistory: []
    property bool ready: false

    readonly property color cyan: "#00e5f2"
    readonly property color pink: "#ff2a6d"
    readonly property color yellow: "#fcee0a"
    readonly property color text: "#e8f6ff"
    readonly property color dim: "#8ea3c0"
    readonly property string mono: "Share Tech Mono"
    readonly property string display: "Orbitron"

    implicitWidth: 300
    implicitHeight: 270
    radius: 10
    color: "#d90b0714"
    border.color: Qt.rgba(0, 0.9, 0.95, 0.45)
    border.width: 1

    Column {
        anchors.fill: parent
        anchors.margins: 14
        spacing: 10

        Text {
            text: "SYS//MONITOR"
            color: view.cyan
            font.family: view.display
            font.pixelSize: 13
            font.letterSpacing: 2
        }

        Repeater {
            model: [
                { label: "ПРОЦЕССОР", value: view.cpu / 100, shown: Math.round(view.cpu) + " %", tint: view.cyan },
                { label: "ПАМЯТЬ", value: view.memUsed / Math.max(1, view.memTotal),
                  shown: Stats.human(view.memUsed) + " / " + Stats.human(view.memTotal), tint: view.pink }
            ]
            Column {
                width: parent.width
                spacing: 4
                Row {
                    width: parent.width
                    Text { text: modelData.label; color: view.dim; font.family: view.mono; font.pixelSize: 12; width: parent.width / 2 }
                    Text {
                        text: view.ready ? modelData.shown : "…"
                        color: view.text; font.family: view.mono; font.pixelSize: 12
                        width: parent.width / 2; horizontalAlignment: Text.AlignRight
                    }
                }
                Rectangle {
                    width: parent.width; height: 8; radius: 4
                    color: Qt.rgba(1, 1, 1, 0.08)
                    Rectangle {
                        width: parent.width * Math.max(0.02, Math.min(1, modelData.value)); height: parent.height; radius: 4
                        color: modelData.tint
                        Behavior on width { NumberAnimation { duration: 600; easing.type: Easing.OutCubic } }
                    }
                }
            }
        }

        Canvas {                                    // CPU history
            id: chart
            width: parent.width
            height: 64
            property var points: view.cpuHistory
            onPointsChanged: requestPaint()
            onPaint: {
                var c = getContext("2d");
                c.clearRect(0, 0, width, height);
                c.strokeStyle = "rgba(0,229,242,0.18)";
                for (var g = 1; g < 4; g++) { c.beginPath(); c.moveTo(0, height * g / 4); c.lineTo(width, height * g / 4); c.stroke(); }
                var p = points || [];
                if (p.length < 2) return;
                var step = width / (p.length - 1);
                c.beginPath();
                for (var i = 0; i < p.length; i++) {
                    var y = height - height * Math.min(100, p[i]) / 100;
                    if (i === 0) c.moveTo(0, y); else c.lineTo(i * step, y);
                }
                c.lineWidth = 2;
                c.strokeStyle = "#00e5f2";
                c.stroke();
                c.lineTo(width, height); c.lineTo(0, height); c.closePath();
                var grad = c.createLinearGradient(0, 0, 0, height);
                grad.addColorStop(0, "rgba(0,229,242,0.35)");
                grad.addColorStop(1, "rgba(0,229,242,0)");
                c.fillStyle = grad;
                c.fill();
            }
        }

        Row {
            width: parent.width
            Text { text: "СЕТЬ ↓"; color: view.dim; font.family: view.mono; font.pixelSize: 12; width: parent.width * 0.22 }
            Text { text: view.ready ? Stats.human(view.rxRate) + "/с" : "…"; color: view.yellow; font.family: view.mono; font.pixelSize: 12; width: parent.width * 0.28 }
            Text { text: "↑"; color: view.dim; font.family: view.mono; font.pixelSize: 12; width: parent.width * 0.1 }
            Text { text: view.ready ? Stats.human(view.txRate) + "/с" : "…"; color: view.pink; font.family: view.mono; font.pixelSize: 12; width: parent.width * 0.4 }
        }

        Text {
            width: parent.width
            text: "Данные этого компьютера (/proc), обновление каждые 2 с"
            color: view.dim
            opacity: 0.8
            font.pixelSize: 10
            wrapMode: Text.WordWrap
        }
    }
}
