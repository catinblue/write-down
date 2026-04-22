/**
 * Rain-on-window shader. Original implementation.
 *
 * Layers:
 *   - Distant background light haze (4 sources, slow drift, dim — creates depth)
 *   - Foreground neon bokeh (7 sources, hex aperture, chromatic aberration)
 *   - Static mist droplets (fine grid)
 *   - Near falling drops (large, slow, long trails)
 *   - Far falling drops (small, faster, subtler — adds rain volume)
 *
 * Refraction is approximated by the drop's local normal displacing UV used
 * to sample the bokeh. Not physically correct, but cheap and convincingly wet.
 *
 * Uniforms:
 *   u_intensity  — 0..1 rain density
 *   u_blur       — 0..1 fog/defocus mix toward cold dim color
 */

export const RAIN_FRAG = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Soft rotating hue palette
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + t));
}

// Hexagonal aperture mask. p centered on the light, size in UV units.
// Returns 1 inside the hex, 0 outside, soft edge.
float hexMask(vec2 p, float size) {
  vec2 q = abs(p) / size;
  // flat-top hex SDF — softened edges so backdrop-blur has something to smear
  float d = max(dot(q, vec2(0.8660254, 0.5)), q.y);
  return 1.0 - smoothstep(0.75, 1.25, d);
}

// Distant background haze — slow dim lights for spatial depth
vec3 bgLights(vec2 uv) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 p = vec2(
      0.5 + 0.8 * sin(fi * 2.31 + iTime * 0.014),
      0.5 + 0.7 * cos(fi * 1.87 + iTime * 0.011 + fi)
    );
    float d = length(uv - p);
    float glow = exp(-d * 2.3) * 0.045;
    vec3 c = palette(fi * 0.27 + 0.55);
    col += c * glow;
  }
  return col;
}

// Foreground bokeh with chromatic aberration + hex aperture
vec3 bokeh(vec2 uv) {
  vec3 col = vec3(0.0);
  // per-channel UV shift for chromatic aberration — R goes one way, B the other
  const vec2 caR = vec2( 0.0055, 0.0012);
  const vec2 caB = vec2(-0.0055,-0.0012);

  for (int i = 0; i < 13; i++) {
    float fi = float(i);
    // Perimeter walk — parameter t walks around the screen edges. All
    // lights end up framing the card, none sitting behind it. Each
    // quadrant gets its proportional share of the 13 lights.
    float t = (fi + 0.15 + hash21(vec2(fi, 7.7)) * 0.65) / 13.0;
    float inner = 0.07 + 0.13 * hash21(vec2(fi, 17.7));  // distance from screen edge
    vec2 basePos;
    if (t < 0.28) {
      // top
      basePos = vec2(0.05 + (t / 0.28) * 0.9, inner);
    } else if (t < 0.5) {
      // right
      basePos = vec2(1.0 - inner, 0.05 + ((t - 0.28) / 0.22) * 0.9);
    } else if (t < 0.78) {
      // bottom
      basePos = vec2(0.95 - ((t - 0.5) / 0.28) * 0.9, 1.0 - inner);
    } else {
      // left
      basePos = vec2(inner, 0.95 - ((t - 0.78) / 0.22) * 0.9);
    }
    // slow organic drift (small, keeps light on its edge)
    vec2 drift = 0.03 * vec2(
      cos(iTime * 0.19 + fi * 0.73),
      sin(iTime * 0.22 + fi * 1.11)
    );
    vec2 lightPos = basePos + drift;

    vec3 c = palette(fi * 0.19 + 0.05);
    c = mix(c, vec3(1.0), 0.32);

    // per-channel sample of the hex core — gives the bokeh chromatic-fringed edges
    float coreR = hexMask((uv + caR) - lightPos, 0.026) * exp(-length((uv + caR) - lightPos) * 13.0);
    float coreG = hexMask( uv         - lightPos, 0.026) * exp(-length( uv         - lightPos) * 13.0);
    float coreB = hexMask((uv + caB) - lightPos, 0.026) * exp(-length((uv + caB) - lightPos) * 13.0);
    vec3 core = vec3(coreR, coreG, coreB);

    // halo — radial, no CA, tinted by the light color
    float d = length(uv - lightPos);
    float halo = exp(-d * 8.5) * 0.09;
    float farGlow = exp(-d * 2.6) * 0.02;

    col += c * (core * 2.3 + halo + farGlow);
  }
  return col;
}

