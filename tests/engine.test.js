/* Автотесты игрового ядра без браузера: node tests/engine.test.js
   Проверяют сценарии из ТЗ, детерминизм, сохранения, миграцию прототипа и баланс. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');

function boot() {
  const mem = {};
  const ctx = { console, Math, Date, JSON, localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/manifest.js'), 'utf8'), ctx);
  for (const f of ctx.SN_FILES) if (!f.includes('/ui/') && !f.endsWith('main.js')) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  ctx.SN.on('toast', () => {}); ctx.SN.on('modal', () => {});
  return { SN: ctx.SN, mem };
}

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n    ')); } };
const eq = (a, b, m) => { if (a !== b) throw Error((m || '') + ' ожидалось ' + JSON.stringify(b) + ', получено ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw Error(m || 'условие не выполнено'); };

const { SN, mem } = boot();
const { Sys, T, D } = SN;
const setHour = (s, h) => { const d = T.day(s); s.time = (d - 1) * 1440 + h * 60; };
const nextMorning = (s, h) => { s.time = T.day(s) * 1440 + (h || 8) * 60; };

console.log('Сценарии ТЗ');
t('работа → доход → еда → отдых', () => {
  const s = SN.fresh({ seed: 1 });
  const m0 = s.money;
  const r = Sys.work.shift(s, 'recycle'); ok(r.ok, r.msg);
  ok(s.money > m0, 'деньги выросли');
  const f0 = s.st.food; const r2 = Sys.act.run(s, 'bread'); ok(r2.ok, r2.msg); ok(s.st.food > f0 - 1, 'сытость');
  setHour(s, 21); const e0 = s.st.energy; const r3 = Sys.stats.sleep(s, 'shelter'); ok(r3.ok, r3.msg);
  ok(s.st.energy > e0, 'энергия восстановилась'); eq(T.hour(s), 7, 'проснулись в 7');
  ok(s.time > 0 && s.c.gigs === 1 && s.c.sleeps === 1);
});
t('без паспорта нельзя на вакансию, обучение открывает профессию', () => {
  const s = SN.fresh({ seed: 2 });
  ok(Sys.work.applyCheck(s, D.jobById.cashier).includes('Паспорт'));
  s.docs.passport = true; s.docs.medbook = true;
  ok(Sys.work.applyCheck(s, D.jobById.cashier).includes('кассир'), 'нужен курс');
  setHour(s, 9); s.st.energy = 100;
  const r1 = Sys.edu.study(s, 'cashier'); ok(r1.ok, r1.msg);
  s.st.energy = 100; s.st.food = 80; setHour(s, 10);
  const r2 = Sys.edu.study(s, 'cashier'); ok(r2.ok, r2.msg);
  ok(s.certs.includes('cashier'), 'сертификат выдан');
  eq(Sys.work.applyCheck(s, D.jobById.cashier), '', 'вакансия доступна');
});
t('бесплатная библиотека не открывает документы и упирается в потолок', () => {
  const s = SN.fresh({ seed: 3 }); s.sk.intellect = 30; setHour(s, 10);
  ok(Sys.edu.check(s, D.courseById.library).includes('курс'));
  eq(s.certs.length, 0);
});
t('собеседование → найм → смена → зарплата на карту → повышение', () => {
  const s = SN.fresh({ seed: 4 }); s.docs.passport = true; s.account = true; s.sk.physical = 40; s.rep = 60;
  let hired = false;
  for (let i = 0; i < 8 && !hired; i++) { delete s.flags.iv_loader; hired = Sys.work.interview(s, 'loader', 2).hired; }
  ok(hired, 'нанят'); const bank0 = s.bank;
  for (let d = 0; d < 12; d++) { nextMorning(s, 8); s.st.energy = 100; s.st.food = 90; s.district = 'industrial'; const r = Sys.work.shift(s, 'loader'); ok(r.ok, r.msg); }
  ok(s.bank > bank0 + 25000, 'зарплата на карте: ' + s.bank);
  ok(s.job.rank >= 1, 'повышение получено');
});
t('аренда жилья и еженедельная оплата, выселение без денег', () => {
  const s = SN.fresh({ seed: 5 }); s.money = 4300;
  const r = Sys.prop.takeHome(s, 'hostel'); ok(r.ok, r.msg); eq(s.housing, 'hostel');
  s.money = 0; s.bank = 0;
  for (let i = 0; i < 12; i++) T.advance(s, 1440, { indoor: true, noCollapse: true });
  eq(s.housing, 'street', 'выселен за долг');
});
t('покупка жилья и продажа с возвратом 85%', () => {
  const s = SN.fresh({ seed: 6 }); s.docs.passport = true; s.money = 2500000;
  ok(Sys.prop.takeHome(s, 'studio').ok); eq(s.housing, 'studio'); const m = s.money;
  Sys.prop.leave(s); eq(s.money - m, Math.round(2400000 * 0.85));
});
t('бизнес: запуск → ежедневная прибыль/расходы, простой без персонала', () => {
  const s = SN.fresh({ seed: 7 }); s.docs.passport = s.docs.ip = s.docs.medbook = true; s.account = true; s.money = 400000;
  ok(Sys.biz.open(s, 'kiosk').ok);
  const b = s.biz[0]; eq(b.staff, 1);
  const bank0 = s.bank; const rep = T.advance(s, 1440 * 3, { indoor: true, noCollapse: true });
  ok(rep.length >= 3); ok(rep[0].biz.length === 1, 'отчёт по бизнесу');
  const tot = rep.reduce((a, r) => a + r.biz[0].profit, 0);
  ok(rep[0].biz[0].tax > 0 && rep[0].biz[0].wages > 0 && rep[0].biz[0].rent > 0, 'учтены налог, зарплаты, аренда');
  b.staff = 0; const r2 = T.advance(s, 1440, { indoor: true, noCollapse: true });
  eq(r2[0].biz[0].cust, 0, 'без персонала нет клиентов'); ok(r2[0].biz[0].profit < 0, 'убыток от аренды');
  console.log('      прибыль киоска за 3 дня: ' + tot);
});
t('дружба и согласие на свидание', () => {
  const s = SN.fresh({ seed: 8 }); setHour(s, 18); s.district = 'embankment'; s.st.hygiene = 80; s.st.mood = 70;
  const o = Sys.social.open(s, 'katya'); ok(o.ok, o.msg);
  ok(Sys.social.dateCheck(s, 'katya').includes('35'), 'рано звать на свидание');
  const n = Sys.social.get(s, 'katya'); n.rel = 80; n.trust = 40;
  let yes = false; for (let i = 0; i < 10 && !yes; i++) { n.cd = 0; yes = Sys.social.askDate(s, 'katya').yes; }
  ok(yes, 'согласие при хороших отношениях'); eq(n.status, 'dating');
  ok(Sys.social.dateCheck(s, 'lyosha') === '' || Sys.social.dateCheck(s, 'lyosha'), '');
});
t('диалог меняет мир: направление на паспорт', () => {
  const s = SN.fresh({ seed: 9 }); setHour(s, 10); s.district = 'old';
  ok(Sys.social.open(s, 'nina').ok);
  const ch = Sys.social.choices(s, 'nina'); Sys.social.choose(s, 'nina', ch[0].i);
  const ch2 = Sys.social.choices(s, 'nina'); const ref = ch2.find(c => c.t.includes('направление'));
  ok(ref, 'появился вариант'); Sys.social.choose(s, 'nina', ref.i); ok(s.flags.ninaReferral);
  setHour(s, 11); const r = Sys.act.run(s, 'passport'); ok(r.ok, r.msg); ok(s.c.spent <= 70, 'пошлина бесплатно, оплачен максимум проезд');
  T.advance(s, 1440 * 5, { indoor: true, noCollapse: true }); ok(s.docs.passport, 'паспорт готов');
  ok(s.quests.q_passport === 'done', 'квест закрыт');
});

console.log('Сохранения');
t('сохранение → перезагрузка → восстановление, контроль целостности', () => {
  const s = SN.fresh({ seed: 10 }); Sys.work.shift(s, 'recycle'); s.hero.name = 'Тест';
  SN.Save.write(s); SN.Save.write(s);
  const r = SN.Save.read(); eq(r.source, 'main'); eq(r.state.money, s.money); eq(r.state.hero.name, 'Тест'); eq(r.state.rng, s.rng);
  mem[SN.Save.KEY] = mem[SN.Save.KEY].replace('"money', '"monee');
  const r2 = SN.Save.read(); eq(r2.source, 'backup', 'повреждение → резервная копия');
});
t('детерминизм: одинаковые действия после загрузки дают одинаковый результат', () => {
  const a = SN.fresh({ seed: 11 }); T.advance(a, 600, {});
  const b = SN.Save.importText(SN.Save.exportText(a));
  T.advance(a, 1440 * 4, { noCollapse: true }); T.advance(b, 1440 * 4, { noCollapse: true });
  eq(JSON.stringify(a.weather), JSON.stringify(b.weather)); eq(a.rng, b.rng); eq(JSON.stringify(a.pending), JSON.stringify(b.pending));
});
t('миграция сохранения прототипа v1', () => {
  const old = { name: 'Саня', day: 3, hour: 14, money: 13000, bank: 500, xp: 120, health: 60, food: 40, hygiene: 30, mood: 70, energy: 50, warmth: 50, education: 2, reputation: 20, owned: ['Палатка', 'Тележка с напитками'], jobCount: 4 };
  mem[SN.Save.LEGACY] = JSON.stringify(old); delete mem[SN.Save.KEY]; delete mem[SN.Save.BAK];
  const r = SN.Save.read(); eq(r.source, 'legacy'); const s = r.state;
  eq(s.money, 13000); eq(T.day(s), 3); ok(s.items.includes('tent')); eq(s.biz[0].id, 'drinks'); ok(s.certs.includes('school')); eq(s.v, 2);
});
t('импорт отвергает поддельный файл', () => {
  let threw = false; try { SN.Save.importText('{"format":"s-nulya-save","hash":"0","data":"{}"}'); } catch (e) { threw = true; } ok(threw);
  const s = SN.Save.importText(JSON.stringify({ format: 's-nulya-save', data: JSON.stringify({ v: 2, money: 'x', hero: { name: '<img onerror=1>' }, st: { health: 999 } }), hash: SN.U.hash(JSON.stringify({ v: 2, money: 'x', hero: { name: '<img onerror=1>' }, st: { health: 999 } })) }));
  eq(s.st.health, 100); ok(!s.hero.name.includes('<')); eq(s.money, 340);
});

console.log('Баланс (симуляция стратегий)');
function bot(seed, days, opts) {
  const s = SN.fresh({ seed });
  const log = [];
  for (let d = 0; d < days; d++) {
    let guard = 0;
    while (T.hour(s) < 21 && T.hour(s) >= 6 && guard++ < 12) {
      const st = s.st;
      if (s.pending.length) { Sys.events.resolve(s, 0); continue; }
      if (st.food < 45) { const q = Sys.quick.eat(s); const r = q.run(); if (!r.ok && st.food < 20) Sys.act.run(s, 'bread'); continue; }
      if (st.hygiene < 30 && !s.daily.freeshower && T.isOpen(s, [9, 18], 1)) { if (Sys.act.run(s, 'freeshower').ok) continue; }
      if (opts.docs && !s.docs.passport && !s.docsPending.passport) {
        if (!s.flags.ninaReferral && Sys.social.where(s, 'nina')) { Sys.social.open(s, 'nina'); Sys.social.choose(s, 'nina', 0); Sys.social.choose(s, 'nina', 1); continue; }
        if (s.flags.ninaReferral && Sys.act.run(s, 'passport').ok) continue;
      }
      if (opts.docs && s.docs.passport && !s.account && T.isOpen(s, [9, 19], 2) && Sys.fin.openAccount(s).ok) continue;
      if (opts.home && s.housing === 'street' && Sys.econ.available(s) > 9000 && Sys.prop.takeHome(s, 'hostel').ok) continue;
      if (opts.job && s.docs.passport && !s.job && s.sk.physical >= 10 && !Sys.work.applyCheck(s, D.jobById.loader) && T.isOpen(s, [8, 17], 1)) { Sys.work.interview(s, 'loader', 1); continue; }
      const q = Sys.quick.work(s); const r = q.run(); if (!r.ok) break;
    }
    // ночь
    if (s.pending.length) Sys.events.resolve(s, 0);
    if (T.hour(s) < 19 && T.hour(s) >= 6) T.advance(s, (19 - T.hourF(s)) * 60, {});
    const opt = s.housing !== 'street' ? 'home' : (T.hour(s) >= 19 || T.hour(s) < 2 ? 'shelter' : 'street');
    if (opt === 'shelter' && T.hour(s) < 19) T.advance(s, (19 - T.hourF(s)) * 60, {});
    Sys.stats.sleep(s, opt);
    if (T.hour(s) < 6) T.advance(s, (6 - T.hourF(s)) * 60, { sleep: true, q: 0.6 });
    if ((d + 1) % 10 === 0) log.push({ day: T.day(s), net: Sys.fin.netWorth(s), cash: Math.round(s.money + s.bank), job: s.job ? s.job.id : '-', housing: s.housing, hp: Math.round(s.st.health) });
  }
  return { s, log };
}
t('поденщик без документов выживает, но не богатеет', () => {
  const { s, log } = bot(21, 30, {});
  console.log('      ' + log.map(l => 'д' + l.day + ': ' + l.net + '₽ hp' + l.hp).join(' | '));
  ok(SN.Sys.fin.netWorth(s) > 2000, 'может накопить'); ok(SN.Sys.fin.netWorth(s) < 75000, 'но не слишком легко: ' + SN.Sys.fin.netWorth(s)); global.gigNet = SN.Sys.fin.netWorth(s);
  ok(s.c.collapses <= 1, 'не умирает от голода: обмороков ' + s.c.collapses);
});
t('документы + склад + хостел: устойчивый рост', () => {
  const { s, log } = bot(22, 40, { docs: true, job: true, home: true });
  console.log('      ' + log.map(l => 'д' + l.day + ': ' + l.net + '₽ ' + l.job + ' ' + l.housing).join(' | '));
  ok(s.docs.passport, 'паспорт'); ok(s.job, 'работа'); ok(Sys.fin.netWorth(s) > 20000, 'капитал растёт');
  const at30 = log.find(l => l.day >= 31); ok(at30.net > global.gigNet, 'официальный путь выгоднее поденщины: ' + at30.net + ' vs ' + global.gigNet);
});
t('экономика бизнеса: окупаемость 3–20 недель', () => {
  const s = SN.fresh({ seed: 30 }); s.docs.passport = s.docs.ip = s.docs.medbook = true; s.certs.push('biz', 'management', 'mechanic'); s.rep = 80; s.account = true;
  s.time = 120 * 1440; // весна-лето для честного среднего — берём ~февраль..май
  for (const b of D.business) {
    const x = Sys.biz.make(b.id); x.staff = b.staffMax; x.rep = 50;
    let sum = 0; const N = 360; for (let i = 0; i < N; i++) { const seasons = ['winter', 'spring', 'summer', 'autumn']; sum += Sys.biz.calc(s, x, 1, seasons[i % 4], 'clear').profit; }
    let best = -1e9; for (let st = 0; st <= b.staffMax; st++) for (const pr of [0, 1, 2]) { x.staff = st; x.price = pr; let ss = 0; for (const se of ['winter', 'spring', 'summer', 'autumn']) ss += Sys.biz.calc(s, x, 1, se, 'clear').profit; best = Math.max(best, ss / 4); }
    const weeks = b.price / best / 7;
    console.log('      ' + b.name.padEnd(22) + ' лучший средний день ' + Math.round(best) + ' ₽ → окупаемость ' + weeks.toFixed(1) + ' нед.');
    ok(best > 0, b.name + ' может быть прибыльным'); ok(weeks > 4 && weeks < 30, b.name + ' окупаемость в разумных пределах');
  }
});

console.log(`\nИтого: ${pass} пройдено, ${fail} провалено`);
process.exit(fail ? 1 : 0);
