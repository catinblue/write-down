// Hearth — "inside a warm room, looking at the fireplace."
//
// Visual vocabulary:
// - Deep amber glow rising from the bottom (the fireplace).
// - Two-segment vertical gradient: bright warm at the floor → warm haze mid →
//   warm brown-black ceiling. Never near-black — the whole room is lit.
// - Sparse slow-rising embers, cooling from bright yellow-orange to dark
//   amber as they drift up. Density gated so most grid cells have nothing,
//   preserving the "rare ember" feel the product brief asked for.
// - Subtle low-frequency flicker on the floor glow (two sines at ~2Hz and
//   ~5Hz). Never flashes — just breathing warmth.
// - Soft vignette for enclosure.
//
// Uniform semantics (per the MODE_UNIFORMS convention in App.tsx):
//   u_intensity → ember brightness multiplier (0 kills embers, 1 bright)
//   u_blur     → ember halo softness (higher = softer/more diffuse)

export const HEARTH_FRAG = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/**
 * One drifting ember per grid cell, gated by density so most cells are empty.
 * Each ember rises from cell-bottom (t=0) to cell-top (t=1), wobbling slightly
 * and cooling from bright amber to dark red as it ages.
 */
vec3 ember(vec2 uv, vec2 cellScale, float speed, float density, float blur) {
  vec2 grid = uv * cellScale;
  vec2 cell = floor(grid);
  vec2 local = fract(grid);

  // Density gate: hActive in [0,1], only cells below density threshold spawn an ember
  float hActive = hash21(cell + vec2(99.1, 17.3));
  if (hActive > density) return vec3(0.0);

  float h1 = hash21(cell);
  float h2 = hash21(cell + vec2(13.7, 5.2));
  float phase = h1 * 6.2831853;

  // Cell-local rise cycle
  float cellSpeed = speed * (0.7 + h1 * 0.6);
  float t = fract(iTime * cellSpeed + phase);

  // Base x position within the cell, plus horizontal wobble that grows with rise
  float baseX = 0.2 + h2 * 0.6;
  float wobble = sin(iTime * 1.1 + phase * 1.7) * 0.08 * t;
  vec2 pos = vec2(baseX + wobble, 1.0 - t);

  // Halo size: fresh embers are tight, cooling ones diffuse. blur fattens the halo.
  float size = 0.04 + h1 * 0.035 + t * 0.04 + blur * 0.025;

  float d = distance(local, pos);

  // Life curve: fade in quickly at birth, linger through the rise, fade into haze
  float life = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.45, t);

  // Heat cool-down: fresh embers are hot and bright; rising ones cool & dim
  float heat = 1.0 - t * 0.55;
  vec3 colorCool = vec3(0.85, 0.22, 0.04);
  vec3 colorHot  = vec3(1.50, 0.55, 0.15);
  vec3 col = mix(colorCool, colorHot, heat);

  return col * exp(-d / size) * life;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;
  float aspect = iResolution.x / iResolution.y;

  float intensity = clamp(u_intensity, 0.0, 1.0);
  float blur      = clamp(u_blur, 0.0, 1.0);
  // Typing rhythm / release afterglow — driven from App.tsx. Ember brightness
  // pulses up with activity; carries a slow decay after release to create
  // the "lingering warmth" afterglow the product brief asked for.
  float pulse = clamp(u_pulse, 0.0, 1.0);
  intensity *= 1.0 + pulse * 0.42;

  // === Warm atmospheric gradient ===
  // Two-segment so the transition from floor-glow to mid-warm has its own
  // smoothstep shape, separate from mid-to-ceiling fade.
  vec3 bottomGlow = vec3(0.55, 0.18, 0.045);
  vec3 midWarm    = vec3(0.12, 0.042, 0.016);
  vec3 topDeep    = vec3(0.035, 0.012, 0.004);

  float gradT = uv.y;
  vec3 base;
  if (gradT < 0.45) {
    base = mix(bottomGlow, midWarm, smoothstep(0.0, 0.45, gradT));
  } else {
    base = mix(midWarm, topDeep, smoothstep(0.45, 1.0, gradT));
  }

  // === Floor hotspot — elongated along horizontal for a fireplace-mouth feel ===
  vec2 glowOff = vec2((uv.x - 0.5) * aspect, uv.y);
  float glowDist = length(vec2(glowOff.x * 0.55, glowOff.y * 1.9));
  float glow = exp(-glowDist * 2.5);

  // Fire unsteadiness: two low-frequency sines, never exceeds ±12% brightness swing
  float flicker = 1.0 + 0.07 * sin(iTime * 2.1) + 0.04 * sin(iTime * 5.3 + 1.3);

  vec3 glowColor = vec3(1.0, 0.42, 0.12) * flicker;
  base += glowColor * glow * 0.95;

  // === Embers — three layers at decreasing size / increasing density ===
  vec3 emberLight = vec3(0.0);

  // Large, bright, very sparse — the "heroes"
  emberLight += ember(uv, vec2(3.0, 1.2), 0.045, 0.48, blur) * 0.95;

  // Medium, moderate density — the "companions"
  emberLight += ember(uv + vec2(0.31, 0.07), vec2(5.5, 2.5), 0.060, 0.30, blur) * 0.65;

  // Tiny, scattered — distant sparks
  emberLight += ember(uv + vec2(0.73, 0.23), vec2(9.0, 4.3), 0.080, 0.18, blur) * 0.40;

  base += emberLight * intensity;

  // === Soft vignette for enclosure ===
  vec2 vigUV = uv - 0.5;
  float vig = 1.0 - dot(vigUV, vigUV) * 0.85;
  base *= vig;

  // Never output negative channels
  base = max(base, vec3(0.0));

  fragColor = vec4(base, 1.0);
}
`;
