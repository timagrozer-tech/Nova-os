// Shared helpers for NOVA wallpaper scenes (deterministic: seeded PRNG).
let _s = (SEED * 2654435761) >>> 0 || 1;
function rnd() { _s ^= _s << 13; _s >>>= 0; _s ^= _s >> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
function range(a, b) { return a + (b - a) * rnd(); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function layer(w, h) { const c = document.createElement('canvas'); c.width = w || W; c.height = h || H; return [c, c.getContext('2d')]; }
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function grain(ctx, amount) {
  const [g, gc] = layer(512, 512); const img = gc.createImageData(512, 512);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 255 * amount; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  gc.putImageData(img, 0, 0);
  ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.5;
  ctx.fillStyle = ctx.createPattern(g, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore();
}
function vignette(ctx, strength, color) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, rgba(color || '#000000', 0)); g.addColorStop(1, rgba(color || '#000000', strength));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function glowRect(ctx, x, y, w, h, color, blur, alpha) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.restore();
}
// Run a fragment shader (GLSL ES 3.00 body with mainImage(out vec4, in vec2)) into a canvas.
function shader(body, w, h) {
  const c = document.createElement('canvas'); c.width = w || W; c.height = h || H;
  const gl = c.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  const vs = `#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
  const fs = `#version 300 es\nprecision highp float;\nuniform vec2 R; uniform float SEEDF; out vec4 o;\n${body}\nvoid main(){ vec4 col; mainImage(col, gl_FragCoord.xy); o = col; }`;
  function comp(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const pr = gl.createProgram(); gl.attachShader(pr, comp(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, comp(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(gl.getUniformLocation(pr, 'R'), c.width, c.height);
  gl.uniform1f(gl.getUniformLocation(pr, 'SEEDF'), SEED);
  gl.viewport(0, 0, c.width, c.height); gl.drawArrays(gl.TRIANGLES, 0, 3);
  return c;
}
// NOVA "N" mark path in a 96x96 box.
function novaMark(ctx, x, y, size, fill, stroke) {
  const k = size / 96; const pts = [[24, 72], [24, 24], [33, 24], [62, 58], [62, 24], [72, 24], [72, 72], [63, 72], [34, 38], [34, 72]];
  ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + px * k, y + py * k)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
