// js/hud-elements.js - the layered HUD elements, drawn in the scene.
//
// These are the shapes from the HUD lab (star-gallery/hud-lab/index.html) brought into the AR
// scene as real objects: a ring stack around a deep-sky marker, a halo on the selected star, an
// aperture at the portal mouth. Each one is a single plane with a shader on it, facing the user.
//
// Why a shader and not a sprite or a video:
//   - it stays sharp at any distance, where a texture goes soft as the user walks up to it
//   - the whole set costs one draw call each and no texture memory, which matters on a phone
//     already running a volumetric galaxy
//   - the layers can be driven: the value ring can show a real number, the aperture can show
//     how far a transition has got. A sprite cannot.
//
// The elements are built from the same parts as the lab, copied across unchanged apart from the
// one line that has to differ - see px() below. Keep them in step: a part fixed here should be
// fixed there too, and the lab is where to try a change first.

/* global AFRAME */

// 8frame sets window.THREE; every other component in this app reads it the same way.
const THREE = window.THREE || AFRAME.THREE

// ---------------------------------------------------------------------------------------------
// THE PARTS, as in the lab
//
// GLSL ES 1.00, because A-Frame 1.3 compiles materials for WebGL1 as well: no in/out, no
// fragColor, no round(). Everything else is the lab's code as written.
// ---------------------------------------------------------------------------------------------
const PARTS = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uAccent;
uniform float uOpacity;
uniform float uGain;
uniform float uReveal;
uniform float uRate;
uniform float uValue;
uniform float uAspect;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

// One pixel, in the units the shapes are written in. In the lab this is 2/uRes.y, the window's
// own pixel size. Here the element is a plane in the room, so it has no pixel size of its own -
// but the derivative of the position IS that number at this fragment, and it corrects itself as
// the user walks towards the object. A line stays one pixel wide at any distance.
float gPx = 0.004;
float px(){ return gPx; }

float hash11(float n){ return fract(sin(n * 78.233) * 43758.5453); }
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fill(float d){ return clamp(0.5 - d / max(fwidth(d), 1e-6), 0.0, 1.0); }
float stroke(float d, float w){ return fill(abs(d) - w * 0.5); }
float glow(float d, float r){ return exp(-max(d, 0.0) / max(r, 1e-5)); }
float fillW(float d, float w){ return smoothstep(w, -w, d); }
float strokeW(float d, float t, float w){ return fillW(abs(d) - t * 0.5, w); }

float sdBox(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float sdRing(vec2 p, float r){ return abs(length(p) - r); }
float sdArc(vec2 p, float ap, float ra, float rb){
  vec2 sc = vec2(sin(ap), cos(ap));
  p.x = abs(p.x);
  return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra) : abs(length(p) - ra)) - rb;
}
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float dashes(vec2 p, float n, float duty){
  return smoothstep(-duty, duty + 0.02, sin(atan(p.y, p.x) * n));
}