// Static mist droplets
vec2 staticDrops(vec2 uv, float intensity) {
  vec2 grid = vec2(45.0, 65.0);
  vec2 gUV = uv * grid;
  vec2 id = floor(gUV);
  vec2 st = fract(gUV) - 0.5;
  float h = hash21(id);
  float present = step(0.55, h);
  float size = 0.28 * intensity * (0.3 + 0.7 * hash21(id + 7.13));
  float d = length(st);
  float m = smoothstep(size, size * 0.4, d) * present;
  vec2 n = st / max(d, 1e-4);
  return n * m * 0.045 * intensity;
}

// Falling drops layer — parametric so we can stack near + far
// returns (refractX, refractY, drop_mask)
vec3 fallingLayer(vec2 uv, float intensity, vec2 grid, float baseSpeed, float dropR_mul, float trailStrength) {
  vec2 gUV = uv * grid;
  vec2 id = floor(gUV);
  vec2 st = fract(gUV);

  float h1 = hash21(id);
  float h2 = hash21(id + 37.77);

  float speed = baseSpeed + h1 * baseSpeed * 0.55;
  float phase = h2 * 6.2831853;
  float cycle = fract(iTime * speed * 0.18 + phase);

  float dropY = 1.05 - cycle * 1.1;
  float dropX = 0.5 + 0.35 * (h1 - 0.5);
  vec2 dropPos = vec2(dropX, dropY);

  vec2 d = (st - dropPos) * vec2(1.0, 0.7);
  float dropDist = length(d);
  float dropR = dropR_mul * intensity;
  float drop = smoothstep(dropR, dropR * 0.2, dropDist);

  float trailX = abs(st.x - dropX);
  float trailW = 0.012 * intensity;
  float onTrailX = smoothstep(trailW, 0.0, trailX);
  float aboveDrop = smoothstep(dropY - 0.02, dropY - 0.01, st.y);
  float trailFade = smoothstep(1.0, dropY, st.y);
  float trail = onTrailX * aboveDrop * trailFade * trailStrength;

  float mask = max(drop, trail * (1.0 - drop));
  vec2 n = d / max(dropDist, 1e-4);
  vec2 refraction = n * drop * 0.14;

  return vec3(refraction, mask);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // aspect-correct UV for bokeh — letterboxed around y=0.5
  vec2 bokeUV = uv;
  bokeUV.x = (bokeUV.x - 0.5) * iResolution.x / iResolution.y + 0.5;

  float intensity = clamp(u_intensity, 0.0, 1.0);
  float fog = clamp(u_blur, 0.0, 1.0);
  // Typing rhythm / release afterglow — driven from App.tsx. Bumps drop
  // density, giving rain a "gust" feel when the user is mid-flow.
  float pulse = clamp(u_pulse, 0.0, 1.0);
  intensity *= 1.0 + pulse * 0.28;

  // rain layers: stack near + far on different grids for depth
  vec2 refrMist = staticDrops(uv, intensity * 0.75);
  vec3 refrNear = fallingLayer(uv, intensity, vec2(18.0, 4.0), 0.45, 0.08, 0.55);
  vec3 refrFar  = fallingLayer(uv * 1.35 + vec2(0.27, 0.51),
                               intensity * 0.7,
                               vec2(30.0, 7.0), 0.75, 0.04, 0.32);

  vec2 refractOffset = refrMist + refrNear.xy + refrFar.xy * 0.65;

  // background haze (depth) — not affected by refraction
  vec3 col = bgLights(bokeUV);

  // foreground bokeh, refracted
  col += bokeh(bokeUV + refractOffset);

  // dark cold ambient
  col += vec3(0.018, 0.023, 0.038);

  // drop lens effect: slight brightening inside near drops, darkening at edges
  float maskNear = refrNear.z;
  float maskFar = refrFar.z;
  col += bokeh(bokeUV + refractOffset * 1.4) * maskNear * 0.28;
  col *= 1.0 - maskNear * 0.2 - maskFar * 0.08;

  // fog — cold dim tint blend
  vec3 fogCol = vec3(0.04, 0.058, 0.098);
  col = mix(col, fogCol, fog * 0.5);

  // vignette — stronger so distant edges feel like night
  vec2 p = uv - 0.5;
  float vig = smoothstep(1.05, 0.28, length(p));
  col *= vig;

  // subtle film grain
  float grain = hash21(fragCoord + fract(iTime));
  col += (grain - 0.5) * 0.016;

  fragColor = vec4(col, 1.0);
}
`;
