/** Shared GLSL: value noise, fbm with a runtime octave count, cellular craters, sRGB -> linear. */
export const NOISE = /* glsl */ `
float hash31(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = p * 2.03 + 11.7; a *= 0.5; }
  return s / n;
}
// Crater field: returns -1 (deep floor) .. +0.6 (bright rim), 0 on plain ground.
float craters(vec3 p, int oct) {
  float h = 0.0, scale = 1.0;
  for (int k = 0; k < 3; k++) {
    if (k >= oct - 1) break;
    vec3 q = p * (3.0 * scale), i = floor(q), f = fract(q);
    for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
      vec3 g = vec3(float(x), float(y), float(z)), o = hash33(i + g + float(k) * 17.0);
      float d = length(g + o - f), r = 0.18 + 0.2 * o.x;
      h -= smoothstep(r, r * 0.2, d) * 0.9;
      h += smoothstep(r * 0.78, r, d) * smoothstep(r * 1.35, r, d) * 0.6;
    }
    scale *= 2.3;
  }
  return clamp(h, -1.0, 0.8);
}
vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
`;
