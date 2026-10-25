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
      d.writeConfig("Image", "file:///usr/share/wallpapers/NOVA-NeonRain/");
    });
  }
}
function novaRemovePanels() {
  var old = panels();
  for (var i = 0; i < old.length; i++) { novaTry(function () { old[i].remove(); }); }
}

// NOVA desktop mode: windows, density: standard
var p = new Panel;
novaTry(function () { p.location = "bottom"; });
novaTry(function () { p.height = 48; });
novaTry(function () { p.floating = true; });
novaTry(function () { p.lengthMode = "fill"; });
novaTry(function () { p.hiding = "none"; });
novaSpacer(p);
novaKickoff(p);
novaTasks(p, ["applications:org.kde.dolphin.desktop", "applications:firefox-esr.desktop", "applications:nova-control.desktop", "applications:org.kde.discover.desktop", "applications:org.kde.konsole.desktop"]);
novaSpacer(p);
novaWidget(p, "org.kde.plasma.systemtray");
novaWidget(p, "org.kde.plasma.digitalclock");
novaWidget(p, "org.kde.plasma.showdesktop");
// NOVA style: ocean
var ws = desktops();
for (var i = 0; i < ws.length; i++) { var d = ws[i]; novaTry(function () {
  d.wallpaperPlugin = "org.kde.image";
  d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
  d.writeConfig("Image", "file:///usr/share/wallpapers/NOVA-BlueSilk/"); }); }
