/* Люди и отношения: встречи по расписанию, диалоги, совместные занятия,
   романтика только по обоюдному согласию, совместная жизнь, свадьба. */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const S = Sys.social = {};

  S.get = (s, id) => s.npc[id] || (s.npc[id] = { rel: 0, trust: 0, met: false, mem: {}, last: 0, romance: 0, status: '', livingTogether: false, cd: 0, phone: false });
  S.where = (s, id) => D.npcById[id].where(s);
  S.present = (s, id) => S.where(s, id) === s.district;
  S.relLabel = r => r >= 80 ? 'Близкий человек' : r >= 60 ? 'Друг' : r >= 35 ? 'Приятель' : r >= 15 ? 'Знакомый' : 'Едва знакомы';
  S.statusLabel = n => n.status === 'married' ? 'Супруг(а) 💍' : n.status === 'partner' ? (n.livingTogether ? 'Живёте вместе 🏠' : 'Встречаетесь ❤️') : n.status === 'dating' ? 'Ходите на свидания 💞' : '';

  /* api для эффектов диалога */
  const api = (s, n) => ({
    rel: x => { n.rel = U.clamp(n.rel + x); },
    trust: x => { n.trust = U.clamp(n.trust + x); },
    time: m => T.advance(s, m, { indoor: false })
  });

  /* Открыть разговор: лично (нужно быть в одном районе) или по телефону */
  S.open = function (s, id, remote) {
    const def = D.npcById[id], n = S.get(s, id);
    if (remote) {
      if (!s.items.includes('phone') || s.flags.phoneBroken) return SN.fail('Нужен работающий телефон');
      if (!n.phone) return SN.fail('У вас нет номера ' + def.name);
      const hh = T.hourF(s); if (hh < 8 || hh >= 23) return SN.fail('Слишком поздно для звонков');
    } else {
      const where = S.where(s, id);
      if (!where) return SN.fail(def.name + ' сейчас не в городе — загляните в другое время');
      if (where !== s.district) { const r = Sys.city.travel(s, where); if (!r.ok) return r; }
      if (S.where(s, id) !== s.district) return SN.fail(def.name + ' уже ушёл(ушла)');
    }
    const first = !n.met;
    s.c.talks = (s.c.talks || 0) + 1;
    n.met = true;
    T.advance(s, remote ? 10 : 20, { indoor: false });
    if (n.last !== T.day(s)) { n.rel = U.clamp(n.rel + (remote ? 1.5 : 3) * (s.st.hygiene < 25 && !remote ? 0.4 : 1) * (SN.perk(s, 'charisma') ? 1.3 : 1)); n.last = T.day(s); }
    if (n.rel >= 15 && !n.phone && s.items.includes('phone')) { n.phone = true; SN.say(def.icon + ' ' + def.name + ' даёт свой номер.', 'good'); }
    Sys.quests.check(s);
    return { ok: true, first, greet: def.greet[D.npcTier(n)] };
  };
  S.choices = function (s, id) {
    const def = D.npcById[id], n = S.get(s, id);
    return def.choices.map((c, i) => ({ i, t: c.t, show: !c.show || c.show(s, n), lock: c.lock ? c.lock(s, n) : '' })).filter(c => c.show);
  };
  S.choose = function (s, id, i) {
    const def = D.npcById[id], n = S.get(s, id), c = def.choices[i];
    if (!c || (c.show && !c.show(s, n))) return { text: '…' };
    const lock = c.lock ? c.lock(s, n) : ''; if (lock) return { text: lock };
    T.advance(s, 15, {});
    const r = c.run(s, n, api(s, n));
    s.xp += 3;
    Sys.quests.check(s);
    return typeof r === 'string' ? { text: r } : r;
  };

  /* Совместные занятия */
  S.HANG = {
    walk:   { name: 'Прогуляться', icon: '🚶', cost: 0, hours: 2, rel: 4, rom: 3, mood: 6 },
    coffee: { name: 'Выпить кофе', icon: '☕', cost: 550, hours: 1.5, rel: 6, rom: 5, mood: 6 },
    cinema: { name: 'Сходить в кино', icon: '🎬', cost: 1000, hours: 3, rel: 7, rom: 7, mood: 12 },
    gift:   { name: 'Подарить подарок', icon: '🎁', cost: 900, hours: 0.5, rel: 6, rom: 6, mood: 3, cooldown: 3 },
    dinner: { name: 'Романтический ужин', icon: '🍽️', cost: 3400, hours: 3, rel: 8, rom: 12, mood: 15, romanceOnly: true }
  };
  S.hangCheck = function (s, id, k) {
    const n = S.get(s, id), h = S.HANG[k];
    if (!n.met) return 'Сначала познакомьтесь';
    if (h.romanceOnly && !n.status) return 'Только для пары';
    if (n.rel < 10 && k !== 'walk') return 'Пока слишком мало знакомы';
    if (h.cooldown && n.mem.giftDay && T.day(s) - n.mem.giftDay < h.cooldown) return 'Недавно дарили';
    if (n.mem['hang_' + T.day(s)]) return 'Сегодня уже провели время вместе';
    if (!Sys.econ.canPay(s, h.cost)) return 'Нужно ' + U.money(h.cost);
    if (!S.where(s, id)) return 'Сейчас не в городе';
    return '';
  };
  S.hang = function (s, id, k) {
    const why = S.hangCheck(s, id, k); if (why) return SN.fail(why);
    const n = S.get(s, id), h = S.HANG[k], def = D.npcById[id];
    const where = S.where(s, id);
    if (where !== s.district) { const r = Sys.city.travel(s, where); if (!r.ok) return r; }
    if (h.cost) Sys.econ.pay(s, h.cost, 'social', h.name + ': ' + def.name);
    T.advance(s, h.hours * 60, { indoor: k !== 'walk' });
    const vibe = (s.st.mood > 50 ? 1.1 : 0.9) * (s.st.hygiene < 30 ? 0.6 : 1) * (SN.perk(s, 'charisma') ? 1.2 : 1);
    n.rel = U.clamp(n.rel + h.rel * vibe);
    if (n.status) n.romance = U.clamp(n.romance + h.rom * vibe);
    if (k === 'gift') n.mem.giftDay = T.day(s);
    n.mem['hang_' + T.day(s)] = 1; n.last = T.day(s);
    Sys.stats.apply(s, { mood: h.mood, stress: -5 });
    Sys.stats.gain(s, { social: 0.6 });
    if (n.status) s.c.dates++;
    Sys.quests.check(s);
    SN.say(h.icon + ' ' + h.name + ' с ' + def.name.split(' ')[0] + ': отношения ' + Math.round(n.rel), 'good');
    return SN.okr('');
  };
  S.findNew = function (s) {
    if (s.st.energy < 10) return SN.fail('Мало энергии');
    T.advance(s, 120, {});
    Sys.stats.gain(s, { social: 1 });
    const here = D.npcs.filter(d => !S.get(s, d.id).met && S.where(s, d.id) === s.district);
    if (here.length) {
      const d = U.pick(s, here); S.get(s, d.id).met = true; S.get(s, d.id).rel = 5;
      Sys.quests.check(s);
      SN.say('Вы познакомились: ' + d.icon + ' ' + d.name + ' (' + d.role.toLowerCase() + ').', 'good');
      return SN.okr(d.id);
    }
    SN.say('Вы пообщались с людьми вокруг. Новых знакомств здесь сейчас нет — попробуйте другой район или время.', 'info');
    return SN.okr('');
  };

  // ── Романтика: всегда с проверкой согласия; отказ уважается
  S.consent = function (s, n, base) {
    let p = base + (SN.perk(s, 'charisma') ? 0.05 : 0) + (n.rel - 35) / 80 + Sys.stats.look(s) * 0.05 + n.trust / 300;
    if (s.st.mood > 55) p += 0.08;
    if (s.st.stress > 70) p -= 0.1;
    if (s.st.hygiene < 35) p -= 0.25;
    if (n.mem.lied && !n.mem.forgiven) p -= 0.2;
    return U.clamp(p, 0.03, 0.95);
  };
  S.dateCheck = function (s, id) {
    const def = D.npcById[id], n = S.get(s, id);
    if (!def.romance) return 'Только дружба';
    if (s.partner && s.partner !== id) return 'Вы уже в отношениях';
    if (n.status) return '';
    if (n.rel < 35) return 'Нужно лучше узнать друг друга (отношения 35)';
    if (n.cd > T.day(s)) return def.name + ' просит не торопить события';
    return '';
  };
  S.askDate = function (s, id) {
    const why = S.dateCheck(s, id); if (why) return SN.fail(why);
    const n = S.get(s, id), def = D.npcById[id];
    if (n.status) return SN.fail('Вы уже встречаетесь — просто проводите время вместе');
    const p = S.consent(s, n, 0.35);
    if (U.chance(s, p)) {
      n.status = 'dating'; n.romance = 20;
      Sys.log(s, def.name + ' согласилась(ся) на свидание.');
      Sys.quests.check(s);
      return { ok: true, yes: true, msg: def.name + ' улыбается: «Давай. Только без пафоса — просто погуляем?» Теперь в карточке доступны свидания.' };
    }
    n.cd = T.day(s) + 4;
    return { ok: true, yes: false, msg: def.name + ' мягко отказывает: «Ты классный, но мне пока не хочется. Давай останемся как есть?» Это нормально — уважайте её(его) решение.' };
  };
  S.proposeCouple = function (s, id) {
    const n = S.get(s, id), def = D.npcById[id];
    if (n.status !== 'dating') return SN.fail('Сначала свидания');
    if (n.romance < 60) return SN.fail('Чувства ещё не окрепли (романтика 60)');
    if (n.cd > T.day(s)) return SN.fail('Дайте время подумать');
    if (U.chance(s, S.consent(s, n, 0.5))) { n.status = 'partner'; s.partner = id; Sys.log(s, 'Теперь вы с ' + def.name + ' — пара.'); Sys.quests.check(s); return { ok: true, yes: true, msg: '«Я думала(думал), ты никогда не спросишь». Теперь вы пара.' }; }
    n.cd = T.day(s) + 5;
    return { ok: true, yes: false, msg: '«Мне хорошо с тобой, но я не готова(готов) к серьёзному. Дай мне время.»' };
  };
  S.moveIn = function (s, id) {
    const n = S.get(s, id);
    if (n.status !== 'partner' && n.status !== 'married') return SN.fail('Сначала станьте парой');
    if (!['flat', 'studio', 'house'].includes(s.housing)) return SN.fail('Нужна отдельная квартира или дом');
    if (n.romance < 75) return SN.fail('Рано съезжаться (романтика 75)');
    n.livingTogether = true; Sys.log(s, 'Вы съехались с ' + D.npcById[id].name + '. Расходы на жильё делите пополам.');
    Sys.quests.check(s);
    return { ok: true, yes: true, msg: 'Коробки, смех, первый ужин на полу среди вещей. Вы живёте вместе — расходы на жильё теперь ниже, настроение выше.' };
  };
  S.marry = function (s, id) {
    const n = S.get(s, id);
    if (!n.livingTogether) return SN.fail('Сначала поживите вместе');
    if (!s.items.includes('ring')) return SN.fail('Нужно обручальное кольцо');
    if (n.romance < 90) return SN.fail('Нужна романтика 90');
    if (!U.chance(s, S.consent(s, n, 0.7))) { n.cd = T.day(s) + 7; return { ok: true, yes: false, msg: '«Я люблю тебя. Но давай не сейчас — я хочу быть уверенной(уверенным) до конца».' }; }
    n.status = 'married'; s.items = s.items.filter(i => i !== 'ring');
    Sys.log(s, 'Свадьба! Вы поженились с ' + D.npcById[id].name + '.');
    Sys.stats.apply(s, { mood: 40, stress: -30 }); s.rep = U.clamp(s.rep + 10);
    Sys.quests.check(s);
    return { ok: true, yes: true, msg: '«Да!» Скромная свадьба в кафе на набережной: Серёга в пиджаке, Нина Петровна плачет, Михалыч произносит тост про историю, которая пишется сейчас.' };
  };
  S.breakUp = function (s, id) {
    const n = S.get(s, id);
    n.status = ''; n.livingTogether = false; n.romance = 0; n.rel = U.clamp(n.rel - 25); s.partner = null;
    Sys.stats.apply(s, { mood: -20, stress: 15 });
    Sys.log(s, 'Вы расстались с ' + D.npcById[id].name + '.');
    return SN.okr('Вы расстались.');
  };

  S.daily = function (s, rep) {
    const day = T.day(s);
    for (const id in s.npc) {
      const n = s.npc[id];
      if (!n.met) continue;
      const idle = day - (n.last || day);
      if (idle > 7 && n.rel > 10) n.rel = U.clamp(n.rel - 0.5);
      if (n.status) {
        if (n.livingTogether) { n.romance = U.clamp(n.romance + 0.5); n.rel = U.clamp(n.rel + 0.3); s.st.mood = U.clamp(s.st.mood + 3); s.st.stress = U.clamp(s.st.stress - 2); }
        else if (idle > 3) { n.romance = U.clamp(n.romance - 1.5); if (n.romance < 10 && n.status === 'dating') { n.status = ''; rep.lines.push(D.npcById[id].name + ': «Мы совсем не видимся… Наверное, у нас ничего не выйдет».'); } }
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
