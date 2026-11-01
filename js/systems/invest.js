/* Капитал: доходные активы, биржа, облигации, золото, срочные вклады, кредитный рейтинг, ипотека,
   страхование, кешбэк, копилка, рейтинг богачей */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const E = () => Sys.econ;
  const I = Sys.inv = {};
  const P = (s, id) => SN.perk(s, id);
  I.TAX = 0.13;

  // ─────────── Кредитный рейтинг 300–850
  I.score = function (s) {
    const f = s.fin, nw = Sys.fin.netWorth(s);
    let sc = 420 + Math.min(150, s.rep * 1.5) + (s.account ? 40 : 0) + (s.job ? 40 : 0) + (s.biz.length ? 25 : 0)
      + Math.min(140, (f.goodPays || 0) * 1.5) - (f.badPays || 0) * 12 + (s.flags.loanRepaid ? 40 : 0) + (s.flags.mortRepaid ? 40 : 0)
      + (nw > 1e6 ? 40 : nw > 1e5 ? 20 : 0) - (f.loan > 0 && T.day(s) > f.loanDue ? 80 : 0);
    return Math.round(U.clamp(sc, 300, 850));
  };
  I.scoreLabel = sc => sc >= 750 ? 'Отличный' : sc >= 650 ? 'Хороший' : sc >= 550 ? 'Средний' : 'Низкий';
  I.scoreMult = s => { const sc = I.score(s); return sc >= 750 ? 0.75 : sc >= 650 ? 0.9 : sc >= 550 ? 1 : 1.3; };

  // ─────────── Доходные активы
  I.units = (s, id) => s.passive.filter(p => p.id === id);
  I.check = function (s, id) {
    const d = D.passiveById[id];
    if (I.units(s, id).length >= d.max) return 'Максимум ' + d.max + ' шт.';
    return E().reqFail(s, d.req);
  };
  I.newUnit = (s, id, price) => ({ uid: (s.flags.uid = (s.flags.uid || 0) + 1), id, value: price, vac: D.passiveById[id].rent ? 2 : 0, q: 1, buy: T.day(s), earned: 0 });
  I.buy = function (s, id, mortgage) {
    const d = D.passiveById[id];
    const why = I.check(s, id); if (why) return SN.fail(why);
    if (mortgage) {
      const q = I.mortQuote(s, d.price); if (q.why) return SN.fail(q.why);
      const u = I.newUnit(s, id, d.price);
      if (!E().pay(s, q.down, 'passive', 'Первый взнос: ' + d.name)) return SN.fail('Нужно ' + U.money(q.down) + ' на первый взнос');
      s.passive.push(u); I.addMort(s, q, 'passive', u.uid, d.name);
    } else {
      if (!E().pay(s, d.price, 'passive', 'Покупка: ' + d.name)) return SN.fail('Нужно ' + U.money(d.price));
      s.passive.push(I.newUnit(s, id, d.price));
    }
    T.advance(s, 60, { indoor: true });
    s.xp += 40;
    Sys.log(s, 'Куплен доходный актив: ' + d.name + (mortgage ? ' (ипотека)' : '') + '.');
    Sys.quests.check(s);
    SN.say(d.icon + ' ' + d.name + ' — теперь ваш. ' + (d.rent ? 'Ищем арендатора.' : 'Доход пойдёт с завтрашнего дня.'), 'good');
    return SN.okr('');
  };
  I.sellValue = (s, u) => { const d = D.passiveById[u.id]; return Math.round(u.value * (d.cat === 'realty' ? 0.92 : 0.6)); };
  I.sell = function (s, uid) {
    const u = s.passive.find(x => x.uid === uid); if (!u) return SN.fail('Нет актива');
    const d = D.passiveById[u.id];
    let v = I.sellValue(s, u);
    const m = s.fin.mort.find(x => x.kind === 'passive' && x.ref === uid);
    if (m) { v -= Math.ceil(m.left); s.fin.mort = s.fin.mort.filter(x => x !== m); }
    s.passive = s.passive.filter(x => x !== u);
    if (v > 0) E().earn(s, v, 'passive', 'Продажа: ' + d.name); else if (v < 0) E().pay(s, -v, 'loan', 'Остаток ипотеки');
    Sys.log(s, 'Продан актив: ' + d.name + '.');
    return SN.okr('Продано' + (m ? ', ипотека закрыта' : '') + '. Получено ' + U.money(Math.max(0, v)));
  };
  I.refresh = function (s, uid) {
    const u = s.passive.find(x => x.uid === uid); if (!u) return SN.fail('Нет актива');
    if (s.st.energy < 15) return SN.fail('Мало энергии');
    s.st.energy = U.clamp(s.st.energy - 12);
    T.advance(s, 180, { indoor: true });
    u.q = 1; Sys.stats.gain(s, { tech: 0.6, marketing: 0.6 });
    SN.say('Контент обновлён: доход снова 100%.', 'good');
    return SN.okr('');
  };
  I.unitIncome = function (s, u, season) {
    const d = D.passiveById[u.id];
    if (u.vac > 0) return { inc: 0, up: d.up };
    const inc = d.inc * (u.q || 1) * (d.seasonal ? d.seasonal[season] : 1) * (s.fin.agency && d.rent ? 0.9 : 1);
    return { inc, up: d.up * (P(s, 'landlord') && d.cat === 'realty' ? 0.85 : 1) };
  };
  I.netOf = (inc, up) => { const pre = inc - up; return pre > 0 ? pre * (1 - I.TAX) : pre; };
  I.passivePerDay = function (s) {
    const season = T.season(s);
    let sum = 0;
    for (const u of s.passive || []) { const r = I.unitIncome(s, Object.assign({}, u, { vac: 0 }), season); sum += I.netOf(r.inc, r.up); }
    return Math.round(sum);
  };
  I.passiveValue = s => (s.passive || []).reduce((a, u) => a + I.sellValue(s, u), 0);
  I.passiveDaily = function (s, rep) {
    const season = T.season(s);
    let total = 0;
    for (const u of s.passive) {
      const d = D.passiveById[u.id];
      if (u.vac > 0) { u.vac--; if (u.vac === 0 && d.rent) rep.lines.push(d.icon + ' ' + d.name + ': найден арендатор.'); }
      const r = I.unitIncome(s, u, season);
      const inc = r.inc * (0.9 + U.rand(s) * 0.2) * (d.id === 'photobooth' && T.weekend(s) ? 1.5 : 1);
      const net = I.netOf(inc, r.up);
      total += net; u.earned = (u.earned || 0) + net;
      if (d.rent && !u.vac && U.chance(s, 0.012 * (P(s, 'landlord') ? 0.5 : 1))) {
        u.vac = s.fin.agency ? 1 + Math.floor(U.rand(s) * 2) : 3 + Math.floor(U.rand(s) * 7);
        rep.lines.push(d.icon + ' ' + d.name + ': арендатор съехал, поиск нового ~' + u.vac + ' дн.' + (s.fin.agency ? ' (агентство)' : ''));
      }
      if (d.cat !== 'online' && U.chance(s, 0.005)) {
        const cost = Math.round(d.price * 0.008 / 100) * 100;
        if (s.fin.ins.property) rep.lines.push(d.icon + ' ' + d.name + ': поломка на ' + U.money(cost) + ' — покрыта страховкой.');
        else { total -= cost; rep.lines.push(d.icon + ' ' + d.name + ': ремонт ' + U.money(cost) + '.'); }
      }
      if (d.decay) u.q = Math.max(0.3, (u.q || 1) * 0.994);
      if (d.cat === 'realty') u.value *= 1 + 0.0002 + U.gauss(s) * 0.003;
      else if (d.cat === 'machine' || d.cat === 'energy') u.value *= 0.9993;
    }
    if (total > 0) E().earn(s, total, 'passive', 'Пассивный доход', true);
    else if (total < 0) { const need = -total; E().pay(s, Math.min(need, Math.max(0, E().available(s))), 'passive', 'Расходы на активы'); }
    s.c.passive = (s.c.passive || 0) + Math.max(0, total);
    rep.passive = Math.round(total);
  };

  // ─────────── Биржа
  I.mkt = function (s) {
    const m = s.fin.mkt;
    if (!m.p || !Object.keys(m.p).length) { m.p = {}; m.h = {}; D.stocks.forEach(x => { m.p[x.id] = x.price; m.h[x.id] = [x.price]; }); }
    if (!m.gold) { m.gold = 6800; m.gh = [6800]; }
    return m;
  };
  I.price = (s, id) => I.mkt(s).p[id];
  I.fee = s => P(s, 'investor') ? 0 : 0.003;
  I.openBroker = function (s) {
    if (!s.account) return SN.fail('Сначала откройте банковский счёт');
    s.fin.broker = true; Sys.log(s, 'Открыт брокерский счёт.');
    SN.say('📈 Брокерский счёт открыт. Покупки — со счёта в банке.', 'good');
    return SN.okr('');
  };
  I.buyStock = function (s, id, amt) {
    if (!s.fin.broker) return SN.fail('Нужен брокерский счёт');
    const p = I.price(s, id), fee = I.fee(s);
    const q = Math.floor(Math.min(amt, s.bank) / (p * (1 + fee)));
    if (q < 1) return SN.fail('Недостаточно средств на счёте для 1 акции (' + U.money(p) + ')');
    const cost = q * p, f = cost * fee;
    s.bank -= cost + f;
    const pos = s.fin.port[id] || (s.fin.port[id] = { q: 0, cost: 0 });
    pos.q += q; pos.cost += cost + f;
    E().ledger(s, 0, 'invest', 'Куплено ' + q + ' шт. ' + id + ' на ' + U.money(cost));
    Sys.quests.check(s);
    return SN.okr('Куплено ' + q + ' шт. ' + D.stockById[id].name);
  };
  I.sellStock = function (s, id, frac) {
    const pos = s.fin.port[id]; if (!pos || pos.q < 1) return SN.fail('Нет акций');
    const q = Math.max(1, Math.round(pos.q * frac)), p = I.price(s, id);
    const gross = q * p, fee = gross * I.fee(s), basis = pos.cost * q / pos.q;
    const profit = gross - fee - basis, tax = profit > 0 ? profit * I.TAX : 0;
    pos.cost -= basis; pos.q -= q; if (pos.q <= 0) delete s.fin.port[id];
    s.bank += gross - fee - tax;
    E().ledger(s, Math.round(profit - tax), 'invest', 'Продано ' + q + ' шт. ' + id + (tax ? ', налог ' + U.money(tax) : ''));
    return SN.okr('Продано на ' + U.money(gross - fee - tax) + (profit >= 0 ? ' (прибыль ' : ' (убыток ') + U.money(Math.abs(profit)) + ')');
  };
  I.portfolioValue = s => Object.entries(s.fin.port || {}).reduce((a, [id, p]) => a + p.q * (I.mkt(s).p[id] || 0), 0);
  I.portfolioCost = s => Object.values(s.fin.port || {}).reduce((a, p) => a + p.cost, 0);
  I.buyGold = function (s, amt) {
    if (!s.account) return SN.fail('Нужен счёт в банке');
    amt = Math.min(Math.floor(amt), s.bank); if (amt < 1000) return SN.fail('Минимум 1 000 ₽');
    const g = amt / (I.mkt(s).gold * 1.03); s.bank -= amt; s.fin.gold += g;
    E().ledger(s, 0, 'invest', 'Куплено золото ' + g.toFixed(1) + ' г');
    return SN.okr('Куплено ' + g.toFixed(1).replace('.', ',') + ' г золота');
  };
  I.sellGold = function (s) {
    if (s.fin.gold <= 0) return SN.fail('Нет золота');
    const v = s.fin.gold * I.mkt(s).gold * 0.97; s.fin.gold = 0; s.bank += v;
    E().ledger(s, 0, 'invest', 'Продано золото на ' + U.money(v));
    return SN.okr('Продано на ' + U.money(v));
  };
  I.BOND = { rate: 0.00035, days: 90, name: 'Облигации федерального займа (ОФЗ)' };
  I.buyBond = function (s, amt) {
    if (!s.fin.broker) return SN.fail('Нужен брокерский счёт');
    amt = Math.min(Math.floor(amt), s.bank); if (amt < 1000) return SN.fail('Минимум 1 000 ₽');
    s.bank -= amt; s.fin.bonds.push({ amt, end: T.day(s) + I.BOND.days, rate: I.BOND.rate });
    E().ledger(s, 0, 'invest', 'Куплены ОФЗ на ' + U.money(amt));
    return SN.okr('Куплено облигаций на ' + U.money(amt));
  };
  I.sellBond = function (s, i) {
    const b = s.fin.bonds[i]; if (!b) return SN.fail('Нет облигаций');
    s.fin.bonds.splice(i, 1); s.bank += b.amt * 0.985;
    return SN.okr('Продано досрочно за ' + U.money(b.amt * 0.985));
  };
  I.marketDaily = function (s, rep) {
    const m = I.mkt(s);
    const g = 0.0002 + U.gauss(s) * 0.007;
    let shock = null;
    if (U.chance(s, 0.09)) {
      const st = U.pick(s, D.stocks), up = U.chance(s, 0.55);
      shock = { sector: st.sector, mag: (up ? 1 : -1) * (0.04 + U.rand(s) * 0.1) };
      const txt = '📰 ' + D.sectorNews[st.sector][up ? 0 : 1] + ' (' + st.name + ' ' + (up ? '+' : '') + Math.round(shock.mag * 100) + '%)';
      s.fin.news.unshift({ d: T.day(s), t: txt }); s.fin.news = s.fin.news.slice(0, 12);
      if (s.fin.port[st.id]) rep.lines.push(txt);
    }
    for (const st of D.stocks) {
      let r = st.mu + st.beta * g + st.sigma * U.gauss(s) + (shock && shock.sector === st.sector ? shock.mag : 0);
      r = U.clamp(r, -0.25, 0.25);
      m.p[st.id] = Math.max(0.01, m.p[st.id] * (1 + r));
      const h = m.h[st.id] || (m.h[st.id] = []); h.push(+m.p[st.id].toPrecision(6)); if (h.length > 40) h.shift();
    }
    m.gold *= 1 + 0.0002 + U.gauss(s) * 0.006; m.gh.push(Math.round(m.gold)); if (m.gh.length > 40) m.gh.shift();
    // Дивиденды раз в 30 дней
    if (T.day(s) % 30 === 0) {
      let div = 0;
      for (const [id, pos] of Object.entries(s.fin.port)) { const st = D.stockById[id]; if (st && st.div) div += pos.q * m.p[id] * st.div / 12; }
      div *= (P(s, 'investor') ? 1.1 : 1) * (1 - I.TAX);
      if (div > 1) { E().earn(s, div, 'invest', 'Дивиденды', true); rep.lines.push('💰 Дивиденды по акциям: ' + U.money(div) + ' (после налога).'); }
    }
    // Облигации: купон ежедневно, погашение
    let coupon = 0;
    s.fin.bonds = s.fin.bonds.filter(b => {
      coupon += b.amt * b.rate;
      if (T.day(s) >= b.end) { s.bank += b.amt; rep.lines.push('ОФЗ погашены: ' + U.money(b.amt) + ' вернулись на счёт.'); return false; }
      return true;
    });
    if (coupon > 0) E().earn(s, coupon * (1 - I.TAX), 'invest', 'Купоны ОФЗ', true);
  };

  // ─────────── Срочные вклады
  I.TERMS = [{ days: 30, rate: 0.0005 }, { days: 90, rate: 0.0006 }, { days: 180, rate: 0.0007 }];
  I.termRate = (s, k) => I.TERMS[k].rate * (P(s, 'banker') ? 1.2 : 1);
  I.openTerm = function (s, k, amt) {
    amt = Math.min(Math.floor(amt), s.bank); if (amt < 5000) return SN.fail('Минимум 5 000 ₽ со счёта');
    s.bank -= amt; s.fin.terms.push({ amt, acc: 0, rate: I.termRate(s, k), end: T.day(s) + I.TERMS[k].days, days: I.TERMS[k].days });
    E().ledger(s, 0, 'bank', 'Открыт вклад на ' + I.TERMS[k].days + ' дн.: ' + U.money(amt));
    return SN.okr('Вклад открыт');
  };
  I.closeTerm = function (s, i) {
    const t = s.fin.terms[i]; if (!t) return SN.fail('Нет вклада');
    s.fin.terms.splice(i, 1); s.bank += t.amt;
    return SN.okr('Вклад закрыт досрочно: проценты сгорели, возвращено ' + U.money(t.amt));
  };
  I.termsDaily = function (s, rep) {
    s.fin.terms = s.fin.terms.filter(t => {
      t.acc += (t.amt + t.acc) * t.rate;
      if (T.day(s) >= t.end) { const v = t.amt + t.acc; s.bank += v; s.today.inc += t.acc; E().ledger(s, t.acc, 'bank', 'Проценты по вкладу'); rep.lines.push('🐷 Вклад на ' + t.days + ' дн. закрыт: +' + U.money(t.acc) + ' процентов.'); return false; }
      return true;
    });
  };

  // ─────────── Ипотека
  I.MORT_DAYS = 720;
  I.annuity = (L, r, n) => L * r / (1 - Math.pow(1 + r, -n));
  I.mortQuote = function (s, price) {
    const rate = 0.00025 * I.scoreMult(s) * (P(s, 'banker') ? 0.85 : 1);
    const down = Math.ceil(price * 0.2), loan = price - down;
    const pay = Math.ceil(I.annuity(loan, rate, I.MORT_DAYS));
    const q = { down, loan, pay, rate, days: I.MORT_DAYS, why: '' };
    const sc = I.score(s);
    if (!s.account) q.why = 'Нужен банковский счёт';
    else if (sc < 560) q.why = 'Кредитный рейтинг ' + sc + ' — нужно 560+';
    else if (!s.job && !s.biz.length && !s.passive.length) q.why = 'Нужен подтверждённый доход';
    else {
      const inc = Math.max(Sys.fin.avgIncome(s), I.passivePerDay(s)), busy = s.fin.mort.reduce((a, m) => a + m.pay, 0);
      if (pay + busy > inc * 0.6) q.why = 'Платёж ' + U.money(pay) + '/день больше 60% дохода (' + U.money(inc) + '/день)';
    }
    return q;
  };
  I.addMort = function (s, q, kind, ref, name) {
    s.fin.mort.push({ kind, ref, name, left: q.loan, pay: q.pay, rate: q.rate, missed: 0, start: T.day(s) });
    E().ledger(s, q.loan, 'loan', 'Ипотека: ' + name);
  };
  I.mortRepay = function (s, i, amt) {
    const m = s.fin.mort[i]; if (!m) return SN.fail('Нет ипотеки');
    amt = Math.min(Math.ceil(amt), Math.ceil(m.left));
    if (!E().pay(s, amt, 'loan', 'Досрочное погашение ипотеки')) return SN.fail('Не хватает денег');
    m.left -= amt;
    if (m.left < 1) { s.fin.mort.splice(i, 1); s.flags.mortRepaid = true; Sys.log(s, 'Ипотека погашена: ' + m.name + '.'); Sys.quests.check(s); return SN.okr('Ипотека полностью погашена!'); }
    m.pay = Math.ceil(I.annuity(m.left, m.rate, Math.max(10, I.MORT_DAYS - (T.day(s) - m.start))));
    return SN.okr('Погашено ' + U.money(amt) + '. Новый платёж ' + U.money(m.pay) + '/день');
  };
  I.mortDaily = function (s, rep) {
    for (const m of s.fin.mort.slice()) {
      const interest = m.left * m.rate;
      if (E().pay(s, m.pay, 'loan', 'Платёж по ипотеке')) {
        m.left -= m.pay - interest; m.missed = 0; s.fin.goodPays = (s.fin.goodPays || 0) + 1;
        if (m.left <= 1) { s.fin.mort = s.fin.mort.filter(x => x !== m); s.flags.mortRepaid = true; rep.lines.push('🏦 Ипотека погашена: ' + m.name + '!'); }
      } else {
        m.missed++; s.fin.badPays = (s.fin.badPays || 0) + 1; m.left += interest + m.pay * 0.02;
        rep.lines.push('⚠️ Не хватило на платёж по ипотеке (' + U.money(m.pay) + '). Просрочка ' + m.missed + '/14 дн.');
        if (m.missed >= 14) I.seize(s, m, rep);
      }
    }
  };
  I.seize = function (s, m, rep) {
    let sale = 0;
    if (m.kind === 'passive') { const u = s.passive.find(x => x.uid === m.ref); if (u) { sale = u.value * 0.7; s.passive = s.passive.filter(x => x !== u); } }
    else if (m.kind === 'home' && s.housing === m.ref) { sale = D.housing[m.ref].price * 0.7; s.housing = 'street'; s.rentPaid = 0; }
    s.fin.mort = s.fin.mort.filter(x => x !== m);
    const rest = sale - m.left;
    if (rest > 0) E().earn(s, rest, 'loan', 'Остаток после продажи залога');
    s.rep = U.clamp(s.rep - 10);
    rep.lines.push('🏦 Банк забрал залог «' + m.name + '» за долги и продал его. ' + (rest > 0 ? 'Вам вернули ' + U.money(rest) + '.' : 'Денег от продажи едва хватило на долг.'));
  };

  // ─────────── Страхование, карты, копилка
  I.INS = { health: { name: 'ДМС — медицинская страховка', icon: '🩺', fee: () => 1800, desc: 'Платная клиника бесплатно, болезни проходят быстрее.' },
    property: { name: 'Страхование имущества', icon: '🛡️', fee: s => Math.max(500, Math.round((I.passiveValue(s) + (D.housing[s.housing].type === 'own' ? D.housing[s.housing].price : 0)) * 0.0003)), desc: 'Ремонты, поломки и порча арендаторами — за счёт страховой.' } };
  I.CARDS = { basic: { name: 'Дебетовая карта', cb: 0.005, fee: 0 }, premium: { name: 'Премиальная карта', cb: 0.02, fee: 1500, score: 650 } };
  I.setCard = function (s, k) {
    if (k === 'premium' && I.score(s) < 650) return SN.fail('Нужен кредитный рейтинг 650');
    s.fin.card = k; return SN.okr('Карта: ' + I.CARDS[k].name);
  };
  I.toggleIns = function (s, k) {
    if (!s.account) return SN.fail('Нужен банковский счёт');
    s.fin.ins[k] = !s.fin.ins[k];
    if (s.fin.ins[k] && !E().pay(s, I.INS[k].fee(s), 'bank', 'Страховка: ' + I.INS[k].name)) { s.fin.ins[k] = false; return SN.fail('Не хватает на первый взнос'); }
    return SN.okr(s.fin.ins[k] ? 'Страховка оформлена (списание раз в неделю)' : 'Страховка отключена');
  };
  I.cashbackOn = (s, amt, cat) => { if (s.account && !['housing', 'loan', 'business', 'invest', 'bank', 'passive', 'gift'].includes(cat)) s.fin.cb = (s.fin.cb || 0) + amt * I.CARDS[s.fin.card || 'basic'].cb; };
  I.autosaveOn = function (s, amt, cat, toBank) {
    const pct = s.fin.autosave || 0;
    if (!pct || !s.account || !['work', 'business', 'passive'].includes(cat)) return;
    const x = Math.floor(amt * pct / 100);
    if (toBank && s.account) { const y = Math.min(x, s.bank); s.bank -= y; s.fin.deposit += y; }
    else { const y = Math.min(x, s.money); s.money -= y; s.fin.deposit += y; }
  };
  I.serviceDaily = function (s, rep) {
    if (s.fin.cb >= 1) { s.bank += s.fin.cb; s.today.inc += s.fin.cb; E().ledger(s, s.fin.cb, 'bank', 'Кешбэк'); s.fin.cb = 0; }
    if (T.day(s) % 7 !== 0) return;
    for (const k in I.INS) if (s.fin.ins[k] && !E().pay(s, I.INS[k].fee(s), 'bank', 'Страховка: ' + I.INS[k].name)) { s.fin.ins[k] = false; rep.lines.push('Страховка «' + I.INS[k].name + '» отключена: не хватило на взнос.'); }
    const c = I.CARDS[s.fin.card || 'basic'];
    if (c.fee && !E().pay(s, c.fee, 'bank', 'Обслуживание премиальной карты')) s.fin.card = 'basic';
  };

  // ─────────── Рейтинг богачей
  I.richList = function (s) {
    const d = T.day(s);
    const list = D.rich.map(r => ({ name: r.name, icon: r.icon, what: r.what, w: r.w * Math.pow(1 + r.g, d) }));
    list.push({ name: s.hero.name + ' (вы)', icon: '⭐', what: 'начинал с нуля', w: Sys.fin.netWorth(s), me: true });
    return list.sort((a, b) => b.w - a.w);
  };
  I.richRank = s => I.richList(s).findIndex(x => x.me) + 1;

  I.daily = function (s, rep) {
    I.passiveDaily(s, rep);
    I.marketDaily(s, rep);
    I.termsDaily(s, rep);
    I.mortDaily(s, rep);
    I.serviceDaily(s, rep);
    s.nwHist.push(Sys.fin.netWorth(s)); if (s.nwHist.length > 120) s.nwHist.shift();
  };
})(typeof window !== 'undefined' ? window : globalThis);
