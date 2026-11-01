/* Порядок загрузки модулей. Используется index.html, сборщиком и тестами. */
(function (G) {
  G.SN_FILES = [
    'js/core/util.js',
    'js/data/world.js', 'js/data/jobs.js', 'js/data/education.js', 'js/data/property.js', 'js/data/business.js',
    'js/data/services.js', 'js/data/npcs.js', 'js/data/events.js', 'js/data/quests.js', 'js/data/extra.js', 'js/data/business2.js',
    'js/core/state.js', 'js/core/clock.js', 'js/core/save.js',
    'js/systems/stats.js', 'js/systems/economy.js', 'js/systems/work.js', 'js/systems/property.js', 'js/systems/business.js',
    'js/systems/finance.js', 'js/systems/invest.js', 'js/systems/perks.js', 'js/systems/social.js', 'js/systems/events.js', 'js/systems/quests.js', 'js/systems/auto.js', 'js/systems/daily.js',
    'js/ui/scene.js', 'js/ui/components.js', 'js/ui/screens.js', 'js/ui/screens2.js', 'js/ui/sheets.js', 'js/main.js', 'js/ui/actions2.js', 'js/ui/bizui.js', 'js/ui/extras.js'
  ];
})(typeof window !== 'undefined' ? window : globalThis);
