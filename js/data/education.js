/* Образование. Каждый курс: общая длительность (hours), занятие (session) — сколько часов
   идёт одно посещение, cost — полная стоимость (списывается частями за каждое занятие).
   Сертификат (cert) выдаётся один раз. Самообразование развивает навык, но не даёт документов. */
(function (G) {
  'use strict';
  const D = G.SN.D;
  D.courses = [
    { id: 'library', icon: '📚', name: 'Самообразование в библиотеке', district: 'center', hours: 0, session: 2, cost: 0, open: [9, 20], free: true,
      repeat: true, gain: { intellect: 1 }, cap: { intellect: 30 }, desc: 'Бесплатно. Развивает интеллект до 30, но документов не даёт.' },
    { id: 'pc', icon: '🖱️', name: 'Компьютерная грамотность', district: 'old', hours: 6, session: 2, cost: 0, open: [10, 17], cert: 'pc',
      gain: { tech: 2 }, desc: 'Бесплатный курс при соццентре: почта, документы, госуслуги.' },
    { id: 'finlit', icon: '🧮', name: 'Финансовая грамотность', district: 'business', hours: 6, session: 2, cost: 0, open: [10, 19], cert: 'finlit',
      gain: { finance: 3 }, desc: 'Бесплатные лекции банка: бюджет, кредиты, мошенники.' },
    { id: 'cashier', icon: '🛒', name: 'Курс продавца-кассира', district: 'center', hours: 8, session: 4, cost: 0, open: [9, 17], cert: 'cashier',
      req: { docs: ['passport'] }, gain: { trade: 3 }, desc: 'Центр занятости, бесплатно для безработных. Нужен паспорт.' },
    { id: 'guard', icon: '🛡️', name: 'Лицензия охранника', district: 'center', hours: 10, session: 5, cost: 4500, open: [9, 15], cert: 'guard',
      req: { docs: ['passport', 'medbook'] }, gain: { physical: 2 }, desc: 'Учебный центр + экзамен. Нужна медкнижка.' },
    { id: 'cook', icon: '🧑‍🍳', name: 'Курсы повара', district: 'center', hours: 12, session: 4, cost: 5400, open: [9, 18], cert: 'cook',
      req: { docs: ['passport'] }, gain: { cooking: 4 }, desc: 'Санитарные нормы, заготовки, работа на линии.' },
    { id: 'mechanic', icon: '🔧', name: 'Курс автослесаря', district: 'industrial', hours: 24, session: 4, cost: 9600, open: [8, 18], cert: 'mechanic',
      req: { docs: ['passport'] }, gain: { craft: 3 }, desc: 'Практика в автосервисе.' },
    { id: 'driving', icon: '🚗', name: 'Автошкола (категория B)', district: 'sleeping', hours: 30, session: 3, cost: 33000, open: [9, 20], doc: 'license',
      req: { docs: ['passport', 'medbook'] }, gain: { driving: 3 }, desc: 'Теория, вождение, экзамен в ГИБДД. Даёт права.' },
    { id: 'biz', icon: '📊', name: 'Основы предпринимательства', district: 'business', hours: 12, session: 4, cost: 7500, open: [10, 19], cert: 'biz',
      req: { docs: ['passport'] }, gain: { trade: 2, finance: 2 }, desc: 'Бизнес-инкубатор: учёт, налоги, найм. Нужен для кофейни и магазина.' },
    { id: 'school', icon: '🎒', name: 'Вечерняя школа (аттестат)', district: 'sleeping', hours: 40, session: 4, cost: 0, open: [17, 21], cert: 'school',
      req: { docs: ['passport'] }, gain: { intellect: 2 }, desc: 'Бесплатно, вечерами. Аттестат открывает колледж и офис.' },
    { id: 'programming', icon: '💻', name: 'Курсы программирования', district: 'center', hours: 60, session: 4, cost: 48000, open: [10, 21], cert: 'programming',
      req: { certs: ['pc'], items: ['laptop'] }, gain: { tech: 2.5, intellect: 0.5 }, desc: 'Долгий путь в IT. Нужен свой ноутбук.' },
    { id: 'management', icon: '🧑‍💼', name: 'Курс управления командой', district: 'business', hours: 30, session: 5, cost: 26000, open: [10, 19], cert: 'management',
      req: { certs: ['school'] }, gain: { social: 2, finance: 1 }, desc: 'Найм, мотивация, планирование.' },
    { id: 'accounting', icon: '🧾', name: 'Колледж: бухучёт', district: 'center', hours: 80, session: 5, cost: 62000, open: [9, 18], cert: 'accounting',
      req: { certs: ['school'] }, gain: { finance: 2, intellect: 1 }, desc: 'Диплом колледжа. Профессия бухгалтера.' },
    { id: 'medcollege', icon: '💉', name: 'Медицинский колледж', district: 'hospital', hours: 100, session: 5, cost: 74000, open: [8, 17], cert: 'medcollege',
      req: { certs: ['school'], docs: ['medbook'] }, gain: { intellect: 1.5, social: 0.5 }, desc: 'Диплом медсестры / медбрата.' },
    { id: 'university', icon: '🏛️', name: 'Университет (экономика)', district: 'center', hours: 200, session: 6, cost: 190000, open: [9, 18], cert: 'university',
      req: { certs: ['school'], skills: { intellect: 35 } }, gain: { intellect: 1.5, finance: 1, social: 0.5 }, desc: 'Высшее образование. Нужен интеллект 35 для поступления.' },
    { id: 'meduni', icon: '🩺', name: 'Медицинский университет', district: 'hospital', hours: 240, session: 6, cost: 260000, open: [8, 17], cert: 'meduni',
      req: { certs: ['medcollege'], skills: { intellect: 40 } }, gain: { intellect: 1.5 }, desc: 'Путь к профессии врача.' }
  ];
  D.courseById = Object.fromEntries(D.courses.map(c => [c.id, c]));
  D.certNames = { pc: 'Компьютерная грамотность', finlit: 'Финансовая грамотность', cashier: 'Продавец-кассир', guard: 'Лицензия охранника',
    cook: 'Повар', mechanic: 'Автослесарь', biz: 'Основы предпринимательства', school: 'Аттестат', programming: 'Программирование',
    management: 'Управление', accounting: 'Диплом: бухучёт', medcollege: 'Диплом медколледжа', university: 'Диплом вуза', meduni: 'Диплом врача' };
  D.docNames = { passport: 'Паспорт', oms: 'Полис ОМС', medbook: 'Медкнижка', license: 'Права (B)', ip: 'ИП' };
  D.skillNames = { physical: 'Физподготовка', social: 'Общение', intellect: 'Интеллект', finance: 'Финансы', cooking: 'Кулинария',
    tech: 'Техника и IT', trade: 'Торговля', craft: 'Ремесло', driving: 'Вождение', music: 'Музыка' };
  D.skillIcons = { physical: '💪', social: '🗣️', intellect: '🧠', finance: '🧮', cooking: '🍳', tech: '💻', trade: '🤝', craft: '🛠️', driving: '🚗', music: '🎸' };
})(typeof window !== 'undefined' ? window : globalThis);
