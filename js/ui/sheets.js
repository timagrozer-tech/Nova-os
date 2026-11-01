/* Нижние шторки: события, итоги дня, диалоги, собеседование, сон, суммы, рыбалка, подтверждения */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, C = UI.C;
  const e = U.esc, M = U.money;
  const Sh = UI.sheet = { el: null, queue: [] };
  const S = () => SN.state;

  Sh.isOpen = () => !!Sh.el;
  Sh.open = function (html, o) {
    Sh.close(true);
    o = o || {};
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    w.addEventListener('click', ev => { if (ev.target === w && o.closable !== false) Sh.close(); });
    document.body.appendChild(w);
    Sh.el = w; Sh.onClose = o.onClose;
    const f = w.querySelector('[data-focus]') || w.querySelector('button'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  };
  Sh.body = () => Sh.el && Sh.el.querySelector('.sheet');
  Sh.close = function (silent) {
    if (!Sh.el) return;
    Sh.el.remove(); Sh.el = null;
    const cb = Sh.onClose; Sh.onClose = null;
    if (cb) cb();
    if (!silent) setTimeout(UI.pump, 60);
  };
  Sh.push = fn => { Sh.queue.push(fn); };
  /* Показать следующее из очереди: инфо → итоги дня → события с выбором */
  UI.pump = function () {
    if (Sh.isOpen()) return;
    if (Sh.queue.length) { Sh.queue.shift()(); return; }
    if (S().pending.length) Sh.event();
  };

  Sh.info = function (o) {
    Sh.open(`${o.icon ? `<div class="big-ico">${o.icon}</div>` : ''}<h3 style="justify-content:center">${e(o.title)}</h3><p style="text-align:center">${e(o.text)}</p><button class="btn wide" data-a="sheetClose" data-focus>Понятно</button>`);
  };
  Sh.confirm = function (title, text, yes, label) {
    UI.onConfirm = yes;
    Sh.open(`<h3>${e(title)}</h3><p>${text}</p><div class="btns"><button class="btn sec" data-a="sheetClose">Отмена</button><button class="btn" data-a="confirmYes" data-focus>${e(label || 'Подтвердить')}</button></div>`);
  };

  /* Итоги дня (можно несколько дней подряд после долгого сна/болезни) */
  Sh.days = function (reports) {
    const r = reports[reports.length - 1];
    const bizSum = r.biz.reduce((a, b) => a + b.profit, 0);
    const lines = reports.flatMap(x => x.lines);
    Sh.open(`<h3>🌙 Итоги дня ${r.day}</h3>
      <div class="card gold"><div class="stat3"><div><strong style="color:var(--green)">+${U.num(r.inc)}</strong><span>Доход</span></div><div><strong style="color:var(--red)">−${U.num(r.exp)}</strong><span>Расход</span></div><div><strong>${U.num(S().money + S().bank)}</strong><span>Сейчас ₽</span></div></div></div>
      ${r.biz.length ? `<div class="card"><div class="title">Бизнес: ${bizSum >= 0 ? '+' : ''}${M(bizSum)}</div>${r.biz.map(b => C.kv(b.icon + ' ' + b.name + (b.closed ? ' (простой)' : ''), `<span style="color:${b.profit >= 0 ? 'var(--green)' : 'var(--red)'}">${b.profit >= 0 ? '+' : ''}${U.num(b.profit)} ₽</span>`) + `<div class="desc">${b.cust} клиентов · выручка ${M(b.rev)} · расходы ${M(b.rev - b.profit)} (налог ${M(b.tax)})</div>`).join('')}</div>` : ''}
      ${lines.length ? `<div class="card">${lines.map(l => `<div class="kv" style="display:block;font-size:12.5px">${e(l)}</div>`).join('')}</div>` : ''}
      <p class="desc">Новый день: ${T.dateLabel(S())}, ${D.weatherKinds[S().weather.kind].icon} ${S().weather.temp}°</p>
      <button class="btn wide" data-a="sheetClose" data-focus>Дальше</button>`);
  };

  Sh.event = function () {
    const ev = Sys.events.current(S()); if (!ev) return;
    const s = S();
    const ch = (ev.choices || [{ t: 'Хорошо' }]).map((c, i) => { const l = Sys.events.lock(s, c); return `<button class="choice" data-a="evChoose" data-x="${i}" ${l ? `aria-disabled="true" data-why="${e(l)}"` : ''}>${e(c.t)}${l ? `<small>${e(l)}</small>` : ''}</button>`; }).join('');
    Sh.open(`<div class="big-ico">${ev.icon}</div><h3 style="justify-content:center">${e(ev.title)}</h3><p>${e(Sys.events.text(s, ev))}</p>${ch}`, { closable: false });
  };
  Sh.eventResult = function (text) { Sh.open(`<p>${e(text)}</p><button class="btn wide" data-a="sheetClose" data-focus>Дальше</button>`); };

  // ── Диалог с NPC
  Sh.dialog = function (id, greet) {
    const n = D.npcById[id], st = Sys.social.get(S(), id);
    Sh.dlg = { id, log: [{ who: 'npc', t: greet }] };
    Sh.renderDialog(st, n);
  };
  Sh.renderDialog = function () {
    const id = Sh.dlg.id, n = D.npcById[id], st = Sys.social.get(S(), id);
    const chs = Sys.social.choices(S(), id);
    const html = `<div class="npc-head"><div class="thumb">${n.icon}</div><div class="grow"><h3 style="margin:0">${n.name}</h3><div class="desc">${n.role} · ${Sys.social.relLabel(st.rel)} (${Math.round(st.rel)})</div>${C.prog(st.rel, 100)}</div></div>
      <div id="dlgLog">${Sh.dlg.log.slice(-6).map(m => `<div class="bubble ${m.who === 'me' ? 'me' : ''}">${e(m.t)}</div>`).join('')}</div>
      ${chs.map(c => `<button class="choice" data-a="dlg" data-x="${c.i}" ${c.lock ? `aria-disabled="true" data-why="${e(c.lock)}"` : ''}>${e(c.t)}${c.lock ? `<small>${e(c.lock)}</small>` : ''}</button>`).join('')}
      <div class="btns"><button class="btn sec" data-a="sheetClose">Попрощаться</button><button class="btn ghost" data-a="npcFromDlg" data-x="${id}">Карточка</button></div>`;
    if (Sh.isOpen() && Sh.body()) { Sh.body().innerHTML = '<div class="grab"></div>' + html; const lg = Sh.body().querySelector('#dlgLog'); if (lg) lg.lastElementChild && lg.lastElementChild.scrollIntoView({ block: 'nearest' }); }
    else Sh.open(html);
  };
  Sh.dialogChoose = function (i) {
    const id = Sh.dlg.id, def = D.npcById[id].choices[i];
    Sh.dlg.log.push({ who: 'me', t: def.t });
    const r = Sys.social.choose(S(), id, i);
    Sh.dlg.log.push({ who: 'npc', t: r.text });
    UI.after(true);
    Sh.renderDialog();
  };

  // ── Собеседование
  Sh.Q = [
    ['Почему вы хотите работать именно у нас?', [['Хочу стабильности и расти в профессии', 1], ['Честно — нужны деньги, но работать буду на совесть', 0.7], ['Да мне всё равно, где работать', 0]]],
    ['В резюме большой перерыв. Что случилось?', [['Были трудности, сейчас восстанавливаю документы и навыки', 1], ['Долгая история, не хочу об этом', 0.3], ['Работал без оформления, ничего особенного', 0.5]]],
    ['Что будете делать, если не справляетесь с задачей?', [['Спрошу совета у старших и разберусь', 1], ['Буду молча стараться до последнего', 0.5], ['Наверное, уйду', 0]]],
    ['Как относитесь к переработкам?', [['Нормально, если это оговорено и оплачивается', 1], ['Готов работать хоть круглосуточно!', 0.4], ['Ни минуты сверх графика', 0.3]]],
    ['Назовите свою сильную сторону', [['Пунктуальность: ни разу не опоздал на подработку', 1], ['Я лучший во всём', 0.2], ['Не знаю даже', 0]]],
    ['Конфликт с коллегой. Ваши действия?', [['Спокойно поговорю с ним наедине', 1], ['Пожалуюсь начальнику', 0.5], ['Разберёмся по-мужски', 0]]]
  ];
  Sh.interview = function (jobId) {
    const j = D.jobById[jobId], s = S();
    const why = Sys.work.applyCheck(s, j); if (why) return SN.fail(why);
    const qs = Sh.Q.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    Sh.iv = { jobId, qs, ans: [] };
    Sh.renderInterview();
  };
  Sh.renderInterview = function () {
    const iv = Sh.iv, j = D.jobById[iv.jobId], s = S(), k = iv.ans.length;
    let html = `<h3>${j.icon} Собеседование</h3><div class="desc">${j.name} · ${D.districts[j.district].name}. Вид: ${Sys.stats.look(s)}/4, общение ${Math.floor(s.sk.social)}, репутация ${Math.round(s.rep)}</div>`;
    if (k < iv.qs.length) {
      const q = iv.qs[k];
      html += `<div class="bubble">«${q[0]}»</div>` + q[1].slice().sort(() => Math.random() - 0.5).map(a => `<button class="choice" data-a="ivAns" data-x="${a[1]}">${e(a[0])}</button>`).join('');
    } else {
      const score = iv.ans.reduce((a, b) => a + b, 0);
      const p = Sys.work.interviewChance(s, j, score);
      html += `<p>Ответы ${score >= 1.6 ? 'произвели хорошее впечатление' : score >= 1 ? 'нормальные' : 'вызвали сомнения'}. Шанс получить место: <b>${Math.round(p * 100)}%</b>. Собеседование займёт 1 час${s.district !== j.district ? ' + дорога' : ''}.</p>
        <div class="btns"><button class="btn sec" data-a="sheetClose">Не сейчас</button><button class="btn" data-a="ivGo" data-focus>Пройти</button></div>`;
    }
    Sh.open(html);
  };

  // ── Сон
  Sh.sleep = function () {
    const s = S(), opts = Sys.stats.sleepOptions(s);
    const h = T.hourF(s);
    let html = `<h3>🛏️ Где отдохнуть?</h3><p class="desc">Сейчас ${T.clock(s)}. Ночной сон — до 7:00 утра, днём — 8 часов. Энергия ${Math.round(s.st.energy)}.</p>`;
    html += opts.map(o => {
      const why = o.open === false ? o.note : (o.cost && !Sys.econ.canPay(s, o.cost) ? 'Нужно ' + M(o.cost) : '');
      return `<button class="choice" data-a="sleep" data-x="${o.id}" ${why ? `aria-disabled="true" data-why="${e(why)}"` : ''}>${o.icon} ${e(o.name)} — сон ×${String(o.q.toFixed(2)).replace('.', ',')}${o.cost ? ', ' + M(o.cost) : ''}${o.warm ? ', тепло' : ', холодно'}${o.district && o.district !== s.district ? ', ехать: ' + D.districts[o.district].name : ''}${o.id === 'street' && s.money > 600 ? '<small>Риск кражи наличных</small>' : ''}${why ? `<small>${e(why)}</small>` : ''}</button>`;
    }).join('');
    html += `<button class="choice" data-a="act" data-x="nap">😴 Вздремнуть 2 часа (энергия +18)</button><div class="btns"><button class="btn sec" data-a="sheetClose">Отмена</button></div>`;
    Sh.open(html);
  };

  // ── Суммы для финансов
  Sh.AM = {
    toBank: ['Внести на счёт', s => s.money], toCash: ['Снять наличные', s => s.bank], depPut: ['Пополнить вклад', s => s.bank], depTake: ['Снять со вклада', s => Math.floor(s.fin.deposit)],
    loan: ['Взять кредит', s => Sys.fin.loanLimit(s)], repay: ['Погасить кредит', s => Math.min(Math.ceil(s.fin.loan), Sys.econ.available(s))]
  };
  Sh.amount = function (kind) {
    const s = S();
    const fund = kind.startsWith('fund:') ? kind.slice(5) : null;
    const [title, maxf] = fund ? ['Купить: ' + Sys.fin.FUNDS[fund].name, x => x.bank] : Sh.AM[kind];
    const max = Math.max(0, Math.floor(maxf(s)));
    Sh.am = { kind, fund, max };
    const presets = [500, 1000, 5000, 20000].filter(x => x < max);
    Sh.open(`<h3>${e(title)}</h3><p class="desc">Доступно: ${M(max)}</p>
      ${fund ? C.notice('⚠️ ' + Sys.fin.FUNDS[fund].risk + ' Не вкладывайте деньги, которые нужны на еду и жильё.') : ''}
      ${kind === 'loan' ? C.notice('⚠️ Кредит нужно вернуть с процентами за ' + Sys.fin.LOAN_TERM + ' дней. Ставка ~' + Math.round(Sys.fin.loanRate(s) * 36500) + '% годовых.') : ''}
      <input class="field" type="number" inputmode="numeric" min="1" max="${max}" step="1" value="${Math.min(max, presets[presets.length - 1] || max)}" id="amIn" aria-label="Сумма">
      <div class="amount">${presets.map(p => `<button class="btn sec" data-a="amSet" data-x="${p}">${U.num(p)}</button>`).join('')}<button class="btn sec" data-a="amSet" data-x="${max}">Всё</button></div>
      <div class="btns"><button class="btn sec" data-a="sheetClose">Отмена</button><button class="btn" data-a="amGo" data-focus>Подтвердить</button></div>`);
  };

  // ── Рыбалка: маркер бегает по шкале, нужно нажать, когда он в зелёной зоне
  Sh.fishing = function () {
    const f = Sh.fish = { tries: 3, caught: 0, res: [], x: 0, dir: 1, speed: 0.9 + Math.random() * 0.5, zone: 0, w: 0, raf: 0, last: 0 };
    const newZone = () => { f.w = 14 + Math.random() * 10; f.zone = 8 + Math.random() * (84 - f.w); f.speed = 0.9 + Math.random() * 0.8; };
    newZone(); f.newZone = newZone;
    Sh.open(`<h3>🎣 Рыбалка</h3><p class="desc">Нажмите «Подсечь», когда поплавок в зелёной зоне. Три заброса.</p>
      <div class="fish-bar"><div class="fish-zone" id="fz"></div><div class="fish-mark" id="fm"></div></div>
      <div class="fish-res" id="fr" aria-live="polite"></div>
      <button class="btn wide" data-a="fishHook" data-focus style="min-height:56px;font-size:16px">Подсечь!</button>`, { closable: false });
    const zoneEl = document.getElementById('fz'), mark = document.getElementById('fm');
    const paint = () => { zoneEl.style.left = f.zone + '%'; zoneEl.style.width = f.w + '%'; };
    paint(); f.paint = paint;
    const motion = S().settings.motion && !(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const loop = t => {
      if (!Sh.fish) return;
      const dt = f.last ? Math.min(50, t - f.last) : 16; f.last = t;
      f.x += f.dir * f.speed * dt * (motion ? 0.09 : 0.05);
      if (f.x > 100) { f.x = 100; f.dir = -1; } if (f.x < 0) { f.x = 0; f.dir = 1; }
      mark.style.left = f.x + '%';
      f.raf = requestAnimationFrame(loop);
    };
    f.raf = requestAnimationFrame(loop);
  };
  Sh.fishHook = function () {
    const f = Sh.fish; if (!f || f.tries <= 0) return;
    const hit = f.x >= f.zone && f.x <= f.zone + f.w;
    f.tries--; if (hit) f.caught++;
    f.res.push(hit ? '🐟' : '💨');
    document.getElementById('fr').textContent = f.res.join(' ');
    if (f.tries > 0) { f.newZone(); f.paint(); return; }
    cancelAnimationFrame(f.raf); Sh.fish = null;
    const msg = Sys.fun.fishResult(S(), f.caught);
    UI.after(true);
    Sh.open(`<div class="big-ico">${f.caught ? '🐟' : '🌊'}</div><p style="text-align:center">${e(msg)}</p><div class="btns"><button class="btn sec" data-a="sheetClose">Позже</button>${f.caught ? `<button class="btn" data-a="eatFish">Сварить уху</button>` : ''}</div>`);
  };

  // ── Первый запуск
  Sh.welcome = function () {
    Sh.open(`<div class="big-ico">🌆</div><h3 style="justify-content:center">С НУЛЯ</h3>
      <p>Осень. У вас 340 ₽, потрёпанная куртка и ни одного документа. Город большой — и возможностей в нём больше, чем кажется.</p>
      <p class="desc">Можно учиться и строить карьеру, открыть своё дело, найти друзей и любовь — или просто жить свободно. Голод, холод и усталость реальны, но безвыходных ситуаций нет: соццентр и ночлежка помогут всегда.</p>
      <label class="desc" for="wName">Как зовут героя?</label><input id="wName" class="field" maxlength="24" value="${e(S().hero.name)}" autocomplete="off">
      <button class="btn wide" style="margin-top:12px" data-a="startGame" data-focus>Начать с нуля</button>`, { closable: false });
  };
})(typeof window !== 'undefined' ? window : globalThis);
