/* Случайные и сезонные события с выбором. when(s) — условие, w — вес, choices — варианты с последствиями.
   Каждый вариант честно сообщает результат; нет «ловушек» без возможности восстановиться. */
(function (G) {
  'use strict';
  const SN = G.SN, D = SN.D, U = SN.U;
  const E = () => SN.Sys.econ, St = () => SN.Sys.stats;
  const T = { advance: (...a) => SN.T.advance(...a), day: s => SN.T.day(s) };

  D.events = [
    { id: 'wallet', icon: '👛', title: 'Найденный кошелёк', w: 3, when: s => true,
      text: 'У остановки лежит кошелёк: 3 000 ₽, банковская карта и пропуск на имя Ирины Соколовой.',
      choices: [
        { t: 'Найти хозяйку по пропуску и вернуть', run: s => { T.advance(s, 90, {}); s.rep = U.clamp(s.rep + 8); St().apply(s, { mood: 10 }); s.flags.honest = (s.flags.honest || 0) + 1;
          if (U.chance(s, 0.6)) { E().earn(s, 1000, 'gift', 'Благодарность за кошелёк'); return 'Ирина чуть не расплакалась и настояла на тысяче в благодарность. По району пошёл слух о честном человеке. Репутация +8.'; }
          return 'Ирина долго благодарит. Денег вы не взяли, но на душе тепло. Репутация +8.'; } },
        { t: 'Сдать в отделение полиции', run: s => { T.advance(s, 60, { indoor: true }); s.rep = U.clamp(s.rep + 4); return 'Дежурный записал ваши данные. Репутация +4.'; } },
        { t: 'Забрать деньги, кошелёк выбросить', run: s => { E().earn(s, 3000, 'other', 'Чужой кошелёк'); s.rep = U.clamp(s.rep - 6); St().apply(s, { stress: 12 }); s.flags.tookWallet = true; return '+3 000 ₽. Но мысль о чужом пропуске не даёт покоя. Стресс +12, репутация −6.'; } }
      ] },
    { id: 'scam', icon: '🎣', title: '«Лёгкий заработок»', w: 3, when: s => s.money + s.bank > 1500,
      text: 'Незнакомец предлагает «работу курьером»: 15 000 ₽ за день, нужно только оплатить «страховку» 2 000 ₽ и ничего не спрашивать.',
      choices: [
        { t: 'Отказаться — это мошенничество', run: s => { St().gain(s, { finance: 1 }); s.flags.scamAvoided = (s.flags.scamAvoided || 0) + 1; return 'Правильно. Такие «курьеры» либо теряют деньги, либо становятся соучастниками преступлений. Финансы +1.'; } },
        { t: 'Согласиться и заплатить 2 000 ₽', lock: s => E().canPay(s, 2000) ? '' : 'Нет 2 000 ₽',
          run: s => { E().pay(s, 2000, 'other', '«Страховка»'); St().apply(s, { mood: -15, stress: 15 }); return 'Номер больше не отвечает. 2 000 ₽ потеряны. Тяжёлый, но важный урок.'; } }
      ] },
    { id: 'prices', icon: '📈', title: 'Цены выросли', w: 2, when: s => s.prices === 1,
      text: 'Поставщики подняли цены — продукты и услуги в городе подорожали на 8% на ближайшие 7 дней.',
      choices: [{ t: 'Понятно, буду экономить', run: s => { s.prices = 1.08; s.priceDays = 7; return 'Ищите бесплатные обеды и готовьте дома — так дешевле.'; } }] },
    { id: 'sale', icon: '🏷️', title: 'Распродажа одежды', w: 2, when: s => true,
      text: 'В торговом центре распродажа: только сегодня одежда −30%, вещи −25%.',
      choices: [{ t: 'Отлично, загляну', run: s => { s.flags.discountDay = T.day(s); return 'Скидка действует до полуночи (раздел «Персонаж» и «Имущество»).'; } }] },
    { id: 'interview', icon: '📞', title: 'Приглашение на собеседование', w: 3, when: s => s.docs.passport && !s.job,
      text: 'Звонит рекрутер: вас рекомендовали знакомые. Следующее собеседование пройдёт с заметным преимуществом.',
      choices: [{ t: 'Спасибо, подготовлюсь', run: s => { s.flags.interviewBonus = true; return 'Шанс на следующем собеседовании +15%.'; } }] },
    { id: 'friendhelp', icon: '🤝', title: 'Помощь знакомого', w: 2, when: s => SN.Sys.social.get(s, 'seryoga').rel >= 30 && s.money < 500,
      text: 'Серёга находит вас: «Держи, мне на складе премию дали. Отдашь, когда сможешь».',
      choices: [
        { t: 'Взять 800 ₽ взаймы', run: s => { E().earn(s, 800, 'gift', 'Серёга выручил'); s.flags.oweSeryoga = 800; SN.Sys.social.get(s, 'seryoga').rel += 3; return 'Друзья познаются в беде.'; } },
        { t: 'Отказаться: «Справлюсь сам»', run: s => { St().apply(s, { mood: 3 }); return 'Серёга хлопает по плечу: «Уважаю».'; } }
      ] },
    { id: 'goodgig', icon: '⭐', title: 'Срочная подработка', w: 3, when: s => s.st.energy > 40 && SN.T.hour(s) < 16,
      text: 'Знакомый прораб: нужно срочно разгрузить стройматериалы. 6 часов, 3 200 ₽ наличными сразу.',
      choices: [
        { t: 'Согласиться (6 ч)', lock: s => s.st.energy >= 35 ? '' : 'Мало энергии',
          run: s => { s.st.energy = U.clamp(s.st.energy - 30); T.advance(s, 360, {}); E().earn(s, 3200, 'work', 'Срочная разгрузка'); St().gain(s, { physical: 2 }); s.c.gigs++; return '+3 200 ₽. Спина ноет, но кошелёк рад.'; } },
        { t: 'Отказаться', run: () => 'Прораб найдёт кого-нибудь другого.' }
      ] },
    { id: 'phonebroke', icon: '📵', title: 'Телефон сломался', w: 2, when: s => s.items.includes('phone') && !s.flags.phoneBroken,
      text: 'Телефон упал в лужу и не включается. Без него не работают курьерские приложения и звонки.',
      choices: [
        { t: 'Сдать в ремонт (1 300 ₽)', lock: s => E().canPay(s, 1300) ? '' : 'Нет 1 300 ₽', run: s => { E().pay(s, 1300, 'items', 'Ремонт телефона'); return 'Мастер починил за час.'; } },
        { t: 'Попросить Валеру посмотреть', run: s => { s.flags.phoneBroken = true; return 'Загляните к Валере в Промзону (нужны отношения 25). Пока телефон не работает.'; } },
        { t: 'Пока походить без телефона', run: s => { s.flags.phoneBroken = true; return 'Телефон не работает. Отремонтируйте у Валеры или купите новый.'; } }
      ] },
    { id: 'bikestolen', icon: '🚲', title: 'Пропал велосипед', w: 1, when: s => s.items.includes('bike') && s.housing === 'street',
      text: 'Утром велосипеда на месте нет. Замок перекушен.',
      choices: [
        { t: 'Заявить в полицию (2 ч)', run: s => { T.advance(s, 120, { indoor: true }); if (U.chance(s, 0.35)) return 'Через день велосипед нашли во дворе по соседству!'; s.items = s.items.filter(i => i !== 'bike'); return 'Заявление приняли, но шансов мало. Велосипед потерян.'; } },
        { t: 'Смириться', run: s => { s.items = s.items.filter(i => i !== 'bike'); St().apply(s, { mood: -10 }); return 'Жильё с замком решило бы проблему.'; } }
      ] },
    { id: 'police', icon: '👮', title: 'Проверка документов', w: 2, when: s => !s.docs.passport && SN.T.day(s) > 2,
      text: 'Патруль просит предъявить документы. Паспорта у вас нет.',
      choices: [{ t: 'Объяснить ситуацию', run: s => { T.advance(s, 90, { indoor: true }); s.flags.ninaMet = true;
        return s.flags.ninaReferral || s.docsPending.passport ? 'Показали направление из соццентра — отпустили через полтора часа.' : 'Полтора часа в отделении. Дежурный дал адрес соцработника: Нина Петровна, соццентр Старого района — она помогает восстановить паспорт.'; } }] },
    { id: 'shelterfight', icon: '🥊', title: 'Конфликт в ночлежке', w: 2, when: s => (s.flags.shelterNights || 0) > 0 && s.housing === 'street',
      text: 'Ночью двое отнимают у пожилого соседа куртку.',
      choices: [
        { t: 'Вмешаться', run: s => { if (U.chance(s, 0.5 + s.sk.physical / 200)) { s.rep = U.clamp(s.rep + 6); return 'Хулиганы отступили. Старик благодарит. Репутация +6.'; } St().apply(s, { health: -12, mood: -5 }); s.rep = U.clamp(s.rep + 4); return 'Получили пару ударов, но куртку отстояли. Здоровье −12, репутация +4.'; } },
        { t: 'Позвать охрану', run: s => { s.rep = U.clamp(s.rep + 2); return 'Охранник выставил хулиганов. Безопасный и разумный выбор.'; } },
        { t: 'Отвернуться', run: s => { St().apply(s, { stress: 8 }); return 'Утром старик молча смотрит в пол. Неприятно.'; } }
      ] },
    { id: 'dog', icon: '🐕', title: 'Бездомный пёс', w: 1, when: s => !s.flags.dog && SN.T.day(s) > 3,
      text: 'Рыжая дворняга уже третий день ходит за вами и спит рядом, когда вы на улице.',
      choices: [
        { t: 'Приютить и назвать Рыжиком', run: s => { s.flags.dog = true; St().apply(s, { mood: 15, stress: -10 }); return 'Теперь вы не один. Рыжик греет ночами (+тепло во сне на улице) и поднимает настроение. Корм — 50 ₽ в день.'; } },
        { t: 'Покормить, но не забирать', lock: s => E().canPay(s, 60) ? '' : 'Нет 60 ₽', run: s => { E().pay(s, 60, 'food', 'Корм для собаки'); St().apply(s, { mood: 5 }); return 'Пёс благодарно виляет хвостом.'; } },
        { t: 'Отогнать', run: () => 'Пёс уходит, оглядываясь.' }
      ] },
    { id: 'inspection', icon: '📋', title: 'Проверка бизнеса', w: 2, when: s => s.biz.length > 0,
      text: 'Санитарная проверка нашла нарушения на одной из ваших точек.',
      choices: [
        { t: 'Устранить нарушения (4 000 ₽)', lock: s => E().canPay(s, 4000) ? '' : 'Нет 4 000 ₽', run: s => { E().pay(s, 4000, 'business', 'Устранение нарушений'); s.biz.forEach(b => b.rep = U.clamp(b.rep + 3)); return 'Всё исправлено. Клиенты ценят чистоту: репутация точек +3.'; } },
        { t: 'Оспорить (шанс по навыку «Финансы»)', run: s => { if (U.chance(s, 0.3 + s.sk.finance / 150)) return 'Юридически грамотная жалоба — штраф отменён!'; E().pay(s, Math.min(E().available(s), 8000), 'business', 'Штраф'); s.biz.forEach(b => b.rep = U.clamp(b.rep - 5)); return 'Оспорить не удалось: штраф 8 000 ₽, репутация точек −5.'; } }
      ] },
    { id: 'supplier', icon: '🚚', title: 'Выгодный поставщик', w: 2, when: s => s.biz.length > 0 && !s.flags.supplierDeal,
      text: 'Оптовик предлагает предоплату 6 000 ₽ за скидку: ваши точки получат +5 к репутации за свежий товар.',
      choices: [
        { t: 'Заключить договор', lock: s => E().canPay(s, 6000) ? '' : 'Нет 6 000 ₽', run: s => { E().pay(s, 6000, 'business', 'Договор с поставщиком'); s.flags.supplierDeal = true; s.biz.forEach(b => b.rep = U.clamp(b.rep + 5)); return 'Договор подписан. Репутация точек +5.'; } },
        { t: 'Отказаться', run: () => 'Работаете со старым поставщиком.' }
      ] },
    { id: 'cold', icon: '🥶', title: 'Резкое похолодание', w: 2, when: s => s.weather && s.weather.temp < 3 && s.housing === 'street',
      text: 'Ночью обещают сильный мороз. На улице спать опасно.',
      choices: [{ t: 'Понятно: ночлежка с 19:00 или хостел', run: s => { s.flags.coldWarned = T.day(s); return 'Ночлежка в Старом районе бесплатна. Пункт помощи выдаёт тёплые вещи.'; } }] },
    { id: 'volunteer', icon: '🍲', title: 'Волонтёры раздают обеды', w: 2, when: s => s.housing === 'street' && SN.T.weekend(s),
      text: 'Волонтёры привезли горячую еду. Среди них — девушка в синей куртке: Катя, студентка-медик.',
      choices: [
        { t: 'Поесть и познакомиться', run: s => { St().apply(s, { food: 35, warmth: 8 }); const n = SN.Sys.social.get(s, 'katya'); if (!n.met) { n.met = true; n.rel = 8; } else n.rel = U.clamp(n.rel + 3); return 'Горячий плов и короткий разговор. Катя: «Приходи по субботам, мы всегда тут»'; } },
        { t: 'Помочь раздавать (2 ч)', run: s => { T.advance(s, 120, {}); St().apply(s, { food: 30, mood: 12 }); s.rep = U.clamp(s.rep + 4); const n = SN.Sys.social.get(s, 'katya'); n.met = true; n.rel = U.clamp(n.rel + 8); return 'Два часа вы помогаете волонтёрам. Катя явно впечатлена. Репутация +4.'; } }
      ] },
    { id: 'rainstorm', icon: '⛈️', title: 'Ливень', w: 2, when: s => s.weather && s.weather.kind === 'rain',
      text: 'Ливень стеной. Одежда промокает за минуту.',
      choices: [
        { t: 'Переждать под навесом (1 ч)', run: s => { T.advance(s, 60, { indoor: true }); return 'Ливень стих. Вы сухи.'; } },
        { t: 'Идти дальше', run: s => { St().apply(s, { warmth: -15, hygiene: -5 }); if (U.chance(s, 0.25)) St().getIll(s, 'cold'); return 'Промокли до нитки. Тепло −15.'; } }
      ] },
    { id: 'oldfriend', icon: '📱', title: 'Звонок старого друга', w: 1, when: s => s.items.includes('phone') && !s.flags.oldFriend && SN.T.day(s) > 10,
      text: 'Пишет одноклассник Дима: «Слышал, ты в городе. Нужен человек на склад к нам, могу замолвить слово».',
      choices: [{ t: 'Поблагодарить', run: s => { s.flags.oldFriend = true; s.flags.interviewBonus = true; s.rep = U.clamp(s.rep + 2); return 'Рекомендация знакомого: шанс на следующем собеседовании +15%.'; } }] },
    { id: 'heat', icon: '🥵', title: 'Жара', w: 2, when: s => s.weather && s.weather.kind === 'heat',
      text: 'Под тридцать градусов. Тяжело работать на улице.',
      choices: [{ t: 'Пить воду и беречь силы', lock: s => E().canPay(s, 60) ? '' : 'Нет 60 ₽', run: s => { E().pay(s, 60, 'food', 'Вода'); return 'Бутылка воды спасает день.'; } },
        { t: 'Терпеть', run: s => { St().apply(s, { energy: -10, mood: -5 }); return 'Энергия −10.'; } }] }
  ];

  /* Фиксированные сезонные события по календарю */
  D.seasonal = [
    { id: 'fair', when: (s, o) => o.d >= 12 && o.d <= 14, icon: '🎪', title: 'Городская ярмарка', text: 'В Центре ярмарка: работа продавцом на ярмарке (5 ч, 1 700 ₽), гулянья и скидки.', flag: 'fair' },
    { id: 'newyear', when: (s, o) => o.m === 11 && o.d === 31, icon: '🎄', title: 'Новый год', text: 'Город светится гирляндами. Соццентр устраивает праздничный ужин, а волонтёры раздают подарки.', effect: s => { St().apply(s, { mood: 20, food: 20 }); } },
    { id: 'cityday', when: (s, o) => o.m === 8 && o.d === 10, icon: '🎆', title: 'День города', text: 'Концерты на набережной бесплатны, весь город гуляет.', effect: s => { St().apply(s, { mood: 15 }); } }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
