/* Экраны игры. Каждый экран — функция, возвращающая HTML по текущему состоянию. */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, C = UI.C;
  const e = U.esc, M = U.money;
  const V = UI.views = {};
  const S = () => SN.state;

  // ─────────────────────────── ДОМ
  V.home = function () {
    const s = S(), h = D.housing[s.housing], w = s.weather, wk = D.weatherKinds[w.kind];
    const qWork = Sys.quick.work(s), qEat = Sys.quick.eat(s), qRest = Sys.quick.rest(s);
    const flag = V.dayFlag(s);
    const head = s.housing === 'street' ? 'Без крыши над головой' : h.icon + ' ' + h.name;
    const goal = Sys.quests.active(s)[0];
    let o = `<div class="hero">${SN.Scene.html(s)}
      <div class="scene-top"><span class="pill">📍 ${D.districts[s.district].name}</span><span class="pill">${wk.icon} ${w.temp > 0 ? '+' : ''}${w.temp}° · ${D.seasonName[T.season(s)]}</span></div>
      <div class="scene-copy"><div class="eyebrow">${e(s.hero.name)} · ${T.dateLabel(s)}</div><h1>${head}</h1>
      <p>${goal ? '🎯 ' + goal.title : 'Город большой. Возможностей ещё больше.'}</p>
      ${flag ? `<div class="dayflag">${flag}</div>` : ''}
      <div class="quick">
        <button data-a="quick" data-x="work"><span class="ico">💼</span>Работать<small>${e(qWork.label)}</small></button>
        <button data-a="quick" data-x="eat"><span class="ico">🍲</span>Поесть<small>${e(qEat.label)}</small></button>
        <button data-a="sleepSheet"><span class="ico">🛏️</span>Отдохнуть<small>${e(qRest.label)}</small></button>
      </div></div></div>`;
    o += V.autoPanel(s);
    const st = s.st;
    const pas = Sys.inv.passivePerDay(s);
    o += `<div class="money-strip"><button ${C.attrs('go', 'rich')}><b>${U.num(Sys.fin.netWorth(s))} ₽</b><span>капитал · #${Sys.inv.richRank(s)} в городе</span></button><button ${C.attrs('go', 'passive')}><b class="${pas > 0 ? 'pos' : ''}">+${U.num(pas)} ₽</b><span>пассивно в день</span></button><button ${C.attrs('go', 'talents')}><b>${Sys.perks.points(s)} ★</b><span>очков таланта</span></button></div>`;
    o += `<h3 class="heading">Состояние <span class="muted">Репутация ${Math.round(s.rep)}</span></h3><div class="meters">
      ${C.meter('Здоровье', '❤️', st.health, '#f27c7b')}${C.meter('Сытость', '🍗', st.food, '#ffb86a')}${C.meter('Энергия', '⚡', st.energy, '#b29aff')}
      ${C.meter('Гигиена', '💧', st.hygiene, '#7bbdff')}${C.meter('Настроение', '😊', st.mood, '#8dda9f')}${C.meter('Тепло', '🌡️', st.warmth, '#f9bd79')}
      ${C.meter('Стресс', '😣', st.stress, '#ff8f7a', true)}${C.meter('Репутация', '⭐', s.rep, '#f5b54a', false, true)}${C.meter('Навыки', '🧠', V.skillAvg(s), '#7bd7e8', false, true)}</div>`;
    if (s.ill) { const I = Sys.stats.ILL[s.ill.id]; o += `<div class="card warn" style="margin-top:9px"><div class="row"><div class="thumb">${I.icon}</div><div class="grow"><div class="title">${I.name}</div><div class="desc">Ещё ~${Math.max(1, Math.ceil(s.ill.left))} дн. Энергия и здоровье тают быстрее. Бесплатно лечат в мобильном медпункте соццентра.</div></div>${C.btn('Лечить', 'go', 'cat:health', null, { cls: 'sm' })}</div></div>`; }
    const offers = V.offers(s);
    if (offers.length) o += `<h3 class="heading">Сейчас можно <span class="muted">${T.clock(s)}</span></h3>` + offers.join('');
    const qs = Sys.quests.active(s).slice(0, 3);
    o += `<h3 class="heading">Цели <span class="muted">${Object.keys(s.quests).length}/${D.quests.length} выполнено</span></h3><div class="card gold">${qs.map(q => `<div class="kv" style="display:block"><div class="title">${D.questLines[q.line][0]} ${q.title}</div><div class="desc">${q.desc}</div>${q.prog ? `<div class="meta"><span class="c">${e(q.prog(s))}</span></div>` : ''}</div>`).join('') || C.empty('Все цели выполнены!')}<div class="btns">${C.btn('Все задания →', 'go', 'quests', null, { cls: 'ghost sm' })}</div></div>`;
    o += `<h3 class="heading">Новости города</h3><div class="card">${V.news(s).map(n => `<div class="kv" style="display:block;font-size:12.5px">${n}</div>`).join('')}</div>`;
    o += `<div class="grid2" style="margin-top:12px">${[['🎓', 'Учёба', 'career:study'], ['🗺️', 'Город', 'city'], ['🏪', 'Бизнес', 'biz'], ['💞', 'Люди', 'people']].map(z => `<button class="tile" ${C.attrs('go', z[2])}><span class="ti">${z[0]}</span><span>${z[1]}</span></button>`).join('')}</div>`;
    o += `<p class="footnote">Всё работает офлайн. Прогресс сохраняется на устройстве автоматически.</p>`;
    return o;
  };
  V.skillAvg = s => { const v = Object.values(s.sk).sort((a, b) => b - a).slice(0, 3); return v.reduce((a, x) => a + x, 0) / 3; };
  V.dayFlag = function (s) {
    const d = T.day(s), h = T.hourF(s);
    if (s.st.health < 25) return '⚠️ Здоровье на исходе — нужно лечение, еда и тепло';
    if (s.st.food < 15) return '⚠️ Сильный голод — поешьте. Бесплатный обед 12–15 в соццентре';
    if (s.housing !== 'street' && s.rentPaid && s.rentPaid - d <= 1) return '🏠 Завтра списание за жильё: ' + M(Sys.prop.weeklyBill(s));
    for (const k in s.docsPending) return '🪪 ' + D.docNames[k] + ' будет готов(а) на ' + s.docsPending[k] + '-й день';
    if (s.flags.fair) return '🎪 В Центре городская ярмарка — работа продавцом';
    if (s.weather.temp < 0 && s.housing === 'street') return '🥶 Мороз. Ночлежка принимает с 19:00 бесплатно';
    if (s.job && s.job.last !== d && T.dateOf(d).wd < 5 && h < D.jobById[s.job.id].open[1]) return '💼 Сегодня рабочий день: смена до ' + D.jobById[s.job.id].open[1] + ':00';
    return '';
  };
  V.offers = function (s) {
    const h = T.hourF(s), out = [];
    const add = (icon, title, desc, btn) => out.push(C.row({ icon, title, desc, btn }));
    if (!s.flags.ninaMet && !s.docs.passport) add('👩‍🦳', 'Соццентр: помощь с документами', 'Нина Петровна помогает восстановить паспорт. Будни 9–18, Старый район.', C.btn('К ней', 'npc', 'nina', null, { cls: 'sm' }));
    if (h >= 10 && h < 14.9 && !s.daily.soup && s.st.food < 80) add('🥣', 'Бесплатный обед', 'Соццентр, 12:00–15:00. Сытость +42.', C.btn('Идти', 'act', 'soup', null, { cls: 'sm', why: Sys.act.check(s, D.actionById.soup) }));
    if (s.st.hygiene < 40 && !s.daily.freeshower && h >= 8 && h < 17.3) add('🚿', 'Бесплатный душ', 'Соццентр. Опрятный вид важен для работы и знакомств.', C.btn('Идти', 'act', 'freeshower', null, { cls: 'sm' }));
    if (s.wear === 'worn' && h >= 9 && h < 16 && !Sys.act.check(s, D.actionById.charity)) add('👕', 'Пункт вещевой помощи', 'Чистая одежда по сезону бесплатно.', C.btn('Идти', 'act', 'charity', null, { cls: 'sm' }));
    if (s.housing === 'street' && h >= 17) add('🏚️', 'Ночлежка', 'Бесплатно, тепло, без краж. Заселение с 19:00.', C.btn('Ночлег', 'sleepSheet', null, null, { cls: 'sm' }));
    if (s.money > 2500 && s.housing === 'street' && !s.account) add('💸', 'Наличные под угрозой', 'На улице деньги могут украсть ночью. ' + (s.docs.passport ? 'Откройте банковский счёт.' : 'Нужен паспорт для счёта, или ночуйте в ночлежке.'), C.btn('Банк', 'go', 'fin', null, { cls: 'sm' }));
    if (s.job) { const j = D.jobById[s.job.id]; const why = Sys.work.check(s, j); if (!why) add(j.icon, 'Смена: ' + Sys.work.rankName(j, s.job.rank), '+' + M(Sys.work.payEstimate(s, j)) + ' · ' + j.hours + ' ч', C.btn('На смену', 'shift', j.id, null, { cls: 'sm' })); }
    if (s.pending.length) add('❗', 'Есть событие', 'Требуется ваше решение.', C.btn('Открыть', 'event', null, null, { cls: 'sm' }));
    return out.slice(0, 4);
  };
  V.news = function (s) {
    const n = [];
    const w = s.weather, wk = D.weatherKinds[w.kind];
    n.push(`${wk.icon} Погода: ${wk.name.toLowerCase()}, ${w.temp > 0 ? '+' : ''}${w.temp}°. ${w.temp < 0 ? 'На улице опасно ночевать без тёплой одежды.' : w.kind === 'rain' ? 'Курьерам и музыкантам сегодня тяжело.' : 'Хороший день для дел.'}`);
    if (s.prices > 1) n.push('📈 Цены в городе выше обычного ещё ' + s.priceDays + ' дн.');
    if (s.flags.fair) n.push('🎪 Ярмарка в Центре: нужны продавцы, 1 700 ₽ за 5 часов.');
    const season = T.season(s);
    n.push({ winter: '❄️ Зима: тележки с напитками простаивают, мастерские загружены.', spring: '🌱 Весна: город оживает, спрос растёт.', summer: '☀️ Лето: на набережной толпы — сезон уличной торговли.', autumn: '🍂 Осень: дожди, простуды. Тёплая одежда — в пункте помощи.' }[season]);
    s.log.slice(0, 3).forEach(l => n.push('<span class="muted">День ' + l.d + (l.h ? ', ' + l.h : '') + ':</span> ' + e(l.t)));
    return n;
  };

  // ─────────────────────────── ГОРОД
  V.city = function () {
    const s = S();
    const ds = D.districts, ids = Object.keys(ds);
    const lines = [['old', 'center'], ['center', 'business'], ['center', 'sleeping'], ['center', 'embankment'], ['industrial', 'old'], ['industrial', 'center'], ['embankment', 'hospital'], ['hospital', 'sleeping']];
    let o = C.head('🗺️ Город', 'Районы, люди и возможности. Нажмите на район.');
    o += `<div class="map"><svg class="roads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="100" fill="#26322f"/><path d="M60 0 Q70 30 92 40 L100 42 L100 0 Z" fill="#244258" opacity=".8"/>${lines.map(([a, b]) => `<line x1="${ds[a].x}" y1="${ds[a].y}" x2="${ds[b].x}" y2="${ds[b].y}" stroke="#7b8576" stroke-width="1.4" stroke-dasharray="0" opacity=".6"/>`).join('')}</svg>
      ${ids.map(id => { const ppl = D.npcs.filter(n => Sys.social.where(s, n.id) === id && Sys.social.get(s, n.id).met).length; return `<button class="pin ${id === s.district ? 'here' : ''}" style="left:${ds[id].x}%;top:${ds[id].y}%" ${C.attrs('go', 'district:' + id)} aria-label="${ds[id].name}">${ds[id].icon}<span>${ds[id].name.split(' ')[0]}</span>${ppl ? `<b class="ppl">👤${ppl}</b>` : ''}</button>`; }).join('')}</div>`;
    o += `<h3 class="heading">Районы <span class="muted">Транспорт: ${D.transport[Sys.city.pickMode(s)].icon} ${D.transport[Sys.city.pickMode(s)].name}</span></h3>`;
    o += ids.map(id => {
      const d = ds[id], here = id === s.district, t = D.transport[Sys.city.pickMode(s)];
      return C.row({ icon: d.icon, title: d.name + (here ? ' · вы здесь' : ''), desc: d.desc, meta: `<span class="${d.priceMult > 1 ? 'c' : ''}">Цены ×${String(d.priceMult).replace('.', ',')}</span>${here ? '' : `<span class="m">${t.icon} ${t.mins} мин${t.cost ? ' · ' + t.cost + ' ₽' : ''}</span>`}`, a: 'go', x: 'district:' + id, btn: here ? '' : C.btn('Ехать', 'travel', id, null, { cls: 'sm sec' }) });
    }).join('');
    o += C.btn('🚌 Настроить транспорт', 'go', 'transport', null, { cls: 'ghost wide' });
    return o;
  };
  V.district = function (id) {
    const s = S(), d = D.districts[id], here = s.district === id;
    let o = C.head(d.icon + ' ' + d.name, d.desc, true);
    if (!here) o += `<div class="card gold"><div class="row"><div class="grow"><div class="title">Вы в районе «${D.districts[s.district].name}»</div><div class="meta">${C.where(s, id)}</div></div>${C.btn('Поехать', 'travel', id)}</div></div>`;
    const ppl = D.npcs.filter(n => Sys.social.where(s, n.id) === id);
    o += `<h3 class="heading">Сейчас здесь</h3>`;
    o += ppl.length ? ppl.map(n => { const st = Sys.social.get(s, n.id); return C.row({ icon: n.icon, title: st.met ? n.name : 'Незнакомый человек', desc: st.met ? n.role + ' · ' + Sys.social.relLabel(st.rel) : n.role, a: 'npc', x: n.id, btn: C.btn(st.met ? 'Говорить' : 'Познакомиться', 'talk', n.id, null, { cls: 'sm' }) }); }).join('') : C.empty('Знакомых здесь сейчас нет. ' + C.btn('Пообщаться с людьми (2 ч)', 'findNew', null, null, { cls: 'sm sec' }));
    const jobs = D.jobs.filter(j => j.district === id);
    if (jobs.length) o += `<h3 class="heading">Работа</h3>` + jobs.map(j => V.jobCard(s, j)).join('');
    const courses = D.courses.filter(c => c.district === id);
    if (courses.length) o += `<h3 class="heading">Учёба</h3>` + courses.map(c => V.courseCard(s, c)).join('');
    const acts = D.actions.filter(a => a.where === id || (Array.isArray(a.where) && a.where.includes(id)));
    if (acts.length) o += `<h3 class="heading">Места и услуги</h3>` + acts.map(a => V.actCard(s, a)).join('');
    if (id === 'old' || (id === 'sleeping')) o += C.row({ icon: '🏠', title: 'Жильё', desc: 'Аренда и покупка жилья', a: 'go', x: 'housing', btn: C.btn('Открыть', 'go', 'housing', null, { cls: 'sm sec' }) });
    if (id === 'business') o += C.row({ icon: '📈', title: 'Биржа и активы', desc: 'Акции, облигации, недвижимость под сдачу', a: 'go', x: 'passive', btn: C.btn('Открыть', 'go', 'passive', null, { cls: 'sm sec' }) });
    if (id === 'business') o += C.row({ icon: '🏦', title: 'Банк', desc: 'Счёт, вклад, кредит, инвестиции', a: 'go', x: 'fin', btn: C.btn('Открыть', 'go', 'fin', null, { cls: 'sm sec' }) });
    const biz = D.business.filter(b => b.district === id);
    if (biz.length) o += `<h3 class="heading">Бизнес в районе</h3>` + biz.map(b => C.row({ icon: b.icon, title: b.name, desc: b.desc, a: 'go', x: 'biz' })).join('');
    return o;
  };

  // ─────────────────────────── КАРЬЕРА
  V.jobCard = function (s, j) {
    const isMine = s.job && s.job.id === j.id;
    let why, btn;
    if (j.kind === 'gig') { why = Sys.work.check(s, j); btn = C.btn('Работать', 'shift', j.id, null, { cls: 'sm', why }); }
    else if (isMine) { why = Sys.work.check(s, j); btn = C.btn('На смену', 'shift', j.id, null, { cls: 'sm', why }); }
    else { why = Sys.work.applyCheck(s, j); btn = C.btn('Откликнуться', 'apply', j.id, null, { cls: 'sm sec', why }); }
    const pay = Sys.work.payEstimate(s, j);
    const meta = `<span>+${M(pay)}</span><span class="m">⏱ ${j.hours} ч · ⚡${j.energy}</span>${j.kind === 'job' ? `<span class="m">Смена с ${j.open[0]}:00–${j.open[1]}:00, будни</span>` : `<span class="m">${UI.C.where(s, j.district === 'home' ? 'home' : j.district)}</span>`}`;
    return C.row({ icon: j.icon, title: isMine ? Sys.work.rankName(j, s.job.rank) : j.name, desc: j.desc, meta, why: why && j.kind === 'job' && !isMine ? why : (why && !why.startsWith('Мало') ? why : ''), btn, cls: isMine ? 'gold' : '' });
  };
  V.courseCard = function (s, c) {
    const done = Sys.edu.done(s, c), why = Sys.edu.check(s, c), p = Sys.edu.progress(s, c);
    const cost = Sys.edu.sessionCost(c, s);
    const meta = c.repeat ? `<span>Бесплатно</span><span class="m">${c.session} ч за занятие</span>` : `<span class="c">${c.cost ? M(c.cost * (c.id === 'programming' && s.flags.kolyaDiscount ? 0.7 : 1)) + ' (' + M(cost) + '/занятие)' : 'Бесплатно'}</span><span class="m">${c.hours} ч всего · по ${c.session} ч</span><span class="m">${C.where(s, c.district)}</span>`;
    return C.row({ icon: c.icon, title: c.name + (done ? ' ✓' : ''), desc: c.desc, meta, why: done ? '' : why, cls: done ? 'good' : '', extra: !c.repeat && !done && p ? C.prog(p, c.hours) + `<div class="desc">Пройдено ${p}/${c.hours} ч</div>` : '', btn: done ? C.tag('Готово', 'good') : C.btn('Учиться', 'study', c.id, null, { cls: 'sm', why }) });
  };
  V.career = function (tab) {
    const s = S(); tab = tab || 'jobs';
    let o = C.head('💼 Карьера', 'Работа, учёба и навыки');
    o += C.tabs([['jobs', 'Работа'], ['study', 'Учёба'], ['skills', 'Навыки']], tab, 'careerTab');
    o += `<div class="card gold"><div class="stat3"><div><strong>${s.c.gigs}</strong><span>Подработок</span></div><div><strong>${s.c.jobs}</strong><span>Смен</span></div><div><strong>${s.certs.length}</strong><span>Документов об обучении</span></div></div></div>`;
    if (tab === 'jobs') {
      if (s.job) {
        const j = D.jobById[s.job.id];
        o += `<h3 class="heading">Моя работа</h3>` + V.jobCard(s, j) + `<div class="card"><div class="desc">${Sys.work.nextPromo(s, j)}</div>${C.prog(s.job.shifts, D.RANK_SHIFTS[Math.min(4, s.job.rank + 1)] || 1)}<div class="desc" style="margin-top:6px">Прогулы подряд: ${s.job.missed}/5 · выходные — сб, вс</div><div class="btns">${C.btn('Уволиться', 'quit', null, null, { cls: 'ghost sm' })}</div></div>`;
      }
      o += `<h3 class="heading">Подработки <span class="muted">оплата сразу</span></h3>` + D.jobs.filter(j => j.kind === 'gig').map(j => V.jobCard(s, j)).join('');
      o += `<h3 class="heading">Вакансии <span class="muted">собеседование · карьера</span></h3>` + D.jobs.filter(j => j.kind === 'job' && (!s.job || s.job.id !== j.id)).map(j => V.jobCard(s, j)).join('');
    } else if (tab === 'study') {
      o += C.notice('🎓 Бесплатно: библиотека (навык без документов), компьютерная грамотность, кассир, финграмотность, вечерняя школа. Профессии требуют конкретных документов — повторять один курс бесполезно.', 'blue');
      o += D.courses.map(c => V.courseCard(s, c)).join('');
    } else {
      o += V.skillsTab(s);
    }
    return o;
  };

  // ─────────────────────────── ДЕЙСТВИЯ ПО КАТЕГОРИЯМ
  V.actCard = function (s, a) {
    const why = Sys.act.check(s, a);
    const cost = a.special === 'docPassport' ? (s.flags.ninaReferral ? 0 : 1500) : Sys.act.cost(s, a);
    const eff = a.eff ? Object.entries(a.eff).map(([k, v]) => ({ food: '🍗', health: '❤️', energy: '⚡', hygiene: '💧', mood: '😊', warmth: '🌡️', stress: '😣' }[k] + (v > 0 ? '+' : '') + v)).join(' ') : '';
    const meta = `<span class="${cost ? 'c' : ''}">${cost ? M(cost) : 'Бесплатно'}</span><span class="m">⏱ ${U.hrs(a.hours)}</span>${eff ? `<span class="m">${eff}</span>` : ''}${a.open ? `<span class="m">🕘 ${Sys.city.hoursLabel(a.open)}</span>` : ''}<span class="m">${C.where(s, a.where)}</span>`;
    return C.row({ icon: a.icon, title: a.name, desc: a.desc, meta, why, btn: C.btn('Выбрать', 'act', a.id, null, { cls: 'sm', why }) });
  };
  V.cat = function (cat) {
    const s = S(), c = D.actionCats[cat];
    let o = C.head(c[0] + ' ' + c[1], c[2], true);
    if (cat === 'food') o += `<div class="card gold"><div class="stat3"><div><strong>${Math.round(s.st.food)}</strong><span>Сытость</span></div><div><strong>${s.groceries}</strong><span>Порций дома</span></div><div><strong>${s.fish}</strong><span>Рыбы</span></div></div>${s.fish ? `<div class="btns">${C.btn('🐟 Сварить уху', 'eatFish', null, null, { cls: 'sm' })}${C.btn('Продать рыбу', 'sellFish', null, null, { cls: 'sm sec' })}</div>` : ''}</div>`;
    if (cat === 'health') o += `<div class="card ${s.ill ? 'warn' : 'gold'}"><div class="title">${s.ill ? Sys.stats.ILL[s.ill.id].icon + ' ' + Sys.stats.ILL[s.ill.id].name : '✅ Вы здоровы'}</div><div class="desc">Здоровье ${Math.round(s.st.health)} · Гигиена ${Math.round(s.st.hygiene)} · Полис ОМС: ${s.docs.oms ? 'есть' : 'нет'}</div></div>`;
    if (cat === 'docs') o += `<div class="card gold">${Object.keys(D.docNames).map(k => C.kv(D.docNames[k], s.docs[k] ? '✅ есть' : s.docsPending[k] ? '⏳ день ' + s.docsPending[k] : '—')).join('')}</div>`;
    o += D.actions.filter(a => a.cat === cat).map(a => V.actCard(s, a)).join('');
    if (cat === 'health') o += C.row({ icon: '🛏️', title: 'Сон', desc: 'Выбрать место для ночлега', btn: C.btn('Выбрать', 'sleepSheet', null, null, { cls: 'sm' }) });
    return o;
  };

  // ─────────────────────────── ЛЮДИ
  V.people = function (tab) {
    const s = S(); tab = tab || 'contacts';
    let o = C.head('👥 Люди', 'У каждого своя история, цели и память о ваших поступках');
    o += C.tabs([['contacts', 'Контакты'], ['love', 'Отношения']], tab, 'peopleTab');
    const met = D.npcs.filter(n => Sys.social.get(s, n.id).met);
    o += `<div class="card gold"><div class="stat3"><div><strong>${met.length}/${D.npcs.length}</strong><span>Знакомых</span></div><div><strong>${Object.values(s.npc).filter(n => n.rel >= 60).length}</strong><span>Друзей</span></div><div><strong>${s.partner ? '❤️' : '—'}</strong><span>Партнёр</span></div></div></div>`;
    if (tab === 'contacts') {
      o += D.npcs.map(n => {
        const st = Sys.social.get(s, n.id), where = Sys.social.where(s, n.id);
        if (!st.met) return C.row({ icon: '❔', title: 'Не знакомы', desc: n.role + '. ' + (where ? 'Сейчас: ' + D.districts[where].name : 'Сейчас не в городе'), cls: 'dim', btn: where ? C.btn('Найти', 'talk', n.id, null, { cls: 'sm sec' }) : '' });
        return C.row({ icon: n.icon, title: n.name + (st.status ? ' · ' + Sys.social.statusLabel(st) : ''), desc: n.role, meta: `<span>${Sys.social.relLabel(st.rel)} · ${Math.round(st.rel)}</span><span class="m">${where ? '📍 ' + D.districts[where].name : '🌙 не в городе'}</span>${st.phone ? '<span class="m">📱 есть номер</span>' : ''}`, extra: C.prog(st.rel, 100), a: 'npc', x: n.id, btn: C.btn('›', 'npc', n.id, null, { cls: 'sm sec', label: 'Открыть' }) });
      }).join('');
      o += C.row({ icon: '🔎', title: 'Пообщаться с людьми', desc: 'В районе «' + D.districts[s.district].name + '»: шанс новых знакомств, навык общения +1. 2 часа.', btn: C.btn('Идти', 'findNew', null, null, { cls: 'sm' }) });
    } else {
      o += C.notice('Романтика — только по взаимному согласию. Отказ — нормальная часть жизни: дайте человеку время. Опрятность, настроение и честность повышают шансы.', 'blue');
      const rom = D.npcs.filter(n => n.romance);
      o += rom.map(n => { const st = Sys.social.get(s, n.id); return C.row({ icon: st.met ? n.icon : '❔', title: st.met ? n.name : 'Не знакомы', desc: st.met ? (Sys.social.statusLabel(st) || 'Отношения: ' + Math.round(st.rel)) : n.role, extra: st.status ? `<div class="desc">Романтика ${Math.round(st.romance)}</div>` + C.prog(st.romance, 100) : '', a: st.met ? 'npc' : null, x: n.id }); }).join('');
      if (s.partner) { const p = Sys.social.get(s, s.partner); o += `<div class="card gold"><div class="title">Путь пары</div>${C.kv('Свидания', p.status ? '✅' : '—')}${C.kv('Пара (романтика 60)', p.status === 'partner' || p.status === 'married' ? '✅' : '—')}${C.kv('Жить вместе (75, квартира)', p.livingTogether ? '✅' : '—')}${C.kv('Свадьба (90, кольцо)', p.status === 'married' ? '✅' : '—')}</div>`; }
    }
    return o;
  };
  V.npc = function (id) {
    const s = S(), n = D.npcById[id], st = Sys.social.get(s, id), where = Sys.social.where(s, id);
    let o = C.head(n.icon + ' ' + (st.met ? n.name : 'Незнакомец'), n.role + ', ' + n.age, true);
    if (!st.met) return o + C.notice('Вы ещё не знакомы. ' + (where ? 'Сейчас этот человек в районе «' + D.districts[where].name + '».' : 'Сейчас не в городе — попробуйте в другое время.')) + (where ? C.btn('Подойти и познакомиться', 'talk', id, null, { cls: 'wide' }) : '');
    o += `<div class="card"><div class="desc" style="font-size:12.5px">${n.bio}</div><div class="tags">${C.tag('🎯 ' + n.goal, 'gold')}${n.likes.map(l => C.tag('♥ ' + l)).join('')}</div></div>`;
    o += `<div class="card">${C.kv('Отношения', Sys.social.relLabel(st.rel) + ' · ' + Math.round(st.rel))}${C.prog(st.rel, 100)}${C.kv('Доверие', Math.round(st.trust))}${st.status ? C.kv('Статус', Sys.social.statusLabel(st)) + C.kv('Романтика', Math.round(st.romance)) : ''}${C.kv('Где сейчас', where ? D.districts[where].name : 'Не в городе')}${C.kv('Телефон', st.phone ? '📱 есть' : 'нет (отношения 15 + свой смартфон)')}</div>`;
    o += `<div class="btns">${C.btn('💬 Поговорить', 'talk', id, null, { why: where ? '' : 'Сейчас не в городе' })}${C.btn('📱 Написать', 'call', id, null, { cls: 'sec', why: st.phone && s.items.includes('phone') ? '' : 'Нет номера или телефона' })}</div>`;
    o += `<h3 class="heading">Провести время</h3>` + Object.entries(Sys.social.HANG).filter(([k, h]) => !h.romanceOnly || st.status).map(([k, h]) => { const why = Sys.social.hangCheck(s, id, k); return C.row({ icon: h.icon, title: h.name, meta: `<span class="c">${h.cost ? M(h.cost) : 'Бесплатно'}</span><span class="m">⏱ ${U.hrs(h.hours)} · отношения +${h.rel}</span>`, why, btn: C.btn('Да', 'hang', id, k, { cls: 'sm', why }) }); }).join('');
    if (n.romance) {
      o += `<h3 class="heading">Романтика</h3><div class="card">`;
      if (!st.status) { const why = Sys.social.dateCheck(s, id); o += `<div class="desc">Пригласить на свидание. ${why ? '' : 'Ответ зависит от отношений, вашего вида и настроения.'}</div><div class="btns">${C.btn('💐 Пригласить на свидание', 'askDate', id, null, { why })}</div>`; }
      else {
        o += `<div class="btns">`;
        if (st.status === 'dating') o += C.btn('❤️ Предложить встречаться', 'couple', id, null, { why: st.romance < 60 ? 'Нужна романтика 60' : '' });
        if (st.status === 'partner' && !st.livingTogether) o += C.btn('🏠 Предложить жить вместе', 'moveIn', id, null, { why: st.romance < 75 ? 'Нужна романтика 75' : !['flat', 'studio', 'house'].includes(s.housing) ? 'Нужна отдельная квартира' : '' });
        if (st.livingTogether && st.status !== 'married') o += C.btn('💍 Сделать предложение', 'marry', id, null, { why: !s.items.includes('ring') ? 'Купите кольцо в «Имуществе»' : st.romance < 90 ? 'Нужна романтика 90' : '' });
        o += C.btn('Расстаться', 'breakUp', id, null, { cls: 'ghost sm' }) + `</div>`;
      }
      o += `</div>`;
    }
    const mem = Object.keys(st.mem).filter(k => !k.startsWith('hang_') && k !== 'giftDay');
    if (mem.length) o += `<h3 class="heading">Помнит о вас</h3><div class="card">${mem.map(k => `<div class="kv" style="font-size:12px">${V.memText(id, k, st)}</div>`).join('')}</div>`;
    return o;
  };
  V.MEM = { intro: 'Вы познакомились и поговорили по душам', lent: 'Вы одолжили денег, когда было трудно', repaid: 'Долг вернули с благодарностью', story: 'Рассказал(а) вам свою историю', honest: 'Вы были честны с ней', lied: 'Вы соврали — она это заметила', forgiven: 'Вы попросили прощения за ложь', dream: 'Поделился(-ась) мечтой', partner: 'Вы стали партнёрами по делу', donated: 'Вы помогли центру деньгами', album: 'Рассказал про свой альбом', funded: 'Вы вложились в альбом', released: 'Альбом вышел благодаря вам', startup: 'Рассказал про стартап', tested: 'Вы протестировали приложение', mentor: 'Стала вашей наставницей', rod: 'Подарил вам удочку', son: 'Рассказал о ссоре с сыном', letter: 'Вы вместе написали письмо', reunited: 'Помирился с сыном — благодаря вам', fedDay: 'Делился едой, когда вы голодали' };
  V.memText = (id, k) => '• ' + (V.MEM[k] || k);

  // ─────────────────────────── ЕЩЁ
  V.MENU = [['🏠', 'Жильё и имущество', 'housing', 'Аренда, покупка, вещи'], ['🏪', 'Бизнес', 'biz', 'Свои предприятия'], ['💳', 'Финансы', 'fin', 'Банк, вклад, кредит'], ['🍜', 'Питание', 'cat:food', 'Еда и продукты'],
    ['❤️', 'Здоровье и быт', 'cat:health', 'Душ, лечение, сон'], ['🎮', 'Развлечения', 'cat:fun', 'Отдых, рыбалка'], ['🪪', 'Документы', 'cat:docs', 'Паспорт, ОМС, ИП'], ['🚌', 'Транспорт', 'transport', 'Как передвигаться'],
    ['🧍', 'Персонаж', 'hero', 'Внешность, одежда'], ['🎒', 'Инвентарь', 'inventory', 'Вещи и документы'], ['📋', 'Задания', 'quests', 'Сюжетные линии'], ['🏆', 'Достижения', 'ach', 'Награды'],
    ['📔', 'Журнал', 'journal', 'История жизни'], ['📊', 'Статистика', 'stats', 'Ваш путь'], ['🎲', 'Режимы игры', 'modes', 'Варианты прохождения'], ['⚙️', 'Настройки', 'settings', 'Сохранения, доступность'], ['❓', 'Как играть', 'help', 'Подсказки и установка']];
  V.more = function () {
    return C.head('▦ Все разделы', 'Город, привычки и возможности') + `<div class="grid2">${V.MENU.map(z => `<button class="tile" ${C.attrs('go', z[2])}><span class="ti">${z[0]}</span><span>${z[1]}<small>${z[3]}</small></span></button>`).join('')}</div><p class="footnote">С НУЛЯ ${SN.VERSION} · офлайн · без регистрации и аналитики</p>`;
  };

  // ─────────────────────────── ЖИЛЬЁ И ИМУЩЕСТВО
  V.housing = function () {
    const s = S(), cur = D.housing[s.housing];
    let o = C.head('🏠 Жильё и имущество', 'Крыша, вещи и то, что остаётся с вами', true);
    const bill = Sys.prop.weeklyBill(s);
    o += `<div class="card gold"><div class="row"><div class="thumb">${cur.icon}</div><div class="grow"><div class="title">${cur.name}</div><div class="desc">${cur.desc}</div>${bill ? `<div class="meta"><span class="c">Платежи: ${M(bill)}/нед.</span><span class="m">след. списание: день ${s.rentPaid}</span>${s.rentDebt ? '<span class="r">Просрочка ' + s.rentDebt + ' дн.</span>' : ''}</div>` : ''}${s.deposit ? `<div class="desc">Залог: ${M(s.deposit)} (вернётся при выезде без долгов)</div>` : ''}</div></div>${s.housing !== 'street' ? `<div class="btns">${C.btn(cur.type === 'own' ? 'Продать (85%)' : 'Съехать', 'leave', null, null, { cls: 'ghost sm' })}</div>` : ''}</div>`;
    o += C.notice('🏚️ Ночлежка в Старом районе — бесплатно каждую ночь с 19:00. Хостел — 780 ₽ за ночь без аренды.', 'blue');
    o += `<h3 class="heading">Жильё</h3>` + Object.entries(D.housing).filter(([id]) => id !== 'street').map(([id, h]) => {
      const why = s.housing === id ? '' : Sys.prop.checkHome(s, id);
      const price = h.type === 'rent' ? `${M(h.weekly)}/нед.${h.deposit ? ' + залог ' + M(h.deposit) : ''}` : M(h.price) + ' · коммуналка ' + M(h.upkeep) + '/нед.';
      return C.row({ icon: h.icon, title: h.name, desc: h.desc, meta: `<span class="c">${price}</span><span class="m">Сон ×${String(h.sleep).replace('.', ',')}</span>`, why: s.housing === id ? '' : why, cls: s.housing === id ? 'good' : '', btn: s.housing === id ? C.tag('Ваш дом', 'good') : h.type === 'own' ? `<div class="col">${C.btn('Купить', 'home', id, null, { cls: 'sm', why })}${C.btn('Ипотека', 'homeMort', id, null, { cls: 'sm sec', why: Sys.inv.mortQuote(s, h.price).why })}</div>` : C.btn('Снять', 'home', id, null, { cls: 'sm', why }) });
    }).join('');
    o += `<div class="grid2" style="margin-top:12px">${[['🛍️', 'Магазин вещей', 'shop', 'Техника, транспорт, роскошь'], ['🏘️', 'Доходные активы', 'passive', 'Сдавать в аренду']].map(z => `<button class="tile" ${C.attrs('go', z[2])}><span class="ti">${z[0]}</span><span>${z[1]}<small>${z[3]}</small></span></button>`).join('')}</div>`;
    return o;
  };

  // ─────────────────────────── БИЗНЕС
  V.biz = function () {
    const s = S();
    let o = C.head('🏪 Бизнес', 'Прибыль = выручка − себестоимость − аренда − зарплаты − реклама − налог 6%', true);
    if (!s.docs.ip) o += C.notice('Для бизнеса нужно ИП: паспорт → регистрация в Деловом районе (800 ₽, 3 дня).' + (s.docs.passport ? '' : ' Сначала восстановите паспорт.'));
    if (s.biz.length) {
      const tot = s.biz.reduce((a, b) => a + (b.last ? b.last.profit : 0), 0);
      o += `<div class="card gold"><div class="stat3"><div><strong>${s.biz.length}</strong><span>Точек</span></div><div><strong style="color:${tot >= 0 ? 'var(--green)' : 'var(--red)'}">${tot >= 0 ? '+' : ''}${U.num(tot)}</strong><span>₽ за вчера</span></div><div><strong>${s.c.bizProfitDays}</strong><span>Дней в плюсе</span></div></div></div>`;
      o += s.biz.map(b => V.bizPanel(s, b)).join('');
    }
    o += `<h3 class="heading">Открыть дело</h3>` + D.business.map(d => {
      if (Sys.biz.get(s, d.id)) return '';
      const why = Sys.biz.openCheck(s, d.id), price = Sys.biz.price(s, d.id);
      return C.row({ icon: d.icon, title: d.name, desc: d.desc, meta: `<span class="c">${M(price)}</span><span class="m">аренда ${M(d.rent)}/день · до ${d.staffMax} чел.</span><span class="m">📍 ${D.districts[d.district].name}</span>`, why, btn: C.btn('Открыть', 'bizOpen', d.id, null, { cls: 'sm', why }) });
    }).join('');
    return o;
  };
  V.bizPanel = function (s, b) {
    const d = D.bizById[b.id], f = Sys.biz.forecast(s, b), l = b.last;
    const seg = (key, arr, cur) => `<div class="seg">${arr.map((n, i) => C.btn(n, 'bizSet', b.id, key + ':' + i, { cls: cur === i ? '' : 'sec' })).join('')}</div>`;
    return `<div class="card"><div class="row"><div class="thumb">${d.icon}</div><div class="grow"><div class="title">${d.name} · ур. ${b.lvl}</div><div class="desc">Репутация точки ${Math.round(b.rep)} · дней ${b.days} · всего ${b.total >= 0 ? '+' : ''}${M(b.total)}${b.debt ? ' · долг ' + M(b.debt) : ''}</div></div></div>
      ${l ? `<div class="kv"><span>Вчера</span><b style="color:${l.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${l.profit >= 0 ? '+' : ''}${M(l.profit)} · ${l.cust} клиентов</b></div>` : ''}
      <div class="kv"><span>Прогноз на сегодня</span><b style="color:${f.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${f.profit >= 0 ? '+' : ''}${M(f.profit)}</b></div>
      <div class="desc">Спрос ${f.demand} · мощность ${f.cap} · выручка ${M(f.rev)} · себест. ${M(f.cogs)} · аренда ${M(f.rent)} · зарплаты ${M(f.wages)} · реклама ${M(f.ads)} · налог ${M(f.tax)}</div>
      ${f.demand > f.cap * 1.15 ? '<div class="why">Клиенты уходят: не хватает персонала.</div>' : ''}${f.cap === 0 ? '<div class="why">Точка закрыта: нет персонала. Наймите сотрудника или выйдите на смену сами.</div>' : ''}
      <div class="kv"><span>Персонал (${M(d.wage)}/день)</span><span class="row" style="gap:6px">${C.btn('−', 'bizSet', b.id, 'staff:' + (b.staff - 1), { cls: 'sm sec', label: 'Уволить' })}<b>${b.staff}/${d.staffMax}</b>${C.btn('+', 'bizSet', b.id, 'staff:' + (b.staff + 1), { cls: 'sm sec', label: 'Нанять' })}</span></div>
      <div class="desc">Цены</div>${seg('price', D.PRICE_LEVELS.map(p => p.name), b.price)}
      <div class="desc">Реклама (${M(d.ads)} за уровень в день)</div>${seg('ads', ['Нет', 'Немного', 'Активно'], b.ads)}
      <div class="btns">${C.btn('Поработать (8 ч)', 'bizWork', b.id, null, { cls: 'sm', why: b.owner ? 'Уже отработали сегодня' : '' })}${C.btn(b.lvl >= 3 ? 'Макс. уровень' : 'Расширить: ' + M(Sys.biz.upgradeCost(b, d)), 'bizUp', b.id, null, { cls: 'sm sec', why: b.lvl >= 3 ? 'Максимальный уровень' : '' })}${C.btn('Продать: ' + M(Sys.biz.sellValue(s, b)), 'bizSell', b.id, null, { cls: 'sm ghost' })}</div></div>`;
  };

  // ─────────────────────────── ФИНАНСЫ
  V.fin = function () {
    const s = S(), f = s.fin, F = Sys.fin;
    let o = C.head('💳 Финансы', 'Наличные, счёт, вклад, кредит, инвестиции', true);
    o += `<div class="card gold"><div class="stat3"><div><strong>${U.num(s.money)}</strong><span>Наличные ₽</span></div><div><strong>${U.num(s.bank)}</strong><span>На счёте ₽</span></div><div><strong>${U.num(F.netWorth(s))}</strong><span>Капитал ₽</span></div></div>${C.bars(s.days)}</div>`;
    if (!s.account) o += C.row({ icon: '🏦', title: 'Открыть счёт с картой', desc: 'Деньги на счёте не украдут, зарплата приходит на карту, можно платить картой. Нужен паспорт. Деловой район, 09–20.', btn: C.btn('Открыть', 'openAcc', null, null, { cls: 'sm', why: s.docs.passport ? '' : 'Нужен паспорт' }) });
    else {
      o += `<h3 class="heading">Счёт</h3><div class="card">${C.kv('Наличные ↔ счёт', '')}<div class="btns">${C.btn('Внести', 'amount', 'toBank', null, { cls: 'sm' })}${C.btn('Снять', 'amount', 'toCash', null, { cls: 'sm sec' })}</div></div>`;
      o += `<div class="card">${C.kv('🐷 Вклад', M(f.deposit))}<div class="desc">0,04% в день (~15,7% годовых), проценты начисляются каждую ночь. Снимать можно в любой момент.</div><div class="btns">${C.btn('Пополнить', 'amount', 'depPut', null, { cls: 'sm' })}${C.btn('Снять', 'amount', 'depTake', null, { cls: 'sm sec', why: f.deposit < 1 ? 'Вклад пуст' : '' })}</div></div>`;
      const lim = F.loanLimit(s), why = F.loanWhy(s);
      o += `<div class="card ${f.loan > 0 && T.day(s) > f.loanDue ? 'warn' : ''}">${C.kv('💸 Кредит', f.loan > 0 ? M(f.loan) : 'нет')}${f.loan > 0 ? C.kv('Погасить до', 'дня ' + f.loanDue + (T.day(s) > f.loanDue ? ' — просрочка!' : '')) : ''}<div class="desc">Ставка ${(F.loanRate(s) * 100).toFixed(3).replace('.', ',')}% в день (~${Math.round(F.loanRate(s) * 36500)}% годовых), срок ${F.LOAN_TERM} дней. Просрочка: пени 0,2%/день и падение репутации. Берите кредит только на то, что принесёт доход.</div>
        <div class="btns">${f.loan > 0 ? C.btn('Погасить', 'amount', 'repay', null, { cls: 'sm' }) : C.btn('Взять (до ' + M(lim) + ')', 'amount', 'loan', null, { cls: 'sm sec', why: why || (lim <= 0 ? 'Лимит пока 0 — нужна история доходов' : '') })}</div></div>`;
      o += `<h3 class="heading">Инвестиции</h3>` + Object.entries(F.FUNDS).map(([id, fd]) => C.row({ icon: fd.icon, title: fd.name + ': ' + M(f.funds[id] || 0), desc: '⚠️ ' + fd.risk + (s.certs.includes('finlit') ? '' : ' Пройдите бесплатный курс финграмотности.'), btn: `<div style="display:flex;flex-direction:column;gap:6px">${C.btn('Купить', 'amount', 'fund:' + id, null, { cls: 'sm' })}${C.btn('Продать', 'sellFund', id, null, { cls: 'sm sec', why: (f.funds[id] || 0) < 1 ? 'Нет вложений' : '' })}</div>` })).join('');
    }
    o += `<h3 class="heading">История операций</h3><div class="card">${f.ledger.slice(0, 30).map(l => `<div class="kv" style="font-size:12px"><span>Д${l.d} ${l.h || ''} · ${e(l.n)}</span><b style="color:${l.a > 0 ? 'var(--green)' : l.a < 0 ? 'var(--red)' : 'var(--mute)'}">${l.a ? (l.a > 0 ? '+' : '') + U.num(l.a) : '⇄'}</b></div>`).join('') || C.empty('Операций пока нет')}</div>`;
    return o;
  };

  // ─────────────────────────── ТРАНСПОРТ
  V.transport = function () {
    const s = S();
    let o = C.head('🚌 Транспорт', 'Как герой передвигается между районами', true);
    o += C.notice('Если действие в другом районе, герой доедет автоматически выбранным способом — время и деньги списываются честно.', 'blue');
    o += [['auto', { icon: '🤖', name: 'Автоматически', mins: '—', cost: 0 }]].concat(Object.entries(D.transport)).map(([id, t]) => {
      const av = id === 'auto' || Sys.city.modeAvailable(s, id);
      const on = s.settings.transport === id;
      return C.row({ icon: t.icon, title: t.name + (on ? ' ✓' : ''), desc: id === 'auto' ? 'Экономно, когда денег мало; быстро, когда хватает.' : `${t.mins} мин · ${t.cost ? M(t.cost) : 'бесплатно'} · энергия −${t.energy}${t.item ? ' · нужно: ' + D.items[t.item].name.toLowerCase() : ''}${t.open ? ' · ' + Sys.city.hoursLabel(t.open) : ''}`, cls: on ? 'gold' : '', btn: C.btn(on ? 'Выбрано' : 'Выбрать', 'setTransport', id, null, { cls: 'sm ' + (on ? 'sec' : ''), why: av ? '' : 'Сейчас недоступно' }) });
    }).join('');
    return o;
  };

  // ─────────────────────────── ПЕРСОНАЖ
  V.hero = function () {
    const s = S();
    let o = C.head('🧍 Персонаж', 'Внешность и одежда влияют на собеседования и знакомства', true);
    o += `<div class="card"><div class="avatar-big">${SN.Scene.avatar(s, true)}</div>
      <label class="desc" for="heroName">Имя</label><input id="heroName" class="field" maxlength="24" value="${e(s.hero.name)}" data-change="name" autocomplete="off">
      <div class="desc" style="margin-top:10px">Тон кожи</div><div class="swatches">${SN.Scene.SKIN.map((c, i) => `<button class="sw ${s.hero.skin === i ? 'on' : ''}" style="background:${c}" ${C.attrs('look', 'skin', i)} aria-label="Тон ${i + 1}"></button>`).join('')}</div>
      <div class="desc" style="margin-top:10px">Волосы</div><div class="swatches">${SN.Scene.HAIR.map((c, i) => `<button class="sw ${s.hero.hair === i ? 'on' : ''}" style="background:${c}" ${C.attrs('look', 'hair', i)} aria-label="Цвет ${i + 1}"></button>`).join('')}</div>
      <div class="btns">${C.btn(s.hero.beard ? 'Побриться' : 'Отрастить бороду', 'look', 'beard', s.hero.beard ? 0 : 1, { cls: 'sec sm' })}</div></div>`;
    o += `<div class="card gold">${C.kv('Внешний вид (для работы)', Sys.stats.look(s) + ' из 4')}${C.kv('Утепление одежды', '+' + Sys.stats.warmthBonus(s))}</div>`;
    const disc = s.flags.discountDay === T.day(s);
    o += `<h3 class="heading">Гардероб ${disc ? C.tag('−30% сегодня', 'gold') : ''}</h3>` + Object.entries(D.clothes).map(([id, c]) => {
      const has = s.clothes.includes(id), on = s.wear === id;
      const btn = on ? C.tag('Надето', 'good') : has ? C.btn('Надеть', 'wear', id, null, { cls: 'sm sec' }) : c.price ? C.btn('Купить', 'buyClothes', id, null, { cls: 'sm', why: Sys.econ.canPay(s, Sys.prop.clothPrice(s, id)) ? '' : 'Нужно ' + M(Sys.prop.clothPrice(s, id)) }) : C.btn('Где взять', 'go', 'district:old', null, { cls: 'sm ghost' });
      return C.row({ icon: c.icon, title: c.name, desc: c.desc, meta: `<span class="m">🌡️+${c.warmth} · 👔 ${c.look}</span>${!has && c.price ? `<span class="c">${M(Sys.prop.clothPrice(s, id))}</span>` : ''}`, cls: on ? 'gold' : '', btn });
    }).join('');
    return o;
  };

  // ─────────────────────────── ИНВЕНТАРЬ / ЗАДАНИЯ / ДОСТИЖЕНИЯ / ЖУРНАЛ / СТАТИСТИКА
  V.inventory = function () {
    const s = S();
    let o = C.head('🎒 Инвентарь', 'Вещи, документы, запасы', true);
    o += `<div class="card gold">${C.kv('🏠 Жильё', D.housing[s.housing].name)}${C.kv('🛍️ Продукты дома', s.groceries + ' порц.')}${C.kv('🐟 Рыба', s.fish)}${s.flags.dog ? C.kv('🐕 Рыжик', 'с вами') : ''}</div>`;
    o += `<h3 class="heading">Документы</h3><div class="card">${Object.keys(D.docNames).map(k => C.kv(D.docNames[k], s.docs[k] ? '✅' : s.docsPending[k] ? '⏳' : '—')).join('')}${s.certs.map(c => C.kv('🎓 ' + D.certNames[c], '✅')).join('')}</div>`;
    o += `<h3 class="heading">Вещи</h3>` + (s.items.length ? s.items.map(i => C.row({ icon: D.items[i].icon, title: D.items[i].name, desc: D.items[i].desc + (i === 'phone' && s.flags.phoneBroken ? ' ⚠️ Сломан.' : '') })).join('') : C.empty('Вещей пока нет'));
    o += `<h3 class="heading">Одежда</h3>` + s.clothes.map(c => C.row({ icon: D.clothes[c].icon, title: D.clothes[c].name + (s.wear === c ? ' (надето)' : '') })).join('');
    return o;
  };
  V.quests = function () {
    const s = S();
    let o = C.head('📋 Задания', D.quests.length + ' целей в ' + Object.keys(D.questLines).length + ' сюжетных линиях', true);
    for (const [line, [icon, name]] of Object.entries(D.questLines)) {
      const qs = D.quests.filter(q => q.line === line);
      const done = qs.filter(q => s.quests[q.id] === 'done').length;
      o += `<h3 class="heading">${icon} ${name} <span class="muted">${done}/${qs.length}</span></h3>`;
      o += qs.map(q => {
        const st = s.quests[q.id] === 'done' ? 'done' : Sys.quests.isOpen(s, q) ? 'active' : 'locked';
        const r = q.reward || {};
        return C.row({ icon: st === 'done' ? '✅' : st === 'active' ? '🎯' : '🔒', title: q.title, desc: st === 'locked' ? 'Откроется после: ' + q.after.map(a => D.questById[a].title).join(', ') : q.desc, meta: (st === 'active' && q.prog ? `<span class="c">${e(q.prog(s))}</span>` : '') + `<span class="m">+${r.xp || 0} XP${r.rep ? ' · реп. +' + r.rep : ''}${r.money ? ' · ' + M(r.money) : ''}</span>`, cls: st === 'done' ? 'good' : st === 'locked' ? 'dim' : '' });
      }).join('');
    }
    return o;
  };
  V.ach = function () {
    const s = S(), n = Object.keys(s.ach).length;
    return C.head('🏆 Достижения', n + ' из ' + D.achievements.length, true) + `<div class="grid2">${D.achievements.map(a => `<div class="tile ${s.ach[a.id] ? '' : 'dim'}" style="${s.ach[a.id] ? 'border-color:#6b542f' : 'opacity:.55'}"><span class="ti">${s.ach[a.id] ? a.icon : '🔒'}</span><span>${a.name}<small>${a.desc}${s.ach[a.id] ? ' · день ' + s.ach[a.id] : ''}</small></span></div>`).join('')}</div>`;
  };
  V.journal = function () {
    const s = S();
    return C.head('📔 Журнал', 'История решений и событий', true) + `<div class="card">${s.log.map(l => `<div class="kv" style="display:block;font-size:12.5px"><span class="muted">День ${l.d}${l.h ? ', ' + l.h : ''}</span><br>${e(l.t)}</div>`).join('')}</div>`;
  };
  V.stats = function () {
    const s = S(), c = s.c;
    let o = C.head('📊 Статистика', 'Ваш путь в цифрах', true);
    o += `<div class="btns">${C.btn('🏅 Рейтинг состояний', 'go', 'rich', null, { cls: 'sec' })}</div>`;
    o += `<div class="card gold"><div class="stat3"><div><strong>${T.day(s)}</strong><span>День</span></div><div><strong>${Sys.quests.level(s)}</strong><span>Уровень</span></div><div><strong>${U.num(Sys.fin.netWorth(s))}</strong><span>Капитал ₽</span></div></div>${C.bars(s.days)}</div>`;
    o += `<div class="card">${[['💰 Заработано всего', M(c.earned)], ['🧾 Потрачено всего', M(c.spent)], ['🛠️ Подработок', c.gigs], ['💼 Смен на работе', c.jobs], ['🎓 Часов учёбы', c.studyH], ['🍲 Приёмов пищи', c.meals], ['🛏️ Ночей', c.sleeps], ['🌃 Ночей на улице', c.nightsStreet], ['💞 Свиданий', c.dates], ['📅 Событий', c.events], ['🐟 Рыбы поймано', c.fishCaught], ['🏘️ Пассивный доход всего', M(c.passive || 0)], ['⏩ Дней на автопилоте', c.autoDays || 0], ['🎙️ Подписчиков', U.num(s.flags.subs || 0)], ['🚑 Обмороков', c.collapses], ['⭐ Опыт', U.num(s.xp) + ' XP']].map(z => C.kv(z[0], z[1])).join('')}</div>`;
    return o;
  };

  // ─────────────────────────── РЕЖИМЫ / НАСТРОЙКИ / ПОМОЩЬ
  V.MODES = [
    ['👑', 'Классический', true, 'Сбалансированная песочница с сюжетными линиями. Обморок не заканчивает игру. Бесплатные службы всегда доступны.'],
    ['💀', 'Хардкор', false, 'Цены ×1,4, зарплаты ×0,8, болезни вдвое опаснее, кражи чаще. Нет бесплатного обеда по выходным. Восстановление после неудачи: социальный контракт центра занятости (обучение + 14 дней гарантированного ночлега), реабилитационный кредит без процентов 10 000 ₽ раз в игру.'],
    ['📖', 'Сюжетный', false, '5 актов, 40+ сцен с выбором, напарники с собственными арками. Концовки: «Мастер своего дела», «Семья», «Свободная жизнь», «Империя», «Помощь другим». Ключевые решения необратимы и меняют отношение NPC.'],
    ['♾️', 'Песочница', false, 'Выбор стартовых условий: деньги, документы, жильё, навыки, сезон. Множители экономики. Отключаемые потребности. Без заданий-ограничений.'],
    ['🏢', 'Бизнес-империя', false, 'Старт с 200 000 ₽ и ИП. Конкуренты в районах, закупки партиями, найм с навыками, кредитные линии, филиалы, франшизы, фондовый рынок с акциями вашей компании.'],
    ['👨‍👩‍👦', 'Династия', false, 'Семья и дети, взросление (1 игровой год = 1 месяц жизни ребёнка), наследование активов и 50% навыков, смена поколений, репутация фамилии.']
  ];
  V.modes = function () {
    const s = S();
    return C.head('🎲 Режимы игры', 'Сейчас полностью реализован Классический режим', true) + C.notice('Остальные режимы в разработке. Ниже — их задокументированные правила; выбрать их пока нельзя.', 'blue') + V.MODES.map(m => C.row({ icon: m[0], title: m[1] + (m[2] ? '' : ''), desc: m[3], cls: m[2] ? 'gold' : 'dim', btn: m[2] ? C.tag('Активен', 'good') : C.tag('В разработке') })).join('');
  };
  V.settings = function () {
    const s = S(), st = s.settings;
    const tog = (k, label, desc) => `<div class="card"><label class="switch"><span><span class="title">${label}</span><span class="desc" style="display:block">${desc}</span></span><input type="checkbox" ${st[k] ? 'checked' : ''} data-toggle="${k}"></label></div>`;
    let o = C.head('⚙️ Настройки', 'Доступность и сохранения', true);
    o += tog('motion', 'Анимации', 'Плавные переходы и погодные эффекты (150–250 мс).');
    o += tog('bigText', 'Крупный текст', 'Увеличивает размер шрифта.');
    o += tog('vibro', 'Вибрация', 'Лёгкий отклик при нажатиях и событиях (на телефоне).');
    o += `<div class="card gold"><div class="title">🔐 Автосохранение включено</div><div class="desc">Прогресс хранится только в этом браузере (localStorage) с контрольной суммой и резервной копией. Ничего не отправляется в интернет. Очистка данных браузера удалит прогресс — делайте экспорт.</div><div class="btns">${C.btn('💾 Экспорт в файл', 'exportSave', null, null, { cls: 'sm' })}${C.btn('📋 Скопировать код', 'copySave', null, null, { cls: 'sm sec' })}</div></div>`;
    o += `<div class="card"><div class="title">Импорт сохранения</div><div class="desc">JSON-файл, экспортированный ранее (поддерживаются и сохранения прототипа).</div><input type="file" accept="application/json,.json" class="field" style="margin-top:8px" data-file="import"></div>`;
    o += `<div class="card"><div class="title">Новая игра</div><div class="desc">Начать заново. Текущий прогресс будет удалён (сделайте экспорт).</div><div class="btns">${C.btn('Начать заново', 'reset', null, null, { cls: 'bad sm' })}</div></div>`;
    o += `<p class="footnote">С НУЛЯ ${SN.VERSION} · формат сохранения v${SN.SAVE_VERSION} · HTML/CSS/JS без движков и CDN</p>`;
    return o;
  };
  V.help = function () {
    return C.head('❓ Как играть', '', true) + `<div class="card"><div class="title">Первые шаги</div><div class="desc" style="font-size:12.5px;line-height:1.55">
      1. Днём — бесплатный обед, душ и вещи в соццентре (Старый район).<br>2. Познакомьтесь с Ниной Петровной: она даст направление на паспорт.<br>3. Подрабатывайте: вторсырьё, листовки, разгрузка. Копите.<br>4. Ночуйте в ночлежке (с 19:00) — там тепло и не воруют.<br>5. С паспортом: счёт в банке, курсы, вакансии, аренда хостела.<br>6. Учитесь — профессии с документами платят в разы больше.<br>7. Дальше — своё дело, жильё, семья, или свободная жизнь. Выбор ваш.</div></div>
      <div class="card"><div class="title">Показатели</div><div class="desc" style="font-size:12.5px;line-height:1.55">Голод, холод и усталость медленно отнимают здоровье. При нуле здоровья — больница, а не конец игры. Стресс снижает эффективность, отдых и общение его снимают. Каждое действие тратит игровое время.</div></div>
      <div class="card"><div class="title">📲 Установить на Android</div><div class="desc" style="font-size:12.5px;line-height:1.55">Откройте игру в Chrome по HTTPS-адресу → меню ⋮ → «Добавить на главный экран» / «Установить приложение». После первого запуска игра работает без интернета.</div></div>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
