/* Работа: подработки (gig) — без найма, вакансии (job) — с собеседованием и карьерой.
   pay — оплата за смену в ₽, hours — длительность, energy — расход энергии. */
(function (G) {
  'use strict';
  const D = G.SN.D;
  D.RANK_MULT = [1, 1.18, 1.4, 1.7, 2.0];
  D.RANK_SHIFTS = [0, 10, 25, 45, 75];
  D.RANK_SKILL = [0, 15, 30, 45, 60];

  D.jobs = [
    // ── Подработки: доступны сразу, оплата наличными после смены
    { id: 'recycle', kind: 'gig', limit: 3, icon: '♻️', name: 'Сбор и сдача вторсырья', district: 'old', hours: 2, pay: 230, energy: 9, hyg: 8, open: [6, 21],
      gain: { physical: 0.5 }, desc: 'Пластик, картон, металлолом. Мало, но всегда доступно.' },
    { id: 'flyers', kind: 'gig', limit: 1, icon: '📰', name: 'Раздача листовок', district: 'center', hours: 3, pay: 480, energy: 8, hyg: 3, open: [9, 20],
      gain: { social: 0.6 }, desc: 'Стоять у метро и улыбаться прохожим.' },
    { id: 'yard', kind: 'gig', limit: 1, icon: '🧹', name: 'Уборка дворов (поденно)', district: 'sleeping', hours: 3, pay: 620, energy: 14, hyg: 7, open: [6, 18],
      gain: { physical: 0.6 }, desc: 'Управляющая компания платит наличными за смену.' },
    { id: 'unload', kind: 'gig', limit: 2, icon: '📦', name: 'Разгрузка фуры', district: 'industrial', hours: 3, pay: 720, energy: 22, hyg: 10, open: [6, 22], risk: 0.02,
      gain: { physical: 1 }, desc: 'Тяжело, но платят сразу. Нужна энергия.' },
    { id: 'carwash', kind: 'gig', limit: 1, icon: '🚿', name: 'Помощник на автомойке', district: 'industrial', hours: 4, pay: 760, energy: 16, hyg: 6, open: [8, 21],
      gain: { craft: 0.3 }, desc: 'Мойка, пылесос, протирка салона.' },
    { id: 'dishwash', kind: 'gig', limit: 1, icon: '🍽️', name: 'Мойщик посуды (вечер)', district: 'center', hours: 4, pay: 1000, energy: 13, hyg: 4, open: [16, 23], indoor: true,
      req: { hygiene: 30 }, gain: { cooking: 0.3 }, desc: 'Кафе берёт на вечер, если выглядишь опрятно. Тепло и кормят.' , perk: { food: 15 } },
    { id: 'labor', kind: 'gig', limit: 1, icon: '🧱', name: 'Подсобник на стройке', district: 'industrial', hours: 6, pay: 1550, energy: 30, hyg: 12, open: [7, 18], risk: 0.03,
      req: { skills: { physical: 15 } }, gain: { physical: 1.2, craft: 0.4 }, desc: 'Бригадир берёт крепких, раз в день. Нужна физподготовка 15.' },
    { id: 'footcourier', kind: 'gig', limit: 2, icon: '🚶', name: 'Пеший курьер', district: 'center', hours: 4, pay: 1450, energy: 20, hyg: 6, open: [9, 23],
      req: { docs: ['passport'], items: ['phone'] }, gain: { physical: 0.6 }, desc: 'Приложение требует паспорт и смартфон.' },
    { id: 'bikecourier', kind: 'gig', limit: 2, icon: '🚲', name: 'Велокурьер', district: 'center', hours: 4, pay: 2300, energy: 22, hyg: 7, open: [9, 23],
      req: { docs: ['passport'], items: ['phone', 'bike'] }, gain: { physical: 0.8 }, desc: 'Больше заказов за смену.' },
    { id: 'busk', kind: 'gig', limit: 3, icon: '🎸', name: 'Уличный музыкант', district: 'embankment', hours: 2, pay: 350, energy: 8, hyg: 2, open: [11, 22],
      req: { items: ['guitar'] }, gain: { music: 1, social: 0.3 }, scaleSkill: 'music', desc: 'Доход зависит от навыка музыки и погоды.' },
    { id: 'fairseller', kind: 'gig', limit: 1, icon: '🎪', name: 'Продавец на ярмарке', district: 'center', hours: 5, pay: 1700, energy: 14, hyg: 4, open: [10, 19],
      req: { flag: 'fair' }, gain: { trade: 1, social: 0.5 }, desc: 'Только во время городской ярмарки.' },
    { id: 'taxi', kind: 'gig', limit: 1, icon: '🚕', name: 'Водитель такси', district: 'center', hours: 6, pay: 4300, energy: 16, hyg: 3, open: [6, 25], indoor: true,
      req: { docs: ['passport', 'license'], items: ['car', 'phone'] }, gain: { driving: 1 }, fuel: 600, desc: 'Своё авто + права. Топливо 600 ₽ за смену.' },
    { id: 'freelance', kind: 'gig', limit: 2, icon: '💻', name: 'Фриланс-заказ', district: 'home', hours: 4, pay: 3200, energy: 12, hyg: 0, open: [0, 25], indoor: true,
      req: { certs: ['programming'], items: ['laptop'] }, gain: { tech: 1 }, scaleSkill: 'tech', desc: 'Работа из дома, нужен ноутбук и навык программирования.' },

    // ── Вакансии: собеседование, одна основная работа, повышения
    { id: 'loader', kind: 'job', icon: '🏗️', name: 'Грузчик на складе', district: 'industrial', hours: 8, pay: 3000, energy: 28, hyg: 10, open: [7, 12],
      req: { docs: ['passport'], skills: { physical: 10 } }, gain: { physical: 1 }, promo: 'physical', interview: 0.15,
      track: ['Грузчик', 'Старший грузчик', 'Бригадир', 'Мастер смены', 'Начальник склада'], desc: 'Официальное трудоустройство, стабильная зарплата.' },
    { id: 'cashier', kind: 'job', icon: '🛒', name: 'Продавец-кассир', district: 'sleeping', hours: 8, pay: 2500, energy: 18, hyg: 3, open: [8, 13], indoor: true,
      req: { docs: ['passport', 'medbook'], certs: ['cashier'] }, gain: { trade: 1, social: 0.5 }, promo: 'trade', interview: 0.25,
      track: ['Продавец-кассир', 'Старший продавец', 'Администратор', 'Заместитель директора', 'Директор магазина'], desc: 'Нужны медкнижка и курс кассира.' },
    { id: 'guard', kind: 'job', icon: '🛡️', name: 'Охранник', district: 'business', hours: 12, pay: 3100, energy: 14, hyg: 2, open: [7, 10], indoor: true,
      req: { docs: ['passport'], certs: ['guard'] }, gain: { physical: 0.3 }, promo: 'physical', interview: 0.2,
      track: ['Охранник', 'Старший охранник', 'Начальник смены', 'Начальник охраны', 'Директор ЧОП'], desc: 'Долгие смены, малая нагрузка.' },
    { id: 'cookhelper', kind: 'job', icon: '🧑‍🍳', name: 'Помощник повара', district: 'center', hours: 8, pay: 2800, energy: 20, hyg: 4, open: [8, 12], indoor: true,
      req: { docs: ['passport', 'medbook'], certs: ['cook'] }, gain: { cooking: 1.2 }, promo: 'cooking', interview: 0.3, perk: { food: 30 },
      track: ['Помощник повара', 'Повар', 'Старший повар', 'Су-шеф', 'Шеф-повар'], desc: 'Кормят на смене. Нужны медкнижка и курс повара.' },
    { id: 'mechanic', kind: 'job', icon: '🔧', name: 'Автослесарь', district: 'industrial', hours: 8, pay: 3500, energy: 22, hyg: 9, open: [8, 12],
      req: { docs: ['passport'], certs: ['mechanic'] }, gain: { craft: 1.2 }, promo: 'craft', interview: 0.3,
      track: ['Автослесарь', 'Мастер-приёмщик', 'Старший мастер', 'Начальник сервиса', 'Совладелец СТО'], desc: 'Нужен курс автослесаря.' },
    { id: 'driver', kind: 'job', icon: '🚚', name: 'Водитель-экспедитор', district: 'industrial', hours: 9, pay: 3900, energy: 16, hyg: 4, open: [7, 11], indoor: true,
      req: { docs: ['passport', 'license', 'medbook'] }, gain: { driving: 1 }, promo: 'driving', interview: 0.3,
      track: ['Водитель-экспедитор', 'Водитель 1 класса', 'Старший водитель', 'Логист', 'Начальник логистики'], desc: 'Нужны права категории B и медкнижка.' },
    { id: 'office', kind: 'job', icon: '🗂️', name: 'Офис-менеджер', district: 'business', hours: 8, pay: 3700, energy: 12, hyg: 2, open: [8, 11], indoor: true,
      req: { docs: ['passport'], certs: ['school', 'pc'], skills: { intellect: 20 }, look: 2 }, gain: { social: 0.7, intellect: 0.4 }, promo: 'social', interview: 0.45,
      track: ['Офис-менеджер', 'Ассистент руководителя', 'Координатор', 'Руководитель отдела', 'Операционный директор'], desc: 'Нужны аттестат, компьютерная грамотность и деловой вид.' },
    { id: 'accountant', kind: 'job', icon: '🧾', name: 'Бухгалтер', district: 'business', hours: 8, pay: 5200, energy: 12, hyg: 1, open: [8, 11], indoor: true,
      req: { docs: ['passport'], certs: ['accounting'], look: 2 }, gain: { finance: 1, intellect: 0.4 }, promo: 'finance', interview: 0.45,
      track: ['Бухгалтер', 'Ведущий бухгалтер', 'Зам. главного бухгалтера', 'Главный бухгалтер', 'Финансовый директор'], desc: 'Диплом колледжа по бухучёту.' },
    { id: 'nurse', kind: 'job', icon: '💉', name: 'Медбрат / медсестра', district: 'hospital', hours: 12, pay: 4300, energy: 22, hyg: 2, open: [7, 9], indoor: true,
      req: { docs: ['passport', 'medbook'], certs: ['medcollege'] }, gain: { intellect: 0.5, social: 0.5 }, promo: 'intellect', interview: 0.35,
      track: ['Медбрат', 'Процедурный медбрат', 'Старший медбрат', 'Главный медбрат', 'Зав. сестринской службой'], desc: 'Диплом медколледжа.' },
    { id: 'programmer', kind: 'job', icon: '👨‍💻', name: 'Junior-разработчик', district: 'business', hours: 8, pay: 6800, energy: 14, hyg: 1, open: [9, 13], indoor: true,
      req: { docs: ['passport'], certs: ['programming'], skills: { tech: 30 }, items: ['laptop'] }, gain: { tech: 1.2 }, promo: 'tech', interview: 0.55,
      track: ['Junior-разработчик', 'Middle-разработчик', 'Senior-разработчик', 'Тимлид', 'Технический директор'], desc: 'Курсы программирования + навык техники 30 + ноутбук.' },
    { id: 'doctor', kind: 'job', icon: '🩺', name: 'Врач', district: 'hospital', hours: 12, pay: 9200, energy: 24, hyg: 2, open: [7, 9], indoor: true,
      req: { docs: ['passport', 'medbook'], certs: ['meduni'] }, gain: { intellect: 0.8, social: 0.4 }, promo: 'intellect', interview: 0.5,
      track: ['Врач-ординатор', 'Врач', 'Врач высшей категории', 'Заведующий отделением', 'Главный врач'], desc: 'Медицинский университет.' },
    { id: 'manager', kind: 'job', icon: '🧑‍💼', name: 'Менеджер проектов', district: 'business', hours: 8, pay: 8600, energy: 14, hyg: 1, open: [9, 12], indoor: true,
      req: { docs: ['passport'], certs: ['university', 'management'], skills: { social: 40 }, look: 3 }, gain: { social: 1, finance: 0.4 }, promo: 'social', interview: 0.6,
      track: ['Менеджер проектов', 'Старший менеджер', 'Руководитель направления', 'Директор департамента', 'Генеральный директор'], desc: 'Высшее образование, курс управления, общение 40.' }
  ];
  D.jobById = Object.fromEntries(D.jobs.map(j => [j.id, j]));
})(typeof window !== 'undefined' ? window : globalThis);
