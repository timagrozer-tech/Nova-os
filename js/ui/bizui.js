/* Бизнес 0.4: холдинг (все точки), карточка точки с вкладками, открытие с выбором района */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, C = UI.C, V = UI.views, A = UI.A, Sh = UI.sheet;
  const e = U.esc, M = U.money, S = () => SN.state, B = () => Sys.biz;
  UI.tabs = UI.tabs || {}; UI.tabs.bizd = UI.tabs.bizd || 'overview';
  const stars = n => '<span class="stars-r">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>';
  const sgn = x => (x >= 0 ? '+' : '−') + U.num(Math.abs(x));
  const col = x => x >= 0 ? 'var(--green)' : 'var(--red)';

  C.pbars = function (hist) {
    if (!hist.length) return C.empty('История появится после первого дня работы');
    const max = Math.max(1, ...hist.map(h => Math.abs(h.p)));
    return `<div class="pbars" role="img" aria-label="Прибыль по дням">${hist.map(h => `<div title="День ${h.d}: ${sgn(h.p)} ₽"><i class="${h.p >= 0 ? 'pos' : 'neg'}" style="height:${Math.max(2, Math.abs(h.p) / max * 50)}%"></i></div>`).join('')}</div>`;
  };
  V.bizStatus = function (s, b) {
    const d = D.bizById[b.id], f = B().forecast(s, b), t = [];
    if (b.paused) t.push(['⏸ Пауза', '']);
    else if (f.cap === 0) t.push(['Нет персонала', 'bad']);
    else if (d.goods && b.stock < f.demand * 0.6 && !b.autoStock) t.push(['Мало товара', 'bad']);
    else if (f.demand > f.cap * 1.2) t.push(['Очереди', 'bad']);
    if (b.team.some(x => x.mor < 30)) t.push(['Команда недовольна', 'bad']);
    if (b.manager) t.push(['🧑‍💼 Управляющий', 'blue']);
    if (b.camp && b.camp.until >= T.day(s)) t.push([D.bizCampById[b.camp.id].icon + ' Реклама', 'gold']);
    if (b.debt) t.push(['Долг ' + U.num(b.debt), 'bad']);
    if (!t.length) t.push(['Работает', 'good']);
    return t.map(([x, c]) => C.tag(x, c)).join('');
  };

  // ─────────── Холдинг
  V.biz = function () {
    const s = S();
    let o = C.head('🏪 Бизнес', 'Ваши точки, команды и прибыль', true);
    if (!s.docs.ip) o += C.notice('Для бизнеса нужно ИП: паспорт → регистрация в Деловом районе (800 ₽, 3 дня).' + (s.docs.passport ? '' : ' Сначала восстановите паспорт.'));
    if (s.biz.length) {
      const y = s.biz.reduce((a, b) => a + (b.last ? b.last.profit : 0), 0);
      const w = s.biz.reduce((a, b) => a + b.hist.slice(-7).reduce((x, h) => x + h.p, 0), 0);
      const tot = s.biz.reduce((a, b) => a + B().forecast(s, b).profit, 0);
      o += `<div class="card gold holding">${C.hero2([[s.biz.length, 'Точек'], [`<span style="color:${col(y)}">${sgn(y)}</span>`, '₽ вчера'], [`<span style="color:${col(w)}">${sgn(w)}</span>`, '₽ за 7 дней']])}<div class="desc" style="margin-top:6px">Прогноз на сегодня: <b style="color:${col(tot)}">${sgn(tot)} ₽</b> · всего заработано ${M(s.biz.reduce((a, b) => a + b.total, 0))}</div></div>`;
      o += s.biz.map(b => {
        const d = D.bizById[b.id], f = B().forecast(s, b);
        return `<button class="bizcard" ${C.attrs('go', 'bizd:' + b.uid)}><div class="bc-ico">${d.icon}<b>${b.lvl}</b></div><div class="grow"><div class="title">${e(B().title(b))}</div><div class="desc">${stars(B().stars(b))} · 👥 ${b.team.length}/${B().staffMax(b, d)} · ${f.cust} клиентов</div><div class="tags">${V.bizStatus(s, b)}</div></div><div class="bc-p"><b style="color:${col(b.last ? b.last.profit : 0)}">${b.last ? sgn(b.last.profit) : '—'}</b><span>вчера</span></div></button>`;
      }).join('');
    }
    o += `<h3 class="heading">Открыть дело <span class="muted">до ${D.BIZ_MAX_BRANCH} точек каждого типа</span></h3>`;
    o += D.business.slice().sort((a, b) => a.price - b.price).map(d => {
      const n = B().branches(s, d.id).length, why = B().openCheck(s, d.id), price = B().price(s, d.id);
      return C.row({ icon: d.icon, title: d.name + (n ? ` · у вас ${n}` : ''), desc: d.desc, meta: `<span class="c">${M(price)}</span><span class="m">аренда от ${M(d.rent)}/день · штат ${d.staffMax}+</span>${d.goods ? '<span class="m">📦 склад</span>' : ''}`, why, btn: C.btn(n ? 'Филиал' : 'Открыть', 'bizOpen', d.id, null, { cls: 'sm', why }) });
    }).join('');
    return o;
  };

  // ─────────── Карточка точки
  V.bizd = function (uid) {
    const s = S(), b = B().byUid(s, uid);
    if (!b) return C.head('Бизнес', '', true) + C.empty('Эта точка больше вам не принадлежит.') + C.btn('К бизнесам', 'go', 'biz', null, { cls: 'wide' });
    const d = D.bizById[b.id], f = B().forecast(s, b), tab = UI.tabs.bizd;
    let o = `<div class="bizhero"><button class="back bh-back" data-a="back" aria-label="Назад">←</button><div class="bh-ico">${d.icon}</div><div class="grow"><div class="bh-name">${e(B().title(b))}</div><div class="bh-sub">${stars(B().stars(b))} <span>Уровень ${b.lvl}/${D.BIZ_MAX_LVL} · день ${b.days}</span></div><div class="tags">${V.bizStatus(s, b)}</div></div></div>`;
    o += `<div class="card">${C.hero2([[f.cust + '<small>/' + f.demand + '</small>', 'Клиентов / спрос'], [f.cap, 'Мощность'], [`<span style="color:${col(f.profit)}">${sgn(f.profit)}</span>`, 'Прогноз ₽']])}${C.prog(Math.min(f.demand, f.cap), Math.max(f.demand, f.cap, 1))}</div>`;
    const tabs = [['overview', 'Обзор'], ['team', 'Команда'], ['stock', d.goods ? 'Склад' : 'Качество'], ['market', 'Маркетинг'], ['up', 'Улучшения']];
    o += C.tabs(tabs, tab, 'bizTab');
    const U2 = b.uid;
    if (tab === 'overview') {
      const l = b.last;
      o += `<div class="card"><div class="title">Прибыль за ${b.hist.length} дн.: <span style="color:${col(b.hist.reduce((a, h) => a + h.p, 0))}">${sgn(b.hist.reduce((a, h) => a + h.p, 0))} ₽</span></div>${C.pbars(b.hist)}</div>`;
      if (l) o += `<div class="card"><div class="title">Вчера</div>${C.kv('👥 Клиентов', l.cust + (l.lostQueue ? ` · ушли из очереди ${l.lostQueue}` : '') + (l.lostStock ? ` · не хватило товара ${l.lostStock}` : ''))}${C.kv('💰 Выручка', M(l.rev))}${C.kv(d.goods ? '📦 Закупки' : '🧴 Расходники', '−' + M(l.cogs))}${C.kv('👔 Зарплаты', '−' + M(l.wages))}${C.kv('🏢 Аренда', '−' + M(l.rent))}${C.kv('🧾 Налог 6%', '−' + M(l.tax))}${C.kv('<b>Итого</b>', `<span style="color:${col(l.profit)}">${sgn(l.profit)} ₽</span>`)}</div>`;
      if (b.reviews.length) o += `<h3 class="heading">Отзывы клиентов</h3><div class="card">${b.reviews.slice(0, 5).map(r => `<div class="kv review"><span>${stars(r.st)}<small class="desc" style="display:block">«${e(r.t)}»</small></span><b class="muted">д.${r.d}</b></div>`).join('')}</div>`;
      o += `<div class="btns">${C.btn('🧑‍🍳 Поработать сам (8 ч)', 'bizWork', U2, null, { why: b.owner ? 'Уже отработали сегодня' : b.paused ? 'Точка на паузе' : '' })}${C.btn(b.paused ? '▶ Возобновить' : '⏸ Пауза', 'bizSet', U2, 'paused:' + (b.paused ? 0 : 1), { cls: 'sec' })}</div>`;
      o += `<div class="card"><div class="row"><div class="grow"><div class="title">📐 Расширение площади</div><div class="desc">Уровень ${b.lvl}: спрос и мощность +35%, +1 место в штате, аренда +30%.</div></div>${C.btn(b.lvl >= D.BIZ_MAX_LVL ? 'Максимум' : M(B().upgradeCost(b, d, s)), 'bizUp', U2, null, { cls: 'sm', why: b.lvl >= D.BIZ_MAX_LVL ? 'Максимальный уровень' : '' })}</div></div>`;
      o += `<div class="btns">${C.btn('Продать за ' + M(B().sellValue(s, b)), 'bizSell', U2, null, { cls: 'ghost' })}</div>`;
    } else if (tab === 'team') {
      const mx = B().staffMax(b, d);
      o += `<div class="card ${b.manager ? 'good' : ''}"><label class="switch"><span><span class="title">🧑‍💼 Управляющий</span><span class="desc" style="display:block">Сам нанимает и увольняет, закупает товар, подстраивает цены, выдаёт премии. ${M(B().managerWage(d))}/день.</span></span><input type="checkbox" ${b.manager ? 'checked' : ''} data-bizset="${U2}:manager"></label></div>`;
      o += `<h3 class="heading">Команда <span class="muted">${b.team.length}/${mx} · ставка от ${M(d.wage * 0.85)}</span></h3>`;
      o += b.team.length ? b.team.map(x => {
        const tr = D.employeeTraits.find(t => t.id === x.tr);
        return `<div class="card emp"><div class="row"><div class="avatar-mini">${x.n[0]}</div><div class="grow"><div class="title">${e(x.n)} <span class="stars-r small">${'★'.repeat(x.sk)}<i>${'★'.repeat(5 - x.sk)}</i></span></div><div class="desc">${M(x.wage)}/день · ${x.days} дн. в команде${tr && tr.name ? ' · ' + tr.name + ' (' + tr.desc + ')' : ''}</div><div class="mor"><span>Мораль ${Math.round(x.mor)}</span><div class="track"><i style="width:${x.mor}%;background:${x.mor < 30 ? 'var(--red)' : x.mor < 60 ? 'var(--orange)' : 'var(--green)'}"></i></div></div></div></div>
          <div class="btns">${C.btn('📚 Обучить ' + M(x.wage * 6), 'bizTrain', U2, x.n, { cls: 'sm', why: x.sk >= 5 ? 'Уже мастер' : '' })}${C.btn('🎁 Премия ' + M(x.wage * 2), 'bizBonus', U2, x.n, { cls: 'sm sec' })}${C.btn('Уволить', 'bizFire', U2, x.n, { cls: 'sm ghost' })}</div></div>`;
      }).join('') : C.empty(d.staffMax > 1 ? 'Никого нет — точка не работает без людей (или выходите на смену сами).' : 'В этой точке работаете вы сами или один продавец.');
      o += `<h3 class="heading">Кандидаты <span class="muted">обновляются каждый день</span></h3>`;
      o += B().candidates(s, b).map((x, i) => { const tr = D.employeeTraits.find(t => t.id === x.tr); return C.row({ icon: '<span class="avatar-mini">' + x.n[0] + '</span>', title: e(x.n) + ` <span class="stars-r small">${'★'.repeat(x.sk)}<i>${'★'.repeat(5 - x.sk)}</i></span>`, desc: M(x.wage) + '/день' + (tr && tr.name ? ' · ' + tr.name + ': ' + tr.desc : ''), btn: C.btn('Нанять', 'bizHire', U2, i, { cls: 'sm', why: b.team.length >= mx ? 'Штат заполнен' : '' }) }); }).join('');
    } else if (tab === 'stock') {
      o += `<div class="card"><div class="title">Качество</div><div class="desc">Эконом дешевле, но клиенты недовольны. Премиум — дороже закупка, выше чек и репутация.</div><div class="seg">${D.bizQuality.map((q, i) => C.btn(q.name, 'bizSet', U2, 'quality:' + i, { cls: b.quality === i ? '' : 'sec' })).join('')}</div></div>`;
      if (d.goods) {
        const days = f.cust ? b.stock / Math.max(1, Math.min(f.demand, f.cap)) : 0;
        o += `<div class="card">${C.hero2([[U.num(b.stock), 'Единиц на складе'], [f.cust ? days.toFixed(1).replace('.', ',') : '—', 'Дней хватит'], [M(B().unitCost(s, b)), 'Цена единицы']])}<div class="desc" style="margin-top:6px">Порча: ${Math.round(d.perish * (B().has(b, 'fridge') ? 0.3 : 1) * 100)}% в день${d.perish && !B().has(b, 'fridge') ? ' · холодильный склад снизит потери' : ''}</div>
          <div class="seg3">${[1, 3, 7].map(n => C.btn('+' + n + ' ' + U.plural(n, 'день', 'дня', 'дней'), 'bizStock', U2, n, { cls: 'sec' })).join('')}</div></div>`;
        o += `<div class="card"><label class="switch"><span><span class="title">🔄 Автозакупка каждую ночь</span><span class="desc" style="display:block">Поставщик привозит товар под прогноз спроса. Удобно, но на 5% дороже.</span></span><input type="checkbox" ${b.autoStock ? 'checked' : ''} data-bizset="${U2}:autoStock"></label></div>`;
      } else o += C.notice('Эта точка оказывает услуги: склад не нужен, расходники списываются автоматически.', 'blue');
    } else if (tab === 'market') {
      const bp = B().bestPrice(s, b);
      o += `<div class="card"><div class="row"><div class="grow"><div class="title">💲 Цены: ${Math.round(b.price * 100)}% от рыночных</div><div class="desc">Ниже цена — больше клиентов и лояльность. Выше — больше денег с клиента, но меньше спрос.</div></div></div>
        <input type="range" class="range" min="70" max="150" step="5" value="${Math.round(b.price * 100)}" data-bizprice="${U2}" aria-label="Цена"><div class="score-scale"><span>70%</span><span>100%</span><span>150%</span></div>
        <div class="btns">${f.cap > 0 ? C.btn('🎯 Оптимальная по прогнозу: ' + Math.round(bp * 100) + '%', 'bizSet', U2, 'price:' + bp, { cls: 'sm sec' }) : '<span class="desc">Подсказка по цене появится, когда в точке будут работники.</span>'}</div></div>`;
      const cmp = B().comp(s, b.id, b.district);
      o += `<div class="card">${C.kv('🏁 Конкуренты в районе', cmp ? cmp + ' (спрос −' + cmp * 10 + '%)' : 'нет')}${C.kv('📍 Район', D.districts[b.district].name + ' · спрос ×' + B().distMult(b, d, 'demand').toFixed(2).replace('.', ','))}</div>`;
      o += `<h3 class="heading">Рекламные кампании</h3>` + (b.camp && b.camp.until >= T.day(s) ? C.notice(D.bizCampById[b.camp.id].icon + ' Идёт «' + D.bizCampById[b.camp.id].name + '» до ' + b.camp.until + '-го дня', 'blue') : '');
      o += D.bizCamps.map(c => { const busy = b.camp && b.camp.until >= T.day(s); return C.row({ icon: c.icon, title: c.name, desc: 'Спрос +' + Math.round((c.mult - 1) * 100) + '% на ' + c.days + ' дн.' + (c.rep ? ' · репутация +' + c.rep : ''), meta: `<span class="c">${M(d.ads * c.k)}</span>`, btn: C.btn('Запустить', 'bizCamp', U2, c.id, { cls: 'sm', why: busy ? 'Уже идёт кампания' : '' }) }); }).join('');
    } else if (tab === 'up') {
      o += D.bizUpgrades.filter(u => (!u.food || d.food) && (!u.goods || d.goods)).map(u => { const has = B().has(b, u.id); return C.row({ icon: u.icon, title: u.name, desc: u.desc, cls: has ? 'good' : '', meta: has ? '<span>Установлено</span>' : `<span class="c">${M(B().upCost(b, d, u.id))}</span>`, btn: has ? C.tag('✓', 'good') : C.btn('Купить', 'bizUpBuy', U2, u.id, { cls: 'sm' }) }); }).join('');
    }
    return o;
  };

  // ─────────── Открытие с выбором района
  Sh.bizOpen = function (id) {
    const s = S(), d = D.bizById[id];
    const list = Object.keys(D.bizDistrict).map(k => {
      const taken = B().branches(s, id).some(b => b.district === k), cmp = B().comp(s, id, k);
      const dm = D.bizDistrict[k].demand / D.bizDistrict[d.district].demand, rm = D.bizDistrict[k].rent / D.bizDistrict[d.district].rent;
      const why = taken ? 'Здесь уже есть ваша точка' : '';
      return `<button class="choice ${k === d.district ? 'on' : ''}" data-a="bizOpenIn" data-x="${id}" data-y="${k}" ${why ? `aria-disabled="true" data-why="${why}"` : ''}>${D.districts[k].icon} ${D.districts[k].name}${k === d.district ? ' · лучший профиль' : ''}<small class="ok">Спрос ×${dm.toFixed(2).replace('.', ',')} · аренда ${M(d.rent * rm)}/день · конкурентов ${cmp}${why ? ' · ' + why : ''}</small></button>`;
    }).join('');
    Sh.open(`<h3>${d.icon} ${e(d.name)}</h3><p>Вложение <b>${M(B().price(s, id))}</b>. Налог 6% с выручки${d.goods ? ', стартовый товар — в подарок' : ''}. Выберите район:</p>${list}<div class="btns"><button class="btn sec" data-a="sheetClose">Отмена</button></div>`);
  };
  const res = r => { UI.after(); return r; };
  const ok = r => { if (r && r.ok && r.msg) SN.say(r.msg, 'good'); return res(r); };
  Object.assign(A, {
    bizOpen: id => Sh.bizOpen(id),
    bizOpenIn: (id, k) => { Sh.close(true); const r = B().open(S(), id, k); if (r.ok) { UI.tabs.bizd = 'overview'; UI.save(); UI.go('bizd:' + r.uid); setTimeout(UI.pump, 60); UI.FX && UI.FX.burst(); } },
    bizTab: x => { UI.tabs.bizd = x; UI.render(); },
    bizSet: (uid, y) => { const [k, v] = String(y).split(':'); B().set(S(), +uid, k, +v); UI.after(); },
    bizHire: (uid, i) => res(B().hire(S(), +uid, +i)),
    bizFire: (uid, n) => Sh.confirm('Уволить ' + e(n) + '?', 'Выходное пособие — 2 дневные ставки. Мораль остальных −5.', () => ok(B().fire(S(), +uid, n)), 'Уволить'),
    bizTrain: (uid, n) => ok(B().train(S(), +uid, n)),
    bizBonus: (uid, n) => ok(B().bonus(S(), +uid, n)),
    bizStock: (uid, n) => ok(B().buyStock(S(), +uid, +n)),
    bizCamp: (uid, c) => ok(B().campaign(S(), +uid, c)),
    bizUpBuy: (uid, u) => ok(B().buyUp(S(), +uid, u)),
    bizUp: uid => res(B().upgrade(S(), +uid)),
    bizWork: uid => res(B().work(S(), +uid)),
    bizSell: uid => { const b = B().byUid(S(), +uid); if (!b) return; Sh.confirm('Продать «' + e(B().title(b)) + '»?', 'Вы получите ' + M(B().sellValue(S(), b)) + '. Команда и улучшения перейдут новому владельцу.', () => { ok(B().sell(S(), +uid)); UI.go('biz'); }, 'Продать'); }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.bizprice) { B().set(S(), +t.dataset.bizprice, 'price', +t.value / 100); UI.after(); }
    if (t.dataset.bizset) { const [uid, k] = t.dataset.bizset.split(':'); B().set(S(), +uid, k, t.checked ? 1 : 0); UI.after(); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
