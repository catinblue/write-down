/**
 * Snowy mode — the "fluffy goose-feather snow" pass.
 *
 * Each flake is a soft puff (dense core + wide halo) instead of a dot.
 * Three layers at different scales; flakes are roughly 60% more present
 * overall. Background: deep violet → dark blue → near-black vertical
 * gradient plus corner nebula glows and a warm-dim horizon near the
 * bottom (subtle "there's a house somewhere below" hint).
 */

export const SNOW_FRAG = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// fluffy puff: core + halo (two smoothsteps summed)
float puff(vec2 d, float r) {
  float dist = length(d);
  float core = smoothstep(r, r * 0.2, dist);
  float halo = smoothstep(r * 1.7, r * 0.7, dist) * 0.35;
  return core + halo * (1.0 - core);
}

float snowLayer(vec2 uv, vec2 grid, float flakeR, float fallSpeed, float windAmp, float density) {
  vec2 gUV = uv * grid;
  vec2 id = floor(gUV);
  vec2 st = fract(gUV);

  float h = hash21(id);
  float phase = h * 6.2831853;
  float t = fract(iTime * fallSpeed * 0.12 + phase);

  float fallY = 1.0 - t;
  float wind = sin(iTime * 0.18 + fallY * 4.0 + h * 3.0);
  float fallX = 0.5 + (h - 0.5) * 0.55 + wind * windAmp;

  // per-flake size variation
  float sizeVar = 0.7 + hash21(id + 3.3) * 0.6;
  float r = flakeR * sizeVar;

  vec2 d = (st - vec2(fallX, fallY)) * vec2(1.0, 0.9);
  float flake = puff(d, r);

  float present = step(0.35, hash21(id + 13.7)) * density;
  return flake * present;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // vertical gradient: violet top → cold blue → near-black
  vec3 bgTop = vec3(0.065, 0.045, 0.095);
  vec3 bgMid = vec3(0.030, 0.038, 0.068);
  vec3 bgBot = vec3(0.012, 0.018, 0.030);

  vec3 col = mix(bgTop, bgMid, smoothstep(0.0, 0.55, uv.y));
  col = mix(col, bgBot, smoothstep(0.5, 1.0, uv.y));

  float intensity = clamp(u_intensity, 0.0, 1.0);
  // Typing rhythm / release afterglow — driven from App.tsx. Pulls more
  // flakes into view, a soft "flurry" response to active writing.
  float pulse = clamp(u_pulse, 0.0, 1.0);
  intensity *= 1.0 + pulse * 0.30;

  // corner nebula glows (subtle aurora-like)
  vec2 p;
  p = uv - vec2(0.22, 0.18);
  col += vec3(0.18, 0.08, 0.28) * exp(-length(p) * 2.2) * 0.28;
  p = uv - vec2(0.78, 0.12);
  col += vec3(0.06, 0.12, 0.24) * exp(-length(p) * 2.8) * 0.20;
  p = uv - vec2(0.14, 0.78);
  col += vec3(0.10, 0.07, 0.22) * exp(-length(p) * 3.2) * 0.13;

  // warm distant horizon — hints at a light source "below the landscape"
  float horizon = smoothstep(0.8, 1.0, uv.y) * smoothstep(1.05, 0.65, abs(uv.x - 0.5) * 2.0);
  col += vec3(0.10, 0.055, 0.025) * horizon * 0.15;

  // snow layers: near big slow → mid → far small fast
  vec3 flakeColor = vec3(0.95, 0.97, 1.0);
  col += flakeColor * snowLayer(uv, vec2(9.0, 3.2), 0.032, 0.30, 0.22, intensity * 0.95);
  col += flakeColor * snowLayer(uv + vec2(0.17, 0.0), vec2(16.0, 5.5), 0.018, 0.55, 0.16, intensity * 0.85);
  col += flakeColor * snowLayer(uv + vec2(0.41, 0.31), vec2(28.0, 10.0), 0.010, 0.95, 0.08, intensity * 0.75) * 0.8;

  // fog — cold violet blend
  float fog = clamp(u_blur, 0.0, 1.0);
  col = mix(col, vec3(0.045, 0.04, 0.075), fog * 0.45);

  // vignette
  float vig = smoothstep(1.08, 0.3, length(uv - 0.5));
  col *= vig;

  // grain
  float grain = hash21(fragCoord + fract(iTime));
  col += (grain - 0.5) * 0.015;

  fragColor = vec4(col, 1.0);
}
`;
