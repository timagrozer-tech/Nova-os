/* Экономика: кошелёк, карта, журнал операций, цены района, проверки требований,
   передвижение по городу и универсальный исполнитель действий. */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;

  Sys.log = (s, t) => { s.log.unshift({ d: T.day(s), h: T.clock(s), t }); s.log = s.log.slice(0, 120); };

  const E = Sys.econ = {};
  /* Доступно к оплате: наличные + карта (если открыт счёт) */
  E.available = s => s.money + (s.account ? s.bank : 0);
  E.canPay = (s, x) => E.available(s) >= x;
  E.ledger = (s, amt, cat, note) => {
    s.fin.ledger.unshift({ d: T.day(s), h: T.clock(s), a: Math.round(amt), c: cat, n: note });
    s.fin.ledger = s.fin.ledger.slice(0, 120);
  };
  E.pay = function (s, amt, cat, note) {
    amt = Math.round(amt);
    if (amt <= 0) return true;
    if (!E.canPay(s, amt)) return false;
    const cash = Math.min(s.money, amt);
    s.money -= cash; s.bank -= (amt - cash);
    s.today.exp += amt; s.c.spent += amt;
    if (Sys.inv) Sys.inv.cashbackOn(s, amt, cat);
    E.ledger(s, -amt, cat, note);
    return true;
  };
  /* toBank — зарплата на карту при официальном трудоустройстве */
  E.earn = function (s, amt, cat, note, toBank) {
    amt = Math.round(amt);
    if (amt <= 0) return;
    if (toBank && s.account) s.bank += amt; else s.money += amt;
    s.today.inc += amt; s.c.earned += amt;
    E.ledger(s, amt, cat, note);
    if (Sys.inv) Sys.inv.autosaveOn(s, amt, cat, toBank);
  };
  /* Цена с учётом района и городской инфляции */
  E.price = (s, base, district, fixed) => fixed ? base : Math.round(base * (D.districts[district] ? D.districts[district].priceMult : 1) * s.prices * (SN.perk(s, 'thrifty') ? 0.95 : 1) / 5) * 5;

  /* Проверка требований. Возвращает текст причины или '' */
  E.reqFail = function (s, r) {
    if (!r) return '';
    for (const d of r.docs || []) if (!s.docs[d]) return 'Нужен документ: ' + D.docNames[d];
    for (const c of r.certs || []) if (!s.certs.includes(c)) return 'Нужно обучение: ' + D.certNames[c];
    for (const k in r.skills || {}) if (s.sk[k] < r.skills[k]) return 'Нужен навык «' + D.skillNames[k] + '» ' + r.skills[k] + ' (сейчас ' + Math.floor(s.sk[k]) + ')';
    for (const i of r.items || []) if (!Sys.prop.has(s, i)) return 'Нужно: ' + D.items[i].name.toLowerCase();
    if (r.rep && s.rep < r.rep) return 'Нужна репутация ' + r.rep;
    if (r.look && Sys.stats.look(s) < r.look) return 'Нужен более опрятный вид (одежда/гигиена)';
    if (r.hygiene && s.st.hygiene < r.hygiene) return 'Слишком неопрятный вид — нужна гигиена ' + r.hygiene;
    if (r.flag && !s.flags[r.flag]) return 'Сейчас недоступно';
    if (r.any && !r.any.some(x => !E.reqFail(s, x))) return E.reqFail(s, r.any[0]);
    return '';
  };

  // ── Город и транспорт
  const C = Sys.city = {};
  C.modeAvailable = function (s, id) {
    const t = D.transport[id];
    if (t.item && !Sys.prop.has(s, t.item)) return false;
    if (t.doc && !s.docs[t.doc]) return false;
    if (t.open && !T.isOpen(s, t.open)) return false;
    return true;
  };
  /* Выбор транспорта: явная настройка игрока или «авто» — разумный выбор по деньгам */
  C.pickMode = function (s) {
    const pref = s.settings.transport;
    if (pref !== 'auto' && C.modeAvailable(s, pref) && E.canPay(s, D.transport[pref].cost)) return pref;
    const order = E.available(s) > 3000 ? ['moto', 'car', 'metro', 'scooter', 'bike', 'bus', 'walk'] : ['scooter', 'bike', 'bus', 'walk'];
    for (const id of order) if (C.modeAvailable(s, id) && E.canPay(s, D.transport[id].cost) && !(id === 'bus' && E.available(s) < 400)) return id;
    return 'walk';
  };
  C.travelInfo = (s, to) => { if (to === s.district) return null; const m = C.pickMode(s); return Object.assign({ id: m }, D.transport[m]); };
  C.travel = function (s, to, modeId) {
    if (!D.districts[to] || to === s.district) return SN.okr('');
    const m = modeId || C.pickMode(s), t = D.transport[m];
    if (!C.modeAvailable(s, m)) return SN.fail(t.name + ' сейчас недоступен.');
    if (t.cost && !E.pay(s, t.cost, 'transport', t.name + ' → ' + D.districts[to].name)) return SN.fail('Не хватает денег на ' + t.name.toLowerCase() + '.');
    // Даже без сил до места можно добрести — медленнее. Тупиков нет.
    const tired = s.st.energy < t.energy;
    s.st.energy = U.clamp(s.st.energy - t.energy);
    T.advance(s, t.mins * (tired ? 1.5 : 1) * (SN.perk(s, 'driver') ? 0.75 : 1), { indoor: m !== 'walk' && m !== 'bike' });
    s.district = to;
    s.flags['visited_' + to] = true;
    if (m === 'walk') Sys.stats.gain(s, { physical: 0.2 });
    return SN.okr(t.icon + ' ' + D.districts[to].name);
  };
  C.etaMins = (s, dest) => dest && dest !== s.district ? D.transport[C.pickMode(s)].mins * (SN.perk(s, 'driver') ? 0.75 : 1) : 0;
  C.hoursLabel = o => String(o[0]).padStart(2, '0') + ':00–' + String(o[1] % 24).padStart(2, '0') + ':00';
  C.homeDistrict = s => s.housing === 'street' ? null : D.housing[s.housing].district;
  /* Куда нужно ехать для действия: null — можно здесь */
  C.needTravel = function (s, where) {
    if (!where || where === 'any') return null;
    if (where === 'home') return C.homeDistrict(s) === s.district ? null : C.homeDistrict(s);
    if (Array.isArray(where)) return where.includes(s.district) ? null : where[0];
    return where === s.district ? null : where;
  };

  // ── Универсальное действие из D.actions
  const A = Sys.act = {};
  A.cost = (s, a) => E.price(s, a.cost || 0, Array.isArray(a.where) ? s.district : (a.where === 'any' || a.where === 'home' ? s.district : a.where), a.fixed);
  A.check = function (s, a) {
    if (a.where === 'home' && s.housing === 'street') return 'Нужно жильё';
    if (a.special === 'cook' && !(D.housing[s.housing].kitchen || s.items.includes('stove'))) return 'Нужна кухня или плитка';
    if (a.special === 'cook' && s.groceries < 1) return 'Нет продуктов';
    const rf = E.reqFail(s, a.req); if (rf) return rf;
    if (a.daily && (s.daily[a.id] || 0) >= a.daily) return 'Уже было сегодня';
    if (a.special === 'charityClothes' && s.lastDone.charity && T.day(s) - s.lastDone.charity < 14) return 'Следующая выдача через ' + (14 - (T.day(s) - s.lastDone.charity)) + ' дн.';
    if (a.special === 'trip' && s.lastDone.trip && T.day(s) - s.lastDone.trip < 14) return 'Недавно путешествовали';
    if (a.special === 'docPassport' && (s.docs.passport || s.docsPending.passport)) return s.docs.passport ? 'Паспорт уже есть' : 'Паспорт готовится';
    if (a.special === 'docOms' && (s.docs.oms || s.docsPending.oms)) return s.docs.oms ? 'Полис уже есть' : 'Полис готовится';
    if (a.special === 'docMedbook' && s.docs.medbook) return 'Медкнижка уже есть';
    if (a.special === 'docIp' && (s.docs.ip || s.docsPending.ip)) return s.docs.ip ? 'ИП уже открыто' : 'Регистрация идёт';
    if (a.energy && s.st.energy < a.energy) return 'Мало энергии';
    if (s.ill && Sys.stats.ILL[s.ill.id].noHeavy && (a.energy || 0) >= 14) return 'Травма: тяжёлые нагрузки нельзя';
    return '';
  };
  A.run = function (s, id) {
    const a = D.actionById[id];
    if (!a) return SN.fail('Неизвестное действие');
    const why = A.check(s, a); if (why) return SN.fail(why);
    if (a.special === 'nap') return Sys.stats.nap(s);
    const dest = C.needTravel(s, a.where);
    if (a.open && !T.isOpen(s, a.open, a.hours, C.etaMins(s, dest))) return SN.fail('Закрыто к вашему приходу. Часы: ' + C.hoursLabel(a.open));
    if (dest) { const r = C.travel(s, dest); if (!r.ok) return r; }
    let cost = A.cost(s, a);
    if (a.special === 'docPassport') cost = s.flags.ninaReferral ? 0 : 1500;
    if (a.id === 'clinic' && s.fin.ins && s.fin.ins.health) cost = 0;
    if (cost && !E.pay(s, cost, a.cat, a.name)) return SN.fail('Не хватает ' + U.money(cost - E.available(s)));
    if (a.energy) s.st.energy = U.clamp(s.st.energy - a.energy);
    T.advance(s, a.hours * 60, { indoor: a.indoor });
    let extra = '';
    if (a.special === 'fishing') { s.c.actions++; SN.emit('minigame', 'fishing'); return SN.okr(''); }
    if (a.special && A.specials[a.special]) extra = A.specials[a.special](s, a) || '';
    let mult = 1;
    if (a.id === 'sportground' || a.id === 'gym') mult = s.wear === 'sport' ? 1.2 : 1;
    Sys.stats.apply(s, a.eff, a.id === 'cookhome' && s.items.includes('kitchen') ? 1.3 : 1);
    Sys.stats.gain(s, a.gain, mult, a.cap);
    if (a.cat === 'food' && a.eff && a.eff.food) s.c.meals++;
    if (a.cat === 'fun' || a.cat === 'skills') s.c.fun = (s.c.fun || 0) + 1;
    if (a.eff && a.eff.hygiene >= 50) s.c.wash = (s.c.wash || 0) + 1;
    if (a.risk === 'poison' && !SN.perk(s, 'ironstomach') && U.chance(s, 0.04)) Sys.stats.getIll(s, 'poison');
    s.daily[a.id] = (s.daily[a.id] || 0) + 1;
    s.c.actions++; s.xp += Math.max(2, Math.round(a.hours * 3));
    Sys.quests.check(s);
    const msg = a.icon + ' ' + a.name + (cost ? ' (−' + U.money(cost) + ')' : '') + '.' + extra;
    SN.say(msg, 'good');
    return SN.okr(msg);
  };
  A.specials = {
    groceries: s => { s.groceries += 4; return ' Продуктов дома: ' + s.groceries + ' порц.'; },
    cook: s => { s.groceries--; return ' Осталось порций: ' + s.groceries + '.'; },
    charityClothes: s => {
      s.lastDone.charity = T.day(s);
      if (!s.clothes.includes('charity')) { s.clothes.push('charity'); s.wear = 'charity'; return ' Вам выдали чистую одежду по сезону — уже надета.'; }
      s.st.hygiene = U.clamp(s.st.hygiene + 10); return ' Вещи обновили на чистые.';
    },
    treat: (s, a) => Sys.stats.treat(s, a.heal),
    trip: s => { s.lastDone.trip = T.day(s); s.flags.traveled = (s.flags.traveled || 0) + 1; return ' Новые впечатления!'; },
    docPassport: s => { s.docsPending.passport = T.day(s) + 5; return ' Паспорт будет готов через 5 дней — заберите в МФЦ (готовый документ выдадут автоматически).'; },
    docOms: s => { s.docsPending.oms = T.day(s) + 2; return ' Полис будет готов через 2 дня.'; },
    docMedbook: s => { s.docs.medbook = true; return ' Медкнижка получена!'; },
    docIp: s => { s.docsPending.ip = T.day(s) + 3; return ' ИП будет зарегистрировано через 3 дня.'; }
  };

  // ── Документы
  const Doc = Sys.docs = {};
  Doc.daily = function (s, rep) {
    const d = T.day(s);
    for (const k in s.docsPending) {
      if (d >= s.docsPending[k]) {
        s.docs[k] = true; delete s.docsPending[k];
        rep.lines.push('Документ готов: ' + D.docNames[k] + '.');
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
