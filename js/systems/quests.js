/* Задания, достижения, уровни, рыбалка, быстрые действия главного экрана */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const Q = Sys.quests = {};

  Q.level = s => Math.floor((1 + Math.sqrt(1 + s.xp / 50)) / 2);
  Q.levelXp = L => 200 * L * (L - 1);
  Q.isOpen = (s, q) => !(q.after || []).some(a => s.quests[a] !== 'done');
  Q.active = s => D.quests.filter(q => s.quests[q.id] !== 'done' && Q.isOpen(s, q));
  let busy = false;
  Q.check = function (s) {
    if (busy) return; busy = true;
    try {
      let changed = true;
      while (changed) {
        changed = false;
        for (const q of D.quests) {
          if (s.quests[q.id] === 'done' || !Q.isOpen(s, q)) continue;
          let ok = false; try { ok = q.done(s); } catch (e) { ok = false; }
          if (!ok) continue;
          s.quests[q.id] = 'done'; changed = true;
          const r = q.reward || {};
          s.xp += r.xp || 0; if (r.rep) s.rep = U.clamp(s.rep + r.rep);
          if (r.money) Sys.econ.earn(s, r.money, 'quest', 'Награда: ' + q.title);
          Sys.log(s, '✅ Задание выполнено: ' + q.title);
          SN.emit('quest', q);
        }
      }
      for (const a of D.achievements) {
        if (s.ach[a.id]) continue;
        let ok = false; try { ok = a.done(s); } catch (e) { ok = false; }
        if (ok) { s.ach[a.id] = T.day(s); s.xp += 50; Sys.log(s, '🏆 Достижение: ' + a.name); SN.emit('achievement', a); }
      }
    } finally { busy = false; }
  };

  // ── Рыбалка (мини-игра): результат 0–3 пойманных рыб
  const Fun = Sys.fun = {};
  Fun.fishResult = function (s, caught) {
    caught = U.clamp(Math.floor(caught), 0, 3);
    s.fish += caught; s.c.fishCaught += caught;
    Sys.stats.gain(s, { physical: 0.2 });
    s.xp += 10 + caught * 10;
    Sys.quests.check(s);
    return caught ? 'Улов: ' + caught + ' ' + U.plural(caught, 'рыба', 'рыбы', 'рыб') + '. Можно съесть (сытость +30) или продать на рынке (250 ₽ за штуку).' : 'Сегодня не клюёт. Зато отдохнули.';
  };
  Fun.eatFish = function (s) {
    if (s.fish < 1) return SN.fail('Нет рыбы');
    if (s.housing === 'street' && !s.items.includes('stove') && !s.flags.campfireOk) { s.flags.campfireOk = true; }
    s.fish--; T.advance(s, 40, {}); Sys.stats.apply(s, { food: 30, mood: 4 }); s.c.meals++;
    SN.say('🐟 Ухa на костре у реки. Сытость +30.', 'good'); return SN.okr('');
  };
  Fun.sellFish = function (s) {
    if (s.fish < 1) return SN.fail('Нет рыбы');
    if (s.district !== 'old') { const r = Sys.city.travel(s, 'old'); if (!r.ok) return r; }
    const n = s.fish, v = n * 250; s.fish = 0; T.advance(s, 30, {});
    Sys.econ.earn(s, v, 'other', 'Продажа рыбы на рынке');
    SN.say('Продано ' + n + ' рыб на рынке: +' + U.money(v), 'good'); return SN.okr('');
  };

  // ── Умные быстрые действия главного экрана
  const Quick = Sys.quick = {};
  Quick.work = s => { const j = Sys.work.best(s); return j ? { label: j.name, run: () => Sys.work.shift(s, j.id) } : { label: 'Нет доступной работы', run: () => SN.fail(Quick.workWhy(s)) }; };
  Quick.workWhy = s => {
    if (s.st.energy < 15) return 'Мало энергии — отдохните.';
    if (s.st.food < 12) return 'Сначала поешьте.';
    const h = T.hourF(s); if (h < 6 || h > 21) return 'Ночью работы нет. Выспитесь — утром откроются подработки.';
    return 'Сейчас нет подходящей работы. Загляните в «Карьеру».';
  };
  Quick.eat = function (s) {
    const order = ['cookhome', 'soup', 'canteen', 'bread', 'noodles'];
    for (const id of order) {
      const a = D.actionById[id];
      if (Sys.act.check(s, a)) continue;
      const dest = Sys.city.needTravel(s, a.where);
      if (a.open && !T.isOpen(s, a.open, a.hours, Sys.city.etaMins(s, dest))) continue;
      if (dest && id !== 'soup' && id !== 'cookhome') continue;
      if (!Sys.econ.canPay(s, Sys.act.cost(s, a))) continue;
      return { label: a.name, run: () => Sys.act.run(s, id) };
    }
    if (s.fish > 0) return { label: 'Сварить уху', run: () => Fun.eatFish(s) };
    return { label: 'Нет денег на еду', run: () => SN.fail('Нет денег. Бесплатный обед в соццентре — 12:00–15:00. Можно сдать вторсырьё (2 ч, ~230 ₽).') };
  };
  Quick.rest = function (s) {
    const h = T.hourF(s);
    if (h >= 20 || h < 5 || s.st.energy < 25) {
      const o = Sys.stats.sleepOptions(s);
      const pick = o.find(x => x.id === 'home') || (o.find(x => x.id === 'shelter' && x.open !== false)) || o.find(x => x.id === 'street');
      return { label: pick.name, run: () => Sys.stats.sleep(s, pick.id), sleep: true };
    }
    return { label: 'Вздремнуть 2 ч', run: () => Sys.act.run(s, 'nap') };
  };
})(typeof window !== 'undefined' ? window : globalThis);
