/* С НУЛЯ — утилиты, шина событий, детерминированный ГПСЧ */
(function (G) {
  'use strict';
  const SN = G.SN = G.SN || {};
  SN.VERSION = '0.2.0';
  SN.SAVE_VERSION = 2;
  SN.D = SN.D || {};      // данные
  SN.Sys = SN.Sys || {};  // игровые системы

  const U = SN.U = {};
  U.clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
  U.num = x => Math.round(x).toLocaleString('ru-RU');
  U.money = x => (x < 0 ? '−' : '') + Math.abs(Math.round(x)).toLocaleString('ru-RU') + ' ₽';
  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.pick = (s, arr) => arr[Math.floor(U.rand(s) * arr.length)];
  U.hrs = h => { const m = Math.round(h * 60); return m < 60 ? m + ' мин' : (m % 60 ? (m / 60).toFixed(1).replace('.', ',') : m / 60) + ' ч'; };
  U.plural = (n, a, b, c) => { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return c; if (n1 > 1 && n1 < 5) return b; if (n1 === 1) return a; return c; };

  /* mulberry32 — состояние ГПСЧ хранится в сохранении, поэтому
     переходы дней и случайные события воспроизводимы после перезагрузки */
  U.rand = function (s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  U.randRange = (s, a, b) => a + (b - a) * U.rand(s);
  U.chance = (s, p) => U.rand(s) < p;
  U.gauss = s => { let u = 0, v = 0; while (!u) u = U.rand(s); v = U.rand(s); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* FNV-1a для контроля целостности сохранений */
  U.hash = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  /* Шина событий: системы не знают о DOM, интерфейс подписывается */
  const subs = {};
  SN.on = (ev, fn) => (subs[ev] = subs[ev] || []).push(fn);
  SN.emit = (ev, data) => (subs[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });
  SN.say = (msg, kind) => SN.emit('toast', { msg, kind: kind || 'info' });
  SN.fail = msg => { SN.say(msg, 'bad'); return { ok: false, msg }; };
  SN.okr = msg => ({ ok: true, msg });
})(typeof window !== 'undefined' ? window : globalThis);
