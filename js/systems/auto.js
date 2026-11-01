/* Автопилот: прожить день / неделю / месяц по плану.
   Герой сам ест, моется, лечится, ходит на работу или подработки, учится, прячет наличные на счёт и спит в лучшем месте.
   События решаются разумным вариантом (или автопилот останавливается — по настройке). */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const Au = Sys.auto = {};
  Au.DEF = { work: 'auto', study: '', events: 'auto', maxHours: 10, saveCash: true };
  Au.plan = s => Object.assign({}, Au.DEF, s.settings.auto || {});

  Au.begin = function (s) {
    SN.mute(true);
    return { plan: Au.plan(s), nw: Sys.fin.netWorth(s), earned: s.c.earned, spent: s.c.spent, day: T.day(s), shifts: s.c.jobs + s.c.gigs, studyH: s.c.studyH, events: [], stop: '', st: Object.assign({}, s.st), days: 0 };
  };
  Au.end = function (s, ctx) {
    const muted = SN.mute(false);
    const lines = [], warn = [];
    for (const m of muted) {
      if (m.ev === 'quest') lines.push('✅ ' + m.data.title);
      else if (m.ev === 'achievement') lines.push('🏆 ' + m.data.name);
      else if (m.ev === 'modal') lines.push((m.data.icon || '•') + ' ' + m.data.text);
      else if (m.ev === 'newday') m.data.forEach(r => r.lines.forEach(l => (l.includes('⚠️') || l.includes('выселили') || l.includes('уволили') ? warn : lines).push(l)));
    }
    s.c.autoDays = (s.c.autoDays || 0) + ctx.days;
    Sys.quests.check(s);
    return { days: ctx.days, income: s.c.earned - ctx.earned, spent: s.c.spent - ctx.spent, nw0: ctx.nw, nw1: Sys.fin.netWorth(s), shifts: s.c.jobs + s.c.gigs - ctx.shifts,
      studyH: s.c.studyH - ctx.studyH, events: ctx.events, lines: lines.slice(-14), warn: warn.slice(-8), stop: ctx.stop, st0: ctx.st, st1: Object.assign({}, s.st) };
  };

  Au.try = (fn) => { const r = fn(); return r && r.ok; };
  Au.resolve = function (s, ctx) {
    const ev = Sys.events.current(s); if (!ev) return;
    let idx = 0;
    if (ev.choices) {
      const free = i => ev.choices[i] && !Sys.events.lock(s, ev.choices[i]);
      idx = ev.auto != null && free(ev.auto) ? ev.auto : ev.choices.findIndex((c, i) => free(i));
      if (idx < 0) idx = ev.choices.length - 1;
    }
    const r = Sys.events.resolve(s, idx);
    if (r.locked) s.pending.shift();
    ctx.events.push(ev.icon + ' ' + ev.title + (r.text ? ': ' + r.text : ''));
  };

  Au.care = function (s) {
    const st = s.st;
    if (st.food < 55) { const q = Sys.quick.eat(s); if (Au.try(q.run)) return true; }
    if (s.ill && !s.daily.autoTreat) {
      s.daily.autoTreat = 1;
      for (const id of (s.fin.ins.health ? ['clinic'] : []).concat(['polyclinic', 'freemed', 'pharmacy'])) {
        const a = D.actionById[id];
        if (Sys.act.check(s, a) || !Sys.econ.canPay(s, Sys.act.cost(s, a))) continue;
        if (a.open && !T.isOpen(s, a.open, a.hours, Sys.city.etaMins(s, Sys.city.needTravel(s, a.where)))) continue;
        if (Au.try(() => Sys.act.run(s, id))) return true;
      }
    }
    if (st.hygiene < 40 && !s.daily.autoWash) {
      s.daily.autoWash = 1;
      for (const id of ['homeshower', 'freeshower', 'banya']) {
        const a = D.actionById[id];
        if (Sys.act.check(s, a) || !Sys.econ.canPay(s, Sys.act.cost(s, a))) continue;
        if (a.open && !T.isOpen(s, a.open, a.hours, Sys.city.etaMins(s, Sys.city.needTravel(s, a.where)))) continue;
        if (Au.try(() => Sys.act.run(s, id))) return true;
      }
    }
    return false;
  };

  Au.work = function (s, plan, part) {
    if (plan.work === 'none' || (s.daily.autoWork || 0) >= plan.maxHours) return false;
    const done = (h) => { s.daily.autoWork = (s.daily.autoWork || 0) + h; return true; };
    if (part !== 'gig' && s.job && (plan.work === 'auto' || plan.work === 'job')) {
      const j = D.jobById[s.job.id];
      if (!Sys.work.check(s, j) && Au.try(() => Sys.work.shift(s, j.id))) return done(j.hours);
    }
    if (part !== 'gig' && s.biz.length && (plan.work === 'auto' || plan.work === 'biz')) {
      const b = s.biz.find(x => !x.owner && !x.paused && (x.team.length === 0 || plan.work === 'biz'));
      if (b && s.st.energy >= 30 && Au.try(() => Sys.biz.work(s, b.uid))) return done(8);
    }
    if (part !== 'main' && (plan.work === 'auto' || plan.work === 'gig')) {
      // Не брать подработку, если сегодня ещё предстоит смена на основной работе
      if (plan.work === 'auto' && s.job && !T.weekend(s) && s.job.last !== T.day(s) && T.hourF(s) < D.jobById[s.job.id].open[1]) return false;
      let best = null, rate = 0;
      for (const j of D.jobs) { if (j.kind !== 'gig' || Sys.work.check(s, j)) continue; const r = Sys.work.payEstimate(s, j) / j.hours - j.energy * 2; if (r > rate) { rate = r; best = j; } }
      if (best && Au.try(() => Sys.work.shift(s, best.id))) return done(best.hours);
    }
    return false;
  };

  Au.study = function (s, plan) {
    const c = D.courseById[plan.study];
    if (!c || (s.daily.autoStudy || 0) >= 2) return false;
    if (Sys.edu.done(s, c)) { s.settings.auto = Object.assign(Au.plan(s), { study: '' }); return false; }
    const why = Sys.edu.check(s, c, true); if (why) return false;
    const eta = Sys.city.etaMins(s, c.district);
    if (!T.isOpen(s, c.open, c.session, eta)) {
      // Занятия откроются позже сегодня — подождать, если ждать недолго
      const startH = c.open[0] - eta / 60, h = T.hourF(s);
      if (startH > h && startH - h <= 3 && c.open[0] + c.session <= c.open[1]) T.advance(s, (startH - h) * 60, { indoor: s.housing !== 'street' });
      else return false;
    }
    if (Au.try(() => Sys.edu.study(s, c.id))) { s.daily.autoStudy = (s.daily.autoStudy || 0) + 1; return true; }
    return false;
  };

  Au.sleep = function (s, plan) {
    if (plan.saveCash && s.account && s.money > 1500) Sys.fin.toBank(s, s.money - 1000);
    const o = Sys.stats.sleepOptions(s);
    let id = 'street';
    if (o.find(x => x.id === 'home')) id = 'home';
    else if (Sys.econ.available(s) > 15000 && o.find(x => x.id === 'hostelNight')) id = 'hostelNight';
    else if (T.hour(s) < 2 || T.hour(s) >= 6) id = 'shelter';
    if (id === 'shelter') {
      if (s.district !== 'old') Sys.city.travel(s, 'old');
      if (T.hour(s) >= 2 && T.hour(s) < 19) T.advance(s, (19 - T.hourF(s)) * 60, {});
      if (!(T.hour(s) >= 19 || T.hour(s) < 2)) id = 'street';
    }
    if (!Au.try(() => Sys.stats.sleep(s, id))) Sys.stats.sleep(s, 'street');
  };

  /* Один день. Возвращает причину остановки или '' */
  Au.day = function (s, ctx) {
    const plan = ctx.plan, d0 = T.day(s);
    let guard = 0;
    while (T.day(s) === d0 && T.hourF(s) < 20.5 && guard++ < 30) {
      if (s.pending.length) { if (plan.events === 'stop') return 'Событие ждёт вашего решения'; Au.resolve(s, ctx); continue; }
      if (s.st.health < 15) return 'Здоровье на исходе — автопилот остановлен. Нужны врач, еда и отдых.';
      if (Au.care(s)) continue;
      if (s.st.energy < 22) break;
      if (Au.work(s, plan, 'main')) continue;
      if (plan.study && Au.study(s, plan)) continue;
      if (Au.work(s, plan, 'gig')) continue;
      break;
    }
    if (T.day(s) === d0 && T.hourF(s) < 19) {
      if (s.housing !== 'street' && s.district !== Sys.city.homeDistrict(s)) Sys.city.travel(s, Sys.city.homeDistrict(s));
      T.advance(s, (19 - T.hourF(s)) * 60, { indoor: s.housing !== 'street' && s.district === Sys.city.homeDistrict(s) });
      Sys.stats.apply(s, { stress: -3, mood: 2 });
    }
    if (s.st.food < 45) { const q = Sys.quick.eat(s); q.run(); }
    Au.sleep(s, plan);
    ctx.days++;
    for (let g = 0; g < 5 && s.pending.length && plan.events !== 'stop'; g++) Au.resolve(s, ctx);
    return '';
  };

  /* Синхронный вариант (для тестов и быстрых вызовов) */
  Au.run = function (s, days) {
    const ctx = Au.begin(s);
    try { for (let i = 0; i < days; i++) { const st = Au.day(s, ctx); if (st) { ctx.stop = st; break; } } }
    finally { var sum = Au.end(s, ctx); }
    return sum;
  };
})(typeof window !== 'undefined' ? window : globalThis);
