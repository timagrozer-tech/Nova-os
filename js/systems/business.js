/* Бизнес: открытие, персонал, реклама, цены, улучшения, ежедневный расчёт прибыли/убытков */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const E = () => Sys.econ;
  const B = Sys.biz = {};

  B.make = id => ({ id, lvl: 1, staff: 0, ads: 0, price: 1, rep: 30, days: 0, plusDays: 0, total: 0, last: null, owner: false, debt: 0, opened: 0 });
  B.get = (s, id) => s.biz.find(b => b.id === id);

  B.openCheck = function (s, id) {
    const d = D.bizById[id];
    if (B.get(s, id)) return 'Уже открыто';
    const rf = E().reqFail(s, d.req); if (rf) return rf;
    if (!E().canPay(s, B.price(s, id))) return 'Нужно ' + U.money(B.price(s, id));
    return '';
  };
  B.price = (s, id) => Math.round(D.bizById[id].price * (id === 'workshop' && s.flags.valeraPartner ? 0.7 : 1));
  B.open = function (s, id) {
    const why = B.openCheck(s, id); if (why) return SN.fail(why);
    const d = D.bizById[id];
    E().pay(s, B.price(s, id), 'business', 'Открытие: ' + d.name);
    const b = B.make(id); b.opened = T.day(s); b.staff = d.staffMax > 1 ? 1 : 0;
    if (s.flags.mariaMentor) b.rep += 20;
    if (id === 'workshop' && s.flags.valeraPartner) b.rep = Math.max(b.rep, 60);
    s.biz.push(b);
    T.advance(s, 180, { indoor: true });
    s.xp += 120; s.rep = U.clamp(s.rep + 5);
    Sys.log(s, 'Открыт бизнес: ' + d.name + '.');
    Sys.quests.check(s);
    SN.emit('modal', { kind: 'info', icon: d.icon, title: 'Своё дело!', text: d.name + ' открыт(а). Наймите персонал или работайте сами — без людей точка не работает. Прибыль и расходы считаются каждую ночь.' });
    return SN.okr(d.name);
  };

  B.capacity = (b, d, withOwner) => (b.staff + (withOwner ? 1 : 0)) * d.cap * (1 + 0.4 * (b.lvl - 1));
  /* Прогноз/расчёт дня. rnd — случайный множитель; если не передан, берётся 1 (прогноз) */
  B.calc = function (s, b, rnd, season, weather) {
    const d = D.bizById[b.id];
    const repM = 0.6 + b.rep / 100 * 0.8;
    const sat = 1 / (1 + (SN.perk(s, 'tycoon') ? 0.02 : 0.04) * Math.max(0, s.biz.length - 1));
    const pl = D.PRICE_LEVELS[b.price];
    let demand = d.base * (1 + 0.4 * (b.lvl - 1)) * repM * D.ADS_MULT[b.ads] * pl.demand * (d.season[season] || 1) * sat * (rnd == null ? 1 : rnd) * (SN.perk(s, 'marketer') ? 1.08 : 1);
    if (['rain', 'snow', 'storm'].includes(weather)) demand *= d.rain;
    const cap = B.capacity(b, d, b.owner);
    const cust = Math.floor(Math.min(demand, cap));
    const rev = cust * d.check * pl.rev * s.prices;
    const cogs = cust * d.check * d.cogs * s.prices;
    const wages = b.staff * d.wage * (SN.perk(s, 'manager') ? 0.9 : 1);
    const ads = b.ads * d.ads;
    const rent = d.rent * (1 + 0.3 * (b.lvl - 1));
    const tax = rev * D.TAX;
    const profit = rev - cogs - wages - ads - rent - tax;
    return { demand: Math.round(demand), cap: Math.round(cap), cust, rev: Math.round(rev), cogs: Math.round(cogs), wages, ads, rent: Math.round(rent), tax: Math.round(tax), profit: Math.round(profit) };
  };
  B.forecast = (s, b) => B.calc(s, b, null, T.season(s), s.weather ? s.weather.kind : 'clear');

  B.daily = function (s, rep) {
    const season = T.season(s), wk = s.weather ? s.weather.kind : 'clear';
    for (const b of s.biz) {
      const d = D.bizById[b.id];
      const r = B.calc(s, b, 0.85 + U.rand(s) * 0.3, season, wk);
      b.days++; b.last = r; b.total += r.profit;
      if (r.profit > 0) { b.plusDays++; s.c.bizProfitDays++; }
      // Репутация точки: довольные клиенты растят, очереди и высокие цены — снижают
      if (r.cust === 0) b.rep -= 2;
      else if (r.demand > r.cap * 1.25) b.rep -= 1;
      else b.rep += b.price === 2 ? 0.2 : b.price === 0 ? 1.2 : 0.7;
      b.rep = U.clamp(b.rep);
      if (r.profit >= 0) {
        const toDebt = Math.min(b.debt, r.profit); b.debt -= toDebt;
        E().earn(s, r.profit - toDebt, 'business', d.name, true);
      } else {
        const need = -r.profit, paid = Math.min(need, Math.max(0, E().available(s)));
        if (paid > 0) E().pay(s, paid, 'business', 'Убыток: ' + d.name);
        if (need > paid) { b.debt += need - paid; rep.lines.push('⚠️ ' + d.name + ': долг перед поставщиками ' + U.money(b.debt) + '.'); }
      }
      rep.biz.push({ name: d.name, icon: d.icon, ...r, closed: r.cust === 0 });
      if (r.cust === 0) rep.lines.push(d.icon + ' ' + d.name + ' простаивает: нет персонала. Наймите сотрудника или выйдите на смену.');
      b.owner = false;
    }
  };

  B.set = function (s, id, key, val) {
    const b = B.get(s, id), d = D.bizById[id];
    if (!b) return SN.fail('Нет бизнеса');
    if (key === 'staff') b.staff = U.clamp(val, 0, d.staffMax);
    if (key === 'ads') b.ads = U.clamp(val, 0, 2);
    if (key === 'price') b.price = U.clamp(val, 0, 2);
    return SN.okr('');
  };
  B.upgradeCost = (b, d, s) => Math.round(d.price * 0.5 * b.lvl * (s && SN.perk(s, 'tycoon') ? 0.75 : 1));
  B.upgrade = function (s, id) {
    const b = B.get(s, id), d = D.bizById[id];
    if (b.lvl >= 3) return SN.fail('Максимальный уровень');
    const c = B.upgradeCost(b, d, s);
    if (!E().pay(s, c, 'business', 'Расширение: ' + d.name)) return SN.fail('Нужно ' + U.money(c));
    b.lvl++; s.xp += 80;
    Sys.quests.check(s);
    SN.say(d.icon + ' Расширение до уровня ' + b.lvl, 'good');
    return SN.okr('');
  };
  /* Владелец сам выходит на смену: точка работает даже без персонала, экономия на зарплате */
  B.work = function (s, id) {
    const b = B.get(s, id), d = D.bizById[id];
    if (b.owner) return SN.fail('Вы уже отработали сегодня');
    if (s.st.energy < 25) return SN.fail('Мало энергии');
    if (s.district !== d.district) { const r = Sys.city.travel(s, d.district); if (!r.ok) return r; }
    s.st.energy = U.clamp(s.st.energy - 20);
    T.advance(s, 8 * 60, { indoor: b.id !== 'drinks' });
    b.owner = true; b.rep = U.clamp(b.rep + 1);
    Sys.stats.gain(s, { trade: 1.2, social: 0.4 });
    s.xp += 40;
    SN.say(d.icon + ' Вы отработали смену в своём деле. Сегодня точка работает с вами.', 'good');
    return SN.okr('');
  };
  B.sell = function (s, id) {
    const b = B.get(s, id), d = D.bizById[id];
    const v = Math.round((d.price + (b.lvl - 1) * d.price * 0.5) * 0.6 * (0.7 + b.rep / 100 * 0.6)) - b.debt;
    s.biz = s.biz.filter(x => x !== b);
    E().earn(s, Math.max(0, v), 'business', 'Продажа: ' + d.name);
    Sys.log(s, 'Бизнес продан: ' + d.name + ' за ' + U.money(Math.max(0, v)) + '.');
    return SN.okr('Продано за ' + U.money(Math.max(0, v)));
  };
  B.sellValue = (s, b) => { const d = D.bizById[b.id]; return Math.max(0, Math.round((d.price + (b.lvl - 1) * d.price * 0.5) * 0.6 * (0.7 + b.rep / 100 * 0.6)) - b.debt); };
})(typeof window !== 'undefined' ? window : globalThis);
