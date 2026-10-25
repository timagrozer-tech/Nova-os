// NOVA "Paper": calm off-white canvas with a twisting satin ribbon (navy with
// white stripes on the front, lighter blue on the back) and soft watercolour
// washes. Light-theme wallpaper. Original artwork for NOVA OS.
async function draw() {
  const S = W / 3840;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.5, W * 0.65);
  bg.addColorStop(0, '#fcfcfd'); bg.addColorStop(0.7, '#f0f2f5'); bg.addColorStop(1, '#dde1e8');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // watercolour washes
  for (const [x, y, r, c, a] of [[0.18, 0.28, 0.32, '#9fb9ff', 0.16], [0.82, 0.2, 0.28, '#b9d4ff', 0.18], [0.7, 0.85, 0.35, '#a6b8f0', 0.14], [0.3, 0.9, 0.25, '#cfdcff', 0.2]]) {
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  function ribbon(y0, amp, ph, width, twists, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  const N = 900, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = -0.06 * W + t * 1.12 * W;
    const y = H * (y0 + amp * Math.sin(t * 4.6 + ph) + 0.03 * Math.sin(t * 11.0 + 1.0 + ph));
    const twist = Math.cos(t * Math.PI * twists + 0.7 + ph);             // -1..1: back/front
    pts.push({ x, y, w: width * (0.55 + 0.45 * Math.abs(twist)) * S, side: twist >= 0 ? 1 : -1, k: Math.abs(twist) });
  }
  // shadow
  ctx.save(); ctx.filter = `blur(${Math.round(36 * S)}px)`; ctx.fillStyle = 'rgba(25,45,95,0.16)';
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x, p.y + 60 * S + p.w * 0.5));
  for (let i = N; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y + 60 * S - pts[i].w * 0.5); ctx.fill(); ctx.restore();
  // body as quads with per-segment shading
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1];
    const nx = -(b.y - a.y), ny = b.x - a.x, l = Math.hypot(nx, ny) || 1;
    const ux = nx / l, uy = ny / l;
    const light = 0.55 + 0.45 * a.k;
    const front = a.side > 0;
    const base = front ? [24, 56, 150] : [86, 126, 222];
    ctx.fillStyle = `rgb(${Math.round(base[0] * light + 20 * a.k)},${Math.round(base[1] * light + 25 * a.k)},${Math.round(base[2] * light + 30 * a.k)})`;
    ctx.beginPath();
    ctx.moveTo(a.x + ux * a.w / 2, a.y + uy * a.w / 2); ctx.lineTo(b.x + ux * b.w / 2, b.y + uy * b.w / 2);
    ctx.lineTo(b.x - ux * b.w / 2, b.y - uy * b.w / 2); ctx.lineTo(a.x - ux * a.w / 2, a.y - uy * a.w / 2);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2.2 * S; ctx.stroke();
    if (front && a.k > 0.25) { // white stripes on the front side
      ctx.strokeStyle = `rgba(255,255,255,${0.95 * a.k})`; ctx.lineWidth = 6 * S * a.k + 1;
      for (const f of [-0.32, 0.32]) {
        ctx.beginPath(); ctx.moveTo(a.x + ux * a.w * f, a.y + uy * a.w * f); ctx.lineTo(b.x + ux * b.w * f, b.y + uy * b.w * f); ctx.stroke();
      }
    }
    // satin sheen
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * a.k * a.k})`; ctx.lineWidth = 10 * S;
    ctx.beginPath(); ctx.moveTo(a.x + ux * a.w * 0.12, a.y + uy * a.w * 0.12); ctx.lineTo(b.x + ux * b.w * 0.12, b.y + uy * b.w * 0.12); ctx.stroke();
  }
  ctx.restore();
  }
  ribbon(0.58, 0.07, 2.2, 46, 4.4, 0.55);
  ribbon(0.66, 0.09, 0.4, 130, 3.2, 1.0);
  ctx.fillStyle = 'rgba(40,55,85,0.5)'; ctx.font = `300 ${Math.round(44 * S)}px "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center'; ctx.fillText('N  O  V  A', W * 0.5, H * 0.95);
  grain(ctx, 0.03);
}
