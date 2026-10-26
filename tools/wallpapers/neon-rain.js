// NOVA "Neon Rain": a rainy night city seen through a window, neon signs, bokeh,
// raindrops refracting the street. Original procedural artwork for NOVA OS.
async function draw() {
  const S = W / 3840;
  const ctx = canvas.getContext('2d');
  // Window opening (the glass) in canvas coordinates.
  const WX = 0.215 * W, WY = 0.0 * H, WW = 0.62 * W, WH = 0.705 * H;

  // ---------------- City (drawn sharp, blurred later) ----------------
  const [city, c] = layer();
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0b0d22'); sky.addColorStop(0.45, '#1a1638'); sky.addColorStop(0.75, '#3a2347'); sky.addColorStop(1, '#5a2c3c');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  // distant haze glow
  const haze = c.createRadialGradient(W * 0.55, H * 0.72, 10, W * 0.55, H * 0.72, W * 0.5);
  haze.addColorStop(0, 'rgba(255,120,150,0.35)'); haze.addColorStop(1, 'rgba(255,120,150,0)');
  c.fillStyle = haze; c.fillRect(0, 0, W, H);

  const warm = ['#ffd38a', '#ffc46b', '#ffe2a8', '#fff1c9'];
  const cool = ['#cfe6ff', '#a9d4ff', '#e8f3ff'];
  function building(x, top, w, base, shade, density, cold) {
    c.fillStyle = shade; c.fillRect(x, top, w, base - top);
    const cw = Math.max(6 * S, w / Math.round(range(11, 19))), ch = cw * range(0.55, 0.95);
    for (let yy = top + ch * 0.6; yy < base - ch; yy += ch * range(1.5, 1.9)) {
      for (let xx = x + cw * 0.35; xx < x + w - cw; xx += cw * 1.45) {
        if (rnd() < density) {
          c.fillStyle = pick(cold && rnd() < 0.6 ? cool : warm);
          c.globalAlpha = range(0.35, 1); c.fillRect(xx, yy, cw * range(0.7, 0.95), ch * 0.8); c.globalAlpha = 1;
        }
      }
    }
  }
  // far layer
  for (let x = -100 * S; x < W; x += range(140, 320) * S) {
    const w = range(160, 360) * S; building(x, H * range(0.18, 0.42), w, H, '#1b1b38', 0.22, true);
  }
  // mid layer
  for (let x = -60 * S; x < W; x += range(260, 520) * S) {
    const w = range(300, 620) * S; building(x, H * range(0.05, 0.3), w, H, '#141329', 0.35, false);
  }
  // near buildings with clear structure
  for (let x = -40 * S; x < W; x += range(420, 760) * S) {
    const w = range(380, 700) * S, top = H * range(-0.05, 0.22);
    building(x, top, w, H, pick(['#11102a', '#151233', '#0e1430']), 0.42, rnd() < 0.4);
    c.fillStyle = 'rgba(160,170,255,0.10)'; c.fillRect(x, top, 3 * S, H - top); c.fillRect(x + w - 3 * S, top, 3 * S, H - top);
  }
  // neon signs: emissive panels with inner glyph strokes
  const neon = [['#ff3d6e', 0.9], ['#ff2bd6', 0.75], ['#29e6ff', 0.85], ['#4d7bff', 0.85], ['#ff9b2f', 0.8], ['#b14dff', 0.75]];
  function sign(x, y, w, h, col, a) {
    glowRect(c, x, y, w, h, col, 60 * S, a * 0.55);
    c.save(); c.globalAlpha = a; c.fillStyle = rgba(col, 0.35); c.fillRect(x, y, w, h);
    c.strokeStyle = col; c.lineWidth = 6 * S; c.shadowColor = col; c.shadowBlur = 30 * S; c.strokeRect(x + 8 * S, y + 8 * S, w - 16 * S, h - 16 * S);
    c.fillStyle = '#ffffff'; c.shadowBlur = 24 * S;
    const vertical = h > w; const n = Math.round(range(3, 6));
    for (let k = 0; k < n; k++) {
      if (vertical) c.fillRect(x + w * 0.3, y + h * (0.12 + k * 0.78 / n), w * 0.4, h * 0.6 / n);
      else c.fillRect(x + w * (0.08 + k * 0.84 / n), y + h * 0.3, w * 0.6 / n, h * 0.4);
    }
    c.restore();
  }
  const placed = [];
  for (let i = 0; i < 40 && placed.length < 10; i++) {
    const [col, a] = pick(neon);
    const vertical = rnd() < 0.4;
    const w = vertical ? range(70, 110) * S : range(200, 420) * S;
    const h = vertical ? range(260, 460) * S : range(80, 140) * S;
    const x = range(0.22, 0.82) * W, y = range(0.1, 0.62) * H;
    if (placed.some(p => x < p[0] + p[2] + 60 * S && p[0] < x + w + 60 * S && y < p[1] + p[3] + 60 * S && p[1] < y + h + 60 * S)) continue;
    placed.push([x, y, w, h]); sign(x, y, w, h, col, a);
  }
  // tall tower with vertical light strip (right side)
  const tx = WX + WW * 0.74;
  building(tx - 170 * S, -50, 420 * S, H, '#0f1530', 0.5, true);
  glowRect(c, tx + 40 * S, 0, 26 * S, H * 0.85, '#bfe8ff', 120 * S, 1);
  glowRect(c, tx + 44 * S, 0, 10 * S, H * 0.85, '#ffffff', 30 * S, 1);
  glowRect(c, tx - 260 * S, H * 0.52, 220 * S, 16 * S, '#36ff9c', 50 * S, 0.9);
  // street glow
  const street = c.createLinearGradient(0, H * 0.7, 0, H);
  street.addColorStop(0, 'rgba(255,150,80,0)'); street.addColorStop(1, 'rgba(255,170,90,0.55)');
  c.fillStyle = street; c.fillRect(0, H * 0.6, W, H * 0.4);
  // bokeh lights
  for (let i = 0; i < 160; i++) {
    const [col] = pick(neon.concat([['#ffd38a'], ['#ffd38a'], ['#fff1c9']]));
    const r = range(10, 60) * S, x = range(0.15, 0.92) * W, y = range(0.3, 1.0) * H;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(0.7, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }

  // blurred city
  const [blurred, b] = layer();
  b.filter = `blur(${Math.round(7 * S)}px)`; b.drawImage(city, 0, 0); b.filter = 'none';

  // ---------------- Compose: room + window ----------------
  ctx.fillStyle = '#07060f'; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.beginPath(); ctx.rect(WX, WY, WW, WH); ctx.clip();
  ctx.drawImage(blurred, 0, 0);
  // condensation haze on glass
  const fog = ctx.createLinearGradient(0, WY, 0, WY + WH);
  fog.addColorStop(0, 'rgba(120,140,200,0.08)'); fog.addColorStop(1, 'rgba(200,140,180,0.10)');
  ctx.fillStyle = fog; ctx.fillRect(WX, WY, WW, WH);
  // rain streaks
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = WX + rnd() * WW, y = WY + rnd() * WH, len = range(40, 220) * S;
    ctx.strokeStyle = `rgba(210,225,255,${range(0.04, 0.16)})`; ctx.lineWidth = range(1, 2.6) * S;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.04, y + len); ctx.stroke();
  }
  // running drops with trails
  for (let i = 0; i < 70; i++) {
    const x = WX + rnd() * WW, y0 = WY + rnd() * WH * 0.7, len = range(120, 600) * S, r = range(4, 9) * S;
    ctx.strokeStyle = 'rgba(200,215,255,0.12)'; ctx.lineWidth = r * 0.7;
    ctx.beginPath(); ctx.moveTo(x, y0);
    for (let t = 0; t <= 1; t += 0.1) ctx.lineTo(x + Math.sin(t * 9 + i) * 4 * S, y0 + t * len);
    ctx.stroke();
  }
  // droplets refracting the (inverted) city
  for (let i = 0; i < 1000; i++) {
    const r = Math.pow(rnd(), 2.4) * 16 * S + 2.5 * S;
    const x = WX + rnd() * WW, y = WY + rnd() * WH;
    ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.08, 0, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x, y); ctx.scale(1, -1);
    const sw = r * 9;
    ctx.drawImage(blurred, x - sw / 2, y - sw / 2, sw, sw, -r, -r * 1.08, r * 2, r * 2.16);
    ctx.restore();
    const rim = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.1);
    rim.addColorStop(0, 'rgba(255,255,255,0.55)'); rim.addColorStop(0.25, 'rgba(255,255,255,0.0)');
    rim.addColorStop(0.8, 'rgba(0,0,0,0.0)'); rim.addColorStop(1, 'rgba(0,0,10,0.22)');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.08, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // window frame
  const frame = '#0c0a17';
  ctx.fillStyle = frame;
  ctx.fillRect(WX - 26 * S, 0, 26 * S, WH + 20 * S);
  ctx.fillRect(WX + WW, 0, 30 * S, WH + 20 * S);
  ctx.fillRect(WX - 26 * S, WY + WH, WW + 56 * S, 22 * S);
  // neon rim light on the frame edges
  ctx.fillStyle = 'rgba(140,170,255,0.35)'; ctx.fillRect(WX - 4 * S, 0, 3 * S, WH);
  ctx.fillStyle = 'rgba(255,120,190,0.30)'; ctx.fillRect(WX + WW + 1 * S, 0, 3 * S, WH);

  // left wall with soft light spill
  const wall = ctx.createLinearGradient(0, 0, WX, 0);
  wall.addColorStop(0, '#05040b'); wall.addColorStop(1, '#1a1730');
  ctx.fillStyle = wall; ctx.fillRect(0, 0, WX - 26 * S, H);
  // curtains (left and right) with folds
  function curtain(x0, x1, tint) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    const folds = 9;
    for (let k = 0; k <= folds; k++) {
      const t = k / folds; const v = 0.55 + 0.45 * Math.sin(t * Math.PI * 2.6 + 0.8);
      g.addColorStop(t, `rgba(${Math.round(tint[0] * v)},${Math.round(tint[1] * v)},${Math.round(tint[2] * v)},1)`);
    }
    ctx.fillStyle = g; ctx.fillRect(x0, 0, x1 - x0, H);
  }
  curtain(0.025 * W, 0.13 * W, [52, 44, 78]);
  curtain(WX + WW + 30 * S, W, [70, 58, 96]);
  // light falloff over the right curtain from the city
  const spill = ctx.createLinearGradient(WX + WW, 0, W, 0);
  spill.addColorStop(0, 'rgba(255,140,200,0.18)'); spill.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = spill; ctx.fillRect(WX + WW, 0, W - WX - WW, H);

  // window seat / sill
  const sillY = WY + WH + 22 * S;
  const sill = ctx.createLinearGradient(0, sillY, 0, H);
  sill.addColorStop(0, '#4a4366'); sill.addColorStop(0.06, '#353052'); sill.addColorStop(0.35, '#211d33'); sill.addColorStop(1, '#0d0b17');
  ctx.fillStyle = sill; ctx.beginPath();
  ctx.moveTo(0.07 * W, H); ctx.lineTo(0.12 * W, sillY); ctx.lineTo(0.94 * W, sillY); ctx.lineTo(0.98 * W, H); ctx.closePath(); ctx.fill();
  // reflection of the city on the polished sill
  ctx.save(); ctx.beginPath(); ctx.rect(0.12 * W, sillY, 0.82 * W, 0.11 * H); ctx.clip();
  ctx.globalAlpha = 0.20; ctx.translate(0, 2 * sillY); ctx.scale(1, -1);
  ctx.filter = `blur(${Math.round(10 * S)}px)`; ctx.drawImage(blurred, WX, WY, WW, WH, WX, WY, WW, WH); ctx.filter = 'none';
  ctx.restore();
  // sill front edge highlight
  ctx.fillStyle = 'rgba(190,170,255,0.25)'; ctx.fillRect(0.12 * W, sillY, 0.82 * W, 3 * S);
  // shelf below
  ctx.fillStyle = '#08070f'; ctx.fillRect(0.12 * W, H * 0.9, 0.82 * W, H * 0.1);
  ctx.fillStyle = 'rgba(120,110,180,0.15)'; ctx.fillRect(0.12 * W, H * 0.9, 0.82 * W, 2 * S);

  // plant silhouette (right of sill)
  const px = 0.79 * W, py = sillY + 0.02 * H;
  ctx.fillStyle = '#2b1f2c';
  ctx.beginPath(); ctx.moveTo(px - 130 * S, py - 150 * S); ctx.lineTo(px + 130 * S, py - 150 * S); ctx.lineTo(px + 100 * S, py + 40 * S); ctx.lineTo(px - 100 * S, py + 40 * S); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,150,190,0.25)'; ctx.fillRect(px + 92 * S, py - 148 * S, 10 * S, 180 * S);
  for (let i = 0; i < 22; i++) {
    const ang = range(-2.5, -0.6), len = range(180, 560) * S;
    const sx = px + range(-40, 40) * S, sy = py - 150 * S;
    const ex = sx + Math.cos(ang) * len * 0.6, ey = sy + Math.sin(ang) * len;
    ctx.strokeStyle = '#112018'; ctx.lineWidth = 6 * S; ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + (ex - sx) * 0.2, ey + (sy - ey) * 0.4, ex, ey); ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const t = range(0.4, 1); const lx = sx + (ex - sx) * t, ly = sy + (ey - sy) * t;
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(range(-1.4, 1.4));
      ctx.fillStyle = '#16301f'; ctx.beginPath(); ctx.ellipse(0, 0, range(40, 80) * S, range(18, 30) * S, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,255,200,0.12)'; ctx.lineWidth = 2 * S; ctx.stroke(); ctx.restore();
    }
  }
  // ambient neon light falling into the room
  const amb = ctx.createRadialGradient(WX + WW * 0.5, sillY, 10, WX + WW * 0.5, sillY, W * 0.55);
  amb.addColorStop(0, 'rgba(170,120,255,0.22)'); amb.addColorStop(0.5, 'rgba(255,90,180,0.07)'); amb.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = amb; ctx.fillRect(0, sillY - 0.2 * H, W, H); ctx.restore();
  // headphones on the sill
  const hx = 0.6 * W, hy = sillY + 0.075 * H;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3a3650'; ctx.lineWidth = 22 * S;
  ctx.beginPath(); ctx.ellipse(hx, hy - 10 * S, 150 * S, 70 * S, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,190,255,0.35)'; ctx.lineWidth = 4 * S;
  ctx.beginPath(); ctx.ellipse(hx, hy - 16 * S, 150 * S, 70 * S, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  for (const dx of [-155, 155]) {
    const g = ctx.createRadialGradient(hx + dx * S - 15 * S, hy - 20 * S, 5 * S, hx + dx * S, hy, 75 * S);
    g.addColorStop(0, '#5a5578'); g.addColorStop(0.6, '#2a2738'); g.addColorStop(1, '#141220');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(hx + dx * S, hy, 62 * S, 72 * S, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(190,200,255,0.35)'; ctx.lineWidth = 3 * S; ctx.stroke();
    ctx.fillStyle = '#0d0c16'; ctx.beginPath(); ctx.ellipse(hx + dx * S, hy, 34 * S, 42 * S, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#1d1a2b'; ctx.lineWidth = 5 * S; ctx.beginPath(); ctx.moveTo(hx + 155 * S, hy + 70 * S);
  ctx.bezierCurveTo(hx + 320 * S, hy + 190 * S, hx - 220 * S, hy + 170 * S, hx - 420 * S, hy + 120 * S); ctx.stroke();
  // notebook
  ctx.save(); ctx.translate(0.43 * W, sillY + 0.06 * H); ctx.rotate(-0.08);
  ctx.fillStyle = '#cfc9e6'; ctx.globalAlpha = 0.8; ctx.fillRect(-160 * S, -60 * S, 300 * S, 170 * S);
  ctx.fillStyle = 'rgba(80,70,120,0.5)'; for (let k = 0; k < 5; k++) ctx.fillRect(-130 * S, -30 * S + k * 26 * S, range(120, 220) * S, 5 * S);
  ctx.restore();

  vignette(ctx, 0.55, '#000000');
  grain(ctx, 0.08);
}
