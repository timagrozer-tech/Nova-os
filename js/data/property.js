/* Жильё, вещи, одежда.
   Аренда — понедельно (weekly), залог возвращается при выезде. Своё жильё — коммуналка (upkeep) раз в неделю.
   sleep — качество сна (множитель восстановления энергии), kitchen — можно готовить дома. */
(function (G) {
  'use strict';
  const D = G.SN.D;
  D.housing = {
    street:  { name: 'Нет жилья', icon: '🧥', sleep: 0.5, warm: false, kitchen: false, desc: 'Ночёвка на улице: холодно, плохо высыпаешься, можно лишиться вещей.' },
    hostel:  { name: 'Койко-место в хостеле', icon: '🛏️', type: 'rent', district: 'old', weekly: 4200, deposit: 0, sleep: 0.85, warm: true, kitchen: true, mood: 0,
      desc: 'Общая комната, душ и кухня. Платёж раз в неделю.' },
    room:    { name: 'Комната в коммуналке', icon: '🚪', type: 'rent', district: 'sleeping', weekly: 5600, deposit: 5600, sleep: 0.95, warm: true, kitchen: true, mood: 3,
      req: { docs: ['passport'] }, desc: 'Своя дверь и замок. Залог равен недельной оплате.' },
    flat:    { name: 'Однушка в аренду', icon: '🏢', type: 'rent', district: 'sleeping', weekly: 10500, deposit: 10500, sleep: 1, warm: true, kitchen: true, mood: 6,
      req: { docs: ['passport'] }, desc: 'Отдельная квартира. Можно жить вместе с партнёром.' },
    studio:  { name: 'Своя квартира-студия', icon: '🏠', type: 'own', district: 'sleeping', price: 2400000, upkeep: 2100, sleep: 1.05, warm: true, kitchen: true, mood: 10,
      req: { docs: ['passport'] }, desc: 'Собственное жильё. Коммуналка 2 100 ₽ в неделю. Можно продать.' },
    house:   { name: 'Загородный дом', icon: '🏡', type: 'own', district: 'sleeping', price: 6900000, upkeep: 4200, sleep: 1.1, warm: true, kitchen: true, mood: 15,
      req: { docs: ['passport'] }, desc: 'Простор и тишина. Коммуналка 4 200 ₽ в неделю.' }
  };

  /* Вещи: sell — доля цены при перепродаже; upkeep — расход в неделю */
  D.items = {
    phone:   { name: 'Б/у смартфон', icon: '📱', price: 3800, sell: 0.5, desc: 'Курьерские приложения, банк, переписка с друзьями.' },
    tent:    { name: 'Палатка и спальник', icon: '⛺', price: 2600, sell: 0.5, desc: 'Ночёвка на улице теплее и спокойнее.' },
    guitar:  { name: 'Гитара б/у', icon: '🎸', price: 3200, sell: 0.55, desc: 'Можно играть на набережной и поднимать настроение.' },
    rod:     { name: 'Удочка', icon: '🎣', price: 1300, sell: 0.5, desc: 'Рыбалка на набережной — мини-игра и бесплатная еда.' },
    stove:   { name: 'Электроплитка', icon: '🍳', price: 1900, sell: 0.5, desc: 'Готовить еду из продуктов в любом жилье.' },
    bike:    { name: 'Велосипед', icon: '🚲', price: 7200, sell: 0.6, desc: 'Бесплатные поездки по городу и работа велокурьером.' },
    laptop:  { name: 'Ноутбук б/у', icon: '💻', price: 26000, sell: 0.55, desc: 'Учёба программированию, фриланс, офисная работа.' },
    furniture:{ name: 'Мебель и матрас', icon: '🛋️', price: 32000, sell: 0.4, needHome: true, desc: 'Качество сна +10%, настроение дома выше.' },
    car:     { name: 'Подержанный автомобиль', icon: '🚗', price: 340000, sell: 0.65, upkeep: 900, desc: 'Быстрые поездки, работа в такси. Обслуживание 900 ₽/нед.' },
    ring:    { name: 'Обручальное кольцо', icon: '💍', price: 24000, sell: 0.5, desc: 'Для самого важного вопроса.' },
    sportcar:{ name: 'Спорткар', icon: '🏎️', price: 4800000, sell: 0.7, upkeep: 12000, desc: 'Статус и настроение. Обслуживание 12 000 ₽/нед.' }
  };

  /* Одежда: warmth — снижает потерю тепла, look — внешний вид для собеседований и знакомств */
  D.clothes = {
    worn:     { name: 'Поношенная одежда', icon: '🧥', price: 0, warmth: 0, look: 0, desc: 'То, что есть. Видно, что жизнь потрепала.' },
    charity:  { name: 'Вещи из пункта помощи', icon: '👕', price: 0, warmth: 1, look: 1, desc: 'Чистые вещи из благотворительного пункта соццентра.' },
    casual:   { name: 'Новая куртка и джинсы', icon: '🧑', price: 3600, warmth: 2, look: 2, desc: 'Аккуратный повседневный вид.' },
    winter:   { name: 'Пуховик и ботинки', icon: '🧣', price: 8200, warmth: 5, look: 2, desc: 'Зимой без него тяжело.' },
    business: { name: 'Деловой костюм', icon: '👔', price: 14500, warmth: 1, look: 4, desc: 'Для собеседований в офисы и банки.' },
    sport:    { name: 'Спортивный костюм', icon: '🏃', price: 4200, warmth: 2, look: 1, desc: 'Тренировки эффективнее на 20%.' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
