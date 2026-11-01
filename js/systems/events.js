/* События: отбор раз в сутки (детерминированно от ГПСЧ сохранения), очередь выбора, сезонные праздники */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const Ev = Sys.events = {};
  Ev.byId = id => D.events.find(e => e.id === id) || D.seasonal.find(e => e.id === id);

  Ev.daily = function (s, rep) {
    const o = T.dateOf(T.day(s));
    // Сезонные
    s.flags.fair = false;
    for (const se of D.seasonal) {
      if (!se.when(s, o)) continue;
      if (se.flag) s.flags[se.flag] = true;
      if (!s.flags['seen_' + se.id + '_' + o.y] && (se.id !== 'fair' || o.d === 12)) {
        s.flags['seen_' + se.id + '_' + o.y] = true;
        if (se.effect) se.effect(s);
        s.pending.push({ id: se.id });
      }
    }
    // Собака
    if (s.flags.dog) { if (!Sys.econ.pay(s, 50, 'food', 'Корм для Рыжика')) Sys.stats.apply(s, { mood: -3 }); }
    // Случайные: 45% шанс в день, не повторяются чаще раза в 6 дней
    if (s.pending.length >= 2 || !U.chance(s, 0.45)) return;
    s.flags.evLast = s.flags.evLast || {};
    const pool = D.events.filter(e => { try { return e.when(s) && !(s.flags.evLast[e.id] > T.day(s) - 6); } catch (x) { return false; } });
    if (!pool.length) return;
    let total = pool.reduce((a, e) => a + e.w, 0), r = U.rand(s) * total, pick = pool[0];
    for (const e of pool) { r -= e.w; if (r <= 0) { pick = e; break; } }
    s.flags.evLast[pick.id] = T.day(s);
    let x = null; try { x = pick.prep ? pick.prep(s) : null; } catch (err) { return; }
    s.pending.push({ id: pick.id, x });
  };

  /* Неизвестные (удалённые в новой версии) события из старых сохранений отбрасываются */
  Ev.current = s => { while (s.pending.length && !Ev.byId(s.pending[0].id)) s.pending.shift(); return s.pending.length ? Ev.byId(s.pending[0].id) : null; };
  Ev.ctx = s => s.pending.length ? s.pending[0].x : null;
  Ev.text = (s, e) => typeof e.text === 'function' ? e.text(s, Ev.ctx(s) || {}) : e.text;
  Ev.lock = (s, c) => c.lock ? c.lock(s, Ev.ctx(s) || {}) : '';
  Ev.resolve = function (s, idx) {
    const e = Ev.current(s);
    if (!e) return { text: '' };
    const item = s.pending.shift(), x = item.x || {};
    if (!e.choices) return { text: '' };
    const c = e.choices[idx];
    if (!c) return { text: '' };
    if (c.lock) { const l = c.lock(s, x); if (l) { s.pending.unshift(item); return { text: l, locked: true }; } }
    const text = c.run(s, x);
    s.c.events++;
    Sys.log(s, e.icon + ' ' + e.title + ': ' + text);
    Sys.quests.check(s);
    return { text };
  };
})(typeof window !== 'undefined' ? window : globalThis);
