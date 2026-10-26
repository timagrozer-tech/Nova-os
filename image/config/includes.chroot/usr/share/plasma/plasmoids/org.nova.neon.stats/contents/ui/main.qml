// NEON Stats plasmoid: CPU, memory and network from /proc via Plasma's executable data engine.
import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.plasma5support as P5Support
import "stats.js" as Stats

PlasmoidItem {
    id: root
    readonly property string command: "sh -c 'cat /proc/stat; echo " + Stats.MARK_MEM + "; cat /proc/meminfo; echo "
                                      + Stats.MARK_NET + "; cat /proc/net/dev'"
    property var last: null
    property real lastTime: 0
    property real cpu: 0
    property real memUsed: 0
    property real memTotal: 1
    property real rxRate: 0
    property real txRate: 0
    property var cpuHistory: []
    property bool ready: false

    preferredRepresentation: fullRepresentation
    Plasmoid.backgroundHints: "NoBackground"
    toolTipMainText: "NEON Stats"
    toolTipSubText: "Процессор " + Math.round(root.cpu) + " %"

    fullRepresentation: StatsView {
        Layout.minimumWidth: 220
        Layout.minimumHeight: 240
        cpu: root.cpu
        memUsed: root.memUsed
        memTotal: root.memTotal
        rxRate: root.rxRate
        txRate: root.txRate
        cpuHistory: root.cpuHistory
        ready: root.ready
    }

    P5Support.DataSource {
        id: source
        engine: "executable"
        connectedSources: []
        onNewData: function (sourceName, data) {
            disconnectSource(sourceName);
            var snap = Stats.parseSnapshot(String(data["stdout"] || ""));
            if (!snap) return;
            var now = Date.now();
            if (root.last) {
                var secs = (now - root.lastTime) / 1000;
                root.cpu = Stats.cpuPercent(root.last.cpu, snap.cpu);
                root.rxRate = Stats.rate(root.last.net.rx, snap.net.rx, secs);
                root.txRate = Stats.rate(root.last.net.tx, snap.net.tx, secs);
                root.cpuHistory = Stats.pushHistory(root.cpuHistory, root.cpu, 40);
                root.ready = true;
            }
            root.memUsed = snap.mem.used;
            root.memTotal = snap.mem.total;
            root.last = snap;
            root.lastTime = now;
        }
    }

    Timer {
        interval: 2000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: source.connectSource(root.command)
    }
}
