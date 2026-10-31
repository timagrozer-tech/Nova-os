/* Имущество и жильё: аренда с залогом, покупка/продажа, коммуналка, вещи и одежда */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const E = () => Sys.econ;
  const P = Sys.prop = {};

  P.checkHome = function (s, id) {
    const h = D.housing[id];
    if (s.housing === id) return 'Вы уже здесь живёте';
    const rf = E().reqFail(s, h.req); if (rf) return rf;
    const need = h.type === 'rent' ? h.weekly + h.deposit : h.price;
    const refund = P.refundValue(s);
    if (!E().canPay(s, need - refund)) return 'Нужно ' + U.money(need) + (refund ? ' (с учётом возврата ' + U.money(refund) + ')' : '');
    return '';
  };
  /* Сколько вернётся при переезде: залог (если без долгов) или 85% стоимости своего жилья */
  P.refundValue = function (s) {
    const cur = D.housing[s.housing];
    if (cur.type === 'rent') return s.rentDebt > 0 ? 0 : s.deposit;
    if (cur.type === 'own') return Math.round(cur.price * 0.85);
    return 0;
  };
  P.moveOut = function (s) {
    const cur = D.housing[s.housing]; const refund = P.refundValue(s);
    if (refund) E().earn(s, refund, 'housing', cur.type === 'own' ? 'Продажа: ' + cur.name : 'Возврат залога');
    s.housing = 'street'; s.deposit = 0; s.rentPaid = 0; s.rentDebt = 0;
    if (s.partner && s.npc[s.partner] && s.npc[s.partner].livingTogether) { s.npc[s.partner].livingTogether = false; }
    return refund;
  };
  P.takeHome = function (s, id) {
    const why = P.checkHome(s, id); if (why) return SN.fail(why);
    const h = D.housing[id];
    if (s.housing !== 'street') P.moveOut(s);
    if (h.type === 'rent') {
      E().pay(s, h.weekly + h.deposit, 'housing', 'Аренда + залог: ' + h.name);
      s.deposit = h.deposit; s.rentPaid = T.day(s) + 7;
    } else {
      E().pay(s, h.price, 'housing', 'Покупка: ' + h.name);
      s.rentPaid = T.day(s) + 7;
    }
    s.housing = id; s.rentDebt = 0;
    T.advance(s, 120, { indoor: true });
    Sys.log(s, (h.type === 'rent' ? 'Сняли жильё: ' : 'Купили жильё: ') + h.name + '.');
    Sys.quests.check(s);
    SN.say(h.icon + ' Новый адрес: ' + h.name, 'good');
    return SN.okr(h.name);
  };
  P.leave = function (s) {
    if (s.housing === 'street') return SN.fail('Вам некуда съезжать');
    const name = D.housing[s.housing].name, r = P.moveOut(s);
    Sys.log(s, 'Вы съехали: ' + name + (r ? ', получено ' + U.money(r) : '') + '.');
    return SN.okr('Вы съехали. ' + (r ? 'Возврат: ' + U.money(r) : ''));
  };

  /* Еженедельные платежи: аренда/коммуналка + обслуживание техники */
  P.weeklyBill = function (s) {
    const h = D.housing[s.housing];
    let sum = h.type === 'rent' ? h.weekly : h.type === 'own' ? h.upkeep : 0;
    s.items.forEach(i => { if (D.items[i].upkeep) sum += D.items[i].upkeep; });
    return Math.round(sum * (s.partner && s.npc[s.partner] && s.npc[s.partner].livingTogether ? 0.6 : 1));
  };
  P.daily = function (s, rep) {
    const day = T.day(s);
    const hasBills = s.housing !== 'street' || s.items.some(i => D.items[i].upkeep);
    if (!hasBills) return;
    if (!s.rentPaid) s.rentPaid = day + 7;
    if (day < s.rentPaid) return;
    const bill = P.weeklyBill(s);
    if (E().pay(s, bill, 'housing', 'Еженедельные платежи')) {
      s.rentPaid = day + 7;
      if (s.rentDebt) rep.lines.push('Долг по жилью погашен.');
      s.rentDebt = 0;
      rep.lines.push('Списаны платежи за неделю (жильё и обслуживание): ' + U.money(bill) + '.');
      return;
    }
    s.rentDebt++;
    if (D.housing[s.housing].type === 'rent') {
      if (s.rentDebt >= 4) {
        rep.lines.push('Вас выселили за неуплату. Залог ушёл в счёт долга. Ночлежка в Старом районе принимает бесплатно.');
        s.deposit = 0; s.housing = 'street'; s.rentPaid = 0; s.rentDebt = 0; s.rep = U.clamp(s.rep - 5);
      } else rep.lines.push('⚠️ Нечем платить за жильё (' + U.money(bill) + '). Просрочка ' + s.rentDebt + ' дн. из 3 — затем выселение.');
    } else {
      s.st.mood = U.clamp(s.st.mood - 4);
      rep.lines.push('⚠️ Не хватает на коммуналку и обслуживание (' + U.money(bill) + '). Долг растёт, репутация падает.');
      s.rep = U.clamp(s.rep - 1);
    }
  };

  P.itemPrice = (s, id) => Math.round(D.items[id].price * (s.flags.discountDay === T.day(s) ? 0.75 : 1));
  P.buyItem = function (s, id) {
    const it = D.items[id];
    if (s.items.includes(id)) return SN.fail('Уже есть');
    if (it.needHome && s.housing === 'street') return SN.fail('Сначала нужно жильё');
    const p = P.itemPrice(s, id);
    if (!E().pay(s, p, 'items', it.name)) return SN.fail('Нужно ещё ' + U.money(p - E().available(s)));
    s.items.push(id);
    if (id === 'phone') delete s.flags.phoneBroken;
    T.advance(s, 30, { indoor: true });
    Sys.stats.apply(s, { mood: id === 'sportcar' ? 30 : 5 });
    Sys.log(s, 'Покупка: ' + it.name + ' (' + U.money(p) + ').');
    Sys.quests.check(s);
    SN.say(it.icon + ' Куплено: ' + it.name, 'good');
    return SN.okr(it.name);
  };
  P.sellItem = function (s, id) {
    const it = D.items[id];
    if (!s.items.includes(id)) return SN.fail('Нет такой вещи');
    const v = Math.round(it.price * it.sell);
    s.items = s.items.filter(x => x !== id);
    E().earn(s, v, 'items', 'Продажа: ' + it.name);
    Sys.log(s, 'Продано: ' + it.name + ' за ' + U.money(v) + '.');
    SN.say('Продано за ' + U.money(v), 'good');
    return SN.okr('');
  };
  P.clothPrice = (s, id) => Math.round(D.clothes[id].price * (s.flags.discountDay === T.day(s) ? 0.7 : 1));
  P.buyClothes = function (s, id) {
    const c = D.clothes[id];
    if (s.clothes.includes(id)) return SN.fail('Уже есть');
    if (!c.price) return SN.fail('Эту одежду выдают в пункте помощи соццентра');
    const p = P.clothPrice(s, id);
    if (!E().pay(s, p, 'items', c.name)) return SN.fail('Нужно ещё ' + U.money(p - E().available(s)));
    s.clothes.push(id); s.wear = id;
    s.st.mood = U.clamp(s.st.mood + 6);
    Sys.quests.check(s);
    SN.say(c.icon + ' Обновка надета: ' + c.name, 'good');
    return SN.okr('');
  };
  P.wear = function (s, id) {
    if (!s.clothes.includes(id)) return SN.fail('Нет такой одежды');
    s.wear = id; return SN.okr('Надето: ' + D.clothes[id].name);
  };
})(typeof window !== 'undefined' ? window : globalThis);