// -- the layered circle -------------------------------------------------------------------------
vec3 partHalo(vec2 p, float r, float soft, vec3 col){
  return col * exp(-abs(length(p) - r) / max(soft, 1e-4)) * 0.5;
}
vec3 partRingStack(vec2 p, float r0, float gap, float n, float rate, vec3 col){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 9; i++){
    float f = float(i);
    if (f >= n) break;
    float r = r0 + f * gap;
    float dir = mod(f, 2.0) < 0.5 ? 1.0 : -1.0;
    float d = sdRing(p, r);
    float dash = dashes(p * rot(uTime * rate * (0.5 - f * 0.055) * dir), 4.0 + f * 5.0, 0.18 + f * 0.04);
    float fade = 1.0 - f * 0.085;
    c += col * strokeW(d, max(0.014 - f * 0.0013, 0.003), px()) * dash * fade;
    c += col * glow(d, 0.02) * dash * 0.35 * fade;
  }
  return c;
}
vec3 partSegRing(vec2 p, float r, float w, float n, float duty, float value, vec3 col){
  float a = (atan(p.y, p.x) + PI) / TAU;
  float f = fract(a * n);
  float seg = smoothstep(0.0, duty, f) * smoothstep(1.0, 1.0 - duty, f);
  float lit = smoothstep(value + 0.5 / n, value - 0.5 / n, a);
  float d = abs(length(p) - r) - w * 0.5;
  vec3 c = col * fillW(d, px()) * seg * (0.16 + 0.84 * lit);
  c += mix(col, vec3(1.0), 0.7) * fillW(d, px()) * seg * smoothstep(1.5 / n, 0.0, abs(a - value)) * 0.9;
  return c;
}
vec3 partGyro(vec2 p, float r, float n, float rate, vec3 col){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 5; i++){
    float f = float(i);
    if (f >= n) break;
    float squash = max(0.16 + 0.74 * abs(sin(uTime * rate * 0.3 + f * 2.1)), 0.12);
    vec2 q = p * rot(f * 1.05 + uTime * rate * 0.09);
    q.y /= squash;
    float rr = r * (1.0 - f * 0.11);
    float d = (abs(length(q) - rr)) * squash;
    float near = 0.4 + 0.6 * smoothstep(-0.3, 0.7, sin(atan(q.y, q.x) + uTime * rate * (0.3 + f * 0.15)));
    c += col * fillW(d - 0.006, px()) * near;
    c += col * glow(max(d - 0.006, 0.0), 0.02) * near * 0.45;
  }
  return c;
}
vec3 partSpokes(vec2 p, float r0, float r1, float n, float rate, vec3 col){
  float a = atan(p.y, p.x) + uTime * rate;
  float rr = length(p);
  float band = smoothstep(r0 - px(), r0 + px(), rr) * smoothstep(r1 + px(), r1 - px(), rr);
  return col * pow(max(0.0, cos(a * n)), 50.0) * band * smoothstep(r1, r0, rr);
}
vec3 partArcLayers(vec2 p, float r0, float gap, float n, float rate, vec3 col){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 7; i++){
    float f = float(i);
    if (f >= n) break;
    float dir = mod(f, 2.0) < 0.5 ? 1.0 : -1.0;
    float ap = 0.4 + 0.9 * hash11(f * 3.7);
    float mid = uTime * rate * (0.3 + 0.22 * hash11(f * 5.1)) * dir + f * 2.0;
    float d = sdArc(p * rot(-mid + PI * 0.5), ap, r0 + f * gap, max(0.010 - f * 0.0008, 0.003));
    c += col * fill(d) * (1.0 - f * 0.1);
    c += col * glow(max(d, 0.0), 0.025) * 0.45;
  }
  return c;
}

