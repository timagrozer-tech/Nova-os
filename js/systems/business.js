/* Бизнес 0.4: филиалы по районам, команда с навыками и моралью, склад и закупки, качество, гибкие цены,
   рекламные кампании, улучшения, управляющий, конкуренты, отзывы, история прибыли.

   Расчёт дня:
   спрос    = база × уровень × район × репутация × кампания × цена^-1,6 × качество × сезон × погода × улучшения × конкуренты × насыщение × случайность
   мощность = Σ(сотрудник: мощность × (0,55 + 0,15 × навык) × мораль × черта) + владелец на смене, × уровень × оборудование
   клиенты  = min(спрос, мощность, товар на складе)
   прибыль  = выручка − закупки/расходники − зарплаты − управляющий − аренда − кампания − налог 6% */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const E = () => Sys.econ;
  const B = Sys.biz = {};
  const P = (s, id) => SN.perk(s, id);

  B.title = b => { const d = D.bizById[b.id]; return d.name + (b.district !== d.district ? ' · ' + D.districts[b.district].name : ''); };
  B.has = (b, up) => b.up.includes(up);
  B.byUid = (s, uid) => s.biz.find(b => b.uid === +uid);
  B.get = B.byUid;
  B.emp = (s, uid, n) => { const b = B.byUid(s, uid); return b && b.team.find(e => e.n === n); };
  B.make = (id, district) => ({ uid: 0, id, district: district || D.bizById[id].district, lvl: 1, team: [], cand: [], candDay: 0, manager: false, price: 1, quality: 1,
    camp: null, up: [], stock: 0, autoStock: true, rep: 30, days: 0, plusDays: 0, total: 0, hist: [], last: null, owner: false, debt: 0, paused: false, reviews: [], opened: 0 });
  /* Перевод бизнеса из старых версий (0.1–0.3) */
  B.upgradeLegacy = function (s, b) {
    const n = Object.assign(B.make(b.id), b);
    if (!n.uid) n.uid = (s.flags.bizUid = (s.flags.bizUid || 0) + 1);
    if (!Array.isArray(n.team)) n.team = [];
    if (b.staff != null && !b.team) for (let i = 0; i < b.staff; i++) n.team.push(B.newEmp(s, D.bizById[b.id], 2));
    if (typeof b.price === 'number' && b.price <= 2 && Number.isInteger(b.price) && !b.team) n.price = [0.85, 1, 1.2][b.price];
    if (!b.team) { n.stock = 0; n.autoStock = true; }
    if (!D.districts[n.district]) n.district = D.bizById[b.id].district;
    for (const k of ['up', 'cand', 'hist', 'reviews']) if (!Array.isArray(n[k])) n[k] = [];
    n.lvl = U.clamp(n.lvl | 0 || 1, 1, D.BIZ_MAX_LVL);
    delete n.staff; delete n.ads;
    return n;
  };

  // ─────────── Сотрудники
  B.newEmp = function (s, d, sk) {
    sk = sk || 1 + Math.floor(U.rand(s) * 5);
    const tr = D.employeeTraits[Math.floor(U.rand(s) * D.employeeTraits.length)];
    return { n: U.pick(s, D.firstNames) + ' ' + U.pick(s, D.lastNames), sk, wage: Math.round(d.wage * (0.7 + 0.15 * sk) / 50) * 50, mor: 60 + Math.floor(U.rand(s) * 30), tr: tr.id, days: 0 };
  };
  B.staffMax = (b, d) => d.staffMax + (b.lvl - 1);
  B.candidates = function (s, b) {
    if (b.candDay !== T.day(s) || !b.cand.length) { const d = D.bizById[b.id]; b.cand = [0, 1, 2].map(() => B.newEmp(s, d)); b.candDay = T.day(s); }
    return b.cand;
  };
  B.hire = function (s, uid, i) {
    const b = B.byUid(s, uid), d = D.bizById[b.id];
    if (b.team.length >= B.staffMax(b, d)) return SN.fail('Штат заполнен (' + B.staffMax(b, d) + '). Расширьте точку.');
    const e = B.candidates(s, b)[i]; if (!e) return SN.fail('Кандидат уже ушёл');
    b.team.push(e); b.cand.splice(i, 1);
    T.advance(s, 30, { indoor: true });
    SN.say('🤝 ' + e.n + ' принят(а) на работу.', 'good');
    return SN.okr('');
  };
  B.fire = function (s, uid, n) {
    const b = B.byUid(s, uid); const e = b.team.find(x => x.n === n); if (!e) return SN.fail('Нет сотрудника');
    b.team = b.team.filter(x => x !== e); b.team.forEach(x => x.mor = U.clamp(x.mor - 5));
    E().pay(s, Math.min(E().available(s), e.wage * 2), 'business', 'Выходное пособие: ' + n);
    return SN.okr(n + ' уволен(а). Выходное пособие — 2 дневные ставки.');
  };
  B.train = function (s, uid, n) {
    const e = B.emp(s, uid, n); if (!e) return SN.fail('Нет сотрудника');
    if (e.sk >= 5) return SN.fail('Уже мастер своего дела');
    const c = e.wage * 6;
    if (!E().pay(s, c, 'business', 'Обучение: ' + n)) return SN.fail('Нужно ' + U.money(c));
    e.sk++; e.wage = Math.round(e.wage * 1.12 / 50) * 50; e.mor = U.clamp(e.mor + 10);
    return SN.okr(n + ': навык ' + e.sk + '★, ставка ' + U.money(e.wage));
  };
  B.bonus = function (s, uid, n) {
    const e = B.emp(s, uid, n); if (!e) return SN.fail('Нет сотрудника');
    if (!E().pay(s, e.wage * 2, 'business', 'Премия: ' + n)) return SN.fail('Нужно ' + U.money(e.wage * 2));
    e.mor = U.clamp(e.mor + 30);
    return SN.okr(n + ': мораль ' + Math.round(e.mor));
  };
  B.managerWage = d => Math.round(d.wage * 2.4);

  // ─────────── Открытие
  B.price = (s, id) => Math.round(D.bizById[id].price * (id === 'workshop' && s.flags.valeraPartner ? 0.7 : 1));
  B.branches = (s, id) => s.biz.filter(b => b.id === id);
  B.openCheck = function (s, id, district) {
    const d = D.bizById[id];
    if (B.branches(s, id).length >= D.BIZ_MAX_BRANCH) return 'Максимум ' + D.BIZ_MAX_BRANCH + ' точки этого типа';
    if (district && B.branches(s, id).some(b => b.district === district)) return 'В этом районе точка уже есть';
    const rf = E().reqFail(s, d.req); if (rf) return rf;
    if (!E().canPay(s, B.price(s, id))) return 'Нужно ' + U.money(B.price(s, id));
    return '';
  };
  B.open = function (s, id, district) {
    const d = D.bizById[id];
    district = district || (B.branches(s, id).some(b => b.district === d.district) ? Object.keys(D.bizDistrict).find(k => !B.branches(s, id).some(b => b.district === k)) : d.district);
    const why = B.openCheck(s, id, district); if (why) return SN.fail(why);
    E().pay(s, B.price(s, id), 'business', 'Открытие: ' + d.name);
    const b = B.make(id, district);
    b.uid = (s.flags.bizUid = (s.flags.bizUid || 0) + 1); b.opened = T.day(s);
    b.team.push(B.newEmp(s, d, 2));
    if (s.flags.mariaMentor) b.rep += 20;
    if (id === 'workshop' && s.flags.valeraPartner) b.rep = Math.max(b.rep, 60);
    if (d.goods) b.stock = Math.round(B.calc(s, b, null, T.season(s), 'clear', { noStock: true }).demand * 1.5);
    s.biz.push(b);
    T.advance(s, 180, { indoor: true });
    s.xp += 120; s.rep = U.clamp(s.rep + 5);
    Sys.log(s, 'Открыт бизнес: ' + B.title(b) + '.');
    Sys.quests.check(s);
    SN.emit('modal', { kind: 'info', icon: d.icon, title: 'Своё дело!', text: B.title(b) + ' открыт(а). ' + 'Первый сотрудник уже нанят. ' + (d.goods ? 'Стартовый товар на складе, автозакупка включена. ' : '') + 'Управление — в карточке бизнеса.' });
    return { ok: true, uid: b.uid };
  };

  // ─────────── Экономика точки
  B.qual = b => D.bizQuality[b.quality] || D.bizQuality[1];
  B.unitCost = (s, b) => { const d = D.bizById[b.id]; return d.check * d.cogs * B.qual(b).cogs * s.prices; };
  B.empCap = (b, d, e) => d.cap * (0.55 + 0.15 * e.sk) * (e.mor < 30 ? 0.75 : e.mor > 80 ? 1.08 : 1) * (e.tr === 'fast' ? 1.15 : e.tr === 'lazy' ? 0.85 : 1);
  B.capacity = function (s, b, withOwner) {
    const d = D.bizById[b.id];
    let c = b.team.reduce((a, e) => a + B.empCap(b, d, e), 0);
    if (withOwner) c += d.cap * (0.6 + s.sk.trade / 150);
    return c * (1 + 0.35 * (b.lvl - 1)) * (B.has(b, 'equipment') ? 1.3 : 1);
  };
  B.compKey = (id, district) => id + ':' + district;
  B.comp = (s, id, district) => { s.flags.comp = s.flags.comp || {}; const k = B.compKey(id, district); if (s.flags.comp[k] == null) s.flags.comp[k] = (U.hash(k).charCodeAt(0) % 3); return s.flags.comp[k]; };
  B.compAdd = (s, id, district, x) => { B.comp(s, id, district); s.flags.comp[B.compKey(id, district)] = U.clamp(s.flags.comp[B.compKey(id, district)] + x, 0, 4); };
  B.distMult = (b, d, k) => D.bizDistrict[b.district][k] / D.bizDistrict[d.district][k];
  B.campMult = (s, b) => b.camp && b.camp.until >= T.day(s) ? D.bizCampById[b.camp.id].mult : 1;
  B.wages = (s, b, d) => (b.paused ? 0 : b.team.reduce((a, e) => a + e.wage, 0) + (b.manager ? B.managerWage(d) : 0)) * (P(s, 'manager') ? 0.9 : 1) * (B.has(b, 'pos') ? 0.85 : 1);
  B.rent = (b, d) => d.rent * (1 + 0.3 * (b.lvl - 1)) * B.distMult(b, d, 'rent');

  /* opt.noStock — без ограничения склада (для прогнозов окупаемости) */
  B.calc = function (s, b, rnd, season, weather, opt) {
    opt = opt || {};
    const d = D.bizById[b.id], q = B.qual(b);
    const repM = 0.6 + b.rep / 100 * 0.8;
    const sat = 1 / (1 + (P(s, 'tycoon') ? 0.02 : 0.04) * Math.max(0, s.biz.length - 1));
    let ups = 1;
    if (B.has(b, 'sign')) ups *= 1.08; if (B.has(b, 'renovation')) ups *= 1.12; if (B.has(b, 'loyalty')) ups *= 1.06; if (B.has(b, 'delivery') && d.food) ups *= 1.2;
    let demand = b.paused ? 0 : d.base * (1 + 0.35 * (b.lvl - 1)) * B.distMult(b, d, 'demand') * repM * B.campMult(s, b) * Math.pow(1 / b.price, 1.6) * q.demand
      * (d.season[season] || 1) * ups * (1 - 0.1 * B.comp(s, b.id, b.district)) * sat * (P(s, 'marketer') ? 1.08 : 1) * (rnd == null ? 1 : rnd);
    if (['rain', 'snow', 'storm'].includes(weather)) demand *= d.rain;
    const cap = B.capacity(s, b, b.owner);
    const stockLim = d.goods && !opt.noStock ? Math.floor(b.stock) : Infinity;
    const cust = Math.max(0, Math.floor(Math.min(demand, cap, stockLim)));
    const lostQueue = Math.max(0, Math.min(demand, stockLim) - cap), lostStock = Math.max(0, Math.min(demand, cap) - stockLim);
    const rev = cust * d.check * b.price * q.check * s.prices;
    const cogs = cust * B.unitCost(s, b) * (d.goods && b.autoStock ? 1.05 : 1);
    const wages = B.wages(s, b, d);
    const rent = B.rent(b, d);
    const tax = rev * D.TAX;
    const profit = rev - cogs - wages - rent - tax;
    return { demand: Math.round(demand), cap: Math.round(cap), cust, lostQueue: Math.round(lostQueue), lostStock: Math.round(lostStock), rev: Math.round(rev), cogs: Math.round(cogs), wages: Math.round(wages), rent: Math.round(rent), tax: Math.round(tax), profit: Math.round(profit) };
  };
  B.forecast = (s, b) => B.calc(s, b, null, T.season(s), s.weather ? s.weather.kind : 'clear');
  /* Подсказка: цена, при которой прибыль по прогнозу максимальна */
  B.bestPrice = function (s, b) {
    const p0 = b.price; let best = p0, bp = -1e15;
    for (let p = 0.7; p <= 1.501; p += 0.05) { b.price = p; const r = B.calc(s, b, null, T.season(s), 'clear', { noStock: true }); if (r.profit > bp) { bp = r.profit; best = p; } }
    b.price = p0; return Math.round(best * 100) / 100;
  };

  // ─────────── Склад
  B.buyStock = function (s, uid, days) {
    const b = B.byUid(s, uid), d = D.bizById[b.id];
    if (!d.goods) return SN.fail('Здесь склад не нужен');
    const f = B.forecast(s, b), n = Math.max(10, Math.round(Math.min(f.demand, Math.max(f.cap, 1)) * days));
    const cost = Math.round(n * B.unitCost(s, b));
    if (!E().pay(s, cost, 'business', 'Закупка: ' + B.title(b))) return SN.fail('Нужно ' + U.money(cost));
    b.stock += n; b.buyToday = (b.buyToday || 0) + cost;
    return SN.okr('Закуплено ' + U.num(n) + ' ед. за ' + U.money(cost));
  };

  // ─────────── Управление
  B.set = function (s, uid, key, val) {
    const b = B.byUid(s, uid); if (!b) return SN.fail('Нет бизнеса');
    if (key === 'price') b.price = Math.round(U.clamp(val, 0.7, 1.5) * 100) / 100;
    if (key === 'quality') b.quality = U.clamp(val | 0, 0, 2);
    if (key === 'autoStock') b.autoStock = !!val;
    if (key === 'paused') b.paused = !!val;
    if (key === 'manager') { b.manager = !!val; if (b.manager) SN.say('🧑‍💼 Управляющий нанят: сам набирает персонал, закупает товар и подстраивает цены.', 'good'); }
    return SN.okr('');
  };
  B.campaign = function (s, uid, id) {
    const b = B.byUid(s, uid), d = D.bizById[b.id], c = D.bizCampById[id];
    if (b.camp && b.camp.until >= T.day(s)) return SN.fail('Кампания уже идёт до ' + b.camp.until + '-го дня');
    const cost = Math.round(d.ads * c.k);
    if (!E().pay(s, cost, 'business', c.name + ': ' + B.title(b))) return SN.fail('Нужно ' + U.money(cost));
    b.camp = { id, until: T.day(s) + c.days - 1 };
    if (c.rep) b.rep = U.clamp(b.rep + c.rep);
    return SN.okr(c.icon + ' ' + c.name + ' запущена на ' + c.days + ' дн.');
  };
  B.upCost = (b, d, u) => Math.round(d.price * D.bizUpById[u].cost / 1000) * 1000;
  B.buyUp = function (s, uid, u) {
    const b = B.byUid(s, uid), d = D.bizById[b.id], x = D.bizUpById[u];
    if (B.has(b, u)) return SN.fail('Уже есть');
    if (x.food && !d.food) return SN.fail('Только для еды и напитков');
    if (x.goods && !d.goods) return SN.fail('Только для торговли товаром');
    const c = B.upCost(b, d, u);
    if (!E().pay(s, c, 'business', x.name + ': ' + B.title(b))) return SN.fail('Нужно ' + U.money(c));
    b.up.push(u); s.xp += 40;
    return SN.okr(x.icon + ' ' + x.name + ' — готово');
  };
  B.upgradeCost = (b, d, s) => Math.round(d.price * 0.5 * b.lvl * (s && P(s, 'tycoon') ? 0.75 : 1));
  B.upgrade = function (s, uid) {
    const b = B.byUid(s, uid), d = D.bizById[b.id];
    if (b.lvl >= D.BIZ_MAX_LVL) return SN.fail('Максимальный уровень');
    const c = B.upgradeCost(b, d, s);
    if (!E().pay(s, c, 'business', 'Расширение: ' + B.title(b))) return SN.fail('Нужно ' + U.money(c));
    b.lvl++; s.xp += 80;
    Sys.quests.check(s);
    SN.say(d.icon + ' Расширение до уровня ' + b.lvl + ': больше клиентов и мест в штате', 'good');
    return SN.okr('');
  };
  B.work = function (s, uid) {
    const b = B.byUid(s, uid); if (!b) return SN.fail('Нет бизнеса');
    const d = D.bizById[b.id];
    if (b.owner) return SN.fail('Вы уже отработали сегодня');
    if (s.st.energy < 25) return SN.fail('Мало энергии');
    if (s.district !== b.district) { const r = Sys.city.travel(s, b.district); if (!r.ok) return r; }
    s.st.energy = U.clamp(s.st.energy - 20);
    T.advance(s, 8 * 60, { indoor: b.id !== 'drinks' });
    b.owner = true; b.rep = U.clamp(b.rep + 1); s.c.bizShifts = (s.c.bizShifts || 0) + 1; b.team.forEach(e => e.mor = U.clamp(e.mor + 3));
    Sys.stats.gain(s, { trade: 1.2, social: 0.4, marketing: 0.2 });
    s.xp += 40;
    SN.say(d.icon + ' Вы отработали смену в своём деле: точка обслужит больше клиентов, команда воодушевлена.', 'good');
    return SN.okr('');
  };
  B.sellValue = function (s, b) {
    const d = D.bizById[b.id];
    let base = d.price + (b.lvl - 1) * d.price * 0.5 * b.lvl / 2;
    b.up.forEach(u => base += B.upCost(b, d, u) * 0.6);
    return Math.max(0, Math.round(base * 0.6 * (0.7 + b.rep / 100 * 0.6) + b.stock * B.unitCost(s, b) * 0.7 - b.debt));
  };
  B.sell = function (s, uid) {
    const b = B.byUid(s, uid); if (!b) return SN.fail('Нет бизнеса');
    const v = B.sellValue(s, b);
    s.biz = s.biz.filter(x => x !== b);
    E().earn(s, v, 'business', 'Продажа: ' + B.title(b));
    Sys.log(s, 'Бизнес продан: ' + B.title(b) + ' за ' + U.money(v) + '.');
    return SN.okr('Продано за ' + U.money(v));
  };
  B.stars = b => Math.max(1, Math.min(5, Math.round(b.rep / 20 + 0.4)));

  // ─────────── Управляющий: держит штат, склад и цену
  B.manage = function (s, b, rep) {
    const d = D.bizById[b.id], f = B.forecast(s, b);
    const per = b.team.length ? B.capacity(s, b) / b.team.length : d.cap * 0.85 * (1 + 0.35 * (b.lvl - 1));
    const need = U.clamp(Math.ceil(f.demand / Math.max(1, per)), 1, B.staffMax(b, d));
    if (b.team.length < need) { const c = B.candidates(s, b).sort((x, y) => y.sk - x.sk)[0]; if (c) { b.team.push(c); b.cand = b.cand.filter(x => x !== c); rep.lines.push('🧑‍💼 ' + B.title(b) + ': управляющий нанял ' + c.n + '.'); } }
    else if (b.team.length > need + 1) { const w = b.team.slice().sort((x, y) => x.sk - y.sk)[0]; b.team = b.team.filter(x => x !== w); }
    if (f.demand > f.cap * 1.25 && b.team.length >= B.staffMax(b, d)) b.price = Math.min(1.35, b.price + 0.05);
    else if (f.demand < f.cap * 0.6) b.price = Math.max(0.85, b.price - 0.05);
    b.autoStock = true;
    b.team.forEach(e => { if (e.mor < 35 && E().pay(s, e.wage * 2, 'business', 'Премия: ' + e.n)) e.mor += 30; });
  };

  // ─────────── Ночной расчёт
  B.daily = function (s, rep) {
    const season = T.season(s), wk = s.weather ? s.weather.kind : 'clear';
    for (const b of s.biz.slice()) {
      const d = D.bizById[b.id];
      if (b.manager && !b.paused) B.manage(s, b, rep);
      const r = B.calc(s, b, 0.85 + U.rand(s) * 0.3, season, wk);
      // Склад: расход, порча, автозакупка на завтра (оплачивается сейчас)
      let purchases = b.buyToday || 0; b.buyToday = 0;
      if (d.goods) {
        b.stock = Math.max(0, b.stock - r.cust);
        b.stock = Math.floor(b.stock * (1 - d.perish * (B.has(b, 'fridge') ? 0.3 : 1)));
        if (b.autoStock && !b.paused) {
          const target = Math.round(Math.min(r.demand * 1.25 + 5, Math.max(r.cap, 1) * 1.3));
          const n = Math.max(0, target - b.stock), cost = n * B.unitCost(s, b) * 1.05;
          const can = Math.min(cost, Math.max(0, E().available(s) + Math.max(0, r.rev - r.wages - r.rent - r.tax)));
          const k = cost ? can / cost : 0;
          b.stock += Math.floor(n * k); purchases += Math.round(can);
          if (k < 0.99) rep.lines.push('⚠️ ' + B.title(b) + ': не хватило денег на полную закупку товара.');
        }
      }
      const cogs = d.goods ? 0 : r.cogs;
      const camp = 0;
      const profit = Math.round(r.rev - cogs - purchases - r.wages - r.rent - r.tax - camp);
      const out = Object.assign({}, r, { cogs: Math.round(cogs + purchases), profit });
      b.days++; b.last = out; b.total += profit;
      b.hist.push({ d: T.day(s) - 1, p: profit, c: r.cust }); if (b.hist.length > 30) b.hist.shift();
      if (profit > 0) { b.plusDays++; s.c.bizProfitDays++; }
      // Удовлетворённость → репутация и отзывы
      const lostShare = r.demand > 0 ? (r.lostQueue + r.lostStock) / r.demand : 0;
      let sat = 0.55 + B.qual(b).sat - lostShare * (B.has(b, 'loyalty') ? 0.5 : 0.9) - Math.max(0, b.price - 1) * 0.6 + Math.max(0, 1 - b.price) * 0.4
        + (B.has(b, 'renovation') ? 0.08 : 0) + (b.owner ? 0.04 : 0)
        + b.team.reduce((a, e) => a + (e.tr === 'kind' ? 0.03 : e.tr === 'grumpy' ? -0.04 : 0) + (e.sk - 3) * 0.01, 0) / Math.max(1, b.team.length);
      if (r.cust === 0) sat = 0.1;
      b.rep = U.clamp(b.rep + (U.clamp(sat, 0, 1) * 100 - b.rep) * 0.06);
      if (r.cust > 0 && U.chance(s, 0.6)) {
        const st = U.clamp(Math.round(sat * 5 + U.gauss(s) * 0.6), 1, 5);
        let t = U.pick(s, D.reviews[st]);
        if (st <= 2 && r.lostStock > r.lostQueue && r.lostStock > 0) t = 'Половины товара не было в наличии';
        else if (st <= 2 && r.lostQueue > 0) t = 'Очередь на полчаса, персонала не хватает';
        b.reviews.unshift({ d: T.day(s) - 1, st, t }); b.reviews = b.reviews.slice(0, 8);
      }
      // Мораль команды
      const overload = r.demand > r.cap * 1.15;
      for (const e of b.team.slice()) {
        e.days++;
        e.mor = U.clamp(e.mor + (b.paused ? -2 : overload ? -3 : 1) + (b.owner ? 1 : 0));
        if (e.mor < 20 && U.chance(s, 0.25)) { b.team = b.team.filter(x => x !== e); rep.lines.push('🚪 ' + B.title(b) + ': ' + e.n + ' уволился(ась) — низкая мораль.'); }
      }
      // Деньги
      if (profit >= 0) { const toDebt = Math.min(b.debt, profit); b.debt -= toDebt; E().earn(s, profit - toDebt, 'business', B.title(b), true); }
      else {
        const need = -profit, paid = Math.min(need, Math.max(0, E().available(s)));
        if (paid > 0) E().pay(s, paid, 'business', 'Убыток: ' + B.title(b));
        if (need > paid) { b.debt += need - paid; rep.lines.push('⚠️ ' + B.title(b) + ': долг поставщикам ' + U.money(b.debt) + '.'); }
      }
      rep.biz.push({ uid: b.uid, name: B.title(b), icon: d.icon, ...out, closed: r.cust === 0, paused: b.paused });
      if (r.cust === 0 && !b.paused) rep.lines.push(d.icon + ' ' + B.title(b) + ' простаивает: ' + (r.cap === 0 ? 'нет персонала.' : 'нет товара на складе.'));
      if (b.camp && b.camp.until < T.day(s)) b.camp = null;
      b.owner = false;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
