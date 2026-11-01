/* Работа и образование */
(function (G) {
  'use strict';
  const SN = G.SN, U = SN.U, D = SN.D, T = SN.T, Sys = SN.Sys;
  const E = () => Sys.econ, C = () => Sys.city;
  const W = Sys.work = {};

  W.where = (s, j) => j.district === 'home' ? C().homeDistrict(s) : j.district;
  W.rankName = (j, r) => j.track ? j.track[Math.min(r, j.track.length - 1)] : j.name;
  W.payEstimate = function (s, j) {
    let p = j.pay;
    if (j.scaleSkill === 'music') p = 120 + s.sk.music * 14;
    else if (j.scaleSkill === 'blog') p = Math.min(16000, 300 + (s.flags.subs || 0) * 0.06);
    else if (j.scaleSkill) p *= 1 + s.sk[j.scaleSkill] * 0.006;
    if (j.kind === 'job' && s.job && s.job.id === j.id) p *= D.RANK_MULT[s.job.rank];
    if (j.id === 'photo' && s.items.includes('drone')) p *= 1.25;
    if (SN.perk(s, 'negotiator')) p *= 1.1;
    return Math.round(p * s.prices / 10) * 10;
  };

  /* Причина, почему нельзя выйти на смену прямо сейчас (или '') */
  W.check = function (s, j, ignoreTime) {
    if (j.district === 'home' && s.housing === 'street') return 'Нужно жильё с розеткой и тишиной';
    const rf = E().reqFail(s, j.req); if (rf) return rf;
    if (j.kind === 'job') {
      if (!s.job || s.job.id !== j.id) return 'Вы здесь не работаете';
      if (s.job.last === T.day(s)) return 'Смена уже отработана сегодня';
    }
    if (j.limit && (s.daily['gig_' + j.id] || 0) >= j.limit) return j.limit === 1 ? 'Сегодня уже работали здесь' : 'Лимит смен на сегодня (' + j.limit + ')';
    if (s.ill && Sys.stats.ILL[s.ill.id].noHeavy && j.energy >= 20) return 'Травма: тяжёлая работа запрещена';
    if (s.st.energy < Math.min(95, j.energy + 4)) return 'Мало энергии (нужно ' + (j.energy + 4) + ')';
    if (s.st.food < 12) return 'Сначала поешьте';
    if (!ignoreTime) {
      const dest = W.where(s, j);
      const eta = C().etaMins(s, dest);
      const ok = j.kind === 'gig' ? T.isOpen(s, j.open, j.hours, eta) : T.isOpen(s, j.open, 0, eta);
      if (!ok) return j.kind === 'gig' ? 'Не успеть до закрытия (' + C().hoursLabel(j.open) + ')' : 'Смена начинается с ' + j.open[0] + ':00 до ' + j.open[1] + ':00';
    }
    return '';
  };

  W.shift = function (s, id) {
    const j = D.jobById[id];
    if (!j) return SN.fail('Нет такой работы');
    const why = W.check(s, j); if (why) return SN.fail(why);
    const dest = W.where(s, j);
    if (dest && dest !== s.district) { const r = C().travel(s, dest); if (!r.ok) return r; }
    if (j.fuel && !E().pay(s, j.fuel, 'work', 'Топливо')) return SN.fail('Не хватает на топливо');
    s.st.energy = U.clamp(s.st.energy - j.energy * (SN.perk(s, 'workaholic') ? 0.85 : 1));
    s.st.hygiene = U.clamp(s.st.hygiene - j.hyg);
    T.advance(s, j.hours * 60, { indoor: j.indoor });
    if (j.perk) Sys.stats.apply(s, j.perk);
    let perf = 0.88 + U.rand(s) * 0.24;
    if (s.st.mood < 25) perf *= 0.9;
    if (s.st.stress > 75) perf *= 0.9;
    if (j.id === 'busk' && ['rain', 'snow', 'storm'].includes(s.weather.kind)) perf *= 0.45;
    if (j.id === 'busk' && T.weekend(s)) perf *= 1.3;
    if (SN.perk(s, 'lucky')) perf += 0.05;
    if (j.tips) perf *= 0.8 + U.rand(s) * (0.4 + s.sk.social / 100) * (SN.perk(s, 'lucky') ? 1.2 : 1);
    if (j.commission) perf *= U.chance(s, 0.25 + (SN.perk(s, 'lucky') ? 0.08 : 0) + s.sk.trade / 400) ? 2 + U.rand(s) : 0.4 + U.rand(s) * 0.4;
    if (j.id === 'stream') s.flags.subs = (s.flags.subs || 0) + Math.round(40 + s.sk.social * 3 + s.sk.marketing * 4 + U.rand(s) * 60);
    const pay = Math.round(W.payEstimate(s, j) * perf / 10) * 10;
    const official = j.kind === 'job';
    E().earn(s, pay, 'work', (official ? W.rankName(j, s.job.rank) : j.name), official);
    Sys.stats.gain(s, j.gain);
    s.st.stress = U.clamp(s.st.stress + (j.hours * 0.8 - (official ? 2 : 0)) * (SN.perk(s, 'zen') ? 0.6 : 1));
    s.xp += j.hours * 5; s.rep = U.clamp(s.rep + (official ? 0.4 : 0.15));
    let msg = j.icon + ' Смена окончена: +' + U.money(pay) + (official && s.account ? ' на карту' : '') + '.';
    if (j.risk && U.chance(s, j.risk * (s.st.energy < 25 ? 3 : 1))) { Sys.stats.getIll(s, 'injury'); msg += ' Неудачно потянули спину.'; }
    if (official) {
      s.c.jobs++; s.job.shifts++; s.job.last = T.day(s); s.job.missed = 0;
      msg += W.promote(s, j);
    } else { s.c.gigs++; s.gigs[id] = (s.gigs[id] || 0) + 1; s.daily['gig_' + id] = (s.daily['gig_' + id] || 0) + 1; }
    Sys.quests.check(s);
    SN.say(msg, 'good');
    return SN.okr(msg);
  };

  W.promote = function (s, j) {
    const r = s.job.rank;
    if (r >= 4) return '';
    if (s.job.shifts >= D.RANK_SHIFTS[r + 1] && s.sk[j.promo] >= D.RANK_SKILL[r + 1]) {
      s.job.rank++;
      s.rep = U.clamp(s.rep + 4);
      const t = 'Повышение! Теперь вы — ' + W.rankName(j, s.job.rank) + '. Оплата ×' + D.RANK_MULT[s.job.rank].toFixed(2).replace('.', ',') + '.';
      Sys.log(s, t);
      SN.emit('modal', { kind: 'info', icon: '📈', title: 'Повышение', text: t });
      return ' ' + t;
    }
    return '';
  };
  W.nextPromo = function (s, j) {
    const r = s.job.rank; if (r >= 4) return 'Вершина карьеры';
    return 'До повышения: смены ' + s.job.shifts + '/' + D.RANK_SHIFTS[r + 1] + ', ' + D.skillNames[j.promo].toLowerCase() + ' ' + Math.floor(s.sk[j.promo]) + '/' + D.RANK_SKILL[r + 1];
  };

  /* Отклик на вакансию → собеседование */
  W.applyCheck = function (s, j) {
    if (s.job && s.job.id === j.id) return 'Вы уже здесь работаете';
    const rf = E().reqFail(s, j.req); if (rf) return rf;
    const cd = s.flags['iv_' + j.id];
    if (cd && T.day(s) < cd) return 'Повторный отклик через ' + (cd - T.day(s)) + ' дн.';
    return '';
  };
  W.interviewChance = function (s, j, score) {
    let p = (SN.perk(s, 'charisma') ? 0.47 : 0.42) + score * 0.12 + Sys.stats.look(s) * 0.05 + s.sk.social * 0.004 + s.rep * 0.003 - j.interview;
    if (s.st.hygiene < 35) p -= 0.2;
    if (s.st.stress > 70) p -= 0.08;
    if (s.flags.interviewBonus) p += 0.15;
    return U.clamp(p, 0.05, 0.95);
  };
  W.interview = function (s, id, score) {
    const j = D.jobById[id];
    const why = W.applyCheck(s, j); if (why) return SN.fail(why);
    if (j.district !== s.district) { const r = C().travel(s, j.district); if (!r.ok) return r; }
    T.advance(s, 60, { indoor: true });
    const p = W.interviewChance(s, j, score);
    delete s.flags.interviewBonus;
    if (U.chance(s, p)) {
      if (s.job) Sys.log(s, 'Вы уволились с должности «' + W.rankName(D.jobById[s.job.id], s.job.rank) + '».');
      s.job = { id, rank: 0, shifts: 0, hired: T.day(s), last: 0, missed: 0 };
      s.rep = U.clamp(s.rep + 3);
      Sys.log(s, 'Приняты на работу: ' + j.name + '.');
      Sys.quests.check(s);
      return { ok: true, hired: true, msg: 'Вас приняли! ' + j.name + '. Смена начинается с ' + j.open[0] + ':00 до ' + j.open[1] + ':00 по будням.' + (s.account ? ' Зарплата приходит на карту.' : ' Откройте счёт в банке, чтобы получать зарплату на карту.') };
    }
    s.flags['iv_' + id] = T.day(s) + 2;
    s.st.mood = U.clamp(s.st.mood - 6);
    return { ok: true, hired: false, msg: 'Вам перезвонят… но, похоже, не в этот раз. Шанс был ' + Math.round(p * 100) + '%. Улучшите вид, навыки или репутацию и попробуйте через 2 дня.' };
  };
  W.quit = function (s) {
    if (!s.job) return SN.fail('Вы нигде не работаете');
    Sys.log(s, 'Вы уволились: ' + D.jobById[s.job.id].name + '.');
    s.job = null;
    return SN.okr('Вы уволились по собственному желанию.');
  };
  W.daily = function (s, rep) {
    if (!s.job) return;
    const prev = T.day(s) - 1;
    if (T.dateOf(prev).wd >= 5 || s.job.hired >= prev || s.job.last === prev || s.ill) return;
    s.job.missed++;
    if (s.job.missed === 3) rep.lines.push('⚠️ Начальник недоволен: 3 прогула подряд. Ещё два — и увольнение.');
    if (s.job.missed >= 5) {
      rep.lines.push('Вас уволили за прогулы с работы «' + D.jobById[s.job.id].name + '». Репутация −6.');
      s.rep = U.clamp(s.rep - 6); s.job = null;
    }
  };

  /* Лучшая доступная сейчас работа — для кнопки «Работать» на главном экране */
  W.best = function (s) {
    if (s.job) { const j = D.jobById[s.job.id]; if (!W.check(s, j)) return j; }
    let best = null, bestRate = 0;
    for (const j of D.jobs) {
      if (j.kind !== 'gig' || W.check(s, j)) continue;
      const rate = W.payEstimate(s, j) / j.hours - j.energy * 2;
      if (rate > bestRate) { bestRate = rate; best = j; }
    }
    return best;
  };

  // ── Образование
  const Ed = Sys.edu = {};
  Ed.done = (s, c) => c.cert ? s.certs.includes(c.cert) : c.doc ? s.docs[c.doc] : false;
  Ed.progress = (s, c) => s.study[c.id] || 0;
  Ed.sessionCost = (c, s) => c.repeat ? (c.sessionPrice || 0) : c.hours ? Math.round(c.cost * (s && c.id === 'programming' && s.flags.kolyaDiscount ? 0.7 : 1) * c.session / c.hours / 10) * 10 : 0;
  Ed.check = function (s, c, ignoreTime) {
    if (Ed.done(s, c)) return 'Пройдено';
    const rf = E().reqFail(s, c.req); if (rf) return rf;
    if (c.cap) for (const k in c.cap) if (s.sk[k] >= c.cap[k]) return 'Для роста дальше нужен систематический курс';
    if (s.st.energy < 15) return 'Слишком устали для учёбы';
    if (s.st.food < 12) return 'Сначала поешьте';
    if (!ignoreTime && !T.isOpen(s, c.open, c.session, C().etaMins(s, c.district))) return 'Занятия: ' + C().hoursLabel(c.open);
    const cost = Ed.sessionCost(c, s);
    if (cost && !E().canPay(s, cost)) return 'Занятие стоит ' + U.money(cost);
    return '';
  };
  Ed.study = function (s, id) {
    const c = D.courseById[id];
    const why = Ed.check(s, c); if (why) return SN.fail(why);
    if (c.district !== s.district) { const r = C().travel(s, c.district); if (!r.ok) return r; }
    const cost = Ed.sessionCost(c, s);
    if (cost && !E().pay(s, cost, 'study', c.name)) return SN.fail('Не хватает денег');
    s.st.energy = U.clamp(s.st.energy - c.session * 3.5);
    T.advance(s, c.session * 60, { indoor: true });
    Sys.stats.gain(s, c.gain, SN.perk(s, 'fastlearner') ? 1.25 : 1, c.cap);
    s.c.studyH += c.session; s.xp += c.session * 6;
    s.st.stress = U.clamp(s.st.stress + c.session * 0.6 * (SN.perk(s, 'zen') ? 0.6 : 1));
    let msg;
    if (c.repeat) { const k = Object.keys(c.gain)[0]; msg = c.icon + ' Вы позанимались ' + c.session + ' ч. ' + D.skillNames[k] + ' ' + Math.floor(s.sk[k]) + '.'; }
    else {
      s.study[id] = (s.study[id] || 0) + c.session;
      if (s.study[id] >= c.hours) {
        if (c.cert) s.certs.push(c.cert);
        if (c.doc) s.docs[c.doc] = true;
        s.rep = U.clamp(s.rep + 3); s.xp += 50;
        msg = '🎓 Обучение завершено: ' + c.name + '!';
        Sys.log(s, msg);
        SN.emit('modal', { kind: 'info', icon: '🎓', title: 'Документ получен', text: c.name + ' — пройдено. Теперь доступны новые профессии и возможности.' });
      } else msg = c.icon + ' Занятие пройдено: ' + s.study[id] + '/' + c.hours + ' ч.';
    }
    Sys.quests.check(s);
    SN.say(msg, 'good');
    return SN.okr(msg);
  };
})(typeof window !== 'undefined' ? window : globalThis);