// -- the rest of the kit, as far as these presets need it ----------------------------------------
vec3 partTickRing(vec2 p, float r, float n, float major, float len, vec3 col){
  float a = atan(p.y, p.x), rr = length(p);
  float minor = pow(max(0.0, cos(a * n)), 60.0);
  float maj = pow(max(0.0, cos(a * max(1.0, floor(n / max(major, 1.0))))), 90.0);
  float L = len * (0.4 + 0.6 * maj);
  float band = smoothstep(r - L - px(), r - L + px(), rr) * smoothstep(r + px(), r - px(), rr);
  return col * band * max(minor * 0.6, maj);
}
vec3 partIndex(vec2 p, float r, float n, float size, float spin, vec3 col){
  p *= rot(spin);
  float k = TAU / n;
  float s = floor(atan(p.y, p.x) / k + 0.5) * k;
  vec2 dir = vec2(cos(s), sin(s));
  vec2 q = vec2(dot(p, dir), dot(p, vec2(-dir.y, dir.x)));
  float apex = q.x - (r - size);
  float d = max(q.x - r, max(-apex, abs(q.y) - apex * 0.85));
  return col * fillW(d, px());
}
vec3 partSweep(vec2 p, float r0, float r1, float ang, float width, vec3 col){
  float a = atan(p.y, p.x), rr = length(p);
  float d = abs(mod(a - ang + PI, TAU) - PI);
  float wedge = smoothstep(width, 0.0, d);
  float band = smoothstep(r0 - 0.02, r0 + 0.02, rr) * smoothstep(r1 + 0.02, r1 - 0.02, rr);
  return col * wedge * band * (0.25 + 0.75 * smoothstep(width, width * 0.15, d));
}
vec3 partRadialBars(vec2 p, float r0, float len, float n, float seed, float rate, vec3 col){
  float k = (atan(p.y, p.x) + PI) / TAU * n;
  float idx = floor(k), f = fract(k);
  float h = 0.12 + 0.88 * vnoise(vec2(idx * 0.7 + seed, uTime * rate));
  float rr = length(p), r1 = r0 + len * h;
  float gap = smoothstep(0.0, 0.14, f) * smoothstep(1.0, 0.86, f);
  float band = smoothstep(r0 - px(), r0 + px(), rr) * smoothstep(r1 + px(), r1 - px(), rr);
  vec3 c = col * band * gap * (0.45 + 0.55 * h);
  c += mix(col, vec3(1.0), 0.65) * gap * smoothstep(0.022, 0.0, abs(rr - r1)) * 0.9;
  return c;
}
vec3 partIris(vec2 p, float r, float open, float blades, vec3 col){
  float k = TAU / max(blades, 3.0);
  float ang = mod(atan(p.y, p.x) + k * 0.5, k) - k * 0.5;
  float rr = length(p);
  float R = mix(0.06, 0.95, clamp(open, 0.0, 1.0)) * r;
  float d = max(rr - r, R - rr * cos(ang));
  vec3 c = col * fillW(d, px()) * 0.14;
  c += col * strokeW(d, 0.012, px());
  c += col * fillW(max(abs(ang) * rr - 0.004, d), px()) * 0.45;
  return c;
}
vec3 partOrbit(vec2 p, float r, float n, float rate, vec3 col){
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++){
    float f = float(i);
    if (f >= n) break;
    float a = uTime * rate * (0.6 + hash11(f * 2.3) * 0.9) + f * 1.7;
    vec2 o = vec2(cos(a), sin(a)) * r * (0.7 + 0.3 * hash11(f * 5.1));
    float d = length(p - o) - 0.012;
    c += mix(col, vec3(1.0), 0.3) * fillW(d, px());
    c += col * glow(max(d, 0.0), 0.03) * 0.6;
  }
  return c;
}
vec3 partHandles(vec2 p, vec2 b, float len, float w, float nub, vec3 col){
  vec2 q = abs(p);
  float arm = min(sdSeg(q, vec2(b.x - len, b.y), b), sdSeg(q, vec2(b.x, b.y - len), b)) - w * 0.5;
  vec3 c = col * fill(arm);
  c += col * glow(max(arm, 0.0), 0.04) * 0.45;
  c += mix(col, vec3(1.0), 0.4) * fill(sdBox(q - b, vec2(w * 1.9))) * nub;
  return c;
}
vec3 partMarquee(vec2 p, vec2 b, float n, float rate, float w, vec3 col){
  float d = abs(sdBox(p, b)) - w * 0.5;
  vec2 q = abs(p) - b;
  float u = q.x > q.y ? p.y : p.x;
  float dash = step(0.45, fract(u * n - uTime * rate));
  return col * fillW(d, px()) * dash;
}
`

// ---------------------------------------------------------------------------------------------
// THE PRESETS
//
// Each is a hud() taking a position centred on the plane, y running -1..1. uReveal is the build-in
// ramp, 0 to 1, so an element assembles rather than appearing; uValue is whatever number the
// element is showing, if it shows one.
// ---------------------------------------------------------------------------------------------
const PRESETS = {
  // For a deep-sky marker in the constellation view. Layers wrap the marker sphere, a bar fan
  // reads off the rim, bodies orbit. Built to say "there is something in here" from across a room.
  orrery: `
