.pragma library
// NOVA Living Sky — astronomy for the wallpaper, computed locally (no network).
// Same formulas as nova_sky_core.py; both are checked against each other in tests.

var RAD = Math.PI / 180;

function julianDay(ms) {
    return ms / 86400000 + 2440587.5;
}

// Sun position (low-precision solar coordinates, ~0.01°; enough for colours and placement).
function sunPosition(ms, lat, lon) {
    var d = julianDay(ms) - 2451545.0;
    var g = ((357.529 + 0.98560028 * d) % 360 + 360) % 360;
    var q = ((280.459 + 0.98564736 * d) % 360 + 360) % 360;
    var L = q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD);
    var e = 23.439 - 0.00000036 * d;
    var ra = Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD;
    var dec = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD;
    var gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
    var h = ((gmst * 15 + lon - ra) % 360 + 540) % 360 - 180;     // hour angle, -180..180
    var alt = Math.asin(Math.sin(lat * RAD) * Math.sin(dec * RAD)
                        + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(h * RAD)) / RAD;
    var az = Math.atan2(-Math.sin(h * RAD),
                        Math.tan(dec * RAD) * Math.cos(lat * RAD) - Math.sin(lat * RAD) * Math.cos(h * RAD)) / RAD;
    return { elevation: alt, azimuth: (az + 360) % 360, hourAngle: h };
}

// Moon phase 0..1 (0 = new, 0.5 = full), from the mean synodic month.
function moonPhase(ms) {
    var p = ((julianDay(ms) - 2451550.1) / 29.530588853) % 1;
    return p < 0 ? p + 1 : p;
}

function _mix(a, b, k) {
    k = Math.max(0, Math.min(1, k));
    var pa = [parseInt(a.substr(1, 2), 16), parseInt(a.substr(3, 2), 16), parseInt(a.substr(5, 2), 16)];
    var pb = [parseInt(b.substr(1, 2), 16), parseInt(b.substr(3, 2), 16), parseInt(b.substr(5, 2), 16)];
    var out = "#";
    for (var i = 0; i < 3; i++) {
        var v = Math.round(pa[i] + (pb[i] - pa[i]) * k).toString(16);
        out += v.length < 2 ? "0" + v : v;
    }
    return out;
}

// Sky gradient [top, middle, horizon] for a sun elevation in degrees.
var KEYS = [
    [-18, ["#03060f", "#070d1f", "#0c1430"]],   // astronomical night
    [-10, ["#060b22", "#14193d", "#2b2350"]],   // nautical twilight
    [-4,  ["#141a46", "#4a2f6b", "#c0587a"]],   // blue hour → dawn/dusk
    [0,   ["#25336e", "#9a5a8a", "#ff9a5c"]],   // sunrise / sunset
    [6,   ["#3f6fb5", "#e7a07a", "#ffd29a"]],   // golden hour
    [20,  ["#2f78d0", "#7fb3ea", "#cfe6fb"]],   // day
    [60,  ["#1f6bd6", "#5ea6ef", "#bfe0ff"]]    // high sun
];

function skyColors(elevation) {
    if (elevation <= KEYS[0][0]) return KEYS[0][1].slice();
    for (var i = 1; i < KEYS.length; i++) {
        if (elevation <= KEYS[i][0]) {
            var k = (elevation - KEYS[i - 1][0]) / (KEYS[i][0] - KEYS[i - 1][0]);
            return [_mix(KEYS[i - 1][1][0], KEYS[i][1][0], k), _mix(KEYS[i - 1][1][1], KEYS[i][1][1], k),
                    _mix(KEYS[i - 1][1][2], KEYS[i][1][2], k)];
        }
    }
    return KEYS[KEYS.length - 1][1].slice();
}

// 0 at day, 1 at full night: stars and moon fade in through twilight.
function nightFactor(elevation) {
    return Math.max(0, Math.min(1, (-elevation - 2) / 10));
}

// Screen placement of a body: azimuth 60..300° maps to 0..1 across the screen
// (you look south in the northern hemisphere, north in the southern one).
function screenX(azimuth, lat) {
    var a = lat >= 0 ? azimuth : (azimuth + 180) % 360;
    return Math.max(-0.2, Math.min(1.2, (a - 60) / 240));
}
