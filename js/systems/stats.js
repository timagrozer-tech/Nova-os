/* Характеристики и здоровье: пассивные изменения, сон, болезни, последствия низких показателей.
   Принцип: последствия объяснимы, но тупиков нет — при обмороке героя бесплатно выхаживает больница. */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T;
  const S = SN.Sys.stats = {};

  S.ILL = {
    cold:   { name: 'Простуда', icon: '🤧', days: 4, energy: 0.8, health: 0.25, mood: 0.4 },
    poison: { name: 'Отравление', icon: '🤢', days: 2, energy: 1.2, health: 0.6, mood: 0.6 },
    injury: { name: 'Травма спины', icon: '🩹', days: 5, energy: 0.6, health: 0.2, mood: 0.5, noHeavy: true },
    flu:    { name: 'Грипп', icon: '🤒', days: 6, energy: 1.3, health: 0.6, mood: 0.6 }
  };

  S.warmthBonus = s => (D.clothes[s.wear] || D.clothes.worn).warmth;
  S.look = s => {
    let l = (D.clothes[s.wear] || D.clothes.worn).look;
    if (s.st.hygiene < 25) l -= 2; else if (s.st.hygiene < 45) l -= 1;
    return Math.max(0, l);
  };

  /* Пассивный шаг времени (h — доля часа) */
  S.tick = function (s, h, ctx) {
    T.ensureWeather(s);
    const st = s.st, w = s.weather, sleep = !!ctx.sleep;
    st.food -= (sleep ? 1.0 : 2.0) * h;
    st.hygiene -= (sleep ? 0.3 : 0.85) * h;
    if (sleep) {
      const q = ctx.q || 0.5;
      const sick = s.ill ? 0.7 : 1;
      st.energy += 11.5 * q * sick * h;
      if (st.food > 20) st.health += 0.7 * q * h;
      st.stress -= 2.2 * q * h;
    } else {
      st.energy -= 0.9 * h;
    }
    // Тепло: в помещении растёт, на улице зависит от погоды и одежды
    const sheltered = ctx.indoor || (sleep && ctx.warm);
    if (sheltered) st.warmth += (st.warmth < 85 ? 9 : 0) * h;
    else {
      let d = (w.temp - 12) / 4 + S.warmthBonus(s) * 0.7;
      if (w.kind === 'rain') d -= 1.5;
      if (w.kind === 'snow') d -= 1;
      if (w.kind === 'storm') d -= 3;
      if (sleep && ctx.tent) d += 3;
      if (sleep && s.flags.dog) d += 1.5;
      d = U.clamp(d, -7, 3);
      if (d > 0 && st.warmth >= 75) d = 0;
      st.warmth += d * h;
    }
    // Настроение и стресс медленно возвращаются к базе
    st.mood += (50 + (D.housing[s.housing].mood || 0) - st.mood) * 0.04 * h;
    st.stress += (28 - st.stress) * 0.03 * h;
    // Последствия низких показателей
    if (st.food < 15) { st.health -= 1.2 * h; st.mood -= 1 * h; st.stress += 1 * h; }
    if (st.warmth < 20) { st.health -= 0.9 * h; st.mood -= 0.8 * h; }
    if (st.hygiene < 20) st.mood -= 0.4 * h;
    if (st.energy < 10 && !sleep) st.stress += 1 * h;
    if (st.stress > 80) st.health -= 0.4 * h;
    if (s.ill) { const I = S.ILL[s.ill.id]; st.energy -= I.energy * h; st.health -= I.health * h; st.mood -= I.mood * h; }
    for (const k in st) st[k] = U.clamp(st[k]);
  };

  S.apply = function (s, eff, mult) {
    if (!eff) return;
    mult = mult || 1;
    for (const k in eff) {
      if (k in s.st) s.st[k] = U.clamp(s.st[k] + eff[k] * mult);
      else if (k === 'rep') s.rep = U.clamp(s.rep + eff[k]);
    }
  };
  S.gain = function (s, g, mult, cap) {
    if (!g) return;
    const m = (mult || 1) * (s.st.mood < 25 ? 0.7 : s.st.mood > 70 ? 1.15 : 1) * (s.st.stress > 75 ? 0.75 : 1);
    for (const k in g) {
      const limit = cap && cap[k] != null ? cap[k] : 100;
      if (s.sk[k] >= limit) continue;
      s.sk[k] = Math.min(limit, U.clamp(s.sk[k] + g[k] * m * (1 - s.sk[k] / 160)));
    }
  };

  /* Где можно спать прямо сейчас */
  S.sleepOptions = function (s) {
    const h = T.hour(s), opts = [];
    const home = D.housing[s.housing];
    if (s.housing !== 'street') opts.push({ id: 'home', name: 'Спать дома', icon: home.icon, q: home.sleep * (s.items.includes('furniture') ? 1.1 : 1), warm: true, cost: 0, district: home.district });
    opts.push({ id: 'shelter', name: 'Ночлежка (бесплатно)', icon: '🏚️', q: 0.75, warm: true, cost: 0, district: 'old', open: h >= 19 || h < 2, note: 'Заселение с 19:00 до 02:00' });
    if (s.housing === 'street') opts.push({ id: 'hostelNight', name: 'Ночь в хостеле', icon: '🛏️', q: 0.85, warm: true, cost: Math.round(780 * s.prices), district: 'old' });
    opts.push({ id: 'street', name: s.items.includes('tent') ? 'В палатке' : 'На улице', icon: s.items.includes('tent') ? '⛺' : '🧥', q: s.items.includes('tent') ? 0.62 : 0.48, warm: false, tent: s.items.includes('tent'), cost: 0, district: s.district });
    return opts;
  };

  /* Сон: до 7 утра (если вечер/ночь) или 8 часов днём */
  S.sleep = function (s, optId) {
    const o = S.sleepOptions(s).find(x => x.id === optId);
    if (!o) return SN.fail('Здесь нельзя переночевать.');
    if (o.open === false) return SN.fail(o.note);
    if (o.cost && !SN.Sys.econ.canPay(s, o.cost)) return SN.fail('Не хватает ' + U.money(o.cost - SN.Sys.econ.available(s)) + ' на ночь в хостеле.');
    if (o.district && o.district !== s.district) { const r = SN.Sys.city.travel(s, o.district); if (!r.ok) return r; }
    if (o.cost) SN.Sys.econ.pay(s, o.cost, 'housing', 'Ночь в хостеле');
    const hNow = T.hourF(s);
    let hours = (hNow >= 18 || hNow < 4) ? ((31 - hNow) % 24) : 8;
    hours = U.clamp(hours, 6, 11);
    const cashBefore = s.money;
    T.advance(s, hours * 60, { sleep: true, q: o.q, warm: o.warm, tent: o.tent, indoor: o.warm });
    s.c.sleeps++;
    let msg = 'Вы проспали ' + U.hrs(hours) + '. Энергия ' + Math.round(s.st.energy) + '%.';
    if (optId === 'street') {
      s.c.nightsStreet++;
      const risk = o.tent ? 0.04 : 0.09;
      if (cashBefore > 600 && U.chance(s, risk)) {
        const lost = Math.min(15000, Math.round(s.money * 0.35));
        s.money -= lost;
        msg += ' Ночью из кармана вытащили ' + U.money(lost) + '. Деньги надёжнее хранить на банковском счёте.';
        SN.Sys.log(s, 'Ночная кража: −' + U.money(lost));
      }
    }
    if (optId === 'shelter') { s.st.stress = U.clamp(s.st.stress + 3); s.flags.shelterNights = (s.flags.shelterNights || 0) + 1; }
    SN.Sys.quests.check(s);
    SN.say(msg, 'good');
    return SN.okr(msg);
  };

  S.nap = function (s) {
    T.advance(s, 120, { sleep: true, q: 0.8, warm: s.housing !== 'street', indoor: s.housing !== 'street' });
    return SN.okr('Вы немного отдохнули.');
  };

  S.getIll = function (s, id) {
    if (s.ill) return;
    s.ill = { id, left: S.ILL[id].days };
    SN.Sys.log(s, 'Вы заболели: ' + S.ILL[id].name + '.');
    SN.say(S.ILL[id].icon + ' ' + S.ILL[id].name + ': энергия расходуется быстрее. Лечение — медпункт, аптека, поликлиника.', 'bad');
  };
  S.treat = function (s, power) {
    if (!s.ill) return '';
    s.ill.left -= power * 2;
    if (s.ill.left <= 0) { const n = S.ILL[s.ill.id].name; s.ill = null; return ' Вы вылечились: ' + n.toLowerCase() + ' прошла.'; }
    return ' Болезнь отступает.';
  };

  S.daily = function (s, rep) {
    if (s.ill && --s.ill.left <= 0) { rep.lines.push('Вы поправились: ' + S.ILL[s.ill.id].name.toLowerCase() + ' прошла.'); s.ill = null; }
    // Шанс простыть при холоде
    if (!s.ill && s.st.warmth < 30 && U.chance(s, 0.3)) S.getIll(s, s.weather.temp < -5 ? 'flu' : 'cold');
  };

  /* Обморок: не конец игры. Скорая, городская больница, сутки на восстановление. */
  S.collapse = function (s) {
    s.c.collapses++;
    s.st.health = 1;
    SN.T.advance(s, 20 * 60, { sleep: true, q: 0.9, warm: true, indoor: true, noCollapse: true });
    s.st.health = Math.max(s.st.health, 45); s.st.food = Math.max(s.st.food, 50);
    s.st.warmth = Math.max(s.st.warmth, 70); s.st.energy = Math.max(s.st.energy, 55);
    s.st.stress = U.clamp(s.st.stress + 10); s.rep = U.clamp(s.rep - 2);
    s.district = 'hospital';
    if (s.ill) s.ill.left = Math.min(s.ill.left, 1);
    const t = 'Вы потеряли сознание на улице. Скорая отвезла вас в городскую больницу — лечение бесплатное. Берегите здоровье: ешьте и грейтесь вовремя.';
    SN.Sys.log(s, t);
    SN.emit('modal', { kind: 'info', icon: '🚑', title: 'Больница', text: t });
  };
})(typeof window !== 'undefined' ? window : globalThis);
