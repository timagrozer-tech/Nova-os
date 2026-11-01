/* Расширение 0.3: новые навыки, курсы, работы, бизнесы, вещи, доходные активы, биржа, таланты, события, задания */
(function (G) {
  'use strict';
  const SN = G.SN, D = SN.D, U = SN.U;

  // ── Навыки
  Object.assign(D.skillNames, { english: 'Английский', design: 'Дизайн', marketing: 'Маркетинг', law: 'Право' });
  Object.assign(D.skillIcons, { english: '🌐', design: '🎨', marketing: '📣', law: '⚖️' });

  // ── Курсы
  D.courses.push(
    { id: 'english', icon: '🌐', name: 'Английский в языковой школе', district: 'center', hours: 0, session: 2, cost: 0, sessionPrice: 700, open: [9, 21], repeat: true,
      gain: { english: 1.6 }, cap: { english: 75 }, desc: 'Занятие 700 ₽. Английский до 75 — переводы, пилот, международные компании.' },
    { id: 'barista', icon: '☕', name: 'Школа бариста', district: 'center', hours: 6, session: 3, cost: 4200, open: [9, 19], cert: 'barista', req: { docs: ['passport'] }, gain: { cooking: 2, social: 1 }, desc: 'Эспрессо, латте-арт, работа с гостями.' },
    { id: 'electric', icon: '⚡', name: 'Электромонтажник', district: 'industrial', hours: 24, session: 4, cost: 14000, open: [8, 18], cert: 'electric', req: { docs: ['passport'] }, gain: { craft: 3 }, desc: 'Допуск по электробезопасности.' },
    { id: 'welding', icon: '🔥', name: 'Курсы сварщика', district: 'industrial', hours: 20, session: 4, cost: 12000, open: [8, 18], cert: 'welding', req: { docs: ['passport'] }, gain: { craft: 3, physical: 1 }, desc: 'Ручная дуговая и полуавтоматическая сварка.' },
    { id: 'hair', icon: '💈', name: 'Парикмахер-барбер', district: 'sleeping', hours: 24, session: 4, cost: 16000, open: [10, 20], cert: 'hair', req: { docs: ['passport'] }, gain: { design: 2, social: 1 }, desc: 'Стрижки, бороды, работа с клиентом.' },
    { id: 'fitness', icon: '🏋️', name: 'Фитнес-инструктор', district: 'sleeping', hours: 20, session: 4, cost: 18000, open: [8, 21], cert: 'fitness', req: { docs: ['passport'], skills: { physical: 35 } }, gain: { physical: 2, social: 1 }, desc: 'Нужна физподготовка 35.' },
    { id: 'realtor', icon: '🔑', name: 'Курс риелтора', district: 'business', hours: 12, session: 4, cost: 9000, open: [10, 19], cert: 'realtor', req: { docs: ['passport'] }, gain: { trade: 2, law: 1 }, desc: 'Сделки, договоры, работа с покупателями.' },
    { id: 'design', icon: '🎨', name: 'Графический дизайн', district: 'center', hours: 40, session: 4, cost: 36000, open: [10, 21], cert: 'design', req: { items: ['laptop'] }, gain: { design: 2.5 }, desc: 'Фигма, типографика, айдентика. Нужен ноутбук.' },
    { id: 'marketing', icon: '📣', name: 'Интернет-маркетинг', district: 'business', hours: 30, session: 5, cost: 30000, open: [10, 20], cert: 'marketing', req: { certs: ['school'] }, gain: { marketing: 2.5 }, desc: 'Реклама, аналитика, продвижение.' },
    { id: 'teacher', icon: '👩‍🏫', name: 'Педагогический колледж', district: 'center', hours: 80, session: 5, cost: 52000, open: [9, 18], cert: 'teacher', req: { certs: ['school'] }, gain: { intellect: 1, social: 1 }, desc: 'Диплом учителя.' },
    { id: 'lawdeg', icon: '⚖️', name: 'Юридический факультет', district: 'center', hours: 200, session: 6, cost: 210000, open: [9, 18], cert: 'lawdeg', req: { certs: ['school'], skills: { intellect: 35 } }, gain: { law: 1.6, intellect: 0.6 }, desc: 'Высшее юридическое образование.' },
    { id: 'pilot', icon: '✈️', name: 'Лётное училище', district: 'industrial', hours: 300, session: 6, cost: 1500000, open: [7, 17], cert: 'pilot', req: { certs: ['school'], docs: ['medbook'], skills: { english: 40 } }, gain: { driving: 1, english: 0.5 }, desc: 'Самая дорогая учёба. Пилот получает больше всех.' }
  );
  D.courseById = Object.fromEntries(D.courses.map(c => [c.id, c]));
  Object.assign(D.certNames, { barista: 'Бариста', electric: 'Электромонтажник', welding: 'Сварщик', hair: 'Парикмахер', fitness: 'Фитнес-инструктор', realtor: 'Риелтор',
    design: 'Графический дизайн', marketing: 'Интернет-маркетинг', teacher: 'Диплом учителя', lawdeg: 'Диплом юриста', pilot: 'Свидетельство пилота' });

  // ── Работа
  const T5 = (...a) => a;
  D.jobs.push(
    { id: 'dogwalk', kind: 'gig', limit: 2, icon: '🐕', name: 'Выгул собак', district: 'sleeping', hours: 2, pay: 600, energy: 8, hyg: 3, open: [7, 21], req: { items: ['phone'] }, gain: { physical: 0.4, social: 0.2 }, desc: 'Заказы через приложение. Нужен смартфон.' },
    { id: 'handyman', kind: 'gig', limit: 1, icon: '🪛', name: 'Мастер на час', district: 'sleeping', hours: 3, pay: 1700, energy: 12, hyg: 5, open: [8, 20], req: { skills: { craft: 25 }, items: ['phone'] }, gain: { craft: 0.8 }, desc: 'Полки, краны, розетки. Ремесло 25.' },
    { id: 'tutor', kind: 'gig', limit: 2, icon: '📐', name: 'Репетитор', district: 'center', hours: 2, pay: 1600, energy: 8, hyg: 1, open: [14, 21], indoor: true, req: { certs: ['school'], skills: { intellect: 30 } }, gain: { intellect: 0.4, social: 0.4 }, scaleSkill: 'intellect', desc: 'Подготовка школьников к экзаменам.' },
    { id: 'translate', kind: 'gig', limit: 2, icon: '🌐', name: 'Переводы текстов', district: 'home', hours: 3, pay: 2400, energy: 9, hyg: 0, open: [0, 25], indoor: true, req: { skills: { english: 35 }, items: ['laptop'] }, gain: { english: 0.8 }, scaleSkill: 'english', desc: 'Английский 35 и ноутбук. Из дома.' },
    { id: 'photo', kind: 'gig', limit: 1, icon: '📸', name: 'Фотосессия', district: 'embankment', hours: 3, pay: 3500, energy: 10, hyg: 2, open: [9, 21], req: { skills: { design: 25 }, items: ['camera'] }, gain: { design: 1 }, scaleSkill: 'design', desc: 'Портреты и свадьбы. Камера + дизайн 25.' },
    { id: 'stream', kind: 'gig', limit: 1, icon: '🎙️', name: 'Стрим и блог', district: 'home', hours: 3, pay: 300, energy: 8, hyg: 0, open: [10, 26], indoor: true, req: { items: ['gamingpc'] }, gain: { social: 0.6, marketing: 0.4 }, scaleSkill: 'blog', desc: 'Каждый стрим приносит подписчиков, а с ними растёт доход.' },
    { id: 'barista', kind: 'job', icon: '☕', name: 'Бариста', district: 'center', hours: 8, pay: 2700, energy: 16, hyg: 2, open: [7, 12], indoor: true, perk: { food: 10 },
      req: { docs: ['passport', 'medbook'], certs: ['barista'] }, gain: { cooking: 0.6, social: 0.6 }, promo: 'social', interview: 0.25, track: T5('Бариста', 'Старший бариста', 'Шеф-бариста', 'Управляющий кофейней', 'Директор сети'), desc: 'Нужны школа бариста и медкнижка.' },
    { id: 'waiter', kind: 'job', icon: '🍷', name: 'Официант', district: 'embankment', hours: 8, pay: 2300, energy: 18, hyg: 3, open: [10, 15], indoor: true, tips: true, perk: { food: 15 },
      req: { docs: ['passport', 'medbook'], look: 2 }, gain: { social: 1 }, promo: 'social', interview: 0.2, track: T5('Официант', 'Старший официант', 'Администратор зала', 'Менеджер ресторана', 'Управляющий'), desc: 'Чаевые зависят от общения: от ×0,8 до ×1,8.' },
    { id: 'electric', kind: 'job', icon: '⚡', name: 'Электромонтажник', district: 'sleeping', hours: 8, pay: 4300, energy: 20, hyg: 6, open: [8, 12],
      req: { docs: ['passport'], certs: ['electric'] }, gain: { craft: 1 }, promo: 'craft', interview: 0.3, track: T5('Электромонтажник', 'Электрик 5 разряда', 'Бригадир', 'Прораб', 'Главный энергетик'), desc: 'Нужен допуск электромонтажника.' },
    { id: 'welder', kind: 'job', icon: '🔥', name: 'Сварщик', district: 'industrial', hours: 8, pay: 4600, energy: 24, hyg: 10, open: [7, 11], risk: 0.02,
      req: { docs: ['passport'], certs: ['welding'] }, gain: { craft: 1, physical: 0.4 }, promo: 'craft', interview: 0.3, track: T5('Сварщик', 'Сварщик 5 разряда', 'Сварщик 6 разряда', 'Мастер участка', 'Начальник цеха'), desc: 'Тяжело, но хорошо платят.' },
    { id: 'plumber', kind: 'job', icon: '🚰', name: 'Сантехник ЖЭКа', district: 'sleeping', hours: 8, pay: 3400, energy: 18, hyg: 9, open: [8, 12],
      req: { docs: ['passport'], skills: { craft: 30 } }, gain: { craft: 1 }, promo: 'craft', interview: 0.2, track: T5('Сантехник', 'Старший сантехник', 'Мастер участка', 'Главный инженер', 'Директор УК'), desc: 'Без диплома, но нужно ремесло 30.' },
    { id: 'barber', kind: 'job', icon: '💈', name: 'Барбер', district: 'sleeping', hours: 8, pay: 3600, energy: 12, hyg: 1, open: [9, 14], indoor: true,
      req: { docs: ['passport', 'medbook'], certs: ['hair'] }, gain: { design: 0.6, social: 0.5 }, promo: 'design', interview: 0.3, track: T5('Барбер', 'Топ-барбер', 'Арт-директор', 'Управляющий салоном', 'Владелец бренда'), desc: 'Нужны курс парикмахера и медкнижка.' },
    { id: 'trainer', kind: 'job', icon: '🏋️', name: 'Фитнес-тренер', district: 'sleeping', hours: 8, pay: 4200, energy: 22, hyg: 6, open: [7, 13], indoor: true,
      req: { docs: ['passport'], certs: ['fitness'] }, gain: { physical: 1, social: 0.5 }, promo: 'physical', interview: 0.3, track: T5('Тренер', 'Старший тренер', 'Мастер-тренер', 'Фитнес-директор', 'Управляющий сетью'), desc: 'Курс инструктора и физподготовка.' },
    { id: 'realtor', kind: 'job', icon: '🔑', name: 'Риелтор', district: 'business', hours: 8, pay: 2600, energy: 14, hyg: 1, open: [9, 13], indoor: true, commission: true,
      req: { docs: ['passport'], certs: ['realtor'], look: 2 }, gain: { trade: 1, law: 0.4 }, promo: 'trade', interview: 0.25, track: T5('Агент', 'Старший агент', 'Брокер', 'Руководитель офиса', 'Директор агентства'), desc: 'Комиссия: в удачный день до ×3, в пустой — ×0,4.' },
    { id: 'teacher', kind: 'job', icon: '👩‍🏫', name: 'Учитель', district: 'sleeping', hours: 8, pay: 3900, energy: 16, hyg: 1, open: [7, 10], indoor: true,
      req: { docs: ['passport'], certs: ['teacher'] }, gain: { intellect: 0.6, social: 0.6 }, promo: 'intellect', interview: 0.3, track: T5('Учитель', 'Учитель высшей категории', 'Завуч', 'Директор школы', 'Начальник департамента'), desc: 'Диплом педагогического колледжа.' },
    { id: 'designer', kind: 'job', icon: '🎨', name: 'Графический дизайнер', district: 'business', hours: 8, pay: 6400, energy: 12, hyg: 1, open: [9, 13], indoor: true,
      req: { docs: ['passport'], certs: ['design'], items: ['laptop'], skills: { design: 30 } }, gain: { design: 1.2 }, promo: 'design', interview: 0.45, track: T5('Дизайнер', 'Старший дизайнер', 'Арт-директор', 'Креативный директор', 'Партнёр студии'), desc: 'Курс дизайна, навык 30 и ноутбук.' },
    { id: 'marketer', kind: 'job', icon: '📣', name: 'Маркетолог', district: 'business', hours: 8, pay: 7300, energy: 12, hyg: 1, open: [9, 13], indoor: true,
      req: { docs: ['passport'], certs: ['marketing'], skills: { marketing: 30 }, look: 2 }, gain: { marketing: 1.2, social: 0.3 }, promo: 'marketing', interview: 0.5, track: T5('Маркетолог', 'Старший маркетолог', 'Руководитель группы', 'Директор по маркетингу', 'Вице-президент'), desc: 'Курс маркетинга и навык 30.' },
    { id: 'lawyer', kind: 'job', icon: '⚖️', name: 'Юрист', district: 'business', hours: 8, pay: 9600, energy: 14, hyg: 1, open: [9, 12], indoor: true,
      req: { docs: ['passport'], certs: ['lawdeg'], look: 3 }, gain: { law: 1.2, intellect: 0.4 }, promo: 'law', interview: 0.55, track: T5('Юрист', 'Старший юрист', 'Ведущий юрист', 'Руководитель практики', 'Управляющий партнёр'), desc: 'Диплом юриста и деловой вид.' },
    { id: 'pilot', kind: 'job', icon: '✈️', name: 'Пилот гражданской авиации', district: 'industrial', hours: 10, pay: 19000, energy: 22, hyg: 1, open: [6, 10], indoor: true,
      req: { docs: ['passport', 'medbook'], certs: ['pilot'], skills: { english: 50 } }, gain: { english: 0.6, driving: 0.6 }, promo: 'english', interview: 0.5, track: T5('Второй пилот', 'Второй пилот 1 класса', 'Командир ВС', 'Пилот-инструктор', 'Шеф-пилот'), desc: 'Лётное училище, английский 50, медкнижка.' }
  );
  D.jobById = Object.fromEntries(D.jobs.map(j => [j.id, j]));

  // ── Бизнесы
  D.business.push(
    { id: 'carwash', icon: '🚿', name: 'Автомойка', district: 'industrial', price: 520000, base: 40, check: 770, cogs: 0.15, rent: 5500, wage: 2200, cap: 12, staffMax: 4, ads: 900,
      req: { docs: ['ip'] }, season: { winter: 0.8, spring: 1.1, summer: 1.2, autumn: 1 }, rain: 0.6, desc: 'Простой старт: без лицензий. Дождь отпугивает клиентов.' },
    { id: 'barbershop', icon: '💈', name: 'Барбершоп', district: 'sleeping', price: 680000, base: 30, check: 1300, cogs: 0.1, rent: 7000, wage: 3000, cap: 8, staffMax: 4, ads: 1200,
      req: { docs: ['ip'], any: [{ certs: ['hair'] }, { certs: ['biz'] }] }, season: { winter: 1, spring: 1, summer: 1, autumn: 1 }, rain: 0.95, desc: 'Курс парикмахера или предпринимательства.' },
    { id: 'bakery', icon: '🥐', name: 'Пекарня', district: 'sleeping', price: 820000, base: 240, check: 290, cogs: 0.42, rent: 8000, wage: 2600, cap: 80, staffMax: 4, ads: 1200,
      req: { docs: ['ip', 'medbook'] }, season: { winter: 1.1, spring: 1, summer: 0.9, autumn: 1.05 }, rain: 1, desc: 'Утренний хлеб и выпечка. Медкнижка обязательна.' },
    { id: 'itstudio', icon: '💻', name: 'IT-студия', district: 'business', price: 1400000, base: 3, check: 34480, cogs: 0.05, rent: 12000, wage: 8000, cap: 0.75, staffMax: 6, ads: 3000,
      req: { docs: ['ip'], any: [{ certs: ['programming'] }, { skills: { tech: 45 } }] }, season: { winter: 1, spring: 1, summer: 0.9, autumn: 1.05 }, rain: 1, desc: 'Сайты и приложения на заказ. Программирование или техника 45.' },
    { id: 'gym', icon: '🏋️', name: 'Фитнес-клуб', district: 'sleeping', price: 2300000, base: 150, check: 560, cogs: 0.05, rent: 24000, wage: 3500, cap: 40, staffMax: 5, ads: 3000,
      req: { docs: ['ip'], certs: ['biz'] }, season: { winter: 1.1, spring: 1.15, summer: 0.8, autumn: 1 }, rain: 1.05, desc: 'Абонементы. Весной пик спроса.' },
    { id: 'hostelbiz', icon: '🛏️', name: 'Свой хостел', district: 'old', price: 3000000, base: 70, check: 1180, cogs: 0.1, rent: 15000, wage: 2600, cap: 30, staffMax: 3, ads: 2500,
      req: { docs: ['ip'], rep: 40 }, season: { winter: 0.8, spring: 1, summer: 1.35, autumn: 0.95 }, rain: 1, desc: 'Вы знаете, каково это — искать ночлег. Летом аншлаг.' },
    { id: 'restaurant', icon: '🍽️', name: 'Ресторан на набережной', district: 'embankment', price: 4200000, base: 150, check: 1390, cogs: 0.38, rent: 40000, wage: 3200, cap: 28, staffMax: 8, ads: 6000,
      req: { docs: ['ip', 'medbook'], certs: ['biz'], rep: 50 }, season: { winter: 0.85, spring: 1, summer: 1.2, autumn: 0.95 }, rain: 0.9, desc: 'Высокий чек, дорогая аренда. Репутация 50.' },
    { id: 'logistics', icon: '🚚', name: 'Транспортная компания', district: 'industrial', price: 8500000, base: 14, check: 30260, cogs: 0.45, rent: 50000, wage: 4500, cap: 2.6, staffMax: 8, ads: 8000,
      req: { docs: ['ip'], certs: ['biz', 'management'], rep: 60 }, season: { winter: 1.05, spring: 1, summer: 0.95, autumn: 1.1 }, rain: 1, desc: 'Перевозки для бизнеса. Нужен курс управления.' },
    { id: 'cinema', icon: '🎬', name: 'Кинотеатр', district: 'center', price: 11000000, base: 850, check: 410, cogs: 0.2, rent: 80000, wage: 3000, cap: 150, staffMax: 8, ads: 12000,
      req: { docs: ['ip'], certs: ['biz'], rep: 65 }, season: { winter: 1.1, spring: 0.95, summer: 0.85, autumn: 1.1 }, rain: 1.25, desc: 'Дождь и зима — лучшие друзья кино.' },
    { id: 'factory', icon: '🏭', name: 'Мебельная фабрика', district: 'industrial', price: 32000000, base: 28, check: 41650, cogs: 0.55, rent: 140000, wage: 4800, cap: 2.6, staffMax: 12, ads: 20000,
      req: { docs: ['ip'], certs: ['biz', 'management'], rep: 80 }, season: { winter: 0.95, spring: 1.05, summer: 1, autumn: 1 }, rain: 1, desc: 'Производство полного цикла. Вершина бизнес-карьеры.' }
  );
  D.bizById = Object.fromEntries(D.business.map(b => [b.id, b]));

  // ── Вещи и роскошь. cat: tech/transport/home/hobby/luxury. look — к внешнему виду, rep — разово к репутации,
  //    homeDaily — эффект каждый день при наличии жилья, apr — коллекционные: стоимость меняется каждый день
  const CAT = { phone: 'tech', laptop: 'tech', tent: 'home', stove: 'home', furniture: 'home', guitar: 'hobby', rod: 'hobby', bike: 'transport', car: 'transport', sportcar: 'transport', ring: 'luxury' };
  for (const k in CAT) D.items[k].cat = CAT[k];
  D.items.sportcar.look = 1; D.items.sportcar.rep = 5;
  Object.assign(D.items, {
    flagship: { cat: 'tech', name: 'Флагманский смартфон', icon: '📲', price: 95000, sell: 0.45, look: 1, desc: 'Работает как обычный смартфон, но добавляет +1 к внешнему виду.' },
    macbook: { cat: 'tech', name: 'Мощный ноутбук', icon: '🖥️', price: 180000, sell: 0.5, desc: 'Заменяет ноутбук. Навык «Техника» и дизайн растут на 20% быстрее.' },
    gamingpc: { cat: 'tech', name: 'Игровой компьютер', icon: '🕹️', price: 140000, sell: 0.5, needHome: true, homeDaily: { mood: 2 }, desc: 'Настроение +2 в день, можно вести стримы.' },
    tv: { cat: 'home', name: 'Большой телевизор', icon: '📺', price: 65000, sell: 0.4, needHome: true, homeDaily: { mood: 1.5, stress: -1 }, desc: 'Вечер дома приятнее: настроение +1,5 в день.' },
    console: { cat: 'hobby', name: 'Игровая приставка', icon: '🎮', price: 52000, sell: 0.5, needHome: true, homeDaily: { mood: 1.5, stress: -1.5 }, desc: 'Снимает стресс.' },
    treadmill: { cat: 'home', name: 'Беговая дорожка', icon: '🏃', price: 90000, sell: 0.45, needHome: true, homeDaily: { health: 0.6 }, skillDaily: { physical: 0.25 }, desc: 'Здоровье и физподготовка растут каждый день.' },
    kitchen: { cat: 'home', name: 'Кухня шефа', icon: '👨‍🍳', price: 280000, sell: 0.35, needHome: true, homeDaily: { mood: 1 }, desc: 'Домашняя еда сытнее на 30%, кулинария растёт вдвое быстрее.' },
    smarthome: { cat: 'home', name: 'Умный дом', icon: '🏠', price: 450000, sell: 0.4, needHome: true, desc: 'Сон +5%, коммунальные платежи −20%.' },
    camera: { cat: 'hobby', name: 'Фотокамера', icon: '📷', price: 85000, sell: 0.55, desc: 'Подработка фотографом (нужен дизайн 25).' },
    drone: { cat: 'hobby', name: 'Квадрокоптер', icon: '🚁', price: 70000, sell: 0.5, homeDaily: { mood: 0.5 }, desc: 'Аэросъёмка: фотосессии на 25% дороже.' },
    scooter: { cat: 'transport', name: 'Электросамокат', icon: '🛴', price: 38000, sell: 0.5, desc: 'Бесплатно и быстрее пешком: 32 мин между районами.' },
    moto: { cat: 'transport', name: 'Мотоцикл', icon: '🏍️', price: 520000, sell: 0.6, upkeep: 600, desc: 'Самый быстрый транспорт в пробках: 16 мин. Нужны права.' },
    premiumcar: { cat: 'transport', name: 'Бизнес-седан', icon: '🚘', price: 4200000, sell: 0.65, upkeep: 6000, look: 1, rep: 4, desc: 'Комфорт и статус. +1 к виду.' },
    yacht: { cat: 'luxury', name: 'Яхта', icon: '🛥️', price: 28000000, sell: 0.6, upkeep: 60000, homeDaily: { mood: 3, stress: -2 }, rep: 10, desc: 'Выходные на воде: настроение +3 в день.' },
    jet: { cat: 'luxury', name: 'Частный самолёт', icon: '🛩️', price: 450000000, sell: 0.6, upkeep: 900000, rep: 25, desc: 'Абсолютная вершина. Путешествия без ограничений.' },
    watch: { cat: 'luxury', name: 'Швейцарские часы', icon: '⌚', price: 900000, sell: 0.92, apr: [0.0003, 0.008], look: 1, desc: 'Коллекционные: цена меняется каждый день. +1 к виду.' },
    jewelry: { cat: 'luxury', name: 'Ювелирные украшения', icon: '💎', price: 1800000, sell: 0.9, apr: [0.0002, 0.006], look: 1, desc: 'Коллекционные, медленно дорожают.' },
    coins: { cat: 'luxury', name: 'Коллекция монет', icon: '🪙', price: 250000, sell: 0.9, apr: [0.0004, 0.007], desc: 'Нумизматика: стабильный рост.' },
    wine: { cat: 'luxury', name: 'Винная коллекция', icon: '🍷', price: 1200000, sell: 0.9, apr: [0.0005, 0.006], desc: 'Со временем только дорожает.' },
    painting: { cat: 'luxury', name: 'Картина современного художника', icon: '🖼️', price: 3000000, sell: 0.9, apr: [0.0004, 0.02], rep: 3, desc: 'Рискованно: цена может вырасти вдвое или упасть.' },
    vintagecar: { cat: 'luxury', name: 'Ретро-автомобиль', icon: '🚙', price: 6500000, sell: 0.9, upkeep: 3000, apr: [0.0003, 0.01], rep: 4, desc: 'Коллекционный: дорожает, но требует ухода.' }
  });
  D.itemCats = { tech: ['📱', 'Техника'], transport: ['🚗', 'Транспорт'], home: ['🛋️', 'Дом'], hobby: ['🎸', 'Хобби'], luxury: ['💎', 'Роскошь и коллекции'] };
  /* Замены: флагман работает как телефон, дорогие машины — как авто */
  D.itemAlias = { phone: ['flagship'], laptop: ['macbook'], car: ['premiumcar', 'sportcar', 'vintagecar'] };

  // ── Транспорт
  D.transport.scooter = { name: 'Электросамокат', icon: '🛴', mins: 32, cost: 0, energy: 2, item: 'scooter' };
  D.transport.moto = { name: 'Мотоцикл', icon: '🏍️', mins: 16, cost: 90, energy: 1, item: 'moto', doc: 'license' };
  D.transport.car.item = 'car';

  // ── Доходные активы (пассивный доход). inc/up — доход/расходы в день, rent — сдаётся арендаторам (бывают простои)
  D.passive = [
    { id: 'vending', cat: 'machine', icon: '🥤', name: 'Вендинговый автомат', price: 85000, inc: 190, up: 90, max: 10, desc: 'Кофе и снеки в офисных центрах. Дешевеет со временем.' },
    { id: 'photobooth', cat: 'machine', icon: '📸', name: 'Фотобудка в ТЦ', price: 160000, inc: 330, up: 140, max: 5, desc: 'Популярна по выходным.' },
    { id: 'parking', cat: 'realty', icon: '🅿️', name: 'Машиноместо', price: 450000, inc: 470, up: 65, max: 6, rent: true, desc: 'Сдаётся в аренду автомобилистам.' },
    { id: 'garage', cat: 'realty', icon: '🚪', name: 'Гараж', price: 700000, inc: 720, up: 90, max: 5, rent: true, desc: 'Аренда под склад или машину.' },
    { id: 'roomrent', cat: 'realty', icon: '🛏️', name: 'Комната под сдачу', price: 1100000, inc: 1150, up: 200, max: 5, rent: true, desc: 'Студенты и рабочие. Арендаторы меняются часто.' },
    { id: 'studiorent', cat: 'realty', icon: '🏢', name: 'Студия под сдачу', price: 2600000, inc: 2550, up: 400, max: 5, rent: true, desc: 'Самый популярный формат долгосрочной аренды.' },
    { id: 'flat2', cat: 'realty', icon: '🏙️', name: 'Двушка в центре', price: 6500000, inc: 6300, up: 1100, max: 4, rent: true, desc: 'Дорогая аренда для семей и экспатов.' },
    { id: 'office', cat: 'realty', icon: '🏬', name: 'Офисное помещение', price: 12000000, inc: 11800, up: 2300, max: 3, rent: true, req: { docs: ['ip'] }, desc: 'Коммерческая аренда. Нужно ИП.' },
    { id: 'warehouse', cat: 'realty', icon: '🏭', name: 'Склад в Промзоне', price: 25000000, inc: 24000, up: 5000, max: 3, rent: true, req: { docs: ['ip'] }, desc: 'Долгие договоры с логистами.' },
    { id: 'hotel', cat: 'realty', icon: '🏨', name: 'Мини-отель', price: 40000000, inc: 42000, up: 12000, max: 2, rent: true, req: { docs: ['ip'], rep: 60 }, seasonal: { winter: 0.8, spring: 1, summer: 1.3, autumn: 0.9 }, desc: 'Туристы летом. Репутация 60.' },
    { id: 'solar', cat: 'energy', icon: '☀️', name: 'Солнечная электростанция', price: 1500000, inc: 1700, up: 150, max: 4, seasonal: { winter: 0.3, spring: 1.1, summer: 1.6, autumn: 0.7 }, desc: 'Продаёт энергию в сеть. Летом втрое больше, чем зимой.' },
    { id: 'website', cat: 'online', icon: '🌐', name: 'Контентный сайт', price: 120000, inc: 260, up: 40, max: 3, decay: true, req: { skills: { tech: 25 } }, desc: 'Реклама на сайте. Трафик падает без обновлений (техника 25).' },
    { id: 'ecourse', cat: 'online', icon: '🎓', name: 'Авторский онлайн-курс', price: 150000, inc: 560, up: 60, max: 3, decay: true, req: { any: [{ skills: { design: 40 } }, { skills: { marketing: 40 } }, { skills: { tech: 40 } }, { skills: { cooking: 40 } }] }, desc: 'Продажи курса по вашему навыку 40+. Нужно обновлять.' }
  ];
  D.passiveById = Object.fromEntries(D.passive.map(p => [p.id, p]));
  D.passiveCats = { realty: ['🏠', 'Недвижимость'], machine: ['🤖', 'Автоматы'], energy: ['⚡', 'Энергия'], online: ['🌐', 'Онлайн'] };

  // ── Биржа (вымышленные компании)
  D.stocks = [
    { id: 'GRBK', name: 'Городской банк', icon: '🏦', sector: 'bank', price: 280, mu: 0.0006, sigma: 0.016, beta: 1.1, div: 0.09 },
    { id: 'NFTS', name: 'Нефтегаз-Север', icon: '🛢️', sector: 'oil', price: 180, mu: 0.0004, sigma: 0.019, beta: 1.0, div: 0.12 },
    { id: 'TXSF', name: 'ТехноСофт', icon: '💾', sector: 'tech', price: 3400, mu: 0.0011, sigma: 0.028, beta: 1.4, div: 0 },
    { id: 'RTLP', name: 'Ритейл Плюс', icon: '🛒', sector: 'retail', price: 1650, mu: 0.0005, sigma: 0.015, beta: 0.8, div: 0.07 },
    { id: 'STRI', name: 'СтройИнвест', icon: '🏗️', sector: 'build', price: 540, mu: 0.0005, sigma: 0.022, beta: 1.2, div: 0.05 },
    { id: 'ENRG', name: 'Энергосеть', icon: '⚡', sector: 'energy', price: 0.9, mu: 0.0003, sigma: 0.011, beta: 0.6, div: 0.1 },
    { id: 'MDFM', name: 'МедФарм', icon: '💊', sector: 'pharma', price: 720, mu: 0.0007, sigma: 0.018, beta: 0.7, div: 0.04 },
    { id: 'AVLN', name: 'АвиаЛинии', icon: '✈️', sector: 'avia', price: 64, mu: 0.0002, sigma: 0.03, beta: 1.5, div: 0 },
    { id: 'KBRI', name: 'КиберИгры', icon: '🎮', sector: 'games', price: 2100, mu: 0.0012, sigma: 0.035, beta: 1.6, div: 0 },
    { id: 'AGRO', name: 'АгроХолдинг', icon: '🌾', sector: 'agro', price: 410, mu: 0.0004, sigma: 0.014, beta: 0.5, div: 0.08 }
  ];
  D.stockById = Object.fromEntries(D.stocks.map(x => [x.id, x]));
  D.sectorNews = {
    bank: ['ЦБ снизил ключевую ставку — банки растут', 'Проблемные кредиты ударили по банкам'],
    oil: ['Нефть подорожала на мировых рынках', 'Нефть дешевеет: спрос падает'],
    tech: ['ТехноСофт выиграл крупный госконтракт', 'Утечка данных: инвесторы продают IT'],
    retail: ['Рекордные продажи перед праздниками', 'Покупатели экономят: выручка ритейла падает'],
    build: ['Город запускает программу новостроек', 'Ипотека подорожала: стройка тормозит'],
    energy: ['Тарифы на электроэнергию повышены', 'Тарифы заморожены регулятором'],
    pharma: ['МедФарм зарегистрировал новое лекарство', 'Клинические испытания провалились'],
    avia: ['Сезон отпусков: авиабилеты раскуплены', 'Закрыты популярные направления'],
    games: ['Хит КиберИгр бьёт рекорды продаж', 'Релиз игры перенесён на год'],
    agro: ['Рекордный урожай зерна', 'Засуха уничтожила часть урожая']
  };

  // ── Таланты: очки даются за уровни, их можно и купить
  D.perks = [
    { id: 'thrifty', icon: '🧾', name: 'Экономный', cost: 1, desc: 'Еда и услуги дешевле на 5%.' },
    { id: 'haggler', icon: '🤝', name: 'Торгаш', cost: 1, desc: 'Вещи, одежда и транспорт дешевле на 10%.' },
    { id: 'ironstomach', icon: '🍖', name: 'Железный желудок', cost: 1, desc: 'Голод растёт на 15% медленнее, никаких отравлений.' },
    { id: 'nightowl', icon: '🦉', name: 'Выносливый', cost: 1, desc: 'Энергия днём тратится на 20% медленнее.' },
    { id: 'hardy', icon: '🧊', name: 'Закалённый', cost: 1, desc: 'На 30% меньше мёрзнете, болеете вдвое реже.' },
    { id: 'zen', icon: '🧘', name: 'Невозмутимый', cost: 1, desc: 'Стресс от работы и учёбы на 40% меньше.' },
    { id: 'driver', icon: '🛣️', name: 'Знаток города', cost: 1, desc: 'Поездки на 25% быстрее.' },
    { id: 'workaholic', icon: '⚙️', name: 'Трудоголик', cost: 2, desc: 'Смены отнимают на 15% меньше энергии.' },
    { id: 'negotiator', icon: '💬', name: 'Переговорщик', cost: 2, desc: 'Зарплата и оплата подработок +10%.' },
    { id: 'fastlearner', icon: '📚', name: 'Быстро учусь', cost: 2, desc: 'Навыки от учёбы и мастер-классов растут на 25% быстрее.' },
    { id: 'athlete', icon: '💪', name: 'Атлет', cost: 2, desc: 'Физподготовка +30% быстрее, сон восстанавливает на 10% больше.' },
    { id: 'charisma', icon: '✨', name: 'Обаяние', cost: 2, desc: 'Отношения растут быстрее, собеседования и свидания легче.' },
    { id: 'lucky', icon: '🍀', name: 'Везунчик', cost: 2, desc: 'Эффективность смен +5%, больше чаевых и комиссий.' },
    { id: 'banker', icon: '🏦', name: 'Финансист', cost: 2, desc: 'Ставки по вкладам +20%, по кредитам −15%.' },
    { id: 'investor', icon: '📈', name: 'Инвестор', cost: 2, desc: 'Без комиссии брокера, дивиденды +10%.' },
    { id: 'landlord', icon: '🔑', name: 'Арендодатель', cost: 2, desc: 'Простои вдвое реже, расходы на недвижимость −15%.' },
    { id: 'manager', icon: '📋', name: 'Руководитель', cost: 3, desc: 'Зарплаты в вашем бизнесе −10%.' },
    { id: 'marketer', icon: '📣', name: 'Прирождённый маркетолог', cost: 3, desc: 'Спрос во всех ваших бизнесах +8%.' },
    { id: 'tycoon', icon: '👑', name: 'Магнат', cost: 3, desc: 'Расширение бизнеса дешевле на 25%, насыщение рынка вдвое слабее.' }
  ];
  D.perkById = Object.fromEntries(D.perks.map(p => [p.id, p]));

  // ── Самые богатые жители (вымышленные) — для рейтинга
  D.rich = [
    { name: 'Аркадий Велесов', icon: '🛢️', w: 3.1e9, g: 0.0004, what: 'нефть и газ' },
    { name: 'Ирина Остроумова', icon: '💾', w: 1.9e9, g: 0.0009, what: 'IT-холдинг' },
    { name: 'Семья Громовых', icon: '🏗️', w: 1.2e9, g: 0.0003, what: 'девелопмент' },
    { name: 'Тимур Байрамов', icon: '🛒', w: 6.4e8, g: 0.0005, what: 'сеть супермаркетов' },
    { name: 'Олег Кравец', icon: '🚚', w: 2.8e8, g: 0.0004, what: 'логистика' },
    { name: 'Мария Белова', icon: '☕', w: 9.5e7, g: 0.0007, what: 'кофейни (ваша наставница)' },
    { name: 'Степан Лукин', icon: '🏭', w: 4.2e7, g: 0.0003, what: 'мебельное производство' },
    { name: 'Вера Тихонова', icon: '🏨', w: 1.8e7, g: 0.0004, what: 'гостиницы' },
    { name: 'Геннадий Шульц', icon: '🔧', w: 6e6, g: 0.0003, what: 'сеть автосервисов' },
    { name: 'Анна Ким', icon: '🎨', w: 2.5e6, g: 0.0006, what: 'дизайн-студия' }
  ];

  // ── События
  const E = () => SN.Sys.econ, St = () => SN.Sys.stats;
  D.events.push(
    { id: 'tenantdamage', icon: '🔨', title: 'Арендатор всё сломал', w: 2, when: s => (s.passive || []).some(p => D.passiveById[p.id].rent && !p.vac),
      text: 'Арендатор съехал, оставив разбитую сантехнику и пятна на стенах. Ремонт обойдётся в 35 000 ₽.',
      choices: [
        { t: 'Сделать ремонт', lock: s => s.fin.ins.property || E().canPay(s, 35000) ? '' : 'Нет 35 000 ₽', run: s => { if (s.fin.ins.property) return 'Страховка имущества покрыла ремонт полностью.'; E().pay(s, 35000, 'passive', 'Ремонт после арендатора'); return 'Квартира снова как новая.'; } },
        { t: 'Сдать как есть (дешевле)', run: s => { const p = s.passive.find(x => D.passiveById[x.id].rent); if (p) p.q = Math.max(0.6, (p.q || 1) * 0.85); return 'Доход с этого объекта снизился на 15%.'; } }
      ] },
    { id: 'inherit', icon: '📜', title: 'Неожиданное наследство', w: 0.4, when: s => SN.T.day(s) > 40 && !s.flags.inherited,
      text: 'Нотариус сообщает: дальний родственник оставил вам 150 000 ₽.',
      choices: [{ t: 'Принять наследство', run: s => { s.flags.inherited = true; E().earn(s, 150000, 'gift', 'Наследство'); return 'Деньги поступили. Распорядитесь ими с умом.'; } }] },
    { id: 'bizbuyout', icon: '💼', title: 'Предложение о покупке', w: 1, when: s => s.biz.length > 0,
      text: 'Сетевой инвестор хочет купить одну из ваших точек за 130% рыночной стоимости.',
      choices: [
        { t: 'Продать дороже рынка', run: s => { const b = s.biz[0], v = Math.round(SN.Sys.biz.sellValue(s, b) * 1.3); s.biz = s.biz.filter(x => x !== b); E().earn(s, v, 'business', 'Продажа инвестору: ' + D.bizById[b.id].name); return 'Сделка закрыта: ' + U.money(v) + '.'; } },
        { t: 'Отказаться — дело не продаётся', run: s => { s.rep = U.clamp(s.rep + 1); return 'Вы верите в своё дело.'; } }
      ] },
    { id: 'kolyastartup', icon: '🚀', title: 'Коля ищет инвестора', w: 1, when: s => (s.npc.kolya || {}).rel >= 30 && !s.flags.kolyaInvest && SN.Sys.econ.available(s) > 300000,
      text: 'Коля привлекает деньги в своё приложение для поиска честной подработки: 300 000 ₽ за долю. Риск большой — стартапы часто прогорают.',
      choices: [
        { t: 'Вложить 300 000 ₽', lock: s => E().canPay(s, 300000) ? '' : 'Нет 300 000 ₽', run: s => { E().pay(s, 300000, 'invest', 'Доля в стартапе Коли'); s.flags.kolyaInvest = SN.T.day(s); return 'Через месяц станет ясно, взлетит ли приложение.'; } },
        { t: 'Пожелать удачи', run: () => 'Коля не обижается: «Понимаю, это риск».' }
      ] },
    { id: 'startupresult', icon: '📊', title: 'Новости стартапа', w: 5, when: s => s.flags.kolyaInvest > 0 && SN.T.day(s) - s.flags.kolyaInvest >= 30,
      text: 'Коля звонит с новостями о приложении.',
      choices: [{ t: 'Слушаю!', run: s => { s.flags.kolyaInvest = -1; if (U.chance(s, 0.45)) { E().earn(s, 1500000, 'invest', 'Выкуп доли в стартапе'); return 'Приложение купила крупная IT-компания! Ваша доля — 1 500 000 ₽.'; } if (U.chance(s, 0.5)) { E().earn(s, 300000, 'invest', 'Возврат вложений'); return 'Взлететь не получилось, но Коля вернул вложенное: 300 000 ₽.'; } return 'Стартап закрылся. Деньги потеряны — такова цена венчурных инвестиций.'; } }] },
    { id: 'taxaudit', icon: '🧾', title: 'Налоговая проверка', w: 1, when: s => s.biz.length > 0 || (s.passive || []).length > 2,
      text: 'Налоговая запросила документы по вашим доходам.',
      choices: [
        { t: 'Нанять бухгалтера (15 000 ₽)', lock: s => E().canPay(s, 15000) ? '' : 'Нет 15 000 ₽', run: s => { E().pay(s, 15000, 'business', 'Бухгалтер для проверки'); return 'Всё в порядке, претензий нет.'; } },
        { t: 'Разобраться самому', run: s => { if (s.sk.finance >= 30 || s.sk.law >= 25) return 'Навыки пригодились: проверка прошла без замечаний.'; const f = Math.min(E().available(s), 40000); E().pay(s, f, 'business', 'Доначисление налога'); return 'Найдены ошибки: доначислено ' + U.money(f) + '. Финансы или право помогли бы.'; } }
      ] },
    { id: 'charityask', icon: '❤️', title: 'Просьба соццентра', w: 1, when: s => SN.Sys.fin.netWorth(s) > 500000 && (s.npc.nina || {}).met,
      text: 'Нина Петровна пишет: зимой в ночлежке не хватает одеял и еды. Нужны 20 000 ₽.',
      choices: [
        { t: 'Помочь 20 000 ₽', lock: s => E().canPay(s, 20000) ? '' : 'Нет 20 000 ₽', run: s => { E().pay(s, 20000, 'gift', 'Помощь ночлежке'); s.rep = U.clamp(s.rep + 6); St().apply(s, { mood: 12 }); return 'Сорок человек проведут зиму в тепле. Репутация +6.'; } },
        { t: 'Не сейчас', run: () => 'Нина Петровна понимает.' }
      ] }
  );

  // ── Задания и достижения
  D.questLines.invest = ['📈', 'Капитал'];
  D.quests.push(
    { id: 'q_passive1', line: 'invest', title: 'Деньги работают', desc: 'Купите первый доходный актив (раздел «Активы»).', done: s => (s.passive || []).length >= 1, reward: { xp: 150, rep: 3 } },
    { id: 'q_broker', line: 'invest', after: ['q_account'], title: 'На бирже', desc: 'Откройте брокерский счёт и купите акции.', done: s => Object.values(s.fin.port || {}).some(p => p.q > 0), reward: { xp: 120 } },
    { id: 'q_passive5k', line: 'invest', after: ['q_passive1'], title: 'Рантье', desc: 'Пассивный доход 5 000 ₽ в день.', done: s => SN.Sys.inv.passivePerDay(s) >= 5000, prog: s => U.num(SN.Sys.inv.passivePerDay(s)) + ' / 5 000 ₽', reward: { xp: 400, rep: 6 } },
    { id: 'q_passive50k', line: 'invest', after: ['q_passive5k'], title: 'Финансовая свобода', desc: 'Пассивный доход 50 000 ₽ в день — больше любой зарплаты.', done: s => SN.Sys.inv.passivePerDay(s) >= 50000, prog: s => U.num(SN.Sys.inv.passivePerDay(s)) + ' / 50 000 ₽', reward: { xp: 1500, rep: 12 } },
    { id: 'q_score', line: 'invest', after: ['q_account'], title: 'Надёжный заёмщик', desc: 'Кредитный рейтинг 750+.', done: s => SN.Sys.inv.score(s) >= 750, prog: s => SN.Sys.inv.score(s) + ' / 750', reward: { xp: 300 } },
    { id: 'q_talent', line: 'life', title: 'Свой стиль', desc: 'Изучите первый талант (Ещё → Таланты).', done: s => (s.perks || []).length >= 1, reward: { xp: 60 } }
  );
  D.questById = Object.fromEntries(D.quests.map(q => [q.id, q]));
  D.achievements.push(
    { id: 'a_landlord', icon: '🔑', name: 'Арендодатель', desc: '5 объектов недвижимости под сдачу', done: s => (s.passive || []).filter(p => D.passiveById[p.id].rent).length >= 5 },
    { id: 'a_portfolio', icon: '📈', name: 'Портфель на миллион', desc: 'Акции на 1 000 000 ₽', done: s => SN.Sys.inv.portfolioValue(s) >= 1e6 },
    { id: 'a_collector', icon: '🖼️', name: 'Коллекционер', desc: '3 коллекционных предмета', done: s => s.items.filter(i => D.items[i].apr).length >= 3 },
    { id: 'a_yacht', icon: '🛥️', name: 'Капитан', desc: 'Купить яхту', done: s => s.items.includes('yacht') },
    { id: 'a_jet', icon: '🛩️', name: 'Небо принадлежит вам', desc: 'Частный самолёт', done: s => s.items.includes('jet') },
    { id: 'a_talents', icon: '🌟', name: 'Разносторонний', desc: '8 талантов', done: s => (s.perks || []).length >= 8 },
    { id: 'a_top10', icon: '🏅', name: 'В десятке богатейших', desc: 'Войти в рейтинг состояний города', done: s => SN.Sys.inv.richRank(s) <= 10 },
    { id: 'a_top1', icon: '👑', name: 'Самый богатый', desc: 'Первое место в рейтинге', done: s => SN.Sys.inv.richRank(s) === 1 },
    { id: 'a_autopilot', icon: '⏩', name: 'Жизнь на скорости', desc: 'Прожить неделю за раз', done: s => s.c.autoDays >= 7 },
    { id: 'a_mortgage', icon: '🏦', name: 'Свободен от ипотеки', desc: 'Полностью погасить ипотеку', done: s => !!s.flags.mortRepaid },
    { id: 'a_pilot', icon: '✈️', name: 'Командир', desc: 'Стать пилотом', done: s => s.job && s.job.id === 'pilot' },
    { id: 'a_blog', icon: '🎙️', name: 'Блогер', desc: '10 000 подписчиков', done: s => (s.flags.subs || 0) >= 10000 }
  );
})(typeof window !== 'undefined' ? window : globalThis);
