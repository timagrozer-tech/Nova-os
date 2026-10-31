/* Данные мира: районы, транспорт, календарь, погода */
(function (G) {
  'use strict';
  const D = G.SN.D;

  /* priceMult — локальные цены на еду/услуги района; x,y — позиция на карте в % */
  D.districts = {
    old:      { name: 'Старый район',   icon: '🏚️', priceMult: 0.85, x: 18, y: 62, desc: 'Соццентр, ночлежка, дешёвый рынок, пункт приёма вторсырья.' },
    sleeping: { name: 'Спальный район', icon: '🏘️', priceMult: 1.0,  x: 70, y: 70, desc: 'Магазины у дома, аренда жилья, дворы и поликлиника.' },
    industrial:{ name: 'Промзона',      icon: '🏭', priceMult: 0.9,  x: 22, y: 22, desc: 'Склады, стройки, автосервисы. Тяжёлая, но честная работа.' },
    center:   { name: 'Центр',          icon: '🏙️', priceMult: 1.25, x: 52, y: 40, desc: 'МФЦ, библиотека, колледж, университет, кафе и офисы.' },
    embankment:{ name: 'Набережная',    icon: '🌳', priceMult: 1.1,  x: 82, y: 30, desc: 'Прогулки, концерты, рыбалка, свидания.' },
    business: { name: 'Деловой район',  icon: '🏦', priceMult: 1.35, x: 48, y: 12, desc: 'Банки, бизнес-инкубатор, офисы компаний.' },
    hospital: { name: 'Больничный квартал', icon: '🏥', priceMult: 1.0, x: 80, y: 52, desc: 'Городская больница, клиники, медколледж.' }
  };

  /* Транспорт: минуты в пути, цена, расход энергии, требования */
  D.transport = {
    walk:  { name: 'Пешком',     icon: '🚶', mins: 70, cost: 0,   energy: 7 },
    bike:  { name: 'Велосипед',  icon: '🚲', mins: 35, cost: 0,   energy: 5, item: 'bike' },
    bus:   { name: 'Автобус',    icon: '🚌', mins: 40, cost: 55,  energy: 2, open: [6, 23] },
    metro: { name: 'Метро',      icon: '🚇', mins: 25, cost: 70,  energy: 2, open: [6, 25] },
    car:   { name: 'Своё авто',  icon: '🚗', mins: 20, cost: 160, energy: 1, item: 'car', doc: 'license' },
    taxi:  { name: 'Такси',      icon: '🚕', mins: 20, cost: 420, energy: 0 }
  };

  D.months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  D.monthLen = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  D.weekdays = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  D.START_MONTH = 9;   // 1 октября (индекс 9)
  D.START_WEEKDAY = 3; // четверг
  /* Средняя температура по месяцам (средняя полоса России) */
  D.monthTemp = [-8, -7, -2, 6, 14, 18, 20, 18, 12, 5, -1, -6];
  D.seasonOf = m => (m === 11 || m <= 1) ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  D.seasonName = { winter: 'Зима', spring: 'Весна', summer: 'Лето', autumn: 'Осень' };
  D.weatherKinds = {
    clear:  { name: 'Ясно',      icon: '☀️' },
    cloudy: { name: 'Облачно',   icon: '🌥️' },
    rain:   { name: 'Дождь',     icon: '🌧️' },
    snow:   { name: 'Снег',      icon: '🌨️' },
    storm:  { name: 'Метель',    icon: '❄️' },
    heat:   { name: 'Жара',      icon: '🥵' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
