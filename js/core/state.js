/* Игровое состояние: создание, миграции версий, проверка целостности структуры */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U;

  SN.fresh = function (opt) {
    opt = opt || {};
    const seed = (opt.seed != null ? opt.seed : (Date.now() ^ 0x5f3759df)) | 0;
    return {
      v: SN.SAVE_VERSION, mode: 'classic', seed, rng: seed, created: Date.now(),
      hero: { name: opt.name || 'Саня', skin: 1, hair: 1, beard: 1 },
      time: 8 * 60,                    // минуты с полуночи первого дня
      district: 'old',
      money: 340, bank: 0, account: false,
      st: { health: 72, food: 55, energy: 75, hygiene: 40, mood: 50, warmth: 55, stress: 40 },
      rep: 10, xp: 0,
      sk: { physical: 8, social: 6, intellect: 6, finance: 0, cooking: 2, tech: 0, trade: 0, craft: 3, driving: 0, music: 0, english: 2, design: 0, marketing: 0, law: 0 },
      docs: { passport: false, oms: false, medbook: false, license: false, ip: false },
      docsPending: {},                 // { passport: day готовности }
      certs: [], study: {},            // study: { courseId: часов пройдено }
      job: null,                       // { id, rank, shifts, hired, last, missed }
      gigs: {},                        // счётчики подработок
      housing: 'street', rentPaid: 0, deposit: 0, rentDebt: 0,
      items: [], clothes: ['worn'], wear: 'worn', groceries: 0, fish: 0,
      biz: [],
      fin: { deposit: 0, loan: 0, loanStart: 0, loanDue: 0, funds: { index: 0, crypto: 0 }, ledger: [], history: [],
        mkt: { p: {}, h: {}, gold: 0, gh: [] }, port: {}, bonds: [], terms: [], gold: 0, broker: false, mort: [], ins: { health: false, property: false },
        card: 'basic', cb: 0, autosave: 0, agency: false, goodPays: 0, badPays: 0, news: [] },
      perks: [], passive: [], itemVal: {}, nwHist: [],
      npc: {}, partner: null,
      quests: {}, ach: {}, flags: {}, daily: {}, lastDone: {},
      c: { jobs: 0, gigs: 0, meals: 0, sleeps: 0, studyH: 0, earned: 0, spent: 0, actions: 0, nightsStreet: 0, events: 0, dates: 0, bizProfitDays: 0, fishCaught: 0, collapses: 0, passive: 0, autoDays: 0 },
      log: [{ d: 1, t: 'Вы начинаете жизнь с нуля: 340 ₽, поношенная куртка и никаких документов. Соццентр в Старом районе — хорошее начало.' }],
      ill: null, weather: null, prices: 1, priceDays: 0,
      today: { inc: 0, exp: 0 }, days: [],   // история итогов дней
      pending: [],                     // очередь событий с выбором
      news: [],
      settings: { motion: true, transport: 'auto', bigText: false, vibro: true, auto: { work: 'auto', study: '', events: 'auto', maxHours: 10, saveCash: true } }
    };
  };

  /* Миграции: каждая функция поднимает сохранение на одну версию */
  SN.migrations = {
    /* v1 — прототип s_nulya_demo.html (ключ s-nulya-life-demo-v1) */
    1: function (old) {
      const s = SN.fresh();
      const num = (x, d) => Number.isFinite(+x) ? +x : d;
      s.hero.name = String(old.name || 'Саня').slice(0, 24);
      s.time = (Math.max(1, num(old.day, 1)) - 1) * 1440 + U.clamp(num(old.hour, 8), 0, 23) * 60;
      s.money = Math.max(0, num(old.money, 340));
      s.bank = Math.max(0, num(old.bank, 0)); s.account = s.bank > 0;
      s.xp = Math.max(0, num(old.xp, 0));
      ['health', 'food', 'energy', 'hygiene', 'mood', 'warmth'].forEach(k => { if (old[k] != null) s.st[k] = U.clamp(num(old[k], 50)); });
      s.rep = U.clamp(num(old.reputation, 10));
      s.c.jobs = num(old.jobCount, 0); s.c.meals = num(old.foodCount, 0); s.c.sleeps = num(old.sleepCount, 0);
      // Образование прототипа (0–6) переводим в сертификаты осторожно: только базовые
      const edu = num(old.education, 0);
      if (edu >= 1) s.certs.push('pc');
      if (edu >= 2) { s.certs.push('school'); s.docs.passport = true; }
      const map = { 'Палатка': 'tent', 'Велосипед': 'bike', 'Подержанный автомобиль': 'car', 'Спорткар': 'sportcar' };
      (Array.isArray(old.owned) ? old.owned : []).forEach(n => {
        if (map[n]) s.items.push(map[n]);
        if (n === 'Комната') { s.housing = 'room'; s.docs.passport = true; s.rentPaid = 7; }
        if (n === 'Квартира-студия') { s.housing = 'studio'; s.docs.passport = true; }
        if (n === 'Загородный дом') { s.housing = 'house'; s.docs.passport = true; }
        const b = { 'Тележка с напитками': 'drinks', 'Киоск с едой': 'kiosk', 'Мастерская': 'workshop', 'Кофейня': 'coffee', 'Мини-маркет': 'market', 'Торговый центр': 'mall' }[n];
        if (b) { s.docs.ip = true; s.docs.passport = true; s.biz.push(SN.Sys.biz.make(b)); }
      });
      s.log.unshift({ d: 1, t: 'Сохранение прототипа перенесено в новую версию игры.' });
      s.v = 2;
      return s;
    },
    /* v2 → v3 (игра 0.3): новые поля добавит normalize, прогресс сохраняется полностью */
    2: function (s) { s.v = 3; return s; }
  };

  SN.migrate = function (data) {
    let s = data;
    if (!s || typeof s !== 'object') throw Error('not object');
    if (!s.v) s.v = 1;
    while (s.v < SN.SAVE_VERSION) {
      const m = SN.migrations[s.v];
      if (!m) throw Error('no migration ' + s.v);
      s = m(s);
    }
    return SN.normalize(s);
  };

  /* Нормализация: дополняет недостающие поля, обрезает мусор, проверяет типы.
     Защищает от повреждённых и подделанных JSON-файлов. */
  SN.normalize = function (s) {
    const base = SN.fresh({ seed: s.seed | 0 });
    const out = {};
    for (const k in base) {
      const b = base[k], v = s[k];
      if (v === undefined || v === null && b !== null) { out[k] = b; continue; }
      if (b === null) { out[k] = (v && typeof v === 'object') ? v : null; continue; }
      if (typeof b === 'number') out[k] = Number.isFinite(+v) ? +v : b;
      else if (typeof b === 'string') out[k] = String(v).slice(0, 64);
      else if (typeof b === 'boolean') out[k] = !!v;
      else if (Array.isArray(b)) out[k] = Array.isArray(v) ? v.slice(0, 400) : b;
      else if (typeof b === 'object') out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.assign({}, b, v) : b;
    }
    for (const k in base.st) out.st[k] = U.clamp(+out.st[k] || 0);
    for (const k in base.sk) out.sk[k] = U.clamp(+out.sk[k] || 0);
    out.hero.name = String(out.hero.name || 'Саня').replace(/[<>]/g, '').slice(0, 24) || 'Саня';
    out.rep = U.clamp(out.rep);
    out.money = Math.round(out.money * 100) / 100; out.bank = Math.max(0, out.bank);
    out.time = Math.max(0, Math.floor(out.time));
    const D = SN.D;
    out.items = out.items.filter(i => D.items[i]);
    out.clothes = out.clothes.filter(i => D.clothes[i]); if (!out.clothes.length) out.clothes = ['worn'];
    if (!D.clothes[out.wear] || !out.clothes.includes(out.wear)) out.wear = out.clothes[0];
    if (!D.housing[out.housing]) out.housing = 'street';
    if (!D.districts[out.district]) out.district = 'old';
    out.certs = out.certs.filter(c => typeof c === 'string' && D.certNames[c]);
    out.biz = out.biz.filter(b => b && D.bizById[b.id]).map(b => Object.assign(SN.Sys.biz.make(b.id), b));
    out.passive = out.passive.filter(p => p && D.passiveById && D.passiveById[p.id]);
    out.perks = out.perks.filter(p => D.perkById && D.perkById[p]);
    for (const k of ['mkt', 'ins']) out.fin[k] = Object.assign({}, base.fin[k], out.fin[k] || {});
    for (const k of ['port']) if (!out.fin[k] || typeof out.fin[k] !== 'object') out.fin[k] = {};
    for (const k of ['bonds', 'terms', 'mort', 'news', 'ledger', 'history']) if (!Array.isArray(out.fin[k])) out.fin[k] = [];
    out.settings.auto = Object.assign({}, base.settings.auto, out.settings.auto || {});
    if (out.job && !D.jobById[out.job.id]) out.job = null;
    out.log = out.log.slice(0, 120); out.fin.ledger = (out.fin.ledger || []).slice(0, 120);
    out.v = SN.SAVE_VERSION;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