vec3 hud(vec2 p){
  vec3 c = vec3(0.0);
  float t = uTime * uRate;
  float k = uReveal;
  // the stack builds outward: inner layers arrive first, so it reads as opening rather than fading
  c += partHalo(p, 0.3, 0.14, uAccent) * 0.45 * k;
  c += partGyro(p, 0.3, 3.0, uRate, uAccent) * smoothstep(0.0, 0.45, k);
  c += partRingStack(p, 0.46, 0.075, 4.0, uRate * 0.7, uAccent) * 0.85 * smoothstep(0.2, 0.75, k);
  c += partRadialBars(p, 0.78, 0.12, 40.0, 2.0, uRate * 0.4, uAccent) * 0.8 * smoothstep(0.45, 1.0, k);
  c += partTickRing(p, 0.93, 96.0, 8.0, 0.045, uAccent) * 0.5 * smoothstep(0.55, 1.0, k);
  c += partIndex(p, 0.99, 3.0, 0.04, t * 0.1, uAccent) * 0.8 * smoothstep(0.6, 1.0, k);
  c += partOrbit(p, 0.62, 4.0, uRate * 0.5, uAccent) * smoothstep(0.3, 0.9, k);
  return c;
}`,

  // For the selected star. Quieter than the orrery and much smaller on screen, so it is mostly
  // halo and stack, with the value ring carrying the star's brightness.
  halo: `
vec3 hud(vec2 p){
  vec3 c = vec3(0.0);
  float k = uReveal;
  c += partHalo(p, 0.42, 0.12, uAccent) * 0.5 * k;
  c += partRingStack(p, 0.34, 0.1, 3.0, uRate, uAccent) * smoothstep(0.1, 0.7, k);
  c += partSegRing(p, 0.26, 0.035, 20.0, 0.7, uValue, uAccent) * smoothstep(0.35, 1.0, k);
  c += partSpokes(p, 0.58, 0.68, 40.0, 0.04 * uRate, uAccent) * 0.5 * smoothstep(0.6, 1.0, k);
  return c;
}`,

  // Selection: the layered circle says what it is doing, the square says the user picked it.
  //
  // Everything is kept outside p-radius 0.32 on purpose. This element centres on a star, and a
  // star core is an opaque depth-writing sphere - anything drawn inside its silhouette is simply
  // not there, however bright. So the ring sits around the star rather than over it, which is
  // also the more readable picture.
  target: `
vec3 hud(vec2 p){
  vec3 c = vec3(0.0);
  float k = uReveal;
  // the frame flies in from outside and settles, which is what reads as "locked on"
  vec2 b = vec2(0.62) * (1.0 + 0.5 * (1.0 - k));
  c += partHalo(p, 0.44, 0.1, uAccent) * 0.45 * k;
  c += partSegRing(p, 0.34, 0.032, 18.0, 0.7, uValue, uAccent) * smoothstep(0.4, 1.0, k);
  c += partRingStack(p, 0.44, 0.07, 2.0, uRate, uAccent) * smoothstep(0.2, 0.8, k);
  c += partHandles(p, b, 0.15, 0.012, step(0.5, fract(uTime * 1.5)), uAccent) * k;
  c += partMarquee(p, b * 1.14, 18.0, 0.4 * uRate, 0.008, uAccent) * 0.7 * smoothstep(0.5, 1.0, k);
  c += partIndex(p, 0.85, 4.0, 0.05, PI * 0.25, uAccent) * 0.7 * smoothstep(0.6, 1.0, k);
  return c;
}`,

  // The portal mouth: an aperture inside layered rings, opening on uValue. Point it at the moment
  // a deep-sky object is entered and the aperture IS the progress - no separate spinner needed.
  scan: `
vec3 hud(vec2 p){
  vec3 c = vec3(0.0);
  float k = uReveal;
  float open = clamp(uValue, 0.0, 1.0);
  c += partIris(p, 0.3, open, 6.0, uAccent) * k;
  c += partHalo(p, 0.44, 0.12, uAccent) * (0.25 + 0.5 * open) * k;
  c += partRingStack(p, 0.44, 0.08, 4.0, uRate, uAccent) * smoothstep(0.1, 0.7, k);
  c += partSegRing(p, 0.37, 0.03, 24.0, 0.7, open, uAccent) * smoothstep(0.3, 1.0, k);
  c += partSweep(p, 0.3, 0.72, uTime * 0.55 * uRate, 0.4, uAccent) * 0.3 * k;
  return c;
}`,

  // The idle marker for something not yet looked at, and the cheapest element here - the one to
  // use when several are on screen at once.
  //
  // It carries two dashed rings as well as the arcs because this replaces a plain dashed circle
  // on a marker only a couple of centimetres across: arcs alone read as a smudge at that size,
  // where a closed ring still reads as a ring. Layering is not a reason to give up the outline.
  idle: `
