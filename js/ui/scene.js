/* Динамическая сцена: время суток, погода, район, внешний вид героя (SVG без внешних картинок, кроме фото Старого района) */
(function (G) {
  'use strict';
  const SN = G.SN, D = SN.D, T = SN.T;
  const Sc = SN.Scene = {};

  Sc.SKIN = ['#f1c7a1', '#d9a47c', '#a8714c', '#7a4e33'];
  Sc.HAIR = ['#2b211a', '#6b4a2b', '#b98b4e', '#9a9a9a', '#151515'];
  Sc.OUTFIT = {
    worn: { jacket: '#5b5040', pants: '#3b3a36', hat: '#2c2c2e', patch: '#6e6150' },
    charity: { jacket: '#4f6a7d', pants: '#3a4148' },
    casual: { jacket: '#3f6fa8', pants: '#2e3f5c' },
    winter: { jacket: '#2f3d55', pants: '#252b33', scarf: '#b8423f', hat: '#7a2f2d' },
    business: { jacket: '#2a2f3a', pants: '#23272f', shirt: '#e9edf1', tie: '#9a2f35' },
    sport: { jacket: '#a33b3b', pants: '#2d2d33', stripe: '#f2f2f2' }
  };

  /* Аватар героя. full — с ногами (для сцены и редактора), иначе портрет */
  Sc.avatar = function (s, full) {
    const h = s.hero, o = Sc.OUTFIT[s.wear] || Sc.OUTFIT.worn;
    const skin = Sc.SKIN[h.skin % 4], hair = Sc.HAIR[h.hair % 5];
    const vb = full ? '0 0 100 130' : '18 6 64 64';
    let g = '';
    if (full) {
      g += `<rect x="36" y="86" width="12" height="36" rx="5" fill="${o.pants}"/><rect x="52" y="86" width="12" height="36" rx="5" fill="${o.pants}"/>`;
      g += `<rect x="33" y="118" width="16" height="7" rx="3" fill="#1b1b1d"/><rect x="51" y="118" width="16" height="7" rx="3" fill="#1b1b1d"/>`;
    }
    g += `<path d="M26 92 Q26 56 50 54 Q74 56 74 92 Z" fill="${o.jacket}"/>`;
    if (o.patch) g += `<rect x="58" y="74" width="9" height="8" rx="2" fill="${o.patch}" transform="rotate(-8 62 78)"/>`;
    if (o.shirt) g += `<path d="M44 55 L50 72 L56 55 Z" fill="${o.shirt}"/><path d="M49 58 L51 58 L52.5 74 L50 78 L47.5 74 Z" fill="${o.tie}"/>`;
    if (o.stripe) g += `<rect x="30" y="64" width="3" height="26" fill="${o.stripe}"/><rect x="67" y="64" width="3" height="26" fill="${o.stripe}"/>`;
    if (full) g += `<rect x="20" y="60" width="10" height="28" rx="5" fill="${o.jacket}" transform="rotate(10 25 60)"/><rect x="70" y="60" width="10" height="28" rx="5" fill="${o.jacket}" transform="rotate(-10 75 60)"/>`;
    g += `<rect x="45" y="44" width="10" height="12" rx="4" fill="${skin}"/>`;
    g += `<ellipse cx="50" cy="34" rx="15" ry="17" fill="${skin}"/>`;
    g += `<circle cx="44.5" cy="33" r="1.8" fill="#222"/><circle cx="55.5" cy="33" r="1.8" fill="#222"/>`;
    g += `<path d="M45 42 Q50 ${s.st && s.st.mood > 55 ? 46 : s.st && s.st.mood < 30 ? 40 : 43} 55 42" stroke="#3a2a22" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    if (h.beard) g += `<path d="M36 36 Q38 52 50 53 Q62 52 64 36 Q60 46 50 46 Q40 46 36 36 Z" fill="${hair}" opacity=".9"/>`;
    if (o.hat) g += `<path d="M34 30 Q34 14 50 14 Q66 14 66 30 Q58 25 50 25 Q42 25 34 30 Z" fill="${o.hat}"/><rect x="34" y="27" width="32" height="5" rx="2.5" fill="${o.hat}" opacity=".85"/>`;
    else g += `<path d="M35 31 Q34 15 50 16 Q66 15 65 31 Q62 22 50 22 Q38 22 35 31 Z" fill="${hair}"/>`;
    if (o.scarf) g += `<path d="M38 52 Q50 60 62 52 L62 57 Q50 64 38 57 Z" fill="${o.scarf}"/>`;
    if (s.flags && s.flags.dog && full) g += `<g transform="translate(76 104)"><ellipse cx="10" cy="12" rx="12" ry="7" fill="#b9733a"/><circle cx="21" cy="5" r="6" fill="#b9733a"/><path d="M18 0 L20 -5 L23 0 Z" fill="#8a5428"/><circle cx="23" cy="4" r="1" fill="#222"/></g>`;
    return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Внешность героя">${g}</svg>`;
  };

  Sc.SKY = {
    dawn: ['#3a3f63', '#d98a6b'], day: ['#5d88b5', '#b8cde0'], evening: ['#2d2f55', '#e0864e'], night: ['#070b18', '#1c2846']
  };
  /* Скайлайн района: детерминированный набор домов, окна горят вечером/ночью */
  Sc.skyline = function (s) {
    const ph = T.phase(s), [top, bot] = Sc.SKY[ph];
    const seed = Object.keys(D.districts).indexOf(s.district) + 3;
    let r = seed * 9301; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    const lit = ph === 'night' ? 0.45 : ph === 'evening' ? 0.6 : ph === 'dawn' ? 0.25 : 0.05;
    const tall = s.district === 'business' || s.district === 'center' ? 1.2 : s.district === 'industrial' ? 0.8 : 1;
    let x = -10, b = '', w = '';
    const bcol = ph === 'day' ? '#3c4752' : ph === 'night' ? '#222c38' : '#2a2f3c';
    while (x < 420) {
      const bw = 30 + rnd() * 50, bh = Math.min(280, (110 + rnd() * 130) * tall);
      b += `<rect x="${x.toFixed(0)}" y="${(300 - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" fill="${bcol}" opacity="${(0.85 + rnd() * 0.15).toFixed(2)}"/>`;
      for (let wy = 300 - bh + 10; wy < 290; wy += 14) for (let wx = x + 6; wx < x + bw - 8; wx += 11) if (rnd() < lit) { const tw = rnd() < 0.18; w += `<rect ${tw ? `class="tw" style="animation-delay:${(rnd() * 6).toFixed(1)}s"` : ''} x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="5" height="7" fill="#ffd27a" opacity="${(0.6 + rnd() * 0.4).toFixed(2)}"/>`; }
      if (s.district === 'industrial' && rnd() < 0.3) b += `<rect x="${(x + bw / 2).toFixed(0)}" y="${(300 - bh - 50).toFixed(0)}" width="9" height="50" fill="${bcol}"/>`;
      x += bw + 2;
    }
    const sun = ph === 'night' ? `<circle cx="320" cy="60" r="16" fill="#e8ecf5" opacity=".85"/>` : ph === 'day' ? `<circle cx="300" cy="50" r="22" fill="#fff4c9" opacity=".9"/>` : `<circle cx="80" cy="170" r="26" fill="#ffb26b" opacity=".85"/>`;
    const water = s.district === 'embankment' ? `<rect x="0" y="270" width="400" height="30" fill="#2a4a63" opacity=".9"/>` : '';
    return `<svg class="skyline" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs><rect width="400" height="300" fill="url(#sk)"/>${sun}${b}${w}${water}</svg>`;
  };

  Sc.TINT = {
    dawn: 'linear-gradient(180deg,#ff9a6a33,transparent 45%,#0b101ae6 92%)',
    day: 'linear-gradient(180deg,transparent 35%,#0b101ae6 90%)',
    evening: 'linear-gradient(180deg,#ff7a2d3a,transparent 40%,#0b101ae6 90%)',
    night: 'linear-gradient(180deg,#0a143066,transparent 40%,#060a12ee 90%)'
  };
  /* Фото — когда герой без крыши над головой в Старом районе: атмосфера старта.
     Иначе — иллюстрированный район и фигура героя. */
  Sc.html = function (s) {
    const ph = T.phase(s), w = s.weather || { kind: 'clear' };
    const photo = s.housing === 'street' && s.district === 'old';
    const bg = photo ? `<div class="bg" style="background-image:url('assets/scene.webp')"></div>` : Sc.skyline(s) + `<div class="hero-figure">${Sc.avatar(s, true)}</div>`;
    const wx = ['rain', 'snow', 'storm'].includes(w.kind) ? `<div class="wx ${w.kind}"></div>` : '';
    const tint = photo ? Sc.TINT[ph] : 'linear-gradient(180deg,transparent 45%,#0b101acc 78%,#0b101af2 96%)';
    const sky = ph === 'night' ? '<div class="stars"></div>' : (ph === 'day' && !['rain', 'snow', 'storm'].includes(w.kind) ? '<div class="clouds"><i></i><i></i><i></i></div><svg class="birds" viewBox="0 0 60 20" aria-hidden="true"><path d="M2 10 q4 -5 8 0 q4 -5 8 0" /><path d="M30 6 q3 -4 6 0 q3 -4 6 0" /></svg>' : ph === 'evening' || ph === 'dawn' ? '<div class="clouds warm"><i></i><i></i></div>' : '');
    return bg + sky + `<div class="tint" style="background:${tint}"></div>` + wx;
  };
})(typeof window !== 'undefined' ? window : globalThis);
