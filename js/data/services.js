/* Универсальные действия: питание, быт и медицина, развлечения, тренировки, документы.
   where: 'any' — где угодно; 'home' — дома (нужно жильё); массив районов; строка — один район.
   cost умножается на цены района и городскую инфляцию, если не указано fixed: true. daily — лимит в сутки. */
(function (G) {
  'use strict';
  const D = G.SN.D;
  D.actions = [
    // ── Питание
    { id: 'soup', cat: 'food', icon: '🥣', name: 'Бесплатный обед в соццентре', where: 'old', hours: 1, cost: 0, open: [12, 15], daily: 1, indoor: true,
      eff: { food: 42, mood: 2, warmth: 10 }, desc: 'Горячий суп и хлеб. Без условий, раз в день.' },
    { id: 'bread', cat: 'food', icon: '🍞', name: 'Хлеб, кефир и чай', where: 'any', hours: 0.25, cost: 70, eff: { food: 20 }, desc: 'Дёшево и быстро.' },
    { id: 'noodles', cat: 'food', icon: '🍜', name: 'Лапша быстрого приготовления', where: 'any', hours: 0.25, cost: 55, eff: { food: 16, health: -1 }, desc: 'Заглушить голод. Не полезно.' },
    { id: 'shawarma', cat: 'food', icon: '🌯', name: 'Шаурма', where: ['old', 'center', 'industrial'], hours: 0.5, cost: 260, eff: { food: 40, mood: 4 }, risk: 'poison',
      desc: 'Сытно. Небольшой шанс отравиться.' },
    { id: 'canteen', cat: 'food', icon: '🍛', name: 'Обед в столовой', where: ['industrial', 'center', 'sleeping', 'hospital'], hours: 0.75, cost: 340, open: [8, 19], indoor: true,
      eff: { food: 52, mood: 4, health: 1, warmth: 6 }, desc: 'Первое, второе и компот.' },
    { id: 'lunch', cat: 'food', icon: '🥗', name: 'Бизнес-ланч в кафе', where: ['business', 'center'], hours: 1, cost: 520, open: [11, 16], indoor: true,
      eff: { food: 58, mood: 7, health: 2, warmth: 6 }, desc: 'Полноценно и с комфортом.' },
    { id: 'restaurant', cat: 'food', icon: '🍣', name: 'Ресторан', where: ['center', 'embankment'], hours: 2, cost: 2700, open: [12, 24], indoor: true,
      eff: { food: 70, mood: 18, stress: -8, warmth: 8 }, desc: 'Хорошая еда и отличное настроение.' },
    { id: 'groceries', cat: 'food', icon: '🛍️', name: 'Продукты на 4 порции', where: 'any', hours: 0.5, cost: 720, special: 'groceries',
      desc: 'Готовить дома выгоднее: 180 ₽ за сытную порцию.' },
    { id: 'cookhome', cat: 'food', icon: '🍳', name: 'Приготовить еду', where: 'home', hours: 0.75, cost: 0, special: 'cook', indoor: true,
      eff: { food: 55, mood: 5, health: 2 }, gain: { cooking: 0.8 }, desc: 'Нужны продукты и кухня или плитка.' },

    // ── Быт и медицина
    { id: 'freeshower', cat: 'health', icon: '🚿', name: 'Душ в соццентре', where: 'old', hours: 0.75, cost: 0, open: [9, 18], daily: 1, indoor: true,
      eff: { hygiene: 60, mood: 4 }, desc: 'Бесплатно, раз в день.' },
    { id: 'homeshower', cat: 'health', icon: '🛁', name: 'Душ дома', where: 'home', hours: 0.4, cost: 0, indoor: true, eff: { hygiene: 70, mood: 4, stress: -2 }, desc: 'Своё жильё — свой душ.' },
    { id: 'banya', cat: 'health', icon: '🧖', name: 'Городская баня', where: ['old', 'sleeping'], hours: 2, cost: 320, open: [8, 22], indoor: true,
      eff: { hygiene: 75, mood: 10, stress: -8, warmth: 25, health: 2 }, desc: 'Отмыться и отогреться.' },
    { id: 'freelaundry', cat: 'health', icon: '🧺', name: 'Стирка в соццентре', where: 'old', hours: 1.5, cost: 0, open: [9, 17], daily: 1, indoor: true,
      eff: { hygiene: 15, mood: 3 }, desc: 'Бесплатная стиральная машина.' },
    { id: 'laundry', cat: 'health', icon: '🫧', name: 'Прачечная самообслуживания', where: ['sleeping', 'center'], hours: 1.5, cost: 350, indoor: true,
      eff: { hygiene: 18, mood: 3 }, desc: 'Чистая одежда — опрятный вид.' },
    { id: 'charity', cat: 'health', icon: '👕', name: 'Пункт вещевой помощи', where: 'old', hours: 1, cost: 0, open: [10, 17], special: 'charityClothes', indoor: true,
      desc: 'Чистая одежда по сезону бесплатно (раз в 2 недели).' },
    { id: 'freemed', cat: 'health', icon: '🚑', name: 'Мобильный медпункт', where: 'old', hours: 2, cost: 0, open: [10, 16], daily: 1, special: 'treat', heal: 1, indoor: true,
      eff: { health: 14 }, desc: 'Бесплатная помощь без документов: осмотр, перевязка, лекарства от простуды.' },
    { id: 'pharmacy', cat: 'health', icon: '💊', name: 'Лекарства в аптеке', where: 'any', hours: 0.3, cost: 480, special: 'treat', heal: 1, eff: { health: 10 }, desc: 'Помогает при простуде.' },
    { id: 'polyclinic', cat: 'health', icon: '🩺', name: 'Поликлиника по ОМС', where: 'sleeping', hours: 3, cost: 0, open: [8, 19], req: { docs: ['oms'] }, special: 'treat', heal: 2, indoor: true,
      eff: { health: 30 }, desc: 'Бесплатно с полисом ОМС. Лечит болезни.' },
    { id: 'clinic', cat: 'health', icon: '🏥', name: 'Платная клиника', where: 'hospital', hours: 2, cost: 4800, open: [8, 21], special: 'treat', heal: 3, indoor: true,
      eff: { health: 60, stress: -5 }, desc: 'Быстрое и полное восстановление.' },
    { id: 'nap', cat: 'health', icon: '😴', name: 'Вздремнуть 2 часа', where: 'any', hours: 2, cost: 0, special: 'nap', desc: 'Короткий отдых: энергия +18.' },

    // ── Развлечения
    { id: 'walk', cat: 'fun', icon: '🌳', name: 'Прогулка по набережной', where: 'embankment', hours: 2, cost: 0, eff: { mood: 9, stress: -7 }, energy: 4, desc: 'Бесплатно и полезно для головы.' },
    { id: 'fishing', cat: 'fun', icon: '🎣', name: 'Рыбалка (мини-игра)', where: 'embankment', hours: 3, cost: 0, open: [5, 21], req: { items: ['rod'] }, special: 'fishing',
      eff: { mood: 8, stress: -10 }, desc: 'Подсекайте вовремя. Улов — еда или деньги.' },
    { id: 'guitarplay', cat: 'fun', icon: '🎸', name: 'Поиграть на гитаре', where: 'any', hours: 1, cost: 0, req: { items: ['guitar'] }, eff: { mood: 7, stress: -5 }, gain: { music: 1 }, desc: 'Тренировка и отдых.' },
    { id: 'sportground', cat: 'fun', icon: '⚽', name: 'Спортплощадка во дворе', where: 'sleeping', hours: 2, cost: 0, open: [6, 22], energy: 14,
      eff: { mood: 6, health: 2, stress: -6 }, gain: { physical: 1.5 }, desc: 'Бесплатная тренировка.' },
    { id: 'cinema', cat: 'fun', icon: '🎬', name: 'Кино', where: 'center', hours: 2.5, cost: 480, open: [10, 24], indoor: true, eff: { mood: 15, stress: -8 }, desc: 'Отвлечься и согреться.' },
    { id: 'gameclub', cat: 'fun', icon: '🎮', name: 'Компьютерный клуб', where: 'center', hours: 3, cost: 600, open: [10, 26], indoor: true, eff: { mood: 15, stress: -6 }, gain: { tech: 0.4 }, desc: 'Игры и новые знакомые.' },
    { id: 'concert', cat: 'fun', icon: '🎤', name: 'Концерт на набережной', where: 'embankment', hours: 3, cost: 1500, open: [18, 23], eff: { mood: 24, stress: -12 }, gain: { social: 0.5 }, desc: 'Живая музыка.' },
    { id: 'amusement', cat: 'fun', icon: '🎡', name: 'Парк развлечений', where: 'embankment', hours: 5, cost: 1400, open: [10, 21], eff: { mood: 28, stress: -14 }, energy: 10, desc: 'Целый день отдыха.' },
    { id: 'trip', cat: 'fun', icon: '🚆', name: 'Поездка в Карелию на выходные', where: 'any', hours: 30, cost: 14000, special: 'trip', eff: { mood: 45, stress: -40, health: 6 },
      desc: 'Путешествие: 30 часов, полная перезагрузка. Раз в 2 недели.' },

    // ── Тренировки навыков
    { id: 'gym', cat: 'skills', icon: '🏋️', name: 'Спортзал', where: 'sleeping', hours: 2, cost: 380, open: [7, 23], indoor: true, energy: 16, eff: { mood: 5, health: 2, stress: -5 },
      gain: { physical: 2.5 }, desc: 'Быстрее, чем площадка во дворе.' },
    { id: 'talkclub', cat: 'skills', icon: '🗣️', name: 'Разговорный клуб', where: 'center', hours: 2, cost: 0, open: [18, 21], indoor: true, eff: { mood: 5, stress: -3 },
      gain: { social: 1.5 }, desc: 'Бесплатные встречи в библиотеке.' },
    { id: 'readhome', cat: 'skills', icon: '📖', name: 'Читать книги дома', where: 'home', hours: 2, cost: 0, indoor: true, eff: { stress: -4 }, gain: { intellect: 0.7 }, cap: { intellect: 40 },
      desc: 'Медленно, но бесплатно.' },
    { id: 'repairpractice', cat: 'skills', icon: '🪛', name: 'Помогать в гаражах', where: 'industrial', hours: 3, cost: 0, open: [9, 19], energy: 10, gain: { craft: 1.2 }, cap: { craft: 30 },
      desc: 'Опыт ремесла без оплаты.' },

    // ── Документы
    { id: 'passport', cat: 'docs', icon: '🪪', name: 'Подать заявление на паспорт (МФЦ)', where: 'center', hours: 2, cost: 0, open: [9, 19], special: 'docPassport', indoor: true,
      desc: 'Госпошлина 1 500 ₽. С направлением соцработника — бесплатно. Готов через 5 дней.' },
    { id: 'oms', cat: 'docs', icon: '💳', name: 'Оформить полис ОМС (МФЦ)', where: 'center', hours: 1, cost: 0, open: [9, 19], req: { docs: ['passport'] }, special: 'docOms', indoor: true,
      desc: 'Бесплатно. Готов через 2 дня.' },
    { id: 'medbook', cat: 'docs', icon: '📗', name: 'Оформить медкнижку', where: 'hospital', hours: 3, cost: 2700, fixed: true, open: [8, 16], req: { docs: ['passport'] }, special: 'docMedbook', indoor: true,
      desc: 'Медосмотр и анализы. Нужна для еды, медицины и вождения.' },
    { id: 'ip', cat: 'docs', icon: '🧾', name: 'Зарегистрировать ИП', where: 'business', hours: 2, cost: 800, fixed: true, open: [9, 18], req: { docs: ['passport'] }, special: 'docIp', indoor: true,
      desc: 'Госпошлина 800 ₽. Налог 6% с выручки. Готово через 3 дня.' }
  ];
  D.actionById = Object.fromEntries(D.actions.map(a => [a.id, a]));
  D.actionCats = {
    food: ['🍜', 'Питание', 'Ешьте, чтобы не было истощения. Дома готовить дешевле всего.'],
    health: ['❤️', 'Здоровье и быт', 'Душ, стирка, лечение. Бесплатная помощь есть в соццентре.'],
    fun: ['🎮', 'Развлечения', 'Настроение и стресс влияют на работу и отношения.'],
    skills: ['🧠', 'Навыки', 'Тренировки повышают навыки без документов.'],
    docs: ['🪪', 'Документы', 'Паспорт открывает официальную работу, банк и аренду.']
  };
})(typeof window !== 'undefined' ? window : globalThis);
