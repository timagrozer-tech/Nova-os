/* 0.4: задачи дня на главном, входящие, статус в шапке, цветовые темы, причёски и очки */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, C = UI.C, V = UI.views, A = UI.A;
  const e = U.esc, S = () => SN.state;

  D.accents = [['gold', 'Золото', '#f5b54a'], ['azure', 'Лазурь', '#4ea8ff'], ['emerald', 'Изумруд', '#3fcf8e'], ['ruby', 'Рубин', '#ff6b81'], ['violet', 'Аметист', '#a98bff']];

  // ─────────── Шапка: мини-показатели и почта
  const origTop = UI.top;
  UI.top = function () {
    origTop();
    const s = S(), st = s.st, n = Sys.daily.unread(s);
    const mini = (ic, v, c, inv) => `<span class="ms ${inv ? (v > 75 ? 'low' : '') : (v < 20 ? 'low' : '')}" title="${Math.round(v)}"><i>${ic}</i><b><u style="width:${U.clamp(v)}%;background:${c}"></u></b></span>`;
    const el = document.createElement('div');
    el.className = 'topstat';
    el.innerHTML = `<button class="ministats" data-a="nav" data-x="home" aria-label="Состояние">${mini('❤️', st.health, '#f27c7b')}${mini('🍗', st.food, '#ffb86a')}${mini('⚡', st.energy, '#b29aff')}${mini('😊', st.mood, '#8dda9f')}</button>
      <button class="mailbtn" data-a="go" data-x="inbox" aria-label="Сообщения: ${n} новых">✉️${n ? `<em>${n > 9 ? '9+' : n}</em>` : ''}</button>`;
    document.getElementById('top').appendChild(el);
  };
  const origRender = UI.render;
  UI.render = function () { const s = S(); document.documentElement.dataset.accent = (s && s.settings.accent) || 'gold'; origRender(); };

  // ─────────── Задачи дня
  V.tasksCard = function (s) {
    const tk = Sys.daily.ensure(s);
    const done = tk.list.filter(x => x.done).length;
    return `<div class="card tasks"><div class="row"><div class="grow"><div class="title">☑️ Задачи дня <span class="muted">${done}/${tk.list.length}</span></div><div class="desc">Награда: опыт и деньги. Все три — серия дней 🔥${tk.streak ? ' ' + tk.streak : ''} (каждые 7 дней — очко таланта)</div></div></div>
      ${tk.list.map(x => { const t = D.taskById[x.k], p = Sys.daily.progress(s, x); return `<div class="task ${x.done ? 'done' : ''}"><span class="tk-ic">${x.done ? '✅' : t.icon}</span><div class="grow"><div class="tk-t">${e(t.t(x.need))}</div>${C.prog(p, x.need)}</div><span class="tk-p">${x.need > 100 ? U.num(p) : p}/${x.need > 100 ? U.num(x.need) : x.need}</span></div>`; }).join('')}</div>`;
  };
  const origHome = V.home;
  V.home = function () {
    const s = S(), html = origHome();
    const i = html.indexOf('<div class="money-strip">');
    return i < 0 ? html : html.slice(0, i) + V.tasksCard(s) + html.slice(i);
  };

  // ─────────── Сообщения
  V.inbox = function () {
    const s = S();
    let o = C.head('✉️ Сообщения', 'Друзья, банк, бизнес и важные уведомления', true);
    if (Sys.daily.unread(s)) o += `<div class="btns">${C.btn('Прочитать все', 'mailAll', null, null, { cls: 'sec sm' })}</div>`;
    o += s.inbox.length ? s.inbox.map(m => `<div class="card mail ${m.read ? '' : 'new'}" ${C.attrs('mailRead', m.id)} role="button" tabindex="0"><div class="row"><div class="thumb">${m.icon}</div><div class="grow"><div class="title">${e(m.from)} <span class="muted">д.${m.d} ${m.h || ''}</span></div><div class="desc">${e(m.t)}</div></div>${m.npc && !m.replied ? C.btn('Ответить', 'mailReply', m.id, null, { cls: 'sm' }) : ''}</div></div>`).join('') : C.empty('Пока писем нет. С телефоном друзья будут писать вам.');
    s.inbox.forEach(m => m.read = true);
    return o;
  };
  Object.assign(A, {
    mailRead: id => { const m = S().inbox.find(x => x.id === +id); if (m) m.read = true; UI.after(); },
    mailAll: () => { S().inbox.forEach(m => m.read = true); UI.after(); },
    mailReply: id => { const r = Sys.daily.reply(S(), id); if (r.ok) SN.say(r.msg, 'good'); UI.after(); },
    accent: x => { S().settings.accent = x; UI.after(); },
    look2: (k, v) => { S().hero[k] = +v; UI.after(); }
  });
  V.MENU.unshift(['✉️', 'Сообщения', 'inbox', 'Друзья, банк, уведомления']);

  // ─────────── Настройки: цветовая тема
  const origSettings = V.settings;
  V.settings = function () {
    const s = S(), html = origSettings();
    const card = `<div class="card"><div class="title">🎨 Цвет оформления</div><div class="accents">${D.accents.map(([k, n, c]) => `<button class="acc ${s.settings.accent === k ? 'on' : ''}" ${C.attrs('accent', k)} style="--c:${c}"><i></i>${n}</button>`).join('')}</div></div>`;
    const m = '<div class="card gold"><div class="title">🔐';
    return html.includes(m) ? html.replace(m, card + m) : html + card;
  };
  // ─────────── Персонаж: причёска и очки
  const origHero = V.hero;
  V.hero = function () {
    const s = S(), html = origHero(), h = s.hero;
    const card = `<div class="card"><div class="title">💇 Причёска и аксессуары</div><div class="seg">${['Короткая', 'Длинная', 'Лысый', 'Ирокез'].map((n, i) => C.btn(n, 'look2', 'style', i, { cls: (h.style || 0) === i ? '' : 'sec' })).join('')}</div><div class="seg">${C.btn('Без очков', 'look2', 'glasses', 0, { cls: h.glasses ? 'sec' : '' })}${C.btn('👓 Очки', 'look2', 'glasses', 1, { cls: h.glasses ? '' : 'sec' })}</div></div>`;
    const m = '<div class="card gold">';
    const i = html.indexOf(m);
    return i < 0 ? html + card : html.slice(0, i) + card + html.slice(i);
  };
})(typeof window !== 'undefined' ? window : globalThis);
