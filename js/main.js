/* Точка входа: загрузка сохранения, маршрутизация, делегирование кликов, автосохранение, PWA */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys, UI = SN.UI, V = UI.views, Sh = UI.sheet;
  const $ = id => document.getElementById(id);
  const S = () => SN.state;

  UI.route = 'home'; UI.stack = []; UI.tabs = Object.assign({ career: 'jobs', people: 'contacts' }, UI.tabs || {});
  const NAV = [['home', '🏠', 'Дом'], ['city', '🗺️', 'Город'], ['career', '💼', 'Карьера'], ['people', '👥', 'Люди'], ['more', '▦', 'Ещё']];
  const ROOT = r => r.split(':')[0];
  const navOf = r => { const b = ROOT(r); if (b === 'district') return 'city'; if (b === 'npc') return 'people'; return NAV.some(n => n[0] === b) ? b : 'more'; };

  // ── Тост
  let toastT;
  SN.on('toast', ({ msg, kind }) => {
    if (!msg) return;
    const t = $('toast'); t.textContent = msg; t.className = 'toast on ' + (kind === 'bad' ? 'bad' : kind === 'info' ? 'info' : '');
    clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', kind === 'bad' ? 3200 : 2600);
  });
  SN.on('modal', o => Sh.push(() => Sh.info(o)));
  SN.on('newday', reps => Sh.push(() => Sh.days(reps)));
  SN.on('quest', q => SN.say('✅ Задание выполнено: ' + q.title + ' (+' + ((q.reward || {}).xp || 0) + ' XP)', 'good'));
  SN.on('achievement', a => SN.say('🏆 Достижение: ' + a.name, 'good'));
  SN.on('minigame', k => { if (k === 'fishing') Sh.push(() => Sh.fishing()); });

  // ── Отрисовка
  UI.top = function () {
    const s = S(), L = Sys.quests.level(s), a = Sys.quests.levelXp(L), b = Sys.quests.levelXp(L + 1);
    $('top').innerHTML = `<div class="toprow"><div class="brand">С НУЛЯ<small>СИМУЛЯТОР ЖИЗНИ</small></div>
      <div class="wallet" aria-label="Деньги"><b>${U.num(s.money)} <span>₽</span></b><div>${s.account ? '💳 ' + U.num(s.bank) + ' ₽' : 'без счёта'}${s.fin.loan > 0 ? ' · долг ' + U.num(s.fin.loan) : ''}</div></div></div>
      <div class="topsub"><span class="lvl">УР. ${L}</span><div class="xp" role="progressbar" aria-valuenow="${s.xp}" aria-label="Опыт"><i style="width:${U.clamp((s.xp - a) / (b - a) * 100)}%"></i></div><span class="clock">📅 День ${T.day(s)} · ${T.clock(s)}</span></div>`;
  };
  UI.render = function () {
    const s = S(), r = UI.route, [base, arg] = [ROOT(r), r.split(':')[1]];
    T.ensureWeather(s);
    document.documentElement.classList.toggle('nomotion', !s.settings.motion);
    document.documentElement.classList.toggle('big', !!s.settings.bigText);
    UI.top();
    let html;
    try {
      if (base === 'district') html = V.district(arg);
      else if (base === 'cat') html = V.cat(arg);
      else if (base === 'npc') html = V.npc(arg);
      else if (base === 'career') html = V.career(arg || UI.tabs.career);
      else if (base === 'people') html = V.people(arg || UI.tabs.people);
      else html = (V[base] || V.home)(arg);
    } catch (err) { console.error(err); html = `<div class="notice">Ошибка экрана: ${U.esc(err.message)}. Попробуйте вернуться на главный.</div>` + UI.C.btn('На главный', 'go', 'home'); }
    const c = $('content'); c.innerHTML = `<div class="view">${html}</div>`;
    const nv = navOf(r);
    $('nav').innerHTML = NAV.map(n => `<button class="${nv === n[0] ? 'on' : ''}" data-a="nav" data-x="${n[0]}" aria-current="${nv === n[0] ? 'page' : 'false'}"><span class="ni">${n[1]}</span>${n[2]}${n[0] === 'home' && s.pending.length ? '<i class="dot"></i>' : ''}</button>`).join('');
    document.title = 'С НУЛЯ — День ' + T.day(s);
  };
  UI.go = function (r, keepScroll) {
    if (r !== UI.route) UI.stack.push(UI.route);
    if (UI.stack.length > 30) UI.stack.shift();
    UI.route = r; UI.render();
    if (!keepScroll) G.scrollTo(0, 0);
  };
  UI.save = () => SN.Save.write(S());
  /* После любого действия: сохранить, перерисовать, показать очередь окон */
  UI.after = function (noPump) {
    UI.save();
    const y = G.scrollY; UI.render(); G.scrollTo(0, y);
    if (!noPump) setTimeout(UI.pump, 50);
  };
  const res = r => { if (r && r.msg && !r.ok) { /* сообщение уже в тосте */ } UI.after(); return r; };

  // ── Обработчики действий
  const A = UI.A = {
    nav: x => { UI.stack = []; UI.route = x; UI.render(); G.scrollTo(0, 0); },
    go: x => UI.go(x),
    back: () => UI.go(UI.stack.pop() || 'more', false),
    careerTab: x => { UI.tabs.career = x; UI.route = 'career'; UI.render(); },
    peopleTab: x => { UI.tabs.people = x; UI.route = 'people'; UI.render(); },
    quick: x => { const q = x === 'work' ? Sys.quick.work(S()) : Sys.quick.eat(S()); res(q.run()); },
    sleepSheet: () => Sh.sleep(),
    sleep: x => { Sh.close(true); res(Sys.stats.sleep(S(), x)); },
    act: x => { if (Sh.isOpen()) Sh.close(true); res(Sys.act.run(S(), x)); },
    shift: x => res(Sys.work.shift(S(), x)),
    apply: x => Sh.interview(x),
    ivAns: x => { Sh.iv.ans.push(+x); Sh.renderInterview(); },
    ivGo: () => { const r = Sys.work.interview(S(), Sh.iv.jobId, Sh.iv.ans.reduce((a, b) => a + b, 0)); Sh.close(true); UI.after(true); if (r.msg) Sh.info({ icon: r.hired ? '🤝' : '📞', title: r.hired ? 'Вы приняты!' : 'Отказ', text: r.msg }); },
    study: x => res(Sys.edu.study(S(), x)),
    quit: () => Sh.confirm('Уволиться?', 'Повышения и стаж на этом месте будут потеряны.', () => res(Sys.work.quit(S())), 'Уволиться'),
    travel: x => { const r = Sys.city.travel(S(), x); if (r.ok) SN.say(r.msg, 'good'); res(r); },
    setTransport: x => { S().settings.transport = x; UI.after(); },
    talk: x => { const r = Sys.social.open(S(), x, false); UI.after(true); if (r.ok) Sh.dialog(x, r.greet); },
    call: x => { const r = Sys.social.open(S(), x, true); UI.after(true); if (r.ok) Sh.dialog(x, '📱 ' + r.greet); },
    dlg: x => Sh.dialogChoose(+x),
    npc: x => UI.go('npc:' + x),
    npcFromDlg: x => { Sh.close(true); UI.go('npc:' + x); },
    hang: (x, y) => res(Sys.social.hang(S(), x, y)),
    findNew: () => res(Sys.social.findNew(S())),
    askDate: x => { const r = Sys.social.askDate(S(), x); UI.after(true); if (r.msg) Sh.info({ icon: r.yes ? '💞' : '🙂', title: r.yes ? 'Согласие' : 'Не сейчас', text: r.msg }); },
    couple: x => { const r = Sys.social.proposeCouple(S(), x); UI.after(true); if (r.msg) Sh.info({ icon: r.yes ? '❤️' : '🙂', title: r.yes ? 'Вы пара' : 'Пока нет', text: r.msg }); },
    moveIn: x => { const r = Sys.social.moveIn(S(), x); UI.after(true); if (r.msg && r.ok) Sh.info({ icon: '🏠', title: 'Вместе', text: r.msg }); },
    marry: x => { const r = Sys.social.marry(S(), x); UI.after(true); if (r.msg && r.ok) Sh.info({ icon: r.yes ? '💍' : '🙂', title: r.yes ? 'Свадьба!' : 'Не сейчас', text: r.msg }); },
    breakUp: x => Sh.confirm('Расстаться?', 'Отношения и настроение сильно упадут.', () => res(Sys.social.breakUp(S(), x)), 'Расстаться'),
    home: x => { const h = D.housing[x]; Sh.confirm(h.icon + ' ' + h.name, h.type === 'rent' ? `Оплата ${U.money(h.weekly)} за первую неделю${h.deposit ? ' + залог ' + U.money(h.deposit) : ''}. Дальше — автосписание раз в неделю.` : `Покупка за ${U.money(h.price)}. Коммуналка ${U.money(h.upkeep)} в неделю.`, () => res(Sys.prop.takeHome(S(), x)), h.type === 'rent' ? 'Снять' : 'Купить'); },
    leave: () => Sh.confirm('Освободить жильё?', D.housing[S().housing].type === 'own' ? 'Жильё будет продано за 85% стоимости.' : 'Залог вернётся, если нет долгов.', () => res(Sys.prop.leave(S()))),
    buyItem: x => res(Sys.prop.buyItem(S(), x)),
    sellItem: x => Sh.confirm('Продать ' + D.items[x].name.toLowerCase() + '?', 'Вы получите ' + U.money(D.items[x].price * D.items[x].sell) + '.', () => res(Sys.prop.sellItem(S(), x)), 'Продать'),
    buyClothes: x => res(Sys.prop.buyClothes(S(), x)),
    wear: x => res(Sys.prop.wear(S(), x)),
    look: (x, y) => { const h = S().hero; if (x === 'beard') h.beard = +y; else h[x] = +y; UI.after(); },
    bizOpen: x => { const d = D.bizById[x]; Sh.confirm(d.icon + ' ' + d.name, `Вложение ${U.money(Sys.biz.price(S(), x))}. Аренда ${U.money(d.rent)} в день, налог 6% с выручки. Без персонала точка простаивает.`, () => res(Sys.biz.open(S(), x)), 'Открыть'); },
    bizSet: (x, y) => { const [k, v] = y.split(':'); Sys.biz.set(S(), x, k, +v); UI.after(); },
    bizWork: x => res(Sys.biz.work(S(), x)),
    bizUp: x => res(Sys.biz.upgrade(S(), x)),
    bizSell: x => Sh.confirm('Продать бизнес?', 'Вы получите ' + U.money(Sys.biz.sellValue(S(), Sys.biz.get(S(), x))) + '.', () => res(Sys.biz.sell(S(), x)), 'Продать'),
    openAcc: () => res(Sys.fin.openAccount(S())),
    amount: x => Sh.amount(x),
    amSet: x => { const i = document.getElementById('amIn'); if (i) i.value = x; },
    amGo: () => {
      const v = Math.floor(+document.getElementById('amIn').value || 0), am = Sh.am, s = S();
      if (v <= 0) return SN.fail('Введите сумму');
      const F = Sys.fin;
      const map = { toBank: F.toBank, toCash: F.toCash, depPut: F.depositPut, depTake: F.depositTake, loan: F.takeLoan, repay: F.repay };
      const r = am.fund ? F.buyFund(s, am.fund, v) : map[am.kind](s, v);
      Sh.close(true); if (r.ok && r.msg) SN.say(r.msg, 'good'); res(r);
    },
    sellFund: x => res(Sys.fin.sellFund(S(), x)),
    eatFish: () => { if (Sh.isOpen()) Sh.close(true); res(Sys.fun.eatFish(S())); },
    sellFish: () => res(Sys.fun.sellFish(S())),
    fishHook: () => Sh.fishHook(),
    event: () => Sh.event(),
    evChoose: x => { const r = Sys.events.resolve(S(), +x); Sh.close(true); UI.after(true); if (r.text) Sh.eventResult(r.text); },
    sheetClose: () => Sh.close(),
    confirmYes: () => { const f = UI.onConfirm; UI.onConfirm = null; Sh.close(true); if (f) f(); },
    startGame: () => { const n = (document.getElementById('wName').value || '').replace(/[<>]/g, '').trim().slice(0, 24); if (n) S().hero.name = n; S().flags.welcomed = true; Sh.close(); UI.after(); },
    exportSave: () => {
      if (G.AndroidBridge) { const ok = G.AndroidBridge.saveFile('s-nulya-den-' + T.day(S()) + '.json', SN.Save.exportText(S())); if (!ok) SN.say('Не удалось сохранить файл.', 'bad'); return; }
      const blob = new Blob([SN.Save.exportText(S())], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 's-nulya-den-' + T.day(S()) + '.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      SN.say('Сохранение экспортировано в файл.', 'good');
    },
    copySave: () => { const t = SN.Save.exportText(S()); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => SN.say('Код сохранения скопирован.', 'good'), () => SN.say('Не удалось скопировать — используйте экспорт в файл.', 'bad')); },
    reset: () => Sh.confirm('Начать новую игру?', 'Весь текущий прогресс будет удалён без возможности восстановления.', () => { SN.state = SN.fresh(); UI.stack = []; UI.route = 'home'; UI.after(true); Sh.welcome(); }, 'Начать заново')
  };

  /* Системная кнопка «Назад» в Android-приложении: true — обработано игрой */
  UI.androidBack = function () {
    if (Sh.isOpen()) { if (Sh.fish || (Sys.events.current(S()) && Sh.el.querySelector('[data-a="evChoose"]')) || Sh.el.querySelector('[data-a="startGame"]')) return true; Sh.close(); return true; }
    if (UI.stack.length) { A.back(); return true; }
    if (UI.route !== 'home') { A.nav('home'); return true; }
    UI.save(); return false;
  };

  // ── Делегирование событий
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-a]'); if (!el) return;
    if (el.getAttribute('aria-disabled') === 'true') { SN.say(el.getAttribute('data-why') || 'Недоступно', 'bad'); return; }
    const f = A[el.dataset.a]; if (!f) return;
    ev.preventDefault();
    try { f(el.dataset.x, el.dataset.y, el); } catch (err) { console.error(err); SN.say('Ошибка: ' + err.message, 'bad'); }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && Sh.isOpen()) { if (!Sh.fish && !(Sys.events.current(S()) && Sh.el.querySelector('[data-a="evChoose"]'))) Sh.close(); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role="button"][data-a]')) { ev.preventDefault(); ev.target.click(); }
  });
  document.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.toggle) { S().settings[t.dataset.toggle] = t.checked; UI.after(); }
    if (t.dataset.change === 'name') { const n = t.value.replace(/[<>]/g, '').trim().slice(0, 24); if (n) { S().hero.name = n; UI.after(); } }
    if (t.dataset.file === 'import' && t.files && t.files[0]) {
      const f = t.files[0];
      if (f.size > SN.Save.MAX) return SN.say('Файл слишком большой.', 'bad');
      const rd = new FileReader();
      rd.onload = () => { try { SN.state = SN.Save.importText(String(rd.result)); UI.stack = []; UI.route = 'home'; UI.after(); SN.say('Сохранение загружено: день ' + T.day(S()), 'good'); } catch (e) { SN.say('Файл сохранения повреждён или не подходит.', 'bad'); } };
      rd.readAsText(f);
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && SN.state) UI.save(); });
  G.addEventListener('pagehide', () => { if (SN.state) UI.save(); });

  // ── Запуск
  function boot() {
    const r = SN.Save.read();
    SN.state = r.state || SN.fresh();
    T.ensureWeather(SN.state);
    Sys.quests.check(SN.state);
    UI.render();
    if (r.warn) SN.say(r.warn, r.source === 'legacy' ? 'info' : 'bad');
    if (!SN.state.flags.welcomed) Sh.welcome(); else UI.pump();
    UI.save();
    // Service Worker — только по HTTPS/localhost (не из file://)
    if (!G.AndroidBridge && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : globalThis);
