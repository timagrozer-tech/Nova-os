/* Задания (сюжетные линии) и достижения.
   Задание становится активным, когда выполнены все задания из after. done(s) проверяется после каждого действия. */
(function (G) {
  'use strict';
  const SN = G.SN, D = SN.D;
  const npc = (s, id) => s.npc[id] || { rel: 0, mem: {} };
  const bizType = (s, id) => s.biz.some(b => b.id === id);

  D.questLines = {
    docs: ['🪪', 'Документы'], money: ['💼', 'Работа и деньги'], home: ['🏠', 'Крыша над головой'],
    study: ['🎓', 'Учёба'], biz: ['🏪', 'Своё дело'], people: ['👥', 'Люди'], fin: ['💳', 'Финансы'], life: ['🌱', 'Жизнь']
  };

  D.quests = [
    // ── Документы
    { id: 'q_nina', line: 'docs', title: 'Соцработник', desc: 'Познакомьтесь с Ниной Петровной в соццентре Старого района (будни, 9–18).',
      done: s => !!npc(s, 'nina').mem.intro, reward: { xp: 40, rep: 2 } },
    { id: 'q_passport', line: 'docs', after: ['q_nina'], title: 'Восстановить паспорт', desc: 'Получите направление у Нины Петровны, подайте заявление в МФЦ (Центр) и дождитесь 5 дней.',
      done: s => s.docs.passport, prog: s => s.docsPending.passport ? 'Готов на день ' + s.docsPending.passport : (s.flags.ninaReferral ? 'Направление есть — в МФЦ' : 'Нужно направление'), reward: { xp: 120, rep: 5 } },
    { id: 'q_oms', line: 'docs', after: ['q_passport'], title: 'Полис ОМС', desc: 'Оформите полис в МФЦ — бесплатная поликлиника.', done: s => s.docs.oms, reward: { xp: 50 } },
    { id: 'q_medbook', line: 'docs', after: ['q_passport'], title: 'Медкнижка', desc: 'Оформите медкнижку в Больничном квартале (2 700 ₽). Нужна для кафе, магазина и медицины.', done: s => s.docs.medbook, reward: { xp: 80 } },

    // ── Работа и деньги
    { id: 'q_firstgig', line: 'money', title: 'Первая подработка', desc: 'Выполните любую подработку.', done: s => s.c.gigs >= 1, reward: { xp: 30 } },
    { id: 'q_earn5k', line: 'money', after: ['q_firstgig'], title: 'Первые 5 000 ₽', desc: 'Заработайте суммарно 5 000 ₽.', done: s => s.c.earned >= 5000, prog: s => SN.U.num(Math.min(s.c.earned, 5000)) + ' / 5 000 ₽', reward: { xp: 60, money: 300 } },
    { id: 'q_job', line: 'money', after: ['q_passport'], title: 'Постоянная работа', desc: 'Пройдите собеседование и устройтесь на вакансию.', done: s => !!s.job || s.c.jobs > 0, reward: { xp: 150, rep: 5 } },
    { id: 'q_promo', line: 'money', after: ['q_job'], title: 'Первое повышение', desc: 'Получите повышение на работе.', done: s => s.job && s.job.rank >= 1, reward: { xp: 200, rep: 5 } },
    { id: 'q_skilled', line: 'money', after: ['q_job'], title: 'Квалифицированный труд', desc: 'Устройтесь на работу, где требуется специальное обучение.', done: s => s.job && (SN.D.jobById[s.job.id].req.certs || []).length > 0, reward: { xp: 200, rep: 6 } },

    // ── Жильё
    { id: 'q_shelter', line: 'home', title: 'Тёплая ночь', desc: 'Переночуйте в ночлежке Старого района (заселение с 19:00).', done: s => (s.flags.shelterNights || 0) >= 1, reward: { xp: 30 } },
    { id: 'q_hostel', line: 'home', after: ['q_shelter'], title: 'Своя койка', desc: 'Снимите койко-место в хостеле (4 200 ₽ в неделю).', done: s => s.housing !== 'street', reward: { xp: 100, rep: 3 } },
    { id: 'q_room', line: 'home', after: ['q_hostel'], title: 'Своя дверь', desc: 'Снимите комнату или квартиру.', done: s => ['room', 'flat', 'studio', 'house'].includes(s.housing), reward: { xp: 150, rep: 4 } },
    { id: 'q_own', line: 'home', after: ['q_room'], title: 'Своё жильё', desc: 'Купите квартиру-студию или дом.', done: s => ['studio', 'house'].includes(s.housing), reward: { xp: 600, rep: 10 } },

    // ── Учёба
    { id: 'q_self', line: 'study', title: 'Голова — тоже инструмент', desc: 'Позанимайтесь самообразованием в библиотеке.', done: s => s.c.studyH >= 2, reward: { xp: 30 } },
    { id: 'q_cert', line: 'study', after: ['q_self'], title: 'Первый документ об обучении', desc: 'Пройдите любой курс до конца.', done: s => s.certs.length >= 1, reward: { xp: 100, rep: 3 } },
    { id: 'q_school', line: 'study', after: ['q_cert'], title: 'Аттестат', desc: 'Окончите вечернюю школу.', done: s => s.certs.includes('school'), reward: { xp: 250, rep: 5 } },
    { id: 'q_diploma', line: 'study', after: ['q_school'], title: 'Диплом', desc: 'Получите диплом колледжа или вуза.', done: s => ['accounting', 'medcollege', 'university', 'meduni'].some(c => s.certs.includes(c)), reward: { xp: 500, rep: 8 } },

    // ── Своё дело
    { id: 'q_ip', line: 'biz', after: ['q_passport'], title: 'Индивидуальный предприниматель', desc: 'Зарегистрируйте ИП в Деловом районе.', done: s => s.docs.ip, reward: { xp: 80 } },
    { id: 'q_biz1', line: 'biz', after: ['q_ip'], title: 'Первая точка', desc: 'Откройте любой бизнес.', done: s => s.biz.length >= 1, reward: { xp: 200, rep: 5 } },
    { id: 'q_bizweek', line: 'biz', after: ['q_biz1'], title: 'Неделя в плюсе', desc: 'Наберите 7 прибыльных дней бизнеса.', done: s => s.c.bizProfitDays >= 7, prog: s => Math.min(7, s.c.bizProfitDays) + ' / 7 дней', reward: { xp: 250, rep: 5 } },
    { id: 'q_biz2', line: 'biz', after: ['q_bizweek'], title: 'Сеть', desc: 'Владейте тремя бизнесами одновременно.', done: s => s.biz.length >= 3, reward: { xp: 600, rep: 10 } },

    // ── Люди
    { id: 'q_seryoga', line: 'people', title: 'Плечо друга', desc: 'Подружитесь с Серёгой (отношения 40).', done: s => npc(s, 'seryoga').rel >= 40, prog: s => Math.round(npc(s, 'seryoga').rel) + ' / 40', reward: { xp: 60 } },
    { id: 'q_seryoga2', line: 'people', after: ['q_seryoga'], title: 'Сварщик шестого разряда', desc: 'Помогите Серёге вернуться в профессию.', done: s => !!s.flags.seryogaFactory, reward: { xp: 150, rep: 5 } },
    { id: 'q_mihalych', line: 'people', title: 'Письмо сыну', desc: 'Сблизьтесь с Михалычем на набережной и помогите ему помириться с сыном.', done: s => !!s.flags.mihalychReunited, reward: { xp: 200, rep: 6 } },
    { id: 'q_valera', line: 'people', title: 'Партнёр по гаражу', desc: 'Станьте партнёром Валеры (нужно ИП и доверие).', done: s => !!s.flags.valeraPartner, reward: { xp: 200, rep: 4 } },
    { id: 'q_date', line: 'people', title: 'Свидание', desc: 'Пригласите кого-нибудь на свидание и получите согласие.', done: s => Object.values(s.npc).some(n => n.status), reward: { xp: 100 } },
    { id: 'q_together', line: 'people', after: ['q_date'], title: 'Вместе', desc: 'Съезжайтесь с партнёром.', done: s => Object.values(s.npc).some(n => n.livingTogether), reward: { xp: 300, rep: 5 } },
    { id: 'q_wedding', line: 'people', after: ['q_together'], title: 'Семья', desc: 'Сыграйте свадьбу.', done: s => Object.values(s.npc).some(n => n.status === 'married'), reward: { xp: 600, rep: 10 } },

    // ── Финансы
    { id: 'q_account', line: 'fin', after: ['q_passport'], title: 'Банковский счёт', desc: 'Откройте счёт в банке (Деловой район). Деньги на счёте не украдут.', done: s => s.account, reward: { xp: 60 } },
    { id: 'q_cushion', line: 'fin', after: ['q_account'], title: 'Подушка безопасности', desc: 'Накопите 30 000 ₽ на счёте и вкладе.', done: s => s.bank + s.fin.deposit >= 30000, prog: s => SN.U.num(Math.min(30000, s.bank + s.fin.deposit)) + ' / 30 000 ₽', reward: { xp: 150, rep: 3 } },
    { id: 'q_invest', line: 'fin', after: ['q_cushion'], title: 'Инвестор', desc: 'Вложите деньги в индексный фонд.', done: s => (s.fin.funds.index || 0) > 0, reward: { xp: 80 } },
    { id: 'q_million', line: 'fin', after: ['q_cushion'], title: 'Первый миллион', desc: 'Достигните чистого капитала 1 000 000 ₽.', done: s => SN.Sys.fin.netWorth(s) >= 1e6, prog: s => SN.U.num(SN.Sys.fin.netWorth(s)) + ' ₽', reward: { xp: 1000, rep: 10 } },

    // ── Жизнь
    { id: 'q_clean', line: 'life', title: 'Опрятный вид', desc: 'Получите или купите чистую одежду и примите душ (гигиена 70+).', done: s => s.wear !== 'worn' && s.st.hygiene >= 70, reward: { xp: 40, rep: 2 } },
    { id: 'q_help', line: 'life', after: ['q_room'], title: 'Не забывай, откуда пришёл', desc: 'Помогите соццентру Нины Петровны (сблизьтесь и пожертвуйте на мастерские).', done: s => !!s.flags.donated, reward: { xp: 400, rep: 10 } }
  ];
  D.questById = Object.fromEntries(D.quests.map(q => [q.id, q]));

  D.achievements = [
    { id: 'a_day7', icon: '📅', name: 'Первая неделя', desc: 'Прожить 7 дней', done: s => SN.T.day(s) >= 8 },
    { id: 'a_day30', icon: '🗓️', name: 'Месяц в городе', desc: 'Прожить 30 дней', done: s => SN.T.day(s) >= 31 },
    { id: 'a_gigs10', icon: '🛠️', name: 'Не боюсь работы', desc: '10 подработок', done: s => s.c.gigs >= 10 },
    { id: 'a_shifts50', icon: '⏱️', name: 'Опора компании', desc: '50 смен на постоянной работе', done: s => s.c.jobs >= 50 },
    { id: 'a_top', icon: '🏔️', name: 'Вершина карьеры', desc: 'Максимальная должность', done: s => s.job && s.job.rank >= 4 },
    { id: 'a_docs', icon: '🗂️', name: 'Бумажная душа', desc: 'Паспорт, ОМС, медкнижка и права', done: s => s.docs.passport && s.docs.oms && s.docs.medbook && s.docs.license },
    { id: 'a_scholar', icon: '🎓', name: 'Вечный студент', desc: '5 документов об обучении', done: s => s.certs.length >= 5 },
    { id: 'a_skill50', icon: '⭐', name: 'Мастер своего дела', desc: 'Любой навык 50+', done: s => Object.values(s.sk).some(v => v >= 50) },
    { id: 'a_honest', icon: '😇', name: 'Честный человек', desc: 'Вернуть чужой кошелёк', done: s => (s.flags.honest || 0) >= 1 },
    { id: 'a_scam', icon: '🛡️', name: 'Меня не проведёшь', desc: 'Распознать мошенников', done: s => (s.flags.scamAvoided || 0) >= 1 },
    { id: 'a_dog', icon: '🐕', name: 'Лучший друг', desc: 'Приютить пса', done: s => !!s.flags.dog },
    { id: 'a_fish', icon: '🐟', name: 'Рыбак', desc: 'Поймать 10 рыб', done: s => s.c.fishCaught >= 10 },
    { id: 'a_friends3', icon: '🤝', name: 'Свои люди', desc: '3 друга (отношения 60+)', done: s => Object.values(s.npc).filter(n => n.rel >= 60).length >= 3 },
    { id: 'a_love', icon: '💞', name: 'Любовь', desc: 'Стать парой', done: s => Object.values(s.npc).some(n => n.status === 'partner' || n.status === 'married') },
    { id: 'a_biz', icon: '🏪', name: 'Предприниматель', desc: 'Открыть бизнес', done: s => s.biz.length >= 1 },
    { id: 'a_coffee', icon: '☕', name: 'Кофейный король', desc: 'Открыть кофейню', done: s => bizType(s, 'coffee') },
    { id: 'a_mall', icon: '🏢', name: 'Магнат', desc: 'Открыть торговый центр', done: s => bizType(s, 'mall') },
    { id: 'a_100k', icon: '💰', name: 'Сто тысяч', desc: 'Капитал 100 000 ₽', done: s => SN.Sys.fin.netWorth(s) >= 1e5 },
    { id: 'a_10m', icon: '💎', name: 'Мультимиллионер', desc: 'Капитал 10 млн ₽', done: s => SN.Sys.fin.netWorth(s) >= 1e7 },
    { id: 'a_car', icon: '🚗', name: 'За рулём', desc: 'Купить автомобиль', done: s => s.items.includes('car') || s.items.includes('sportcar') },
    { id: 'a_house', icon: '🏡', name: 'Свой дом', desc: 'Купить загородный дом', done: s => s.housing === 'house' },
    { id: 'a_travel', icon: '🧭', name: 'Путешественник', desc: 'Съездить в путешествие', done: s => (s.flags.traveled || 0) >= 1 },
    { id: 'a_explore', icon: '🗺️', name: 'Знаток города', desc: 'Побывать во всех районах', done: s => Object.keys(SN.D.districts).every(d => s.flags['visited_' + d] || s.district === d) },
    { id: 'a_survivor', icon: '🔥', name: 'Выживший', desc: 'Пережить обморок и вернуться', done: s => s.c.collapses >= 1 }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
