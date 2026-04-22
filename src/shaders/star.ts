/**
 * Starry mode — boosted deep-space field.
 *
 * Over v1: brighter stars with bloom halos, two-layered FBM nebula with
 * stronger hues, heavier Milky Way band. Still no meteors — those are
 * painted by MeteorOverlay (2D canvas) over the top.
 */

export const STAR_FRAG = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// star with bloom — tight bright core + wide soft halo
vec3 stars(vec2 uv, float brightnessMul) {
  vec2 id = floor(uv);
  vec2 st = fract(uv) - 0.5;
  float h = hash21(id);
  float present = step(0.978, h);
  float brightness = (hash21(id + 7.7) * 0.7 + 0.3);
  float twinkle = 0.55 + 0.45 * sin(iTime * (0.8 + h * 2.4) + h * 6.2831853);

  float d = length(st);
  float core = smoothstep(0.1, 0.0, d);
  float halo = smoothstep(0.4, 0.0, d) * 0.18;
  float star = (core * 1.6 + halo) * present * brightness * twinkle * brightnessMul;

  // colour tint: warm/neutral/cool mix
  vec3 tint = vec3(0.92, 0.96, 1.0);
  if (hash21(id + 17.7) > 0.85) tint = vec3(1.0, 0.88, 0.72);
  else if (hash21(id + 27.7) > 0.9) tint = vec3(0.72, 0.86, 1.08);

  return tint * star;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  float intensity = clamp(u_intensity, 0.0, 1.0);
  float nebDensity = clamp(u_blur, 0.0, 1.0);
  // Typing rhythm / release afterglow — driven from App.tsx. Stars twinkle
  // brighter when the user is in flow; fades back to baseline on idle.
  float pulse = clamp(u_pulse, 0.0, 1.0);
  intensity *= 1.0 + pulse * 0.38;

  vec3 col = vec3(0.004, 0.006, 0.014);

  // nebula layer 1 — violet
  vec2 nebUV = uv * 1.6 + vec2(0.0, iTime * 0.003);
  float n1 = fbm(nebUV);
  col += vec3(0.28, 0.12, 0.42) * n1 * n1 * (0.18 + nebDensity * 0.15);

  // nebula layer 2 — cool teal
  float n2 = fbm(uv * 2.1 + vec2(3.7, 2.1) - iTime * 0.002);
  col += vec3(0.06, 0.15, 0.30) * n2 * n2 * (0.15 + nebDensity * 0.12);

  // nebula layer 3 — warm accent, very sparse
  float n3 = fbm(uv * 1.2 + vec2(7.3, -4.1));
  col += vec3(0.32, 0.16, 0.08) * pow(n3, 4.0) * 0.22;

  // Milky-Way band — rotated, compressed
  vec2 p = uv - 0.5;
  float c30 = 0.86602540378;
  float s30 = 0.5;
  vec2 rp = vec2(p.x * c30 - p.y * s30, p.x * s30 + p.y * c30);
  float band = exp(-rp.y * rp.y * 20.0) * 0.22;
  col += vec3(0.34, 0.24, 0.42) * band * (0.45 + 0.55 * n1);

  // stars — three scales
  col += stars(uv * 48.0, 1.7) * intensity;
  col += stars(uv * 88.0, 1.1) * intensity;
  col += stars(uv * 140.0, 0.65) * intensity;

  // subtle vignette
  float vig = smoothstep(1.18, 0.2, length(uv - 0.5));
  col *= vig;

  fragColor = vec4(col, 1.0);
}
`;
