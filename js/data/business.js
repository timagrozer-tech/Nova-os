/* Бизнес. Ежедневная модель:
   спрос = base × репутация × реклама × цена × сезон × погода × случайность(0.85–1.15) × насыщение
   клиенты = min(спрос, мощность); мощность = (персонал + владелец на смене) × capPerStaff × уровень
   выручка = клиенты × check × ценовой множитель;  себестоимость = клиенты × check × cogs
   прибыль = выручка − себестоимость − аренда − зарплаты − реклама − налог 6% (УСН «доходы») */
(function (G) {
  'use strict';
  const D = G.SN.D;
  D.TAX = 0.06;
  D.PRICE_LEVELS = [
    { name: 'Низкие', demand: 1.25, rev: 0.85 },
    { name: 'Обычные', demand: 1, rev: 1 },
    { name: 'Высокие', demand: 0.75, rev: 1.25 }
  ];
  D.ADS_MULT = [1, 1.2, 1.4];
  D.business = [
    { id: 'drinks', icon: '🥤', name: 'Тележка с напитками', district: 'embankment', price: 40000, base: 50, check: 130, cogs: 0.4, rent: 300,
      wage: 1500, cap: 70, staffMax: 1, ads: 300, req: { docs: ['ip'] },
      season: { winter: 0.35, spring: 0.9, summer: 1.4, autumn: 0.75 }, rain: 0.6, desc: 'Первое маленькое дело. Летом золото, зимой убыток.' },
    { id: 'kiosk', icon: '🌯', name: 'Киоск с шаурмой', district: 'old', price: 260000, base: 95, check: 310, cogs: 0.47, rent: 4500,
      wage: 2300, cap: 70, staffMax: 3, ads: 700, req: { docs: ['ip', 'medbook'] },
      season: { winter: 0.95, spring: 1, summer: 1.05, autumn: 1 }, rain: 0.85, desc: 'Стабильный спрос круглый год. Нужна медкнижка.' },
    { id: 'workshop', icon: '🛠️', name: 'Мастерская ремонта', district: 'industrial', price: 300000, base: 9, check: 2830, cogs: 0.36, rent: 4000,
      wage: 3200, cap: 6, staffMax: 3, ads: 900, req: { docs: ['ip'], any: [{ certs: ['mechanic'] }, { skills: { craft: 25 } }] },
      season: { winter: 1.15, spring: 1, summer: 0.9, autumn: 1 }, rain: 1, desc: 'Нужен курс автослесаря или ремесло 25.' },
    { id: 'coffee', icon: '☕', name: 'Кофейня', district: 'center', price: 900000, base: 200, check: 440, cogs: 0.38, rent: 16000,
      wage: 2700, cap: 80, staffMax: 4, ads: 2000, req: { docs: ['ip', 'medbook'], certs: ['biz'] },
      season: { winter: 1.1, spring: 1, summer: 0.85, autumn: 1.05 }, rain: 1.1, desc: 'Бренд и атмосфера. Нужен курс предпринимательства.' },
    { id: 'market', icon: '🏪', name: 'Мини-маркет', district: 'sleeping', price: 2400000, base: 380, check: 830, cogs: 0.78, rent: 28000,
      wage: 2800, cap: 150, staffMax: 5, ads: 3500, req: { docs: ['ip'], certs: ['biz'], rep: 40 },
      season: { winter: 1, spring: 1, summer: 1, autumn: 1 }, rain: 1, desc: 'Низкая маржа, большой оборот. Репутация 40.' },
    { id: 'mall', icon: '🏢', name: 'Торговый центр', district: 'business', price: 12000000, base: 24, check: 8980, cogs: 0, rent: 75000,
      wage: 3500, cap: 5, staffMax: 6, ads: 15000, req: { docs: ['ip'], certs: ['biz', 'management'], rep: 70 },
      season: { winter: 1, spring: 1, summer: 0.95, autumn: 1 }, rain: 1.05, desc: 'Сдача площадей арендаторам. Репутация 70 и курс управления.' }
  ];
  D.bizById = Object.fromEntries(D.business.map(b => [b.id, b]));
})(typeof window !== 'undefined' ? window : globalThis);
