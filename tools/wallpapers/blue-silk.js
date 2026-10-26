// NOVA "Blue Silk": layered folds of glossy blue fabric on deep navy, with a
// frosted glass strip and the NOVA mark. Original procedural artwork for NOVA OS.
async function draw() {
  const S = W / 3840;
  const ctx = canvas.getContext('2d');
  const silk = shader(`
const float PI = 3.14159265;
float fold(vec2 p){
  vec2 q = p + 0.18*vec2(sin(p.y*2.7+0.4), sin(p.x*2.2+1.7));
  float r = length(q);
  float a = atan(q.y, q.x);
  // ruffled rosette: radial sheets with petal-like waves
  return r*9.0 + 0.55*sin(a*5.0 + r*6.0) + 0.25*sin(a*9.0 - r*11.0 + 1.3) + 0.35*sin(q.x*3.0+q.y*2.0);
}
void mainImage(out vec4 col, in vec2 fc){
  vec2 uv = (fc - 0.5*R) / R.y;
  uv.y = -uv.y;
  vec2 c0 = vec2(0.0, 0.03);
  vec2 p = (uv - c0) * vec2(0.82, 1.0);
  vec3 bg = mix(vec3(0.035,0.07,0.16), vec3(0.008,0.014,0.04), smoothstep(0.05,1.0,length(uv*vec2(0.7,1.0))));
  float L = fold(p);
  float f = fract(L), id = floor(L);
  float e = 1.0/R.y;
  vec2 g = vec2(fold(p+vec2(e,0.0))-fold(p-vec2(e,0.0)), fold(p+vec2(0.0,e))-fold(p-vec2(0.0,e)));
  vec2 gd = normalize(g + 1e-6);
  // each sheet curls: its normal tilts along the gradient from back (f=0) to lip (f=1)
  float ang = (f - 0.5) * PI * 0.9;
  vec3 n = normalize(vec3(gd * sin(ang), cos(ang) * 0.75));
  vec3 l = normalize(vec3(-0.5, 0.55, 0.65));
  float diff = clamp(dot(n, l), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 40.0);
  float shadow = mix(0.18, 1.0, smoothstep(0.0, 0.35, f));          // under the next sheet
  float lip = smoothstep(0.86, 0.99, f) * (1.0 - smoothstep(0.99, 1.0, f));
  float tone = 0.8 + 0.2 * sin(id * 2.3 + SEEDF);
  vec3 deep = vec3(0.01, 0.05, 0.32), mid = vec3(0.05, 0.25, 0.95), hi = vec3(0.62, 0.80, 1.0);
  vec3 c = mix(deep, mid, pow(diff, 1.2) * tone);
  c = mix(c, hi, clamp(spec * 0.8 + lip * 0.45 * diff, 0.0, 1.0));
  c *= shadow;
  c += vec3(0.03, 0.10, 0.40) * (1.0 - diff) * 0.25;
  // shape of the bloom of sheets: fades into darkness at the rim
  float r = length(p);
  float edge = 0.62 + 0.06 * sin(atan(p.y, p.x) * 3.0 + 1.0);
  float mask = 1.0 - smoothstep(edge - 0.03, edge + 0.01, r + 0.02 * sin(L * PI * 2.0));
  float core = smoothstep(0.0, 0.08, r);
  c = mix(vec3(0.02, 0.06, 0.25), c, core);
  c *= mix(0.55, 1.0, smoothstep(edge, edge - 0.3, r));
  vec3 outc = mix(bg, c, mask);
  outc += vec3(0.02, 0.06, 0.22) * exp(-max(r - edge, 0.0) * 5.0) * (1.0 - mask);
  col = vec4(outc, 1.0);
}`, W, H);
  ctx.drawImage(silk, 0, 0);

  // frosted glass strip in the centre (echo of the reference composition)
  const sx = W * 0.455, sw = W * 0.09;
  ctx.save();
  ctx.beginPath(); ctx.rect(sx, 0, sw, H); ctx.clip();
  ctx.filter = `blur(${Math.round(60 * S)}px) brightness(1.35) saturate(1.25)`; ctx.drawImage(silk, 0, 0); ctx.filter = 'none';
  const glass = ctx.createLinearGradient(sx, 0, sx + sw, 0);
  glass.addColorStop(0, 'rgba(255,255,255,0.16)'); glass.addColorStop(0.18, 'rgba(255,255,255,0.05)');
  glass.addColorStop(0.82, 'rgba(255,255,255,0.03)'); glass.addColorStop(1, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = glass; ctx.fillRect(sx, 0, sw, H);
  ctx.restore();
  ctx.fillStyle = 'rgba(200,225,255,0.45)'; ctx.fillRect(sx, 0, 2 * S, H); ctx.fillRect(sx + sw - 2 * S, 0, 2 * S, H);
  // NOVA mark on the glass
  const m = 260 * S;
  ctx.save(); ctx.shadowColor = 'rgba(120,180,255,0.9)'; ctx.shadowBlur = 40 * S;
  novaMark(ctx, sx + sw / 2 - m / 2, H * 0.5 - m / 2, m, 'rgba(235,245,255,0.92)');
  ctx.restore();
  vignette(ctx, 0.35, '#000010');
  grain(ctx, 0.05);
}