vec3 hud(vec2 p){
  vec3 c = vec3(0.0);
  float k = uReveal;
  c += partHalo(p, 0.4, 0.13, uAccent) * 0.3 * k;
  c += partRingStack(p, 0.34, 0.1, 2.0, uRate * 0.8, uAccent) * smoothstep(0.0, 0.6, k);
  c += partArcLayers(p, 0.3, 0.12, 3.0, uRate, uAccent) * 0.8 * smoothstep(0.25, 1.0, k);
  c += partOrbit(p, 0.2, 2.0, uRate * 0.6, uAccent) * 0.8 * smoothstep(0.4, 1.0, k);
  return c;
}`,
}

// How far out each preset's outermost mark reaches, as a fraction of the plane's half-height.
// A call site wants to say "fit this to the marker", not "work out the plane size" - so it gives
// a radius and this turns it into one. Change a preset's outermost ring and change its number
// here, or every element built from it quietly grows.
const OUTER = {orrery: 0.99, halo: 0.68, target: 0.85, scan: 0.72, idle: 0.54}

const VERT = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const MAIN = `
void main(){
  vec2 p = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);
  // The pixel size has to be taken here, in uniform control flow - a derivative read inside an
  // if() or a loop that not every fragment takes is undefined, and shows up as blocky edges.
  gPx = max(fwidth(p.y), 1e-5);
  // uGain is brightness, and it is not the same thing as opacity. Opacity fades the element
  // towards nothing; gain pushes it past full. Because the output is additive and clamps per
  // channel, anything over 1 burns the cores of the lines out towards white while the falloff
  // around them keeps the accent colour - which is what an emissive line under bloom looks
  // like, without paying for a bloom pass over the camera feed.
  vec3 c = hud(p) * uOpacity * uGain;
  // The plane has edges and a halo does not: exp() falloff is still faintly above zero out at
  // the corners, which draws the plane itself as a glowing rectangle over the camera feed. Fade
  // the whole thing out before it gets there, so the element ends where its light ends.
  c *= smoothstep(1.0, 0.80, max(abs(p.x / max(uAspect, 0.001)), abs(p.y)));
  // And a black floor. Every falloff here is an exponential, which never actually reaches zero:
  // each one leaves a fraction of a bit spread over the whole plane, and added together over a
  // few layers that is enough to show the quad as a faintly glowing rectangle against a dark
  // room. Below this level it is not a line any more, so drop it.
  // The floor rises with the gain, or turning an element up would bring the rectangle back.
  c = max(c - 0.004 * max(uGain, 1.0), 0.0);
  // Additive: black is already transparent, so there is no alpha to get wrong and nothing fringes
  // against the camera feed. The element can only add light, which is what a HUD should do.
  gl_FragColor = vec4(c, 1.0);
}`

function buildMaterial(preset, accent, opacity, rate, gain) {
  const body = PRESETS[preset] || PRESETS.halo
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: {value: 0},
      uAccent: {value: new THREE.Color(accent)},
      uOpacity: {value: opacity},
      uGain: {value: gain === undefined ? 1 : gain},
      uReveal: {value: 0},
      uRate: {value: rate},
      uValue: {value: 0.5},
      uAspect: {value: 1},
    },
    vertexShader: VERT,
    fragmentShader: PARTS + body + MAIN,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Every shape here is anti-aliased from the derivative of its own distance field, and on
    // WebGL1 fwidth() does not exist without this - the shader fails to compile with "no matching
    // overloaded function". three adds the #extension line for us, and drops it on WebGL2 where
    // derivatives are already core.
    extensions: {derivatives: true},
  })
}

// ---------------------------------------------------------------------------------------------
// THE COMPONENT
//
//   <a-entity hud-element="preset: orrery; size: 0.9; rate: 1"></a-entity>
//
// Put it on its own entity as a child of whatever it should follow. It faces the user, it never
// takes a tap, and it never writes depth - so it cannot block a raycast to the thing it is
// wrapped around, and cannot z-fight with it either.
// ---------------------------------------------------------------------------------------------
const hudElementComponent = {
  schema: {
    preset: {type: 'string', default: 'halo'},
    // Two ways to say how big. radius is the one to use: "the outermost mark lands here", in the
    // parent's units. size is the raw plane, for anything that is not a circle.
    radius: {type: 'number', default: 0},
    size: {type: 'number', default: 1},
    aspect: {type: 'number', default: 1},
    color: {type: 'color', default: '#4287f5'},
    opacity: {type: 'number', default: 1},
    intensity: {type: 'number', default: 1},       // brightness; above 1 burns the line cores white
    rate: {type: 'number', default: 1},
    value: {type: 'number', default: 0.5},         // whatever the element is showing, 0..1
    billboard: {type: 'boolean', default: true},
    reveal: {type: 'number', default: 0.9},        // seconds for the element to build in
    visible: {type: 'boolean', default: true},
  },

  init() {
    this.reveal = 0
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      buildMaterial(this.data.preset, this.data.color, this.data.opacity, this.data.rate, this.data.intensity)
    )
    this.mesh.frustumCulled = false     // the plane is small and billboarded; culling it flickers
    // No renderOrder: A-Frame 1.3 leaves renderer.sortObjects false, so draw order is scene-graph
    // order and setting it would do nothing. What actually keeps this behind the things it should
    // be behind is depthTest, which stays ON - that is how the portal's hider walls still occlude
    // it, and the whole AR illusion rests on that. Only depth WRITING is off, so two elements
    // overlapping never punch holes in each other.
    this.el.setObject3D('hud', this.mesh)
    this.applySize()

    this.camera = null
    this.tmpQ = new THREE.Quaternion()
    this.parentQ = new THREE.Quaternion()
  },

  update(old) {
    const d = this.data
    if (old && old.preset !== d.preset) {
      this.mesh.material.dispose()
      this.mesh.material = buildMaterial(d.preset, d.color, d.opacity, d.rate, d.intensity)
    }
    const u = this.mesh.material.uniforms
    u.uAccent.value.set(d.color)
    u.uOpacity.value = d.opacity
    u.uGain.value = d.intensity
    u.uRate.value = d.rate
    u.uValue.value = d.value
    this.applySize()
  },

  applySize() {
    const d = this.data
    // The scale goes on the MESH, not the entity, so a call site can still position and rotate
    // the entity normally - and so this is in the parent's units. Under the loader's containers
    // that is half a metre to the unit, because the display is scaled 0.5.
    const size = d.radius > 0 ? (2 * d.radius) / (OUTER[d.preset] || 0.9) : d.size
    this.mesh.scale.set(size * d.aspect, size, 1)
    this.mesh.material.uniforms.uAspect.value = d.aspect
  },

  tick(time, delta) {
    const d = this.data
    const dt = Math.min(delta || 16, 100) / 1000
    const u = this.mesh.material.uniforms
    u.uTime.value += dt

    // One ramp in, one ramp out, so hiding an element is not a pop either.
    const target = d.visible ? 1 : 0
    const step = dt / Math.max(d.reveal, 0.01)
    this.reveal += Math.max(-step, Math.min(step, target - this.reveal))
    u.uReveal.value = this.reveal
    this.mesh.visible = this.reveal > 0.001

    if (!d.billboard || !this.mesh.visible) return
    if (!this.camera) {
      this.camera = this.el.sceneEl && this.el.sceneEl.camera
      if (!this.camera) return
    }
    // Face the user without rolling: take the camera's world orientation, not a lookAt.
    //
    // The inverse to divide out is the MESH's parent, which is this entity's own object3D - not
    // the entity's parent. Using the entity's parent instead leaves any rotation set on the
    // entity itself uncancelled, and the plane then turns with the figure. Taking it from here
    // means a call site can rotate or nest the entity however it likes and the element still
    // faces front.
    this.camera.getWorldQuaternion(this.tmpQ)
    this.el.object3D.getWorldQuaternion(this.parentQ)
    this.mesh.quaternion.copy(this.parentQ.invert()).multiply(this.tmpQ)
  },

  remove() {
    this.el.removeObject3D('hud')
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  },
}

export {hudElementComponent, PRESETS, PARTS, VERT, MAIN, buildMaterial}
