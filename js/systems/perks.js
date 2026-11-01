/* Таланты (очки за уровни + покупка очков) и платные мастер-классы по любому навыку */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const Pk = Sys.perks = {};

  Pk.spent = s => (s.perks || []).reduce((a, id) => a + (D.perkById[id] ? D.perkById[id].cost : 0), 0);
  Pk.points = s => Math.max(0, Sys.quests.level(s) - 1 + (s.flags.boughtPts || 0) - Pk.spent(s));
  Pk.buy = function (s, id) {
    const p = D.perkById[id];
    if (!p) return SN.fail('Нет таланта');
    if (s.perks.includes(id)) return SN.fail('Уже изучен');
    if (Pk.points(s) < p.cost) return SN.fail('Нужно очков: ' + p.cost);
    s.perks.push(id);
    Sys.log(s, '🌟 Новый талант: ' + p.name + '.');
    Sys.quests.check(s);
    SN.say(p.icon + ' Талант «' + p.name + '» изучен!', 'good');
    return SN.okr('');
  };
  /* Коуч-сессия: купить очко таланта за деньги, цена растёт */
  Pk.pointPrice = s => Math.round(40000 * Math.pow(1.6, s.flags.boughtPts || 0) / 1000) * 1000;
  Pk.buyPoint = function (s) {
    const c = Pk.pointPrice(s);
    if (!Sys.econ.pay(s, c, 'study', 'Коуч-сессия: очко таланта')) return SN.fail('Нужно ' + U.money(c));
    s.flags.boughtPts = (s.flags.boughtPts || 0) + 1;
    T.advance(s, 120, { indoor: true });
    SN.say('Коуч-сессия пройдена: +1 очко таланта.', 'good');
    return SN.okr('');
  };

  /* Онлайн-мастер-класс по любому навыку: быстро, но дорожает с уровнем */
  Pk.mcCost = (s, k) => Math.round(600 * Math.pow(1 + s.sk[k] / 14, 2) / 100) * 100;
  Pk.mcCheck = function (s, k) {
    if (!s.items.includes('phone') && !Sys.prop.has(s, 'phone') && !Sys.prop.has(s, 'laptop')) return 'Нужен смартфон или ноутбук';
    if (s.sk[k] >= 95) return 'Навык почти максимальный';
    if (s.st.energy < 12) return 'Мало энергии';
    if (!Sys.econ.canPay(s, Pk.mcCost(s, k))) return 'Нужно ' + U.money(Pk.mcCost(s, k));
    return '';
  };
  Pk.masterclass = function (s, k) {
    const why = Pk.mcCheck(s, k); if (why) return SN.fail(why);
    const c = Pk.mcCost(s, k);
    Sys.econ.pay(s, c, 'study', 'Мастер-класс: ' + D.skillNames[k]);
    s.st.energy = U.clamp(s.st.energy - 8);
    T.advance(s, 180, { indoor: s.housing !== 'street' });
    const before = s.sk[k];
    Sys.stats.gain(s, { [k]: 4.5 }, SN.perk(s, 'fastlearner') ? 1.25 : 1);
    s.c.studyH += 3; s.xp += 15;
    Sys.quests.check(s);
    const msg = D.skillIcons[k] + ' Мастер-класс: ' + D.skillNames[k] + ' ' + Math.floor(before) + ' → ' + Math.floor(s.sk[k]);
    SN.say(msg, 'good');
    return SN.okr(msg);
  };
})(typeof window !== 'undefined' ? window : globalThis);
