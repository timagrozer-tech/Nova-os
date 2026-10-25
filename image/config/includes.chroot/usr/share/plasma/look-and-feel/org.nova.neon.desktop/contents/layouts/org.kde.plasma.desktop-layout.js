function novaTry(fn) { try { fn(); } catch (e) { print("NOVA: " + e); } }
function novaWidget(panel, plugin) { var w = null; novaTry(function () { w = panel.addWidget(plugin); }); return w; }
function novaSpacer(panel) {
  var s = novaWidget(panel, "org.kde.plasma.panelspacer");
  if (s) { novaTry(function () { s.currentConfigGroup = ["General"]; s.writeConfig("expanding", true); }); }
  return s;
}
function novaTasks(panel, launchers) {
  var t = novaWidget(panel, "org.kde.plasma.icontasks");
  if (t) {
    novaTry(function () {
      t.currentConfigGroup = ["General"];
      t.writeConfig("launchers", launchers);
      t.writeConfig("groupingStrategy", 1);
      t.writeConfig("showOnlyCurrentDesktop", false);
    });
  }
  return t;
}
function novaKickoff(panel) {
  var k = novaWidget(panel, "org.kde.plasma.kickoff");
  if (k) { novaTry(function () { k.currentConfigGroup = ["General"]; k.writeConfig("icon", "nova"); }); }
  return k;
}
function novaWallpaper() {
  var all = desktops();
  for (var i = 0; i < all.length; i++) {
    var d = all[i];
    novaTry(function () {
      d.wallpaperPlugin = "org.kde.image";
      d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
      d.writeConfig("Image", "file:///usr/share/wallpapers/NOVA-NEON/");
    });
  }
}
function novaRemovePanels() {
  var old = panels();
  for (var i = 0; i < old.length; i++) { novaTry(function () { old[i].remove(); }); }
}
function neonKnown(plugin) {
  var known = [];
  novaTry(function () { known = knownWidgetTypes(); });
  if (!known || known.length === undefined || known.length === 0) { return true; }
  for (var i = 0; i < known.length; i++) { if (known[i] === plugin) { return true; } }
  return false;
}
function neonWallpaper(scene, paused) {
  var all = desktops();
  for (var i = 0; i < all.length; i++) {
    var d = all[i];
    novaTry(function () {
      d.wallpaperPlugin = "org.nova.neon.wallpaper";
      d.currentConfigGroup = ["Wallpaper", "org.nova.neon.wallpaper", "General"];
      if (scene !== null) { d.writeConfig("Scene", scene); }
      if (paused !== null) { d.writeConfig("Paused", paused); }
    });
    novaTry(function () { d.reloadConfig(); });
  }
}
function neonRemoveWidgets(d) {
  var ws = [];
  novaTry(function () { ws = d.widgets(); });
  for (var i = 0; i < ws.length; i++) {
    var w = ws[i];
    novaTry(function () {
      w.currentConfigGroup = ["NovaNeon"];
      if (String(w.readConfig("managed", "false")) === "true") { w.remove(); }
    });
  }
}
function neonAddWidget(d, plugin, x, y, wd, ht) {
  if (!neonKnown(plugin)) { return null; }
  var w = null;
  novaTry(function () { w = d.addWidget(plugin, x, y, wd, ht); });
  if (w) { novaTry(function () { w.currentConfigGroup = ["NovaNeon"]; w.writeConfig("managed", "true"); }); }
  return w;
}
function neonWidgets(list, width, gap, top, bottom) {
  var all = desktops();
  for (var i = 0; i < all.length; i++) {
    var d = all[i];
    neonRemoveWidgets(d);
    var g = { x: 0, y: 0, width: 1920, height: 1080 };
    novaTry(function () { var s = screenGeometry(d.screen); if (s && s.width > 0) { g = s; } });
    if (g.width < 2 * width + 3 * gap + 200) { continue; }        // too narrow: keep the desktop clean
    var y = { left: top, right: top };
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      if (y[item[1]] + item[2] > g.height - bottom) { continue; }   // does not fit on this screen
      var x = item[1] === "left" ? gap : g.width - width - gap;
      neonAddWidget(d, item[0], x, y[item[1]], width, item[2]);
      y[item[1]] += item[2] + gap;
    }
  }
}

// NEON//SYS desktop, density: standard
var bar = new Panel;
novaTry(function () { bar.location = "top"; });
novaTry(function () { bar.height = 30; });
novaTry(function () { bar.floating = false; });
novaTry(function () { bar.lengthMode = "fill"; });
novaKickoff(bar);
novaWidget(bar, "org.kde.plasma.pager");
novaSpacer(bar);
novaWidget(bar, "org.kde.plasma.digitalclock");
novaSpacer(bar);
novaWidget(bar, "org.kde.plasma.systemtray");
var dock = new Panel;
novaTry(function () { dock.location = "bottom"; });
novaTry(function () { dock.height = 56; });
novaTry(function () { dock.alignment = "center"; });
novaTry(function () { dock.lengthMode = "fit"; });
novaTry(function () { dock.floating = true; });
novaTry(function () { dock.hiding = "dodgewindows"; });
novaTasks(dock, ["applications:org.kde.dolphin.desktop", "applications:firefox-esr.desktop", "applications:nova-control.desktop", "applications:org.kde.discover.desktop", "applications:org.kde.konsole.desktop", "applications:nova-neon-center.desktop"]);
neonWallpaper("auto", false);
neonWidgets([["org.kde.plasma.digitalclock", "left", 150], ["org.nova.neon.stats", "left", 330], ["org.kde.plasma.calendar", "right", 230], ["org.kde.plasma.mediacontroller", "right", 170], ["org.kde.plasma.notes", "right", 190], ["org.kde.plasma.timer", "right", 150]], 300, 14, 54, 88);
