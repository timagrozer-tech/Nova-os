/* UI-компоненты: строки HTML. Все динамические строки экранируются. Действия — через data-a (делегирование кликов). */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const UI = SN.UI = SN.UI || {};
  const C = UI.C = {};
  const e = U.esc;

  C.attrs = (a, x, y) => `data-a="${e(a)}"` + (x != null ? ` data-x="${e(x)}"` : '') + (y != null ? ` data-y="${e(y)}"` : '');
  /* Кнопка. why — причина недоступности: кнопка остаётся нажимаемой и объясняет, почему нельзя */
  C.btn = (label, a, x, y, o) => {
    o = o || {};
    const dis = o.why ? ` aria-disabled="true" data-why="${e(o.why)}"` : '';
    return `<button class="btn ${o.cls || ''}" ${C.attrs(a, x, y)}${dis}${o.label ? ` aria-label="${e(o.label)}"` : ''}>${label}</button>`;
  };
  C.head = (title, sub, back) => `<div class="section-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${back ? `<button class="back" data-a="back">← Назад</button>` : ''}</div>`;
  C.tabs = (list, cur, a) => `<div class="tabs" role="tablist">${list.map(([id, name]) => `<button role="tab" aria-selected="${cur === id}" class="tab ${cur === id ? 'on' : ''}" ${C.attrs(a, id)}>${name}</button>`).join('')}</div>`;
  C.meter = (label, icon, v, col, inverse, info) => {
    const low = !info && (inverse ? v > 75 : v < 20);
    return `<div class="meter ${low ? 'low' : ''}" aria-label="${label}: ${Math.round(v)}"><div class="mr"><span aria-hidden="true" class="mi">${icon}</span><b data-count="m_${label}">${Math.round(v)}</b></div><div class="ml">${label}</div><div class="track"><i data-k="m_${label}" style="width:${U.clamp(v)}%;background:${col}"></i></div></div>`;
  };
  C.prog = (v, max) => `<div class="prog"><i style="width:${U.clamp(v / max * 100)}%"></i></div>`;
  C.tag = (t, cls) => `<span class="tag ${cls || ''}">${t}</span>`;
  /* Карточка-строка */
  C.row = o => `<div class="card ${o.cls || ''}" ${o.a ? C.attrs(o.a, o.x, o.y) + ' role="button" tabindex="0"' : ''}><div class="row"><div class="thumb">${o.icon}</div><div class="grow"><div class="title">${o.title}</div>${o.desc ? `<div class="desc">${o.desc}</div>` : ''}${o.meta ? `<div class="meta">${o.meta}</div>` : ''}${o.why ? `<div class="why">${e(o.why)}</div>` : ''}${o.extra || ''}</div>${o.btn || ''}</div>${o.below || ''}</div>`;
  C.kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
  C.notice = (t, cls) => `<div class="notice ${cls || ''}">${t}</div>`;
  C.empty = t => `<div class="list-empty">${t}</div>`;
  /* Где выполняется действие и сколько ехать */
  C.where = (s, where) => {
    const dest = Sys.city.needTravel(s, where);
    if (where === 'any') return '<span class="m">📍 где угодно</span>';
    if (where === 'home') return dest ? '<span class="m">🏠 дома · дорога ' + D.transport[Sys.city.pickMode(s)].mins + ' мин</span>' : '<span class="m">🏠 дома</span>';
    const id = Array.isArray(where) ? (where.includes(s.district) ? s.district : where[0]) : where;
    if (!dest) return `<span class="m">📍 ${D.districts[id].name} — вы здесь</span>`;
    const t = D.transport[Sys.city.pickMode(s)];
    return `<span class="m">📍 ${D.districts[id].name} · ${t.icon} ${t.mins} мин${t.cost ? ', ' + t.cost + ' ₽' : ''}</span>`;
  };
  C.money = x => U.money(x);
  /* Мини-график доходов/расходов */
  C.bars = days => {
    const d = days.slice(0, 14).reverse();
    if (!d.length) return C.empty('История появится после первого дня');
    const max = Math.max(1, ...d.map(x => Math.max(x.inc, x.exp)));
    return `<div class="bars" role="img" aria-label="Доходы и расходы за ${d.length} дней">${d.map(x => `<div title="День ${x.d}: +${x.inc} / −${x.exp}"><i style="height:${x.inc / max * 100}%;background:var(--green)"></i><i style="height:${x.exp / max * 100}%;background:var(--red);opacity:.75"></i></div>`).join('')}</div><div class="tags">${C.tag('■ доход', 'good')}${C.tag('■ расход', 'bad')}</div>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
