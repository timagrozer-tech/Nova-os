/* Задачи дня (3 случайные цели, награды, серия дней) и входящие сообщения */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const Dl = Sys.daily = {};

  D.taskTpl = [
    { k: 'shifts', icon: '💼', t: n => 'Отработать ' + n + ' ' + U.plural(n, 'смену', 'смены', 'смен'), c: s => s.c.jobs + s.c.gigs, need: () => 2 },
    { k: 'earn', icon: '💰', t: n => 'Заработать ' + U.money(n), c: s => s.c.earned, need: s => Math.max(800, Math.round(Sys.fin.avgIncome(s) * 0.7 / 100) * 100) },
    { k: 'meals', icon: '🍲', t: n => 'Нормально поесть ' + n + ' раза', c: s => s.c.meals, need: () => 2 },
    { k: 'study', icon: '🎓', t: n => 'Учиться ' + n + ' ч', c: s => s.c.studyH, need: () => 2, when: s => D.courses.some(c => !Sys.edu.done(s, c) && !Sys.econ.reqFail(s, c.req)) },
    { k: 'talk', icon: '💬', t: () => 'Пообщаться с кем-нибудь из знакомых', c: s => s.c.talks || 0, need: () => 1, when: s => Object.values(s.npc).some(n => n.met) },
    { k: 'fun', icon: '🎮', t: () => 'Отдохнуть или потренироваться', c: s => s.c.fun || 0, need: () => 1 },
    { k: 'wash', icon: '🚿', t: () => 'Принять душ', c: s => s.c.wash || 0, need: () => 1 },
    { k: 'save', icon: '🐷', t: n => 'Отложить на накопительный счёт ' + U.money(n), c: s => s.c.saved || 0, need: s => Math.max(1000, Math.round(Sys.fin.avgIncome(s) * 0.2 / 500) * 500), when: s => s.account },
    { k: 'fish', icon: '🐟', t: () => 'Поймать рыбу', c: s => s.c.fishCaught, need: () => 1, when: s => s.items.includes('rod') },
    { k: 'biz', icon: '🏪', t: () => 'Выйти на смену в своём бизнесе', c: s => s.c.bizShifts || 0, need: () => 1, when: s => s.biz.length > 0 },
    { k: 'mc', icon: '📚', t: () => 'Пройти мастер-класс или занятие', c: s => s.c.studyH, need: () => 3, when: s => s.money + s.bank > 3000 }
  ];
  D.taskById = Object.fromEntries(D.taskTpl.map(t => [t.k, t]));

  Dl.gen = function (s) {
    const pool = D.taskTpl.filter(t => !t.when || t.when(s)), list = [];
    while (list.length < 3 && pool.length) { const i = Math.floor(U.rand(s) * pool.length); const t = pool.splice(i, 1)[0]; const need = t.need(s); list.push({ k: t.k, need, base: t.c(s), done: false, rw: 30 + Math.round(need / 200) }); }
    s.tasks = { d: T.day(s), list, streak: (s.tasks && s.tasks.streak) || 0, best: (s.tasks && s.tasks.best) || 0, allDone: false };
  };
  Dl.ensure = s => { if (!s.tasks || !Array.isArray(s.tasks.list)) Dl.gen(s); else if (s.tasks.d !== T.day(s)) Dl.dayStart(s); return s.tasks; };
  Dl.progress = (s, x) => { const t = D.taskById[x.k]; return t ? Math.min(x.need, Math.max(0, t.c(s) - x.base)) : 0; };
  Dl.check = function (s) {
    const tk = Dl.ensure(s);
    for (const x of tk.list) {
      if (x.done || Dl.progress(s, x) < x.need) continue;
      x.done = true; s.xp += 40;
      const money = Math.round(60 + Sys.quests.level(s) * 40);
      Sys.econ.earn(s, money, 'quest', 'Задача дня');
      SN.emit('toast', { msg: '☑️ Задача дня выполнена: +40 XP, +' + U.money(money), kind: 'good' });
    }
    if (!tk.allDone && tk.list.length && tk.list.every(x => x.done)) {
      tk.allDone = true; tk.streak++; tk.best = Math.max(tk.best, tk.streak); s.xp += 100;
      let msg = '🔥 Все задачи дня! Серия: ' + tk.streak + ' ' + U.plural(tk.streak, 'день', 'дня', 'дней') + ', +100 XP';
      if (tk.streak % 7 === 0) { s.flags.streakPts = (s.flags.streakPts || 0) + 1; msg += ' и очко таланта!'; }
      SN.emit('toast', { msg, kind: 'good' });
      Dl.mail(s, 'Ежедневник', '🔥', msg.replace('🔥 ', ''));
    }
  };
  Dl.dayStart = function (s) {
    if (s.tasks && !s.tasks.allDone && s.tasks.streak) Dl.mail(s, 'Ежедневник', '📅', 'Серия задач прервалась на ' + s.tasks.streak + ' ' + U.plural(s.tasks.streak, 'дне', 'днях', 'днях') + '. Начнём заново!');
    if (s.tasks && !s.tasks.allDone) s.tasks.streak = 0;
    Dl.gen(s);
  };

  // ─────────── Входящие
  Dl.mail = function (s, from, icon, t, extra) {
    s.inbox.unshift(Object.assign({ id: (s.flags.mailId = (s.flags.mailId || 0) + 1), d: T.day(s), h: T.clock(s), from, icon, t, read: false }, extra || {}));
    s.inbox = s.inbox.slice(0, 60);
  };
  Dl.unread = s => s.inbox.filter(m => !m.read).length;
  D.npcMsgs = {
    nina: ['Как ты там? Заходи на чай, у нас новые курсы.', 'В центре бесплатные консультации юриста по средам — пригодится.', 'Горжусь тобой. Правда.'],
    seryoga: ['Братан, я на заводе премию получил! Пиво с меня (безалкогольное 😄).', 'Алёнка рисунок прислала — меня с ней на рыбалке. Красота!', 'На складе в Промзоне опять людей ищут, если что.'],
    valera: ['Заходи в гараж, тут «Волгу» привезли — научу кое-чему.', 'Клиент хвалил, что ты ему посоветовал. Молоток.'],
    katya: ['Сдала анатомию! Отмечаем? 🙂', 'Видела тебя на набережной — ты так изменился(ась).', 'В выходные снова раздаём обеды. Придёшь помочь?'],
    lyosha: ['Новую песню написал. Хочешь, сыграю?', 'В субботу концерт на набережной — проходка твоя!', 'Ты знаешь, что ты мой главный слушатель?'],
    kolya: ['Смотри, какой баг я нашёл 😂 (скрин не прикрепился)', 'Есть вакансия джуна, могу скинуть!', 'Запускаем бету, спасибо за советы!'],
    maria: ['Пришлите цифры за неделю, посмотрим вместе.', 'Совет дня: не открывайте новую точку, пока старая не приносит прибыль стабильно.', 'Гордитесь каждым рублём, который заработали честно.'],
    mihalych: ['Внук приезжал — весь в меня, рыбак!', 'Дочитал? Как тебе Ключевский?', 'Клюёт сегодня, приходи.']
  };
  Dl.npcDaily = function (s) {
    for (const id in s.npc) {
      const n = s.npc[id];
      if (!n.met || !n.phone || n.rel < 25 || !D.npcMsgs[id] || !U.chance(s, 0.1)) continue;
      const def = D.npcById[id];
      Dl.mail(s, def.name, def.icon, U.pick(s, D.npcMsgs[id]), { npc: id });
    }
  };
  Dl.reply = function (s, mid) {
    const m = s.inbox.find(x => x.id === +mid); if (!m || !m.npc || m.replied) return SN.fail('Нельзя ответить');
    m.replied = true; m.read = true;
    const n = Sys.social.get(s, m.npc); n.rel = U.clamp(n.rel + 2);
    return SN.okr('Вы ответили. Отношения +2');
  };
  Dl.weekly = function (s, rep) {
    if (T.day(s) % 7 !== 0) return;
    const w = s.days.slice(0, 7), inc = w.reduce((a, x) => a + x.inc, 0), exp = w.reduce((a, x) => a + x.exp, 0);
    Dl.mail(s, 'Городской банк', '🏦', 'Итоги недели: доход ' + U.money(inc) + ', расход ' + U.money(exp) + ', ' + (inc >= exp ? 'в плюсе ' : 'в минусе ') + U.money(Math.abs(inc - exp)) + '. Капитал: ' + U.money(Sys.fin.netWorth(s)) + '.');
    if (s.biz.length) { const p = s.biz.reduce((a, b) => a + b.hist.slice(-7).reduce((x, h) => x + h.p, 0), 0); Dl.mail(s, 'Бухгалтерия', '📊', 'Бизнес за неделю: ' + (p >= 0 ? '+' : '') + U.money(p) + '. Лучшая точка: ' + Sys.biz.title(s.biz.slice().sort((a, b) => b.hist.slice(-7).reduce((x, h) => x + h.p, 0) - a.hist.slice(-7).reduce((x, h) => x + h.p, 0))[0]) + '.'); }
  };
  Dl.daily = function (s, rep) {
    rep.lines.filter(l => l.includes('⚠️') || l.includes('выселили') || l.includes('уволил') || l.includes('Банк забрал')).forEach(l => Dl.mail(s, 'Уведомление', '⚠️', l.replace('⚠️ ', '')));
    Dl.npcDaily(s); Dl.weekly(s, rep); Dl.ensure(s);
  };
})(typeof window !== 'undefined' ? window : globalThis);
