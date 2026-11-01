/* Часы и календарь. Время идёт только от действий игрока.
   advance() двигает время шагами ≤ 60 мин, на каждом шаге — пассивные изменения показателей,
   при переходе через полночь — детерминированная обработка дня (dayTick). */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D;
  const T = SN.T = {};

  T.day = s => Math.floor(s.time / 1440) + 1;
  T.hour = s => Math.floor((s.time % 1440) / 60);
  T.minute = s => s.time % 60;
  T.hourF = s => (s.time % 1440) / 60;
  T.clock = s => String(T.hour(s)).padStart(2, '0') + ':' + String(T.minute(s)).padStart(2, '0');
  T.dateOf = function (day) {
    let m = D.START_MONTH, d = day, y = 2026;
    while (d > D.monthLen[m]) { d -= D.monthLen[m]; m++; if (m > 11) { m = 0; y++; } }
    return { d, m, y, wd: (D.START_WEEKDAY + day - 1) % 7 };
  };
  T.month = s => T.dateOf(T.day(s)).m;
  T.season = s => D.seasonOf(T.month(s));
  T.weekend = s => T.dateOf(T.day(s)).wd >= 5;
  T.dateLabel = s => { const o = T.dateOf(T.day(s)); return D.weekdays[o.wd] + ', ' + o.d + ' ' + D.months[o.m]; };
  T.phase = s => { const h = T.hourF(s); return h < 5 ? 'night' : h < 8 ? 'dawn' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night'; };
  /* Проверка окна работы заведения. Окно [a,b], b может быть > 24 (после полуночи) */
  T.isOpen = (s, open, hours, addMin) => {
    if (!open) return true;
    let h = ((s.time + (addMin || 0)) % 1440) / 60; const [a, b] = open;
    if (b > 24 && h < b - 24) h += 24;
    return h >= a && h + (hours || 0) <= Math.max(b, a + 0.01) + 0.001;
  };

  /* Погода на день: от месяца + случайность */
  T.rollWeather = function (s) {
    const m = T.month(s);
    const temp = Math.round(D.monthTemp[m] + U.gauss(s) * 4);
    const r = U.rand(s);
    let kind = 'clear';
    if (temp <= -12 && r < 0.25) kind = 'storm';
    else if (r < 0.32) kind = temp <= 0 ? 'snow' : 'rain';
    else if (r < 0.62) kind = 'cloudy';
    else if (temp >= 27) kind = 'heat';
    s.weather = { temp, kind, day: T.day(s) };
  };
  T.ensureWeather = s => { if (!s.weather || s.weather.day !== T.day(s)) T.rollWeather(s); };

  /* Главный механизм хода времени.
     ctx: { sleep:bool, indoor:bool, q:качество сна } */
  T.advance = function (s, minutes, ctx) {
    ctx = ctx || {};
    let left = Math.max(0, Math.round(minutes));
    const reports = [];
    while (left > 0) {
      const toMidnight = 1440 - (s.time % 1440);
      const step = Math.min(left, 60, toMidnight);
      SN.Sys.stats.tick(s, step / 60, ctx);
      s.time += step; left -= step;
      if (s.time % 1440 === 0) reports.push(T.dayTick(s));
      if (s.st.health <= 0 && !ctx.noCollapse) { SN.Sys.stats.collapse(s); left = 0; }
    }
    if (reports.length) SN.emit('newday', reports);
    return reports;
  };

  /* Обработка наступления нового дня. Порядок важен и фиксирован → детерминизм. */
  T.dayTick = function (s) {
    const prevDay = T.day(s) - 1;
    const rep = { day: prevDay, inc: s.today.inc, exp: s.today.exp, lines: [], biz: [] };
    s.days.unshift({ d: prevDay, inc: Math.round(s.today.inc), exp: Math.round(s.today.exp) });
    s.days = s.days.slice(0, 30);
    s.today = { inc: 0, exp: 0 };
    s.daily = {};
    T.rollWeather(s);
    if (s.priceDays > 0 && --s.priceDays === 0) { s.prices = 1; rep.lines.push('Цены в городе вернулись к обычным.'); }
    const sys = SN.Sys;
    sys.prop.daily(s, rep);
    sys.biz.daily(s, rep);
    sys.fin.daily(s, rep);
    sys.inv.daily(s, rep);
    sys.stats.daily(s, rep);
    sys.docs.daily(s, rep);
    sys.work.daily(s, rep);
    sys.social.daily(s, rep);
    sys.events.daily(s, rep);
    sys.quests.check(s);
    sys.daily.daily(s, rep);
    rep.lines.forEach(t => SN.Sys.log(s, t));
    return rep;
  };
})(typeof window !== 'undefined' ? window : globalThis);
