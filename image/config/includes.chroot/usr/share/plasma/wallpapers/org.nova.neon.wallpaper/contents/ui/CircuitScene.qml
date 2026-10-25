// Circuit: glowing PCB traces (painted once) with light pulses running along them and a core chip.
import QtQuick

Item {
    id: scene
    property real t: 0
    property var traces: []          // [{pts: [[x,y],...], seg: [cumulative lengths], total, color}]
    readonly property var traceColours: ["#00f0ff", "#00f0ff", "#00f0ff", "#ff2a6d", "#fcee0a"]

    function rng(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; };
    }

    function build() {
        if (width < 10 || height < 10)
            return;
        var r = rng(2024);
        var g = Math.max(14, Math.round(22 * width / 1920));
        var cols = Math.ceil(width / g), rows = Math.ceil(height / g);
        var occ = {};
        var dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        var cw = Math.round(cols * 0.16), ch = Math.round(rows * 0.18);
        var c0 = Math.round(cols / 2 - cw / 2), r0 = Math.round(rows / 2 - ch / 2);
        for (var yy = r0 - 1; yy <= r0 + ch; yy++)
            for (var xx = c0 - 1; xx <= c0 + cw; xx++)
                occ[xx + "," + yy] = true;
        function free(c, w) { return c >= 0 && w >= 0 && c < cols && w < rows && !occ[c + "," + w]; }
        var out = [];
        var n = Math.round(70 * cols * rows / 900);
        for (var i = 0; i < n; i++) {
            var c = Math.floor(r() * cols), w = Math.floor(r() * rows), d = Math.floor(r() * 8);
            if (!free(c, w))
                continue;
            var pts = [[c, w]];
            occ[c + "," + w] = true;
            var len = 6 + Math.floor(r() * 30);
            for (var k = 0; k < len; k++) {
                if (r() < 0.18)
                    d = (d + (r() < 0.5 ? 1 : 7)) % 8;
                var nc = c + dirs[d][0], nw = w + dirs[d][1];
                if (!free(nc, nw))
                    break;
                c = nc; w = nw;
                occ[c + "," + w] = true;
                pts.push([c, w]);
            }
            if (pts.length < 4)
                continue;
            var path = [], seg = [0], total = 0;
            for (var p = 0; p < pts.length; p++) {
                path.push([pts[p][0] * g + g / 2, pts[p][1] * g + g / 2]);
                if (p > 0) {
                    total += Math.sqrt(Math.pow(path[p][0] - path[p - 1][0], 2) + Math.pow(path[p][1] - path[p - 1][1], 2));
                    seg.push(total);
                }
            }
            out.push({ pts: path, seg: seg, total: total, color: traceColours[Math.floor(r() * traceColours.length)] });
        }
        traces = out;
        board.requestPaint();
    }

    function pointAt(trace, dist) {
        if (!trace)
            return [-100, -100];
        var i = 1;
        while (i < trace.seg.length - 1 && trace.seg[i] < dist)
            i++;
        var a = trace.pts[i - 1], b = trace.pts[i];
        var l = (trace.seg[i] - trace.seg[i - 1]) || 1;
        var k = Math.max(0, Math.min(1, (dist - trace.seg[i - 1]) / l));
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }

    onWidthChanged: build()
    onHeightChanged: build()
    Component.onCompleted: build()

    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0b0620" }
            GradientStop { position: 1.0; color: "#030108" }
        }
    }

    Canvas {
        id: board
        anchors.fill: parent
        onPaint: {
            var c = getContext("2d");
            c.clearRect(0, 0, width, height);
            c.lineCap = "round";
            c.lineJoin = "round";
            for (var i = 0; i < scene.traces.length; i++) {
                var tr = scene.traces[i];
                c.strokeStyle = tr.color;
                c.globalAlpha = 0.22;
                c.lineWidth = Math.max(1.5, width / 900);
                c.beginPath();
                c.moveTo(tr.pts[0][0], tr.pts[0][1]);
                for (var p = 1; p < tr.pts.length; p++)
                    c.lineTo(tr.pts[p][0], tr.pts[p][1]);
                c.stroke();
                c.globalAlpha = 0.5;
                var ends = [tr.pts[0], tr.pts[tr.pts.length - 1]];
                for (var e = 0; e < 2; e++) {
                    c.beginPath();
                    c.arc(ends[e][0], ends[e][1], Math.max(2, width / 480), 0, Math.PI * 2);
                    c.stroke();
                }
            }
            c.globalAlpha = 1;
        }
    }

    // Core chip
    Rectangle {
        width: scene.width * 0.16
        height: scene.height * 0.18
        anchors.centerIn: parent
        color: "#0a0518"
        border.color: "#00f0ff"
        border.width: 2
        Rectangle {
            anchors.fill: parent
            anchors.margins: -6
            color: "transparent"
            border.color: "#00f0ff"
            border.width: 4
            opacity: 0.2 + 0.15 * Math.sin(scene.t * 2)
        }
        Text {
            anchors.centerIn: parent
            font.family: "Orbitron"
            font.weight: Font.Black
            font.pixelSize: Math.max(14, parent.width * 0.12)
            color: "#eafcff"
            text: "NEON//SYS"
        }
    }

    // Pulses
    Repeater {
        model: Math.min(40, scene.traces.length)
        Item {
            readonly property var trace: scene.traces.length ? scene.traces[(index * 37) % scene.traces.length] : null
            readonly property real v: 120 + (index * 53) % 260
            readonly property bool reverse: index % 2 === 1
            readonly property real dist: trace ? ((scene.t * v + index * 97) % (trace.total + 80)) : 0
            readonly property var pos: trace ? scene.pointAt(trace, reverse ? trace.total - dist : dist) : [-100, -100]
            visible: trace !== null && dist <= trace.total
            x: pos[0]
            y: pos[1]

            Rectangle {
                width: Math.max(10, scene.width / 140)
                height: width
                radius: width / 2
                x: -width / 2
                y: -height / 2
                color: parent.trace ? parent.trace.color : "#00f0ff"
                opacity: 0.25
            }
            Rectangle {
                width: Math.max(4, scene.width / 420)
                height: width
                radius: width / 2
                x: -width / 2
                y: -height / 2
                color: "#ffffff"
            }
        }
    }
}
