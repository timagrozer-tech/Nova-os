// NOVA "Neon Signal": black field, cyan line-art waves, red rings, halftone dots,
// glitch fragments and the NOVA mark. Original procedural artwork for NOVA OS.
async function draw() {
  const S = W / 3840, cx = W / 2, cy = H * 0.47;
  const CY = '#33e6e6', CYD = '#1a8f96', RED = '#ff2a3d';
  const ctx = canvas.getContext('2d');
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.6);
  bg.addColorStop(0, '#0d1113'); bg.addColorStop(1, '#030405');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round';

  function halftone(x, y, w, h, color, step, dir) {
    for (let yy = y; yy < y + h; yy += step) for (let xx = x; xx < x + w; xx += step) {
      const t = dir === 'x' ? (xx - x) / w : (yy - y) / h;
      const r = step * 0.42 * (1 - t);
      if (r > 0.6) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  // red ring behind the emblem
  ctx.save(); ctx.shadowColor = RED; ctx.shadowBlur = 30 * S;
  ctx.strokeStyle = RED; ctx.lineWidth = 46 * S;
  ctx.beginPath(); ctx.arc(cx, cy, 430 * S, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 430 * S, -Math.PI * 0.38, Math.PI * 0.38); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 470 * S, 0, Math.PI * 2); ctx.arc(cx, cy, 380 * S, 0, Math.PI * 2, true); ctx.clip('evenodd');
  halftone(cx - 520 * S, cy - 520 * S, 1040 * S, 1040 * S, 'rgba(255,42,61,0.55)', 22 * S, 'y'); ctx.restore();
  // concentric broken cyan arcs (signal waves) on both sides
  for (let k = 0; k < 9; k++) {
    const r = (560 + k * 110) * S;
    for (const side of [0, 1]) {
      const base = side ? 0 : Math.PI;
      let a = base - 0.75 + rnd() * 0.15;
      while (a < base + 0.75) {
        const len = range(0.06, 0.32);
        ctx.strokeStyle = rnd() < 0.85 ? CY : CYD; ctx.lineWidth = range(5, 14) * S * (1 - k * 0.06);
        ctx.globalAlpha = 1 - k * 0.08;
        ctx.beginPath(); ctx.arc(cx, cy, r, a, Math.min(a + len, base + 0.75)); ctx.stroke();
        a += len + range(0.03, 0.12);
      }
    }
  }
  ctx.globalAlpha = 1;
  // flowing strands (abstract wings): coherent bundles that sweep outwards
  for (const s of [-1, 1]) {
    for (let b = 0; b < 3; b++) {
      const by = cy + (-330 + b * 230) * S, lift = (-560 + b * 330) * S;
      for (let i = 0; i < 9; i++) {
        const j = (i - 4) * 16 * S, y0 = by + j;
        const x0 = cx + s * 330 * S, x3 = cx + s * (1500 + i * 30 - b * 120) * S, y3 = by + lift + j * 3.2;
        ctx.strokeStyle = i % 4 === 0 ? CYD : CY; ctx.globalAlpha = 0.95 - Math.abs(i - 4) * 0.08;
        ctx.lineWidth = (8 - Math.abs(i - 4)) * S + 2 * S;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x0 + s * 520 * S, y0 - 420 * S + j * 2, x3 - s * 420 * S, y3 + 360 * S - j, x3, y3);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  // glitch fragments
  for (let i = 0; i < 60; i++) {
    const s = rnd() < 0.5 ? -1 : 1, x = cx + s * range(500, 1700) * S, y = cy + range(-700, 650) * S;
    ctx.fillStyle = rnd() < 0.9 ? CY : RED; ctx.globalAlpha = range(0.4, 1);
    ctx.fillRect(x, y, range(20, 160) * S, range(5, 18) * S);
  }
  ctx.globalAlpha = 1;
  halftone(cx - 1500 * S, cy - 200 * S, 500 * S, 600 * S, 'rgba(51,230,230,0.35)', 26 * S, 'x');
  ctx.save(); ctx.translate(2 * cx, 0); ctx.scale(-1, 1);
  halftone(cx - 1500 * S, cy - 200 * S, 500 * S, 600 * S, 'rgba(51,230,230,0.35)', 26 * S, 'x'); ctx.restore();

  // emblem: black disc + cyan outlined NOVA mark with red core lines
  ctx.fillStyle = '#050607'; ctx.beginPath(); ctx.arc(cx, cy, 360 * S, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = CY; ctx.lineWidth = 8 * S; ctx.beginPath(); ctx.arc(cx, cy, 360 * S, 0, Math.PI * 2); ctx.stroke();
  const m = 520 * S;
  ctx.save(); ctx.shadowColor = CY; ctx.shadowBlur = 40 * S; ctx.lineWidth = 14 * S; ctx.lineJoin = 'round';
  novaMark(ctx, cx - m / 2, cy - m / 2, m, null, CY); ctx.restore();
  ctx.save(); ctx.lineWidth = 5 * S; novaMark(ctx, cx - m / 2 + 10 * S, cy - m / 2 + 10 * S, m - 20 * S, null, rgba(RED, 0.8)); ctx.restore();
  // twin red marks (like HUD indicators)
  ctx.fillStyle = RED;
  for (const s of [-1, 1]) { ctx.save(); ctx.translate(cx + s * 240 * S, cy - 470 * S); ctx.rotate(s * 0.25);
    ctx.fillRect(-14 * S, -90 * S, 28 * S, 180 * S); ctx.restore(); }
  // label
  ctx.save(); ctx.fillStyle = RED; ctx.font = `700 ${Math.round(150 * S)}px "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillText('01', cx, cy + 640 * S);
  ctx.font = `600 ${Math.round(40 * S)}px "DejaVu Sans Mono", monospace`; ctx.fillStyle = CY;
  ctx.fillText('N O V A  //  S I G N A L', cx, cy + 720 * S); ctx.restore();
  vignette(ctx, 0.5, '#000000');
  grain(ctx, 0.07);
}
