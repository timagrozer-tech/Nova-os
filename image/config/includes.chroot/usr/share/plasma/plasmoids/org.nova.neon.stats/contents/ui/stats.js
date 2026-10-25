.pragma library
// NEON Stats — parse /proc snapshots (one shell command, no extra daemons).
// The same file is executed by Node in the tests.

var MARK_MEM = "--mem--";
var MARK_NET = "--net--";

function parseCpu(text) {
    var line = (text.split("\n").filter(function (l) { return l.indexOf("cpu ") === 0; })[0]) || "";
    var v = line.trim().split(/\s+/).slice(1).map(Number);
    if (v.length < 4) return null;
    var idle = v[3] + (v[4] || 0);
    var total = v.reduce(function (a, b) { return a + b; }, 0);
    return { idle: idle, total: total };
}

function cpuPercent(prev, cur) {
    if (!prev || !cur || cur.total <= prev.total) return 0;
    var dt = cur.total - prev.total, di = cur.idle - prev.idle;
    return Math.max(0, Math.min(100, 100 * (dt - di) / dt));
}

function parseMem(text) {
    var get = function (key) {
        var m = new RegExp("^" + key + ":\\s+(\\d+)", "m").exec(text);
        return m ? Number(m[1]) * 1024 : 0;
    };
    var total = get("MemTotal"), avail = get("MemAvailable");
    return { total: total, used: Math.max(0, total - avail) };
}

function parseNet(text) {
    var rx = 0, tx = 0;
    text.split("\n").forEach(function (l) {
        var m = /^\s*([^:\s]+):\s*(.*)$/.exec(l);
        if (!m || m[1] === "lo") return;
        var v = m[2].trim().split(/\s+/).map(Number);
        if (v.length >= 9) { rx += v[0]; tx += v[8]; }
    });
    return { rx: rx, tx: tx };
}

// Whole snapshot: "/proc/stat" + MARK_MEM + "/proc/meminfo" + MARK_NET + "/proc/net/dev"
function parseSnapshot(text) {
    var a = text.indexOf(MARK_MEM), b = text.indexOf(MARK_NET);
    if (a < 0 || b < 0) return null;
    return { cpu: parseCpu(text.slice(0, a)), mem: parseMem(text.slice(a, b)), net: parseNet(text.slice(b)) };
}

function rate(prev, cur, seconds) {
    if (!prev || !cur || seconds <= 0) return 0;
    return Math.max(0, (cur - prev) / seconds);
}

function human(bytes) {
    var units = ["Б", "КБ", "МБ", "ГБ", "ТБ"], i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return (i === 0 ? Math.round(bytes) : bytes.toFixed(bytes < 10 ? 1 : 0)).toString().replace(".", ",") + " " + units[i];
}

function pushHistory(list, value, size) {
    var out = list.slice(-(size - 1));
    out.push(value);
    return out;
}
