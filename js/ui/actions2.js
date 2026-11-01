/* 0.3: действия новых экранов, шторки сумм, автопилот с анимацией, визуальные эффекты
   (счётчики денег, всплывающие суммы, плавные шкалы, конфетти уровня, смена дня, вибро, «волна» на кнопках) */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, C = UI.C, A = UI.A, Sh = UI.sheet;
  const e = U.esc, M = U.money, S = () => SN.state;
  const res = r => { UI.after(); return r; };
  const ok = r => { if (r && r.ok && r.msg) SN.say(r.msg, 'good'); return res(r); };

  // ─────────── Шторка суммы (универсальная)
  Sh.amountCfg = function (kind) {
    const s = S(), I = Sys.inv, F = Sys.fin;
    const [k, arg] = kind.split(':');
    const cfg = {
      toBank: { t: 'Внести на карту', max: s.money, go: v => F.toBank(s, v) },
      toCash: { t: 'Снять наличные', max: s.bank, go: v => F.toCash(s, v) },
      depPut: { t: 'Пополнить накопительный счёт', max: s.bank, go: v => F.depositPut(s, v) },
      depTake: { t: 'Снять с накопительного счёта', max: s.fin.deposit, go: v => F.depositTake(s, v) },
      loan: { t: 'Взять кредит', max: F.loanLimit(s), note: '⚠️ Кредит нужно вернуть с процентами за ' + F.LOAN_TERM + ' дней. Ставка ~' + Math.round(F.loanRate(s) * 36500) + '% годовых.', go: v => F.takeLoan(s, v) },
      repay: { t: 'Погасить кредит', max: Math.min(Math.ceil(s.fin.loan), Sys.econ.available(s)), go: v => F.repay(s, v) },
      fund: { t: arg && F.FUNDS[arg] ? 'Купить: ' + F.FUNDS[arg].name : '', max: s.bank, note: arg && F.FUNDS[arg] ? '⚠️ ' + F.FUNDS[arg].risk : '', go: v => F.buyFund(s, arg, v) },
      term: { t: 'Вклад на ' + (I.TERMS[arg] || {}).days + ' дней', max: s.bank, note: 'Минимум 5 000 ₽. Досрочное закрытие — без процентов.', go: v => I.openTerm(s, +arg, v) },
      bond: { t: 'Купить ОФЗ', max: s.bank, note: 'Купон начисляется каждый день, через ' + I.BOND.days + ' дней деньги вернутся.', go: v => I.buyBond(s, v) },
      gold: { t: 'Купить золото', max: s.bank, note: 'Спред 3%: покупка дороже продажи. Золото — для защиты, не для быстрых денег.', go: v => I.buyGold(s, v) },
      stock: { t: arg && D.stockById[arg] ? 'Купить: ' + D.stockById[arg].name : '', max: s.bank, note: arg && D.stockById[arg] ? 'Цена ' + M(I.price(s, arg)) + ' за акцию · комиссия ' + (I.fee(s) * 100).toFixed(1).replace('.', ',') + '%. Акции могут подешеветь.' : '', go: v => I.buyStock(s, arg, v) },
      mort: { t: 'Досрочно погасить ипотеку', max: s.fin.mort[arg] ? Math.min(Math.ceil(s.fin.mort[arg].left), Sys.econ.available(s)) : 0, note: 'Уменьшает ежедневный платёж.', go: v => I.mortRepay(s, +arg, v) }
    }[k];
    return cfg;
  };
  Sh.amount = function (kind) {
    const cfg = Sh.amountCfg(kind); if (!cfg) return;
    const max = Math.max(0, Math.floor(cfg.max));
    Sh.am = { kind, max };
    const presets = [1000, 5000, 20000, 100000, 1000000].filter(x => x < max).slice(-3);
    Sh.open(`<h3>${e(cfg.t)}</h3><p class="desc">Доступно: ${M(max)}</p>${cfg.note ? C.notice(e(cfg.note)) : ''}
      <input class="field big" type="number" inputmode="numeric" min="1" max="${max}" step="1" value="${Math.min(max, presets[presets.length - 1] || max)}" id="amIn" aria-label="Сумма">
      <input type="range" class="range" min="0" max="${max}" step="${Math.max(1, Math.round(max / 200))}" value="${Math.min(max, presets[presets.length - 1] || max)}" id="amRange" aria-label="Ползунок суммы">
      <div class="amount">${presets.map(p => `<button class="btn sec" data-a="amSet" data-x="${p}">${U.num(p)}</button>`).join('')}<button class="btn sec" data-a="amSet" data-x="${Math.floor(max / 2)}">½</button><button class="btn sec" data-a="amSet" data-x="${max}">Всё</button></div>
      <div class="btns"><button class="btn sec" data-a="sheetClose">Отмена</button><button class="btn" data-a="amGo" data-focus>Подтвердить</button></div>`);
    const r = document.getElementById('amRange'), i = document.getElementById('amIn');
    r.addEventListener('input', () => { i.value = r.value; });
    i.addEventListener('input', () => { r.value = i.value; });
  };
  A.amSet = x => { const i = document.getElementById('amIn'), r = document.getElementById('amRange'); if (i) i.value = x; if (r) r.value = x; };
  A.amGo = () => {
    const v = Math.floor(+document.getElementById('amIn').value || 0);
    if (v <= 0) return SN.fail('Введите сумму');
    const cfg = Sh.amountCfg(Sh.am.kind);
    const r = cfg.go(v);
    Sh.close(true); ok(r);
  };

  // ─────────── Новые действия
  Object.assign(A, {
    finTab: x => { UI.tabs.fin = x; UI.route = 'fin'; UI.render(); },
    passiveTab: x => { UI.tabs.passive = x; UI.route = 'passive'; UI.render(); },
    shopTab: x => { UI.tabs.shop = x; UI.route = 'shop'; UI.render(); },
    finSet: (k, v) => { S().fin[k] = +v; UI.after(); },
    setCard: x => ok(Sys.inv.setCard(S(), x)),
    toggleIns: x => ok(Sys.inv.toggleIns(S(), x)),
    closeTerm: i => Sh.confirm('Закрыть вклад досрочно?', 'Начисленные проценты сгорят, вернётся только сумма вклада.', () => ok(Sys.inv.closeTerm(S(), +i)), 'Закрыть'),
    openBroker: () => ok(Sys.inv.openBroker(S())),
    sellStock: (id, f) => ok(Sys.inv.sellStock(S(), id, +f)),
    sellGold: () => ok(Sys.inv.sellGold(S())),
    buyAsset: id => { const d = D.passiveById[id]; Sh.confirm(d.icon + ' ' + d.name, `Цена ${M(d.price)}. Доход ≈ ${M(Sys.inv.netOf(d.inc, d.up))} в день после налога и расходов.${d.rent ? ' Сначала нужно найти арендатора (пара дней).' : ''}`, () => res(Sys.inv.buy(S(), id, false)), 'Купить'); },
    mortAsset: id => { const d = D.passiveById[id], q = Sys.inv.mortQuote(S(), d.price); Sh.confirm('🏦 Ипотека: ' + d.name, `Первый взнос ${M(q.down)}, кредит ${M(q.loan)} на ${q.days} дней. Платёж <b>${M(q.pay)}</b> в день, доход актива ≈ ${M(Sys.inv.netOf(d.inc, d.up))} в день. Просрочка 14 дней — банк заберёт объект.`, () => res(Sys.inv.buy(S(), id, true)), 'Оформить'); },
    homeMort: id => { const h = D.housing[id], q = Sys.inv.mortQuote(S(), h.price); Sh.confirm('🏦 Ипотека: ' + h.name, `Первый взнос ${M(q.down)}, платёж <b>${M(q.pay)}</b> в день ${q.days} дней. Коммуналка ${M(h.upkeep)}/нед. отдельно.`, () => res(Sys.prop.takeHome(S(), id, true)), 'Оформить'); },
    sellAsset: uid => { const u = S().passive.find(x => x.uid === +uid); if (!u) return; Sh.confirm('Продать ' + D.passiveById[u.id].name + '?', 'Вы получите около ' + M(Sys.inv.sellValue(S(), u)) + ' (минус остаток ипотеки, если есть).', () => ok(Sys.inv.sell(S(), +uid)), 'Продать'); },
    refreshAsset: uid => res(Sys.inv.refresh(S(), +uid)),
    perk: id => { const p = D.perkById[id]; if (S().perks.includes(id)) return SN.say(p.icon + ' ' + p.name + ': ' + p.desc, 'info'); Sh.confirm(p.icon + ' ' + p.name, e(p.desc) + '<br><br>Стоимость: ' + '★'.repeat(p.cost), () => { res(Sys.perks.buy(S(), id)); FX.burst(); }, 'Изучить'); },
    buyPoint: () => res(Sys.perks.buyPoint(S())),
    mc: k => res(Sys.perks.masterclass(S(), k)),
    autoSet: (k, v) => { const s = S(); s.settings.auto = Object.assign(Sys.auto.plan(s), { [k]: k === 'maxHours' ? +v : v }); UI.after(); },
    live: days => UI.live(+days),
    liveStop: () => { if (UI.liveCtx) UI.liveCtx.stopReq = true; }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.autotoggle) { const s = S(); s.settings.auto = Object.assign(Sys.auto.plan(s), { [t.dataset.autotoggle]: t.checked }); UI.after(); }
    if (t.dataset.fintoggle) { S().fin[t.dataset.fintoggle] = t.checked; UI.after(); }
  });

  // ─────────── Автопилот с анимацией
  UI.live = function (days) {
    if (UI.liveCtx) return;
    if (Sh.isOpen()) Sh.close(true);
    const s = S(), ctx = Sys.auto.begin(s);
    UI.liveCtx = ctx;
    const ov = document.createElement('div');
    ov.className = 'liveov';
    ov.innerHTML = `<div class="live-card"><div class="live-sun"><i></i></div><div class="live-day" id="lvDay">День ${T.day(s)}</div><div class="live-sub" id="lvSub">${T.dateLabel(s)}</div>
      <div class="track live-track"><i id="lvBar" style="width:0%"></i></div><div class="live-money" id="lvMoney">${U.num(s.money + s.bank)} ₽</div>
      <button class="btn sec" data-a="liveStop">Остановить</button></div>`;
    document.body.appendChild(ov);
    const fast = !s.settings.motion;
    let i = 0;
    const step = () => {
      let stop = '';
      try { stop = Sys.auto.day(s, ctx); } catch (err) { console.error(err); stop = 'Ошибка автопилота: ' + err.message; }
      i++;
      const lv = (id) => document.getElementById(id);
      if (lv('lvDay')) { lv('lvDay').textContent = 'День ' + T.day(s); lv('lvSub').textContent = T.dateLabel(s); lv('lvBar').style.width = (i / days * 100) + '%'; lv('lvMoney').textContent = U.num(s.money + s.bank) + ' ₽'; }
      if (stop) ctx.stop = stop;
      if (stop || ctx.stopReq || i >= days) {
        const sum = Sys.auto.end(s, ctx);
        UI.liveCtx = null; ov.classList.add('out'); setTimeout(() => ov.remove(), 250);
        FX.skipDay = true;
        UI.after(true);
        Sh.autoSummary(sum);
        return;
      }
      setTimeout(step, fast ? 0 : Math.max(40, 380 / Math.sqrt(days)));
    };
    setTimeout(step, fast ? 0 : 200);
  };
  Sh.autoSummary = function (r) {
    const d = r.nw1 - r.nw0;
    const stat = k => { const a = Math.round(r.st0[k]), b = Math.round(r.st1[k]); return `<span class="${b >= a ? 'up' : 'down'}">${a}→${b}</span>`; };
    Sh.open(`<div class="big-ico">⏩</div><h3 style="justify-content:center">Прожито ${r.days} ${U.plural(r.days, 'день', 'дня', 'дней')}</h3>
      ${r.stop ? C.notice('⏸ ' + e(r.stop)) : ''}
      <div class="card gold">${C.hero2([['<span style="color:var(--green)">+' + U.num(r.income) + '</span>', 'Доход ₽'], ['<span style="color:var(--red)">−' + U.num(r.spent) + '</span>', 'Расход ₽'], ['<span style="color:' + (d >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (d >= 0 ? '+' : '') + U.num(d) + '</span>', 'Капитал ₽']])}</div>
      <div class="card">${C.kv('💼 Смен и подработок', r.shifts)}${r.studyH ? C.kv('🎓 Часов учёбы', r.studyH) : ''}${C.kv('❤️ Здоровье', stat('health'))}${C.kv('😊 Настроение', stat('mood'))}${C.kv('😣 Стресс', stat('stress'))}</div>
      ${r.warn.length ? `<div class="card warn">${r.warn.map(l => `<div class="desc">${e(l)}</div>`).join('')}</div>` : ''}
      ${r.events.length ? `<div class="card"><div class="title">События</div>${r.events.slice(-8).map(l => `<div class="desc" style="margin-top:5px">${e(l)}</div>`).join('')}</div>` : ''}
      ${r.lines.length ? `<div class="card"><div class="title">Что произошло</div>${r.lines.map(l => `<div class="desc" style="margin-top:5px">${e(l)}</div>`).join('')}</div>` : ''}
      <button class="btn wide" data-a="sheetClose" data-focus>Отлично</button>`);
    FX.vibe([20, 40, 20]);
  };

  // ─────────── Визуальные эффекты
  const FX = UI.FX = { prev: {}, money: null, total: null, level: null, day: null, skipDay: false };
  const motion = () => S().settings.motion && !(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches);
  FX.vibe = p => { try { if (S().settings.vibro && navigator.vibrate) navigator.vibrate(p); } catch (x) { /* нет вибро */ } };
  FX.count = function (el, from, to, fmt, dur) {
    if (!el || from === to || !motion()) return;
    const t0 = performance.now(); dur = dur || 500;
    const tick = t => { const k = Math.min(1, (t - t0) / dur), v = from + (to - from) * (1 - Math.pow(1 - k, 3)); el.textContent = fmt(v); if (k < 1) requestAnimationFrame(tick); };
    el.textContent = fmt(from); requestAnimationFrame(tick);
  };
  FX.float = function (amount) {
    if (!motion() || !amount) return;
    const w = document.querySelector('.wallet'); if (!w) return;
    const r = w.getBoundingClientRect(), f = document.createElement('div');
    f.className = 'float-delta ' + (amount > 0 ? 'pos' : 'neg');
    f.textContent = (amount > 0 ? '+' : '−') + U.num(Math.abs(amount)) + ' ₽';
    f.style.left = (r.right - 10) + 'px'; f.style.top = (r.bottom - 6) + 'px';
    document.body.appendChild(f); setTimeout(() => f.remove(), 1300);
  };
  FX.burst = function (n) {
    if (!motion()) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = ['#f5b54a', '#ffd98a', '#71d8a3', '#8ebfff', '#ff7d7e', '#c3a3ff'];
    for (let i = 0; i < (n || 46); i++) { const p = document.createElement('i'); p.style.left = (Math.random() * 100) + '%'; p.style.background = cols[i % cols.length]; p.style.animationDelay = (Math.random() * 0.25) + 's'; p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px'); p.style.setProperty('--r', (Math.random() * 720) + 'deg'); box.appendChild(p); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 1700);
  };
  FX.dayWipe = function (s) {
    if (!motion()) return;
    const o = document.createElement('div'); o.className = 'daywipe';
    o.innerHTML = `<div><b>День ${T.day(s)}</b><span>${T.dateLabel(s)} · ${D.weatherKinds[s.weather.kind].icon} ${s.weather.temp > 0 ? '+' : ''}${s.weather.temp}°</span></div>`;
    document.body.appendChild(o); setTimeout(() => o.remove(), 1400);
  };
  FX.post = function () {
    const s = S(); if (!s) return;
    // Деньги
    const wb = document.querySelector('.wallet b'), total = s.money + s.bank;
    if (FX.money != null && wb && wb.firstChild && FX.money !== s.money) FX.count(wb.firstChild, FX.money, s.money, v => U.num(v) + ' ');
    if (FX.total != null && Math.round(total) !== Math.round(FX.total) && !UI.liveCtx) { FX.float(total - FX.total); FX.vibe(total > FX.total ? 12 : 6); if (wb) { wb.classList.remove('pulse'); void wb.offsetWidth; wb.classList.add('pulse'); } }
    FX.money = s.money; FX.total = total;
    // Шкалы и числа
    document.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k, target = el.style.width, prev = FX.prev[k];
      FX.prev[k] = target;
      if (prev != null && prev !== target && motion()) { el.style.transition = 'none'; el.style.width = prev; void el.offsetWidth; el.style.transition = ''; requestAnimationFrame(() => { el.style.width = target; }); }
    });
    document.querySelectorAll('[data-count]').forEach(el => {
      const k = 'c_' + el.dataset.count, v = +el.textContent, prev = FX.prev[k]; FX.prev[k] = v;
      if (prev != null && prev !== v) { FX.count(el, prev, v, x => String(Math.round(x)), 450); el.classList.add(v > prev ? 'up' : 'down'); }
    });
    // Уровень
    const L = Sys.quests.level(s);
    if (FX.level != null && L > FX.level) { FX.burst(); FX.vibe([30, 60, 30]); SN.say('🎉 Новый уровень ' + L + '! +1 очко таланта', 'good'); }
    FX.level = L;
    // Смена дня
    const d = T.day(s);
    if (FX.day != null && d > FX.day && !FX.skipDay && !UI.liveCtx) FX.dayWipe(s);
    FX.day = d; FX.skipDay = false;
  };
  const origRender = UI.render;
  UI.render = function () { origRender(); try { FX.post(); } catch (x) { console.error(x); } };

  // Волна от нажатия и лёгкая вибрация
  document.addEventListener('pointerdown', ev => {
    const b = ev.target.closest('.btn, .quick button, .tile, .choice, .nav button, .pin, .perk');
    if (!b || !motion()) return;
    const r = b.getBoundingClientRect(), w = document.createElement('span');
    w.className = 'ripple'; const sz = Math.max(r.width, r.height) * 1.6;
    w.style.width = w.style.height = sz + 'px'; w.style.left = (ev.clientX - r.left - sz / 2) + 'px'; w.style.top = (ev.clientY - r.top - sz / 2) + 'px';
    b.appendChild(w); setTimeout(() => w.remove(), 520);
  }, { passive: true });
  document.addEventListener('click', ev => { if (ev.target.closest('[data-a]')) FX.vibe(8); }, true);
})(typeof window !== 'undefined' ? window : globalThis);
