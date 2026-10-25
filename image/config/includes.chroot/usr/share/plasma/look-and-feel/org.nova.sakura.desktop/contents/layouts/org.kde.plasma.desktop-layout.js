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
      d.writeConfig("Image", "file:///usr/share/wallpapers/NOVA/");
    });
  }
}
function novaRemovePanels() {
  var old = panels();
  for (var i = 0; i < old.length; i++) { novaTry(function () { old[i].remove(); }); }
}

// NOVA desktop mode: dock, density: standard
var bar = new Panel;
novaTry(function () { bar.location = "top"; });
novaTry(function () { bar.height = 30; });
novaTry(function () { bar.floating = false; });
novaTry(function () { bar.lengthMode = "fill"; });
novaKickoff(bar);
novaWidget(bar, "org.kde.plasma.appmenu");
novaSpacer(bar);
novaWidget(bar, "org.kde.plasma.systemtray");
novaWidget(bar, "org.kde.plasma.digitalclock");
var dock = new Panel;
novaTry(function () { dock.location = "bottom"; });
novaTry(function () { dock.height = 56; });
novaTry(function () { dock.alignment = "center"; });
novaTry(function () { dock.lengthMode = "fit"; });
novaTry(function () { dock.floating = true; });
novaTry(function () { dock.hiding = "dodgewindows"; });
novaTasks(dock, ["applications:org.kde.dolphin.desktop", "applications:firefox-esr.desktop", "applications:nova-control.desktop", "applications:org.kde.discover.desktop", "applications:org.kde.konsole.desktop"]);
// NOVA style: sakura
var ws = desktops();
for (var i = 0; i < ws.length; i++) { var d = ws[i]; novaTry(function () {
  d.wallpaperPlugin = "org.nova.live.wallpaper";
  d.currentConfigGroup = ["Wallpaper", "org.nova.live.wallpaper", "General"];
  d.writeConfig("Scene", "sakura");
  d.writeConfig("Latitude", 55.7500);
  d.writeConfig("Longitude", 37.6200);
  d.writeConfig("Paused", false); });
  novaTry(function () { d.reloadConfig(); }); }
