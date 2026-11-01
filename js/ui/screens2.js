/* Экраны 0.3: финансы (банк, вклады, кредиты, ипотека, биржа, страхование), доходные активы, магазин,
   таланты, мастер-классы, автопилот, рейтинг богачей, обновлённое меню */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, C = UI.C, V = UI.views;
  const e = U.esc, M = U.money, I = () => Sys.inv;
  const S = () => SN.state;
  UI.tabs = UI.tabs || {};
  UI.tabs.fin = UI.tabs.fin || 'overview'; UI.tabs.passive = UI.tabs.passive || 'realty'; UI.tabs.shop = UI.tabs.shop || 'tech';

  /* Мини-график (спарклайн) */
  C.spark = function (arr, w, h, opt) {
    opt = opt || {}; w = w || 120; h = h || 34;
    if (!arr || arr.length < 2) return `<svg width="${w}" height="${h}" class="spark"></svg>`;
    const mn = Math.min(...arr), mx = Math.max(...arr), rg = mx - mn || 1;
    const pts = arr.map((v, i) => [i / (arr.length - 1) * w, h - 3 - (v - mn) / rg * (h - 6)]);
    const up = arr[arr.length - 1] >= arr[0], col = opt.col || (up ? 'var(--green)' : 'var(--red)');
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" class="spark-line"/></svg>`;
  };
  C.pct = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + '%';
  C.hero2 = (items) => `<div class="kpis">${items.map(([v, l, cls]) => `<div class="kpi ${cls || ''}"><strong>${v}</strong><span>${l}</span></div>`).join('')}</div>`;

  // ─────────── Панель «Прожить» на главном экране
  V.autoPanel = function (s) {
    const p = Sys.auto.plan(s);
    const wl = { auto: 'работа + подработки', job: 'только основная работа', gig: 'только подработки', biz: 'своё дело', none: 'отдых' }[p.work];
    const c = p.study && D.courseById[p.study];
    return `<div class="card autopanel"><div class="row"><div class="thumb glow">⏩</div><div class="grow"><div class="title">Прожить время</div><div class="desc">План: ${wl}${c ? ' · учёба: ' + e(c.name) : ''}. Герой сам ест, моется, лечится и спит.</div></div>${C.btn('⚙', 'go', 'auto', null, { cls: 'sec sm', label: 'План' })}</div>
      <div class="seg3">${C.btn('1 день', 'live', 1, null, { cls: 'sec' })}${C.btn('Неделя', 'live', 7)}${C.btn('Месяц', 'live', 30, null, { cls: 'sec' })}</div></div>`;
  };
  V.auto = function () {
    const s = S(), p = Sys.auto.plan(s);
    const opt = (key, val, label, desc) => `<button class="choice ${p[key] === val ? 'on' : ''}" ${C.attrs('autoSet', key, val)}>${label}${desc ? `<small class="ok">${desc}</small>` : ''}</button>`;
    let o = C.head('⏩ Автопилот', 'Как герой проживает дни, когда вы ускоряете время', true);
    o += `<h3 class="heading">Работа</h3>` + opt('work', 'auto', '💼 Работа и подработки', 'Смена на основной работе, затем лучшие подработки; в выходные — подработки')
      + opt('work', 'job', '🏢 Только основная работа', 'Без подработок: больше сил на учёбу') + opt('work', 'gig', '🛠️ Только подработки')
      + opt('work', 'biz', '🏪 Работать в своём деле', 'Владелец выходит на смену в точку без персонала') + opt('work', 'none', '🌴 Не работать', 'Жить на сбережения и пассивный доход');
    o += `<h3 class="heading">Часов работы в день: ${p.maxHours}</h3><div class="seg">${[6, 8, 10, 12, 14].map(h => C.btn(String(h), 'autoSet', 'maxHours', h, { cls: p.maxHours === h ? '' : 'sec' })).join('')}</div>`;
    const avail = D.courses.filter(c => !Sys.edu.done(s, c) && !Sys.econ.reqFail(s, c.req));
    o += `<h3 class="heading">Учёба в свободное время</h3>` + opt('study', '', '— Не учиться') + avail.map(c => opt('study', c.id, c.icon + ' ' + c.name, c.repeat ? 'Повторяемо' : 'Пройдено ' + Sys.edu.progress(s, c) + '/' + c.hours + ' ч')).join('');
    o += `<h3 class="heading">События</h3>` + opt('events', 'auto', '🤖 Решать разумно', 'Автопилот выберет осторожный вариант и расскажет, что случилось') + opt('events', 'stop', '✋ Останавливаться', 'Каждое событие решаете вы');
    o += `<div class="card"><label class="switch"><span><span class="title">Прятать наличные на счёт</span><span class="desc" style="display:block">Перед сном — защита от краж</span></span><input type="checkbox" ${p.saveCash ? 'checked' : ''} data-autotoggle="saveCash"></label></div>`;
    o += `<div class="seg3">${C.btn('1 день', 'live', 1, null, { cls: 'sec' })}${C.btn('Неделя', 'live', 7)}${C.btn('Месяц', 'live', 30, null, { cls: 'sec' })}</div>`;
    return o;
  };

  // ─────────── Финансы
  V.fin = function (tab) {
    const s = S(), f = s.fin, F = Sys.fin; tab = tab || UI.tabs.fin;
    const sc = I().score(s);
    let o = C.head('💳 Финансы', 'Банк, кредиты, инвестиции, страхование', true);
    o += `<div class="card gold bankcard"><div class="bc-top"><span>🏦 Городской банк</span><span class="tag ${s.fin.card === 'premium' ? 'gold' : ''}">${I().CARDS[s.fin.card || 'basic'].name}</span></div>
      <div class="bc-sum">${U.num(F.netWorth(s))} <span>₽ капитал</span></div>${C.spark(s.nwHist.slice(-30), 300, 46, { col: 'var(--gold)' })}
      <div class="kpis">${[[U.num(s.money), 'Наличные'], [U.num(s.bank), 'На карте'], [sc, 'Рейтинг · ' + I().scoreLabel(sc)]].map(([v, l]) => `<div class="kpi"><strong>${v}</strong><span>${l}</span></div>`).join('')}</div></div>`;
    o += C.tabs([['overview', 'Обзор'], ['save', 'Вклады'], ['credit', 'Кредиты'], ['invest', 'Биржа'], ['ins', 'Защита']], tab, 'finTab');
    if (!s.account) {
      o += C.row({ icon: '🏦', title: 'Открыть счёт с картой', desc: 'Деньги на счёте не украдут, зарплата приходит на карту, кешбэк с покупок. Нужен паспорт. Деловой район, 09–20.', btn: C.btn('Открыть', 'openAcc', null, null, { cls: 'sm', why: s.docs.passport ? '' : 'Нужен паспорт' }) });
      return o + V.ledger(s);
    }
    if (tab === 'overview') {
      const pas = I().passivePerDay(s);
      o += `<div class="card"><div class="title">Доходы и расходы за 14 дней</div>${C.bars(s.days)}</div>`;
      o += `<div class="card">${C.kv('📥 Средний доход в день', M(F.avgIncome(s)))}${C.kv('🏠 Пассивный доход в день', M(pas))}${C.kv('🐷 Накопительный счёт', M(f.deposit))}${C.kv('📈 Брокерский портфель', M(I().portfolioValue(s)))}${C.kv('💸 Долги', M(f.loan + f.mort.reduce((a, m) => a + m.left, 0)))}${C.kv('🎁 Кешбэк ' + (I().CARDS[f.card || 'basic'].cb * 100) + '%', 'начисляется каждую ночь')}</div>`;
      o += `<div class="card"><div class="title">💳 Наличные ↔ карта</div><div class="btns">${C.btn('Внести на карту', 'amount', 'toBank', null, { cls: 'sm' })}${C.btn('Снять наличные', 'amount', 'toCash', null, { cls: 'sm sec' })}</div></div>`;
      o += `<div class="card"><div class="title">🪙 Копилка</div><div class="desc">Часть каждой зарплаты, прибыли бизнеса и пассивного дохода автоматически уходит на накопительный счёт.</div><div class="seg">${[0, 5, 10, 20, 30].map(p => C.btn(p ? p + '%' : 'Выкл', 'finSet', 'autosave', p, { cls: (f.autosave || 0) === p ? '' : 'sec' })).join('')}</div></div>`;
      o += `<div class="card"><div class="title">💎 Карта</div>${Object.entries(I().CARDS).map(([k, c]) => `<button class="choice ${f.card === k ? 'on' : ''}" ${C.attrs('setCard', k)}>${c.name} — кешбэк ${c.cb * 100}%${c.fee ? ', ' + M(c.fee) + '/нед.' : ', бесплатно'}${c.score ? `<small class="${sc >= c.score ? 'ok' : ''}">Рейтинг от ${c.score}</small>` : ''}</button>`).join('')}</div>`;
      o += V.scoreCard(s, sc);
    } else if (tab === 'save') {
      o += `<div class="card">${C.kv('🐷 Накопительный счёт', M(f.deposit))}<div class="desc">${((F.DEP_RATE * (SN.perk(s, 'banker') ? 1.2 : 1)) * 100).toFixed(3).replace('.', ',')}% в день, снятие в любой момент.</div><div class="btns">${C.btn('Пополнить', 'amount', 'depPut', null, { cls: 'sm' })}${C.btn('Снять', 'amount', 'depTake', null, { cls: 'sm sec', why: f.deposit < 1 ? 'Пусто' : '' })}</div></div>`;
      o += `<h3 class="heading">Срочные вклады <span class="muted">выше ставка, но досрочно — без процентов</span></h3>`;
      o += I().TERMS.map((t, k) => C.row({ icon: '🔒', title: 'Вклад на ' + t.days + ' дней', desc: (I().termRate(s, k) * 100).toFixed(3).replace('.', ',') + '% в день · ≈ ' + Math.round((Math.pow(1 + I().termRate(s, k), t.days) - 1) * 100) + '% за срок', btn: C.btn('Открыть', 'amount', 'term:' + k, null, { cls: 'sm' }) })).join('');
      if (f.terms.length) o += `<h3 class="heading">Мои вклады</h3>` + f.terms.map((t, i) => C.row({ icon: '🐷', title: M(t.amt) + ' · +' + M(t.acc), desc: 'Закрытие на ' + t.end + '-й день (осталось ' + Math.max(0, t.end - T.day(s)) + ' дн.)', extra: C.prog(t.days - (t.end - T.day(s)), t.days), btn: C.btn('Закрыть', 'closeTerm', i, null, { cls: 'sm ghost' }) })).join('');
    } else if (tab === 'credit') {
      const lim = F.loanLimit(s), why = F.loanWhy(s);
      o += V.scoreCard(s, sc);
      o += `<div class="card ${f.loan > 0 && T.day(s) > f.loanDue ? 'warn' : ''}"><div class="title">💸 Потребительский кредит</div>${C.kv('Долг', f.loan > 0 ? M(f.loan) : 'нет')}${f.loan > 0 ? C.kv('Погасить до', 'дня ' + f.loanDue) : ''}<div class="desc">Ставка ${(F.loanRate(s) * 100).toFixed(3).replace('.', ',')}% в день (~${Math.round(F.loanRate(s) * 36500)}% годовых), срок ${F.LOAN_TERM} дней. Рейтинг снижает ставку.</div><div class="btns">${f.loan > 0 ? C.btn('Погасить', 'amount', 'repay', null, { cls: 'sm' }) : C.btn('Взять (до ' + M(lim) + ')', 'amount', 'loan', null, { cls: 'sm sec', why: why || (lim <= 0 ? 'Лимит 0 — нужна история доходов и рейтинг 500+' : '') })}</div></div>`;
      o += `<h3 class="heading">Ипотека</h3>` + C.notice('🏠 Ипотека: первый взнос 20%, срок ' + I().MORT_DAYS + ' дней, ежедневный платёж. Можно купить своё жильё (раздел «Жильё») или недвижимость под сдачу («Активы»). 14 дней просрочки — банк забирает залог.', 'blue');
      o += f.mort.length ? f.mort.map((m, i) => C.row({ icon: '🏦', title: m.name, desc: 'Остаток ' + M(m.left) + ' · платёж ' + M(m.pay) + '/день' + (m.missed ? ' · просрочка ' + m.missed + ' дн.' : ''), cls: m.missed ? 'warn' : '', btn: C.btn('Погасить', 'amount', 'mort:' + i, null, { cls: 'sm' }) })).join('') : C.empty('Ипотек нет');
    } else if (tab === 'invest') {
      o += V.broker(s);
    } else if (tab === 'ins') {
      o += Object.entries(I().INS).map(([k, x]) => C.row({ icon: x.icon, title: x.name, desc: x.desc, meta: `<span class="c">${M(x.fee(s))}/нед.</span>`, cls: f.ins[k] ? 'good' : '', btn: C.btn(f.ins[k] ? 'Отключить' : 'Оформить', 'toggleIns', k, null, { cls: 'sm ' + (f.ins[k] ? 'ghost' : '') }) })).join('');
      o += `<div class="card"><label class="switch"><span><span class="title">🔑 Агентство по аренде</span><span class="desc" style="display:block">Ищет арендаторов за 1–2 дня вместо недели. Комиссия 10% от аренды.</span></span><input type="checkbox" ${f.agency ? 'checked' : ''} data-fintoggle="agency"></label></div>`;
    }
    return o + (tab === 'overview' ? V.ledger(s) : '');
  };
  V.scoreCard = (s, sc) => `<div class="card"><div class="row"><div class="grow"><div class="title">📊 Кредитный рейтинг: ${sc} · ${I().scoreLabel(sc)}</div><div class="desc">Растёт от репутации, официального дохода, своевременных платежей и капитала. Влияет на ставки, лимиты, ипотеку и премиальную карту.</div></div></div><div class="score-bar"><i style="left:${(sc - 300) / 550 * 100}%"></i></div><div class="score-scale"><span>300 · низкий</span><span>575</span><span>отличный · 850</span></div></div>`;
  V.ledger = s => `<h3 class="heading">История операций</h3><div class="card">${s.fin.ledger.slice(0, 30).map(l => `<div class="kv" style="font-size:12px"><span>Д${l.d} ${l.h || ''} · ${e(l.n)}</span><b style="color:${l.a > 0 ? 'var(--green)' : l.a < 0 ? 'var(--red)' : 'var(--mute)'}">${l.a ? (l.a > 0 ? '+' : '') + U.num(l.a) : '⇄'}</b></div>`).join('') || C.empty('Операций пока нет')}</div>`;

  V.broker = function (s) {
    const f = s.fin, m = I().mkt(s);
    if (!f.broker) return C.row({ icon: '📈', title: 'Брокерский счёт', desc: 'Акции 10 компаний города, облигации, золото. Комиссия 0,3%, налог 13% с прибыли и дивидендов. Цены меняются каждый день — можно и заработать, и потерять.', btn: C.btn('Открыть', 'openBroker', null, null, { cls: 'sm' }) });
    const val = I().portfolioValue(s), cost = I().portfolioCost(s);
    let o = `<div class="card">${C.hero2([[U.num(val), 'Портфель ₽'], [`<span style="color:${val >= cost ? 'var(--green)' : 'var(--red)'}">${val >= cost ? '+' : ''}${U.num(val - cost)}</span>`, 'Прибыль ₽'], [U.num(s.bank), 'Свободно ₽']])}</div>`;
    if (f.news.length) o += `<div class="card news">${f.news.slice(0, 3).map(n => `<div class="desc">Д${n.d}: ${e(n.t)}</div>`).join('')}</div>`;
    o += `<h3 class="heading">Акции <span class="muted">дивиденды раз в 30 дней</span></h3>`;
    o += D.stocks.map(st => {
      const p = m.p[st.id], h = m.h[st.id] || [p], ch = h.length > 1 ? p / h[Math.max(0, h.length - 8)] - 1 : 0, pos = f.port[st.id];
      return `<div class="card stock"><div class="row"><div class="thumb">${st.icon}</div><div class="grow"><div class="title">${st.name} <span class="muted">${st.id}</span></div><div class="meta"><span>${p < 10 ? p.toFixed(3).replace('.', ',') : U.num(p)} ₽</span><span style="color:${ch >= 0 ? 'var(--green)' : 'var(--red)'}">${C.pct(ch)} 7д</span>${st.div ? `<span class="m">див. ${Math.round(st.div * 100)}%</span>` : '<span class="m">без дивидендов</span>'}</div>${pos ? `<div class="desc">У вас ${U.num(pos.q)} шт. на ${M(pos.q * p)} (${C.pct(pos.q * p / pos.cost - 1)})</div>` : ''}</div>${C.spark(h, 78, 34)}</div>
        <div class="btns">${C.btn('Купить', 'amount', 'stock:' + st.id, null, { cls: 'sm' })}${pos ? C.btn('Продать ½', 'sellStock', st.id, 0.5, { cls: 'sm sec' }) + C.btn('Всё', 'sellStock', st.id, 1, { cls: 'sm ghost' }) : ''}</div></div>`;
    }).join('');
    o += `<h3 class="heading">Облигации и золото</h3>`;
    o += C.row({ icon: '📜', title: I().BOND.name, desc: (I().BOND.rate * 100).toFixed(3).replace('.', ',') + '% в день купонами, погашение через ' + I().BOND.days + ' дней. Почти без риска.', meta: f.bonds.length ? `<span>У вас ${M(f.bonds.reduce((a, b) => a + b.amt, 0))}</span>` : '', btn: C.btn('Купить', 'amount', 'bond', null, { cls: 'sm' }) });
    o += C.row({ icon: '🥇', title: 'Золото: ' + U.num(m.gold) + ' ₽/г', desc: 'Защитный актив, спред 3%. У вас ' + f.gold.toFixed(1).replace('.', ',') + ' г на ' + M(f.gold * m.gold), extra: C.spark(m.gh, 140, 26, { col: 'var(--gold)' }), btn: `<div class="col">${C.btn('Купить', 'amount', 'gold', null, { cls: 'sm' })}${C.btn('Продать', 'sellGold', null, null, { cls: 'sm sec', why: f.gold > 0 ? '' : 'Нет золота' })}</div>` });
    o += `<h3 class="heading">Фонды</h3>` + Object.entries(Sys.fin.FUNDS).map(([id, fd]) => C.row({ icon: fd.icon, title: fd.name + ': ' + M(f.funds[id] || 0), desc: '⚠️ ' + fd.risk, btn: `<div class="col">${C.btn('Купить', 'amount', 'fund:' + id, null, { cls: 'sm' })}${C.btn('Продать', 'sellFund', id, null, { cls: 'sm sec', why: (f.funds[id] || 0) < 1 ? 'Нет вложений' : '' })}</div>` })).join('');
    return o;
  };

  // ─────────── Доходные активы
  V.passive = function (tab) {
    const s = S(); tab = tab || UI.tabs.passive;
    const per = I().passivePerDay(s), val = I().passiveValue(s);
    let o = C.head('🏘️ Активы', 'Пассивный доход: деньги, которые работают, пока вы живёте', true);
    o += `<div class="card gold">${C.hero2([['+' + U.num(per), '₽ в день'], [U.num(per * 30), '₽ в месяц'], [U.num(val), 'Стоимость ₽']])}<div class="desc" style="margin-top:6px">После налога 13% и расходов. Всего получено: ${M(s.c.passive || 0)}</div></div>`;
    o += C.tabs(Object.entries(D.passiveCats).map(([k, v]) => [k, v[0] + ' ' + v[1]]), tab, 'passiveTab');
    const mine = s.passive.filter(u => D.passiveById[u.id].cat === tab);
    if (mine.length) {
      o += `<h3 class="heading">Мои объекты <span class="muted">${mine.length}</span></h3>` + mine.map(u => {
        const d = D.passiveById[u.id], r = I().unitIncome(s, u, T.season(s)), net = I().netOf(r.inc, r.up), mort = s.fin.mort.find(m => m.kind === 'passive' && m.ref === u.uid);
        return C.row({ icon: d.icon, title: d.name, desc: (u.vac ? '🔍 Ищем арендатора: ' + u.vac + ' дн.' : '✅ ' + (d.rent ? 'Сдаётся' : 'Работает') + ' · ' + (net >= 0 ? '+' : '') + M(net) + '/день') + (d.decay ? ' · трафик ' + Math.round((u.q || 1) * 100) + '%' : '') + (mort ? ' · ипотека ' + M(mort.left) : ''),
          meta: `<span class="m">Стоимость ${M(I().sellValue(s, u))} · заработал ${M(u.earned || 0)}</span>`, cls: u.vac ? 'warn' : 'good',
          btn: `<div class="col">${d.decay ? C.btn('Обновить', 'refreshAsset', u.uid, null, { cls: 'sm' }) : ''}${C.btn('Продать', 'sellAsset', u.uid, null, { cls: 'sm ghost' })}</div>` });
      }).join('');
    }
    o += `<h3 class="heading">Купить</h3>` + D.passive.filter(d => d.cat === tab).map(d => {
      const why = I().check(s, d.id), n = I().units(s, d.id).length, net = I().netOf(d.inc, d.up);
      const roi = net * 365 / d.price;
      const canM = d.cat === 'realty' && d.price >= 400000;
      return C.row({ icon: d.icon, title: d.name + (n ? ` · ${n}/${d.max}` : ''), desc: d.desc,
        meta: `<span class="c">${M(d.price)}</span><span>+${M(net)}/день</span><span class="m">≈${Math.round(roi * 100)}% годовых</span>`, why: why || (!Sys.econ.canPay(s, d.price) ? 'Нужно ' + M(d.price) + (canM ? ' или ипотека' : '') : ''),
        btn: `<div class="col">${C.btn('Купить', 'buyAsset', d.id, null, { cls: 'sm', why: why || (!Sys.econ.canPay(s, d.price) ? 'Нужно ' + M(d.price) : '') })}${canM ? C.btn('Ипотека', 'mortAsset', d.id, null, { cls: 'sm sec', why: why || I().mortQuote(s, d.price).why }) : ''}</div>` });
    }).join('');
    return o;
  };

  // ─────────── Магазин вещей
  V.shop = function (tab) {
    const s = S(); tab = tab || UI.tabs.shop;
    const disc = s.flags.discountDay === T.day(s);
    let o = C.head('🛍️ Магазин', 'Техника, транспорт, дом, хобби и роскошь' + (disc ? ' · сегодня скидка 25%' : ''), true);
    o += C.tabs(Object.entries(D.itemCats).map(([k, v]) => [k, v[0] + ' ' + v[1]]), tab, 'shopTab');
    if (tab === 'luxury') o += C.notice('💎 Коллекционные предметы меняют цену каждый день — их можно продать дороже, чем купили (или дешевле).', 'blue');
    o += Object.entries(D.items).filter(([, it]) => it.cat === tab).sort((a, b) => a[1].price - b[1].price).map(([id, it]) => {
      const has = s.items.includes(id), p = Sys.prop.itemPrice(s, id);
      const why = has ? '' : (it.needHome && s.housing === 'street' ? 'Нужно жильё' : !Sys.econ.canPay(s, p) ? 'Нужно ' + M(p) : '');
      const val = has && it.apr ? Sys.prop.itemValue(s, id) : 0;
      return C.row({ icon: it.icon, title: it.name, desc: it.desc, cls: has ? 'good' : '',
        meta: has ? (it.apr ? `<span>Сейчас стоит ${M(val / it.sell)}</span>` : `<span>Продать за ${M(Sys.prop.itemValue(s, id))}</span>`) : `<span class="c">${M(p)}</span>${it.upkeep ? `<span class="m">+${M(it.upkeep)}/нед.</span>` : ''}${it.look ? '<span class="m">👔 +' + it.look + '</span>' : ''}`,
        btn: has ? C.btn('Продать', 'sellItem', id, null, { cls: 'sm sec' }) : C.btn('Купить', 'buyItem', id, null, { cls: 'sm', why }) });
    }).join('');
    return o;
  };

  // ─────────── Таланты
  V.talents = function () {
    const s = S(), pts = Sys.perks.points(s);
    let o = C.head('🌟 Таланты', 'Очко таланта — за каждый уровень. Можно купить у коуча.', true);
    o += `<div class="card gold"><div class="row"><div class="grow">${C.hero2([[pts, 'Свободных очков'], [s.perks.length + '/' + D.perks.length, 'Изучено'], [Sys.quests.level(s), 'Уровень']])}</div></div><div class="btns">${C.btn('🎯 Коуч-сессия: +1 очко за ' + M(Sys.perks.pointPrice(s)), 'buyPoint', null, null, { cls: 'sm sec', why: Sys.econ.canPay(s, Sys.perks.pointPrice(s)) ? '' : 'Нужно ' + M(Sys.perks.pointPrice(s)) })}</div></div>`;
    o += `<div class="perk-grid">${D.perks.map(p => { const has = s.perks.includes(p.id); const why = has ? '' : pts < p.cost ? 'Нужно очков: ' + p.cost : '';
      return `<button class="perk ${has ? 'on' : ''}" ${C.attrs('perk', p.id)}${why ? ` aria-disabled="true" data-why="${e(why)}"` : ''}><span class="pi">${p.icon}</span><b>${p.name}</b><small>${p.desc}</small><span class="pc">${has ? '✓ Изучен' : '★'.repeat(p.cost)}</span></button>`; }).join('')}</div>`;
    return o;
  };
  /* Вкладка «Навыки» в карьере: прогресс + мастер-классы */
  V.skillsTab = function (s) {
    let o = C.notice('🎓 Онлайн-мастер-класс по любому навыку: 3 часа, быстрый рост. Цена растёт с уровнем навыка.', 'blue');
    o += Object.keys(D.skillNames).map(k => {
      const why = Sys.perks.mcCheck(s, k);
      return `<div class="card skill"><div class="row"><div class="thumb">${D.skillIcons[k]}</div><div class="grow"><div class="row" style="gap:6px"><span class="title">${D.skillNames[k]}</span><b style="margin-left:auto">${Math.floor(s.sk[k])}</b></div>${C.prog(s.sk[k], 100)}</div>${C.btn('+ ' + U.num(Sys.perks.mcCost(s, k)) + ' ₽', 'mc', k, null, { cls: 'sm', why, label: 'Мастер-класс' })}</div></div>`;
    }).join('');
    o += `<h3 class="heading">Бесплатные тренировки</h3>` + D.actions.filter(a => a.cat === 'skills').map(a => V.actCard(s, a)).join('');
    return o;
  };

  // ─────────── Рейтинг богачей
  V.rich = function () {
    const s = S(), list = I().richList(s), r = I().richRank(s);
    let o = C.head('🏅 Рейтинг состояний', 'Самые богатые жители города', true);
    o += `<div class="card gold">${C.hero2([['#' + r, 'Ваше место'], [U.num(Sys.fin.netWorth(s)), 'Капитал ₽'], [r > 1 ? U.num(list[r - 2].w - Sys.fin.netWorth(s)) : '👑', r > 1 ? 'До следующего ₽' : 'Вы первый']])}</div>`;
    o += `<div class="card">${list.slice(0, Math.max(11, r)).map((x, i) => `<div class="kv rich ${x.me ? 'me' : ''}"><span>${i + 1}. ${x.icon} ${e(x.name)}<small class="desc" style="display:block">${e(x.what)}</small></span><b>${x.w >= 1e9 ? (x.w / 1e9).toFixed(2).replace('.', ',') + ' млрд' : x.w >= 1e6 ? (x.w / 1e6).toFixed(1).replace('.', ',') + ' млн' : U.num(x.w)} ₽</b></div>`).join('')}</div>`;
    o += `<div class="card"><div class="title">Капитал за последние дни</div>${C.spark(s.nwHist.slice(-60), 320, 80, { col: 'var(--gold)' })}</div>`;
    return o;
  };

  // ─────────── Меню «Ещё»
  V.MENU = [['⏩', 'Автопилот', 'auto', 'Прожить день, неделю, месяц'], ['🏘️', 'Активы', 'passive', 'Пассивный доход'], ['💳', 'Финансы', 'fin', 'Банк, биржа, ипотека'], ['🏪', 'Бизнес', 'biz', 'Свои предприятия'],
    ['🏠', 'Жильё', 'housing', 'Аренда и покупка'], ['🛍️', 'Магазин', 'shop', 'Техника, транспорт, роскошь'], ['🌟', 'Таланты', 'talents', 'Особые умения'], ['🏅', 'Рейтинг', 'rich', 'Богатейшие жители'],
    ['🍜', 'Питание', 'cat:food', 'Еда и продукты'], ['❤️', 'Здоровье и быт', 'cat:health', 'Душ, лечение, сон'], ['🎮', 'Развлечения', 'cat:fun', 'Отдых, рыбалка'], ['🪪', 'Документы', 'cat:docs', 'Паспорт, ОМС, ИП'],
    ['🚌', 'Транспорт', 'transport', 'Как передвигаться'], ['🧍', 'Персонаж', 'hero', 'Внешность, одежда'], ['🎒', 'Инвентарь', 'inventory', 'Вещи и документы'], ['📋', 'Задания', 'quests', 'Сюжетные линии'],
    ['🏆', 'Достижения', 'ach', 'Награды'], ['📔', 'Журнал', 'journal', 'История жизни'], ['📊', 'Статистика', 'stats', 'Ваш путь'], ['🎲', 'Режимы игры', 'modes', 'Варианты прохождения'],
    ['⚙️', 'Настройки', 'settings', 'Сохранения, доступность'], ['❓', 'Как играть', 'help', 'Подсказки']];
})(typeof window !== 'undefined' ? window : globalThis);
