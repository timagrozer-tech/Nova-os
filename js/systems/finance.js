/* Финансы: счёт и карта, вклад, кредит, инвестиции, история операций */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const E = () => Sys.econ;
  const F = Sys.fin = {};
  F.DEP_RATE = 0.0004;      // 0,04% в день ≈ 15,7% годовых
  F.LOAN_RATE = 0.0008;     // 0,08% в день ≈ 34% годовых (снижается навыком «Финансы»)
  F.LOAN_TERM = 60;
  F.FUNDS = {
    index:  { name: 'Индексный фонд', icon: '📈', mu: 0.0005, sigma: 0.012, risk: 'Средний риск. Может падать на 10–20% за месяц, но в долгую обычно растёт.' },
    crypto: { name: 'Криптовалюта', icon: '🪙', mu: 0.0002, sigma: 0.06, risk: 'Очень высокий риск: за неделю можно потерять половину вложенного.' }
  };

  F.openAccount = function (s) {
    if (s.account) return SN.fail('Счёт уже открыт');
    if (!s.docs.passport) return SN.fail('Для открытия счёта нужен паспорт');
    if (s.district !== 'business') { const r = Sys.city.travel(s, 'business'); if (!r.ok) return r; }
    if (!T.isOpen(s, [9, 20], 1)) return SN.fail('Банк работает с 09:00 до 20:00');
    T.advance(s, 60, { indoor: true });
    s.account = true;
    if (s.bank > 0) Sys.log(s, 'Остаток прежнего счёта переведён.');
    Sys.log(s, 'Открыт банковский счёт с картой.');
    Sys.quests.check(s);
    SN.say('🏦 Счёт открыт. Зарплата будет приходить на карту, картой можно платить везде.', 'good');
    return SN.okr('');
  };
  F.toBank = function (s, amt) {
    if (!s.account) return SN.fail('Нет счёта');
    amt = Math.min(Math.floor(amt), s.money);
    if (amt <= 0) return SN.fail('Нет наличных');
    s.money -= amt; s.bank += amt; E().ledger(s, 0, 'bank', 'Внесено на счёт ' + U.money(amt));
    Sys.quests.check(s);
    return SN.okr('Внесено ' + U.money(amt));
  };
  F.toCash = function (s, amt) {
    if (!s.account) return SN.fail('Нет счёта');
    amt = Math.min(Math.floor(amt), s.bank);
    if (amt <= 0) return SN.fail('На счёте пусто');
    s.bank -= amt; s.money += amt; E().ledger(s, 0, 'bank', 'Снято со счёта ' + U.money(amt));
    return SN.okr('Снято ' + U.money(amt));
  };
  F.depositPut = function (s, amt) {
    amt = Math.min(Math.floor(amt), s.bank);
    if (!s.account || amt <= 0) return SN.fail('Пополнить вклад можно со счёта');
    s.bank -= amt; s.fin.deposit += amt; s.c.saved = (s.c.saved || 0) + amt;
    Sys.quests.check(s);
    return SN.okr('На вклад: ' + U.money(amt));
  };
  F.depositTake = function (s, amt) {
    amt = Math.min(Math.floor(amt), Math.floor(s.fin.deposit));
    if (amt <= 0) return SN.fail('Вклад пуст');
    s.fin.deposit -= amt; s.bank += amt;
    return SN.okr('Со вклада: ' + U.money(amt));
  };
  F.loanRate = s => F.LOAN_RATE * (1 - s.sk.finance / 200) * (Sys.inv ? Sys.inv.scoreMult(s) : 1) * (SN.perk(s, 'banker') ? 0.85 : 1);
  F.avgIncome = s => { const d = s.days.slice(0, 7); return d.length ? d.reduce((a, x) => a + x.inc, 0) / d.length : 0; };
  F.loanLimit = function (s) {
    if (!s.account || !s.docs.passport) return 0;
    if (!s.job && !s.biz.length) return 0;
    if (s.rep < 15 || s.fin.loan > 0) return 0;
    const sc = Sys.inv ? Sys.inv.score(s) : 600;
    if (sc < 500) return 0;
    return Math.max(0, Math.floor(Math.min(s.rep * 4000 * sc / 600, F.avgIncome(s) * 20 * sc / 600 + (s.job ? 10000 : 0)) / 1000) * 1000);
  };
  F.loanWhy = function (s) {
    if (!s.account) return 'Нужен банковский счёт';
    if (!s.job && !s.biz.length) return 'Нужен официальный доход: работа или бизнес';
    if (s.rep < 15) return 'Нужна репутация 15';
    if (s.fin.loan > 0) return 'Сначала погасите текущий кредит';
    return '';
  };
  F.takeLoan = function (s, amt) {
    const lim = F.loanLimit(s);
    amt = Math.floor(amt);
    if (amt <= 0 || amt > lim) return SN.fail('Доступный лимит: ' + U.money(lim));
    s.fin.loan = amt; s.fin.loanStart = T.day(s); s.fin.loanDue = T.day(s) + F.LOAN_TERM;
    s.bank += amt;
    E().ledger(s, amt, 'loan', 'Кредит получен');
    Sys.log(s, 'Взят кредит ' + U.money(amt) + ' на ' + F.LOAN_TERM + ' дней.');
    return SN.okr('Кредит зачислен на счёт');
  };
  F.repay = function (s, amt) {
    amt = Math.min(Math.ceil(amt), Math.ceil(s.fin.loan));
    if (amt <= 0) return SN.fail('Нет долга');
    if (!E().pay(s, amt, 'loan', 'Погашение кредита')) return SN.fail('Не хватает денег');
    s.fin.loan = Math.max(0, s.fin.loan - amt);
    if (s.fin.loan < 1) { s.fin.loan = 0; s.flags.loanRepaid = true; s.rep = U.clamp(s.rep + 4); Sys.log(s, 'Кредит полностью погашен.'); }
    Sys.quests.check(s);
    return SN.okr('Погашено ' + U.money(amt));
  };
  F.buyFund = function (s, id, amt) {
    amt = Math.min(Math.floor(amt), s.bank);
    if (!s.account || amt <= 0) return SN.fail('Покупка фондов — со счёта в банке');
    s.bank -= amt; s.fin.funds[id] = (s.fin.funds[id] || 0) + amt;
    E().ledger(s, 0, 'invest', 'Куплено: ' + F.FUNDS[id].name + ' на ' + U.money(amt));
    Sys.quests.check(s);
    return SN.okr('Инвестировано ' + U.money(amt));
  };
  F.sellFund = function (s, id) {
    const v = Math.floor(s.fin.funds[id] || 0);
    if (v <= 0) return SN.fail('Нет вложений');
    s.fin.funds[id] = 0; s.bank += v;
    E().ledger(s, 0, 'invest', 'Продано: ' + F.FUNDS[id].name + ' на ' + U.money(v));
    return SN.okr('Продано на ' + U.money(v));
  };

  F.daily = function (s, rep) {
    const f = s.fin;
    if (f.deposit > 0) { const i = f.deposit * F.DEP_RATE * (SN.perk(s, 'banker') ? 1.2 : 1); f.deposit += i; f.depIncome = (f.depIncome || 0) + i; }
    if (f.loan > 0) {
      const overdue = T.day(s) > f.loanDue;
      f.loan += f.loan * (overdue ? 0.002 : F.loanRate(s));
      if (overdue) {
        s.rep = U.clamp(s.rep - 1); s.st.stress = U.clamp(s.st.stress + 4); f.badPays = (f.badPays || 0) + 1;
        rep.lines.push('⚠️ Кредит просрочен: ' + U.money(f.loan) + '. Пени растут, репутация падает.');
      } else if (f.loanDue - T.day(s) === 7) rep.lines.push('До погашения кредита 7 дней. Остаток ' + U.money(f.loan) + '.');
    }
    for (const id in F.FUNDS) {
      if (f.funds[id] > 0) {
        const fd = F.FUNDS[id];
        const ch = Math.max(-0.35, fd.mu + U.gauss(s) * fd.sigma);
        f.funds[id] = Math.max(0, f.funds[id] * (1 + ch));
      }
    }
    f.history.unshift({ d: T.day(s) - 1, cash: s.money, bank: s.bank + f.deposit });
    f.history = f.history.slice(0, 30);
  };
  const f2 = s => s.fin;
  F.netWorth = function (s) {
    let w = s.money + s.bank + s.fin.deposit + (s.fin.funds.index || 0) + (s.fin.funds.crypto || 0) - s.fin.loan;
    s.items.forEach(i => w += Sys.prop.itemValue(s, i));
    const h = D.housing[s.housing];
    if (h.type === 'own') w += h.price * 0.85; else w += s.deposit;
    s.biz.forEach(b => w += Sys.biz.sellValue(s, b));
    if (Sys.inv) {
      w += Sys.inv.passiveValue(s) + Sys.inv.portfolioValue(s) + (f2(s).gold || 0) * (Sys.inv.mkt(s).gold || 0) * 0.97;
      f2(s).bonds.forEach(b => w += b.amt); f2(s).terms.forEach(t => w += t.amt + t.acc);
      f2(s).mort.forEach(m => w -= m.left);
    }
    return Math.round(w);
  };
})(typeof window !== 'undefined' ? window : globalThis);
