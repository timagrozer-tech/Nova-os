/* Бизнес 0.4: типы точек, улучшения, рекламные кампании, районы, имена сотрудников, отзывы, события */
(function (G) {
  'use strict';
  const SN = G.SN, D = SN.D, U = SN.U;

  /* goods — торговля товаром: нужен склад, закупки, порча (perish в день). food — можно подключить доставку */
  const KIND = {
    drinks: { goods: 1, perish: 0.1, food: 1 }, kiosk: { goods: 1, perish: 0.25, food: 1 }, bakery: { goods: 1, perish: 0.4, food: 1 },
    coffee: { goods: 1, perish: 0.12, food: 1 }, market: { goods: 1, perish: 0.04 }, restaurant: { goods: 1, perish: 0.2, food: 1 }, factory: { goods: 1, perish: 0 }
  };
  D.business.forEach(b => Object.assign(b, KIND[b.id] || { goods: 0, perish: 0 }));
  D.BIZ_MAX_LVL = 5;
  D.BIZ_MAX_BRANCH = 3;

  /* Районы: спрос и аренда относительно «родного» района бизнеса */
  D.bizDistrict = { old: { demand: 0.85, rent: 0.8 }, sleeping: { demand: 1.05, rent: 1 }, industrial: { demand: 0.9, rent: 0.85 }, center: { demand: 1.25, rent: 1.35 },
    embankment: { demand: 1.1, rent: 1.15 }, business: { demand: 1.2, rent: 1.45 }, hospital: { demand: 1, rent: 1 } };

  /* Улучшения: цена — доля от стоимости бизнеса */
  D.bizUpgrades = [
    { id: 'sign', icon: '🪧', name: 'Яркая вывеска', cost: 0.06, desc: 'Спрос +8%.' },
    { id: 'renovation', icon: '🛋️', name: 'Ремонт и интерьер', cost: 0.25, desc: 'Спрос +12%, клиенты довольнее (репутация растёт быстрее).' },
    { id: 'equipment', icon: '⚙️', name: 'Новое оборудование', cost: 0.3, desc: 'Каждый сотрудник обслуживает на 30% больше клиентов.' },
    { id: 'pos', icon: '🧾', name: 'Автоматизация и онлайн-касса', cost: 0.15, desc: 'Зарплатный фонд −15%, налог считается без ошибок.' },
    { id: 'loyalty', icon: '💳', name: 'Программа лояльности', cost: 0.12, desc: 'Спрос +6%, постоянные клиенты прощают мелкие промахи.' },
    { id: 'delivery', icon: '🛵', name: 'Доставка', cost: 0.2, food: true, desc: 'Спрос +20% (только еда и напитки).' },
    { id: 'fridge', icon: '❄️', name: 'Холодильный склад', cost: 0.1, goods: true, desc: 'Порча товара −70%.' },
    { id: 'security', icon: '📹', name: 'Охрана и камеры', cost: 0.08, desc: 'Защита от краж и вандализма.' }
  ];
  D.bizUpById = Object.fromEntries(D.bizUpgrades.map(u => [u.id, u]));

  /* Рекламные кампании: множитель спроса на N дней; цена = дневной рекламный бюджет точки × k */
  D.bizCamps = [
    { id: 'flyers', icon: '📰', name: 'Листовки у метро', mult: 1.12, days: 3, k: 1.5 },
    { id: 'social', icon: '📱', name: 'Реклама в соцсетях', mult: 1.25, days: 7, k: 5 },
    { id: 'blogger', icon: '🎥', name: 'Обзор у блогера', mult: 1.35, days: 5, k: 6, rep: 4 },
    { id: 'outdoor', icon: '🗼', name: 'Наружная реклама', mult: 1.35, days: 14, k: 11 },
    { id: 'tv', icon: '📺', name: 'Ролик на ТВ и радио', mult: 1.6, days: 14, k: 26 }
  ];
  D.bizCampById = Object.fromEntries(D.bizCamps.map(c => [c.id, c]));
  D.bizQuality = [
    { name: 'Эконом', cogs: 0.8, demand: 0.95, check: 0.92, sat: -0.12 },
    { name: 'Стандарт', cogs: 1, demand: 1, check: 1, sat: 0 },
    { name: 'Премиум', cogs: 1.3, demand: 1.08, check: 1.15, sat: 0.14 }
  ];

  D.firstNames = ['Артём', 'Дарья', 'Илья', 'Ольга', 'Тимур', 'Света', 'Никита', 'Алина', 'Руслан', 'Маша', 'Денис', 'Лена', 'Паша', 'Аня', 'Глеб', 'Вика', 'Олег', 'Катя', 'Стас', 'Юля', 'Миша', 'Зарина', 'Вадим', 'Таня', 'Костя', 'Нина', 'Игорь', 'Полина', 'Саша', 'Ира'];
  D.lastNames = ['К.', 'С.', 'М.', 'П.', 'Л.', 'Р.', 'Б.', 'Т.', 'Г.', 'Д.', 'В.', 'Н.'];
  D.employeeTraits = [
    { id: 'fast', name: 'Шустрый', desc: '+15% к скорости' }, { id: 'kind', name: 'Вежливый', desc: 'клиенты довольнее' }, { id: 'honest', name: 'Честный', desc: 'не бывает недостач' },
    { id: 'lazy', name: 'Ленивый', desc: '−15% к скорости' }, { id: 'grumpy', name: 'Хмурый', desc: 'клиенты недовольны' }, { id: 'none', name: '', desc: '' }
  ];
  D.reviews = {
    5: ['Лучшее место в районе!', 'Буду ходить каждый день', 'Персонал — золото', 'Однозначно рекомендую'],
    4: ['Хорошо, но можно лучше', 'Приятно и недорого', 'Вернусь ещё'],
    3: ['Нормально', 'Ничего особенного', 'Средне, как везде'],
    2: ['Долго ждал своей очереди', 'Дороговато за такое', 'Не всё было в наличии'],
    1: ['Ужасно, больше не приду', 'Очередь на полчаса, ушёл', 'Ничего не было в наличии']
  };

  // ── Бизнес-события (бизнес продаётся только вручную, автопилот всегда отказывается)
  const E = () => SN.Sys.econ;
  const pickBiz = s => s.biz[Math.floor(U.rand(s) * s.biz.length)];
  D.events = D.events.filter(e => e.id !== 'bizbuyout');
  D.events.push(
    { id: 'bizbuyout2', icon: '💼', title: 'Предложение о покупке', w: 0.8, auto: 0, when: s => s.biz.some(b => b.days > 20),
      prep: s => { const b = s.biz.filter(x => x.days > 20)[0]; return { uid: b.uid, v: Math.round(SN.Sys.biz.sellValue(s, b) * 1.35) }; },
      text: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); return 'Сетевой инвестор хочет купить «' + (b ? SN.Sys.biz.title(b) : '') + '» за ' + U.money(x.v) + ' — на 35% дороже оценки. Решение только за вами.'; },
      choices: [
        { t: 'Отказаться — дело не продаётся', run: s => { s.rep = U.clamp(s.rep + 1); return 'Вы верите в своё дело.'; } },
        { t: 'Продать', run: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); if (!b) return 'Сделка сорвалась.'; s.biz = s.biz.filter(y => y !== b); E().earn(s, x.v, 'business', 'Продажа инвестору: ' + SN.Sys.biz.title(b)); return 'Сделка закрыта: ' + U.money(x.v) + '.'; } }
      ] },
    { id: 'bizraise', icon: '🙋', title: 'Сотрудник просит прибавку', w: 1.5, auto: 0, when: s => s.biz.some(b => b.team.length),
      prep: s => { const b = s.biz.filter(x => x.team.length)[0]; const e = b.team[Math.floor(U.rand(s) * b.team.length)]; return { uid: b.uid, n: e.n }; },
      text: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); return x.n + ' из «' + (b ? SN.Sys.biz.title(b) : '') + '» просит повысить зарплату на 15%: «Я много работаю, а цены растут».'; },
      choices: [
        { t: 'Повысить зарплату (+15%)', run: (s, x) => { const e = SN.Sys.biz.emp(s, x.uid, x.n); if (e) { e.wage = Math.round(e.wage * 1.15); e.mor = U.clamp(e.mor + 30); } return x.n + ' доволен(на): мораль +30.'; } },
        { t: 'Разовая премия вместо прибавки', run: (s, x) => { const e = SN.Sys.biz.emp(s, x.uid, x.n); if (e) { E().pay(s, Math.min(E().available(s), e.wage * 2), 'business', 'Премия: ' + x.n); e.mor = U.clamp(e.mor + 15); } return 'Премия выдана, мораль +15.'; } },
        { t: 'Отказать', run: (s, x) => { const e = SN.Sys.biz.emp(s, x.uid, x.n); if (e) e.mor = U.clamp(e.mor - 25); return 'Отказ. Мораль сотрудника −25: может уволиться.'; } }
      ] },
    { id: 'bizcompetitor', icon: '🏁', title: 'Открылся конкурент', w: 1.2, auto: 0, when: s => s.biz.length > 0,
      prep: s => { const b = pickBiz(s); SN.Sys.biz.compAdd(s, b.id, b.district, 1); return { uid: b.uid }; },
      text: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); return 'Рядом с «' + (b ? SN.Sys.biz.title(b) : '') + '» открылся конкурент. Спрос снизится на 10%.'; },
      choices: [
        { t: 'Ответить скидками на неделю', run: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); if (b) b.price = Math.max(0.7, b.price - 0.1); return 'Цены снижены на 10% — клиенты остаются с вами.'; } },
        { t: 'Сделать ставку на качество', run: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); if (b) b.quality = 2; return 'Переходите на премиальное качество: дороже, но клиенты ценят.'; } },
        { t: 'Ничего не менять', run: () => 'Посмотрим, кто кого.' }
      ] },
    { id: 'bizfoodblogger', icon: '⭐', title: 'Визит критика', w: 1, auto: 0, when: s => s.biz.length > 0,
      prep: s => ({ uid: pickBiz(s).uid }),
      text: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); return 'Известный городской критик зашёл в «' + (b ? SN.Sys.biz.title(b) : '') + '». Отзыв выйдет завтра.'; },
      choices: [{ t: 'Ждём!', run: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); if (!b) return ''; const good = b.rep > 55 || b.quality === 2; b.rep = U.clamp(b.rep + (good ? 12 : -10)); b.reviews.unshift({ d: SN.T.day(s), st: good ? 5 : 2, t: good ? 'Критик: «Место, ради которого стоит приехать»' : 'Критик: «Разочарование вечера»' }); return good ? 'Восторженный отзыв! Репутация точки +12.' : 'Отзыв разгромный. Репутация −10. Качество и сервис решают.'; } }] },
    { id: 'biztheft', icon: '🦹', title: 'Ночная кража', w: 1, auto: 0, when: s => s.biz.some(b => !SN.Sys.biz.has(b, 'security')),
      prep: s => ({ uid: s.biz.filter(b => !SN.Sys.biz.has(b, 'security'))[0].uid }),
      text: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); return 'Ночью в «' + (b ? SN.Sys.biz.title(b) : '') + '» взломали дверь.'; },
      choices: [{ t: 'Оценить ущерб', run: (s, x) => { const b = SN.Sys.biz.byUid(s, x.uid); if (!b) return ''; const d = D.bizById[b.id]; const loss = Math.round(d.price * 0.02); b.stock = Math.floor(b.stock * 0.6); if (s.fin.ins.property) return 'Украли часть товара. Страховка покрыла ремонт. Камеры и охрана защитят в будущем.'; E().pay(s, Math.min(E().available(s), loss), 'business', 'Ущерб от кражи'); return 'Ущерб ' + U.money(loss) + ' и 40% товара. Поставьте охрану (раздел «Улучшения»).'; } }] }
  );
  // Безопасные варианты для автопилота в старых событиях
  const AUTO = { friendhelp: 1, shelterfight: 1, dog: 1, supplier: 1, kolyastartup: 1, charityask: 1, scam: 0, inspection: 0, taxaudit: 0 };
  D.events.forEach(e => { if (AUTO[e.id] != null && e.auto == null) e.auto = AUTO[e.id]; });
})(typeof window !== 'undefined' ? window : globalThis);
