// js/star-visual.js - a constellation star that reads as a light source.
//
// What it replaces: createStarEntity() in constellation-loader.js draws an <a-sphere> with a
// plain lit material (metalness/roughness, no emissive), and dynamic-star.js draws a textured
// sphere with shader:'standard'. Both are LIT - the scene's directional light gives them a dark
// side and a specular highlight, which is exactly what makes a star read as a plastic ball. A
// star is the light; nothing in the scene may shade it.
//
// The look is built in layers, because no single primitive does it:
//
//   body   an opaque sphere, unlit, with limb darkening - bright and near-white at the centre
//          of the disc, cooler and dimmer toward the rim. It carries the depth: real parallax,
//          real occlusion by the portal frame, and something solid to raycast against.
//   halo   one camera-facing quad with a two-lobe PSF - a tight gaussian core plus a wide
//          shallow one. This is the layer that says "light source", and it is also what hides
//          the body's silhouette, so the star has no hard edge anywhere.
//   glare  a second quad carrying diffraction spikes, on the BRIGHT stars only. Spikes are an
//          instrument artefact, so they are the strongest available cue that something is too
//          bright to image cleanly - but on every star at once they read as decoration.
//
// The PSF is the same shape nebula-core.js uses for its galaxy and field stars
// (exp(-r*r*k) + halo*exp(-r*r*k2)), so a constellation star and the star field behind it are
// drawn by the same optics rather than by two unrelated guesses. The widths differ because
// these are world-sized quads rather than point sprites: the wide lobe has to reach zero by the
// quad's edge or the quad's own boundary shows as a square.
//
// Colour comes from physics.tempKelvin through the same blackbody ramp nebula-core uses, so the
// figure stars and the galaxy's stars agree about what a given temperature looks like. Size and
// brightness come from `magnitude`. Both are already in the constellation data and neither was
// being used for anything visual.
//
// Cost, per star, against what it replaces: one 16x16 sphere and two quads (~520 triangles)
// running unlit shaders, versus a 32x32 sphere - two of them, in dynamic-star's case - running
// per-fragment PBR against two lights (~4,100 triangles). It is cheaper than what is there now.
// The one real cost is additive overdraw on the halo quad, which is why the fragment shader
// discards below the same 0.003 threshold nebula-core uses.

// The ramp nebula-core.js keys its star colours off, copied rather than imported: nebula-core
// does not export bbColor, and this file must not start depending on window.NebulaCore being
// present - the constellation draws with or without a deep-sky object in the scene.
const BB = [[1, 0.52, 0.22], [1, 0.70, 0.43], [1, 0.86, 0.70], [1, 0.95, 0.89],
  [0.96, 0.96, 1], [0.82, 0.88, 1], [0.70, 0.80, 1]]

function bbColor(t) {
  const f = Math.max(0, Math.min(1, t)) * (BB.length - 1)
  const i = Math.min(BB.length - 2, Math.floor(f)), k = f - i, a = BB[i], b = BB[i + 1]
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

// Temperature to ramp position, in LOG T. Linear in kelvin spends most of the ramp between
// 20,000K and 30,000K, where the colour barely changes, and crushes the 3,000-6,000K range
// where it changes fastest - which is where most of a constellation's stars actually sit.
function tempToRamp(k) {
  if (!(k > 0)) return -1
  const lo = Math.log(2500), hi = Math.log(30000)
  return Math.max(0, Math.min(1, (Math.log(k) - lo) / (hi - lo)))
}

// Spectral class is the fallback when physics.tempKelvin is absent: the letter alone fixes the
// temperature to within a class, which is far closer than the authored hex, and unlike the hex
// it lands on the same ramp as everything else.
const CLASS_K = {O: 30000, B: 15000, A: 8500, F: 6800, G: 5600, K: 4400, M: 3200}

function starColor(data) {
  let t = tempToRamp(data.tempKelvin)
  if (t < 0 && data.spectralClass) {
    const m = /^\s*([OBAFGKM])/.exec(data.spectralClass.toUpperCase())
    if (m) t = tempToRamp(CLASS_K[m[1]])
  }
  if (t >= 0) return bbColor(t)
  // Nothing astrophysical to go on - fall back to whatever hex the data carries.
  const c = new THREE.Color(data.color || '#ffffff')
  return [c.r, c.g, c.b]
}

// Apparent magnitude is a backwards log scale: every 5 magnitudes is a factor of 100 in flux.
// Taken raw it is far too wide a range to draw - across one constellation the faintest star
// would be a twentieth of the brightest and simply vanish - so the flux is compressed by a
// power before it drives anything.
function fluxOf(mag, ref) {
  const raw = Math.pow(10, -0.4 * ((typeof mag === 'number' ? mag : 3) - ref))
  return Math.pow(raw, 0.45)
}

// Both quads are built in VIEW space: the centre is transformed by the model-view matrix, then
// the corners are pushed out along the view plane's own axes, which faces the quad at the camera
// without a per-frame quaternion copy on the CPU and without a billboard component.
//
// length(modelViewMatrix[0].xyz) recovers the model's world scale - the view matrix is rigid, so
// it cannot change that length. Without it the halo would keep its metre size while the portal
// scales the constellation up around it, and every star would lose its glow on entry.
// uBias pulls the quad toward the camera by a little over the body's radius. Without it the
// quad sits on the body's centre while the body's near pole bulges a whole radius in front of
// it, so the depth test removes the glow exactly where the star is brightest and the body reads
// as a flat grey disc punched out of its own halo. Biasing rather than switching depthTest off
// keeps the star occludable by everything else - the portal frame, a nearer star.
const BILLBOARD_VERT = `
  uniform float uSize, uBias;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float scale = length(modelViewMatrix[0].xyz);
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += position.xy * uSize * scale;
    mv.z += uBias * scale;
    gl_Position = projectionMatrix * mv;
  }
`

// Premultiplied additive, matching nebula-core's star material: the shader emits vec4(col*a, a)
// and the blend is ONE/ONE, so plain AdditiveBlending (SRC_ALPHA,ONE) would square the falloff.
//
// The colour is deliberately NOT clamped. Where a exceeds 1 the core clips all three channels
// and reads white while the wings, which never do, keep the star's temperature. That blowout is
// the whole photographic cue, and it is free.
const HALO_FRAG = `
  precision mediump float;
  uniform vec3 uCol;
  uniform float uCoreK, uHaloK, uHaloAmt, uBright, uInner;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float a = (exp(-r * r * uCoreK) + uHaloAmt * exp(-r * r * uHaloK)) * uBright;
    // uInner is the body's edge in this quad's normalised radius, and it is 0 for an
    // unresolved star. Once the disc IS resolved the halo has to start AT the limb: scattered
    // light belongs around the source, and laid over the photosphere instead it adds about
    // 0.7 of flat white to every pixel of it, which clips the granulation away entirely.
    if (uInner > 0.0) a *= smoothstep(uInner * 0.88, uInner * 1.30, r);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uCol * a, a);
  }
`

// Four spikes, drawn rather than sampled from a texture - two crossed bars, each one tight in
// the axis across it and slack in the axis along it. Two exp() calls per bar is cheaper than a
// texture fetch and it stays sharp at any size, which a 64px cross would not.
const GLARE_FRAG = `
  precision mediump float;
  uniform vec3 uCol;
  uniform float uSharp, uLen, uBright;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float h = exp(-d.y * d.y * uSharp) * exp(-d.x * d.x * uLen);
    float v = exp(-d.x * d.x * uSharp) * exp(-d.y * d.y * uLen);
    // Spikes emanate FROM the core; they do not pile up inside it. Left to overlap at the
    // centre the two bars sum to a bright square-on-point, which shows through the halo as a
    // diamond-shaped core. Fading them out over the innermost few percent hands the centre
    // back to the halo, where the round blown-out core belongs.
    float a = (h + v) * smoothstep(0.0, 0.22, length(d)) * uBright;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uCol * a, a);
  }
`

// The body. mu is the cosine of the angle between the surface normal and the line of sight, so
// it is 1 at the centre of the visible disc and 0 at the limb - the same quantity the classical
// linear limb-darkening law is written in. Colour walks toward white at the centre for the same
// reason the halo's does: the middle of the disc is the part bright enough to clip.
const BODY_VERT = `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    // Object space, so the granulation is fixed TO the surface: sampled in view or world space
    // the cells would swim across the disc as the viewer walks around the portal.
    vLocal = position;
    gl_Position = projectionMatrix * mv;
  }
`

// The engine's own noise primitives, copied for the same reason bbColor was: nebula-core does
// not export its GLSL, and a constellation star must not require a deep-sky object to be in the
// scene. Sharing the basis means a star's surface and the galaxy's gas are made of the same
// noise rather than two different ones that disagree at a glance.
const NOISE = `
  float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453123); }
  float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.0-2.0*f);
    float c000=h3(i),c100=h3(i+vec3(1,0,0)),c010=h3(i+vec3(0,1,0)),c110=h3(i+vec3(1,1,0));
    float c001=h3(i+vec3(0,0,1)),c101=h3(i+vec3(1,0,1)),c011=h3(i+vec3(0,1,1)),c111=h3(i+vec3(1,1,1));
    return mix(mix(mix(c000,c100,u.x),mix(c010,c110,u.x),u.y),
               mix(mix(c001,c101,u.x),mix(c011,c111,u.x),u.y), u.z); }
  float fbm(vec3 p,int o){ float a=0.5,f=1.0,s=0.0,n=0.0;
    for(int i=0;i<5;i++){ if(i>=o) break; s+=a*vnoise(p*f); n+=a; a*=0.5; f*=2.02; } return s/n; }
  float ridged(vec3 p,int o){ float a=0.5,f=1.0,s=0.0,n=0.0;
    for(int i=0;i<4;i++){ if(i>=o) break; s+=a*(1.0-abs(vnoise(p*f)*2.0-1.0)); n+=a; a*=0.5; f*=2.02; }
    return s/n; }
`

// The photosphere. Everything here is detail measured in fractions of the disc, so it only
// earns its cost when the disc is large on screen - the entered-star view, not a figure star
// twenty pixels wide. highp because the hash is fract(sin(...)*43758.0): at mediump that
// multiply loses the low bits the hash depends on and the granulation bands into stripes on
// mobile GPUs.
const SURFACE_FRAG = `
  precision highp float;
  ${NOISE}
  uniform vec3 uCore, uLimb, uSpot;
  uniform float uLimbDark, uBright, uTime, uScale, uChurn, uSurface, uSpots, uSpin, uWarp;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vLocal;
  void main() {
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    float ld = 1.0 - uLimbDark * (1.0 - mu);
    vec3 dir = normalize(vLocal);

    // Differential rotation: the equator comes round faster than the poles, as it does on a
    // fluid body that is not rigid. On its own this is the single clearest sign the surface is
    // a moving fluid rather than a texture pinned to a ball.
    float lat = dir.y;
    float omega = uSpin * (1.0 - 0.35 * lat * lat);
    float ca = cos(uTime * omega), sa = sin(uTime * omega);
    vec3 d = vec3(dir.x * ca - dir.z * sa, dir.y, dir.x * sa + dir.z * ca);

    // Domain warp - the sample point is pushed around by a slow field before the noise is read,
    // so the pattern SWIRLS. Sines rather than another fbm: three of them cost a fraction of
    // three more noise lookups and the eye cannot tell which produced the churn.
    vec3 w = vec3(
      sin(d.y * 3.1 + uTime * 0.21),
      sin(d.z * 2.7 + uTime * 0.17),
      sin(d.x * 3.4 + uTime * 0.19));
    vec3 q = d * uScale + w * uWarp;

    // Two layers drifting opposite ways. One sheet of noise translating in a single direction
    // reads as the surface SLIDING past; two in opposition interfere, so cells swell and
    // dissolve where they are - which is what boiling looks like.
    float gA = fbm(q + vec3(0.0, uTime * uChurn, 0.0), 3);
    float gB = fbm(q * 1.73 - vec3(0.0, uTime * uChurn * 0.77, 0.0), 3);
    float gran = gA * 0.6 + gB * 0.4;

    // smoothstep is what turns smooth fbm into cells with lanes between them - without it the
    // surface reads as haze rather than as a fluid.
    float cells = smoothstep(0.34, 0.72, gran);

    // A much coarser layer, carried round by the same rotation. Real granulation has
    // supergranules an order of magnitude wider than granules, and the dark end of that layer
    // is where spots belong.
    float sg = fbm(d * uScale * 0.26 + 11.0, 3);
    float spot = smoothstep(0.60, 0.32, sg);

    // Contrast falls toward the limb: near the edge you are looking along the cells rather
    // than down onto them, and you are seeing higher, smoother layers of the atmosphere.
    float amt = uSurface * mix(0.30, 1.0, mu);
    float bright = ld * (1.0 + amt * (cells - 0.5) * 1.7);

    vec3 c = mix(uLimb, uCore, pow(mu, 0.55));
    c = mix(c, uSpot, spot * uSpots * mu);
    gl_FragColor = vec4(c * bright * uBright, 1.0);
  }
`

// Prominences and the inner corona: a ring hugging the outside of the limb, discarded inside
// it so the disc keeps its own shading. ridged noise rather than fbm because ridges give
// filaments - the arcs and loops that read as plasma following a magnetic field - where plain
// fbm would give clouds. The angle is fed in as (cos, sin) so the pattern has no seam where
// atan wraps.
const CORONA_FRAG = `
  precision highp float;
  ${NOISE}
  uniform vec3 uCol, uHot;
  uniform float uInner, uBright, uTime, uStreak, uArc;
  varying vec2 vUv;
  void main() {
    vec2 d = (vUv - 0.5) * 2.0;
    float r = length(d);
    if (r < uInner || r > 1.0) discard;
    float t = (r - uInner) / max(1e-4, 1.0 - uInner);
    float ang = atan(d.y, d.x);
    float f = ridged(vec3(cos(ang), sin(ang), uTime * 0.04) * uStreak, 3);
    float loops = pow(f, 2.2);
    float fall = exp(-t * t * uArc);
    float a = fall * (0.22 + 0.78 * loops) * uBright;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uCol, uHot, fall * 0.6) * a, a);
  }
`

const BODY_FRAG = `
  precision mediump float;
  uniform vec3 uCore, uLimb;
  uniform float uLimbDark, uBright;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
    float ld = 1.0 - uLimbDark * (1.0 - mu);
    vec3 c = mix(uLimb, uCore, pow(mu, 0.55));
    gl_FragColor = vec4(c * ld * uBright, 1.0);
  }
`

// Prominence loops, as real geometry rather than as a pattern on the corona quad.
//
// The billboard version could only ever fake this: an arc drawn into a camera-facing quad stays
// flat, so the moment the viewer walks around the portal - which in AR they will - every loop
// turns edge-on at the same instant and the illusion dies. A tube swept along a curve from one
// footpoint on the surface, up over the limb, and back down to another is the same cost bracket
// (~240 triangles each) and it survives being looked at from the side, gets occluded by the
// star's own body on the far side, and parallaxes correctly.
// Points, not a tube. A swept tube is a SURFACE: it has a silhouette, a consistent thickness
// and a lit-looking interior, and no amount of noise on it stops it reading as a pipe, because
// the thing the eye is objecting to is the edge. Plasma has no edge. Thousands of small soft
// additive blobs, clustered into strands that follow the same field-line curve, build density
// out of overlap instead - thick where strands cross, ragged at the margins, and transparent
// throughout. It is also cheaper: one vertex per point, one draw call for every loop on the
// star, and no triangles at all.
const PLASMA_VERT = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aU;        // where this point sits along its loop, 0 at one foot, 1 at the other
  attribute vec2 aCycle;     // x = period in seconds, y = where in that period this loop starts
  attribute vec3 aColor;
  uniform float uTime, uPixH, uBright, uDuty, uEdge;
  varying vec3 vCol;
  varying float vDim;
  void main() {
    // Each loop runs its own clock, and is DORMANT for part of it - that gap is what makes
    // loops appear here and then somewhere else, rather than the whole set standing lit
    // forever and merely wobbling.
    float t = fract(uTime / aCycle.x + aCycle.y);
    float life = t / uDuty;

    // The plasma snakes out of one footpoint and back into the other. Over the first half of
    // the life the head runs 0 -> 1, uncovering the arc; over the second half the tail follows
    // it, so the loop feeds back into the surface and is gone. The curve itself never moves -
    // what travels is which part of it is lit.
    float head = clamp(life * 2.0, 0.0, 1.0);
    float tail = clamp(life * 2.0 - 1.0, 0.0, 1.0);
    float vis = (1.0 - smoothstep(head - uEdge, head, aU)) * smoothstep(tail, tail + uEdge, aU);
    if (life > 1.0) vis = 0.0;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float scale = length(modelViewMatrix[0].xyz);
    // Real perspective size, unlike the field stars: this is gas at a place you can walk up to,
    // so it has to grow as you approach rather than hold a fixed angular size.
    gl_PointSize = clamp(uPixH * aSize * scale / max(0.001, -mv.z), 1.0, 96.0);
    // A little flicker on top, but only a little: the reveal is the animation now, and gas that
    // also wobbled in place read as noise rather than as movement along the arc.
    float shimmer = 0.60 + 0.26 * sin(uTime * 1.7 + aPhase * 3.1)
                          + 0.14 * sin(uTime * 4.3 + aPhase * 1.9);
    vDim = vis * shimmer * uBright;
    vCol = aColor;
    gl_Position = projectionMatrix * mv;
  }
`

const PLASMA_FRAG = `
  precision mediump float;
  uniform float uSoft;
  varying vec3 vCol;
  varying float vDim;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-r * r * uSoft) * vDim;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol * a, a);
  }
`

// Deterministic, so a rebuild does not reshuffle every loop on the star the user is looking at.
function hash11(n) {
  const s = Math.sin(n * 127.1) * 43758.5453123
  return s - Math.floor(s)
}

const starVisualComponent = {
  schema: {
    radius: {type: 'number', default: 0.1},        // the body, in world units
    color: {type: 'color', default: '#ffffff'},    // only used when there is no temperature
    tempKelvin: {type: 'number', default: 0},      // physics.tempKelvin, 0 when unknown
    spectralClass: {type: 'string', default: ''},
    magnitude: {type: 'number', default: 3},
    refMagnitude: {type: 'number', default: 2},    // the magnitude that draws at full strength
    haloScale: {type: 'number', default: 9},       // halo quad width, in body radii
    glareScale: {type: 'number', default: 13},     // spike quad width, in body radii
    // How far below refMagnitude a star still earns spikes. Bright stars only: on all of them
    // at once the spikes stop reading as brightness and start reading as a pattern.
    glareSpan: {type: 'number', default: 1.6},
    twinkle: {type: 'number', default: 0.12},      // scintillation depth, 0 disables the tick
    intensity: {type: 'number', default: 1},

    // --- the entered-star look. Default 0, and that is deliberate: granulation is detail
    // measured in fractions of the disc, so on a figure star a few pixels wide it is sub-pixel
    // noise nobody can resolve and everybody pays for. Turn it on for the star you walk into.
    surface: {type: 'number', default: 0},         // granulation depth, 0 skips the noise shader
    surfaceScale: {type: 'number', default: 11},   // granule frequency
    churn: {type: 'number', default: 0.05},        // convection drift rate
    spots: {type: 'number', default: 0.35},        // how dark the supergranule minima go
    spin: {type: 'number', default: 0.055},        // differential rotation, radians/sec at the equator
    warp: {type: 'number', default: 1.1},          // how hard the swirl pushes the sample point
    prominence: {type: 'number', default: 0},      // corona + spicule fringe, 0 skips the layer
    coronaScale: {type: 'number', default: 2.3},   // corona quad width, in body radii
    arcs: {type: 'number', default: 0},            // prominence loops as geometry, 0 skips them
    arcHeight: {type: 'number', default: 0.26},    // apex height above the surface, in radii
    arcThickness: {type: 'number', default: 0.018},
    arcSeed: {type: 'number', default: 7},
    // One loop's full out-and-back, in seconds, before its own random spread is applied.
    arcPeriod: {type: 'number', default: 9},
    // How much of that period the loop is actually running. Below 1 it leaves dead time, which
    // is what makes loops appear at one place on the star and then at another.
    arcDuty: {type: 'number', default: 0.62},
  },

  init() {
    this.group = null
    this.uniforms = []
    this.timed = []
    this.plasmaMat = null
    this.phase = Math.random() * 6.283
    // Reused every frame; a fresh Vector2 per tick is pure churn.
    this._bufSize = new THREE.Vector2()
    this.build()
  },

  update(oldData) {
    if (!oldData || !Object.keys(oldData).length) return
    this.build()
  },

  build() {
    this.dispose()

    const d = this.data
    const col = starColor(d)
    const flux = fluxOf(d.magnitude, d.refMagnitude)
    const rgb = new THREE.Vector3(col[0], col[1], col[2])

    this.timed = []
    this.plasmaMat = null
    this.group = new THREE.Group()

    // --- body ------------------------------------------------------------------------------
    // 16x16, not 32x32: the halo covers the silhouette, so segments spent on a rounder outline
    // are segments nobody can see.
    const lit = d.surface > 0
    const bodyUniforms = {
      uCore: {value: lit ? rgb.clone().lerp(new THREE.Vector3(1, 1, 1), 0.16)
        : new THREE.Vector3(1, 1, 1).lerp(rgb, 0.25)},
      uLimb: {value: lit ? rgb.clone().multiplyScalar(0.50) : rgb.clone()},
      uLimbDark: {value: lit ? 0.72 : 0.45},
      uBright: {value: lit ? 2.1 : 1},
    }
    if (lit) {
      // A spot is cooler gas, not grey gas: it reads dark only against the photosphere around
      // it. Taking the star's own colour down toward black keeps it in the same family.
      bodyUniforms.uSpot = {value: rgb.clone().multiplyScalar(0.28)}
      bodyUniforms.uTime = {value: 0}
      bodyUniforms.uScale = {value: d.surfaceScale}
      bodyUniforms.uChurn = {value: d.churn}
      bodyUniforms.uSurface = {value: d.surface}
      bodyUniforms.uSpots = {value: d.spots}
      bodyUniforms.uSpin = {value: d.spin}
      bodyUniforms.uWarp = {value: d.warp}
    }
    const bodyMat = new THREE.ShaderMaterial({
      uniforms: bodyUniforms,
      vertexShader: BODY_VERT,
      fragmentShader: lit ? SURFACE_FRAG : BODY_FRAG,
    })
    // More segments only when there is surface detail to carry; the plain body hides its
    // silhouette inside the halo, so a rounder outline buys nothing there.
    const seg = lit ? 48 : 16
    const body = new THREE.Mesh(new THREE.SphereGeometry(d.radius, seg, seg), bodyMat)
    this.group.add(body)
    if (lit) this.timed.push(bodyMat.uniforms.uTime)

    // --- halo ------------------------------------------------------------------------------
    // uHaloK is set so the wide lobe is already under the discard threshold at the quad's rim.
    // If it is not, the quad's own square edge becomes visible wherever the halo is still lit.
    const haloMat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: {value: d.radius * 2 * d.haloScale},
        uBias: {value: d.radius * 1.1},
        uCol: {value: rgb.clone()},
        // A point source gets the tight PSF core; a RESOLVED disc does not. Left at 46 the
        // halo's core lands directly on the photosphere and washes every granule out of it,
        // which is the whole reason to have drawn a surface at all.
        uCoreK: {value: lit ? 9 : 46},
        uHaloK: {value: lit ? 13.0 : 6.2},
        uHaloAmt: {value: lit ? 0.5 : 0.34},
        uInner: {value: lit ? 1 / d.haloScale : 0},
        uBright: {value: (lit ? 0.95 : 0.62) * flux * d.intensity},
      },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    })
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat)
    halo.renderOrder = 2
    // The quad is a stand-in for light scattered in the instrument, not a surface at a place.
    // Culling it against its own 1x1 bounds would drop it the moment the shader grew it.
    halo.frustumCulled = false
    this.group.add(halo)
    this.uniforms.push({u: haloMat.uniforms.uBright, base: haloMat.uniforms.uBright.value})

    // --- glare -----------------------------------------------------------------------------
    // glareSpan is the WIDTH of the fade-in, so it can never be used as an off switch by
    // shrinking it: as it approaches zero the ratio blows up and every star brighter than
    // refMagnitude clamps to full spikes. Non-positive means off, explicitly.
    const glare = d.glareSpan > 0
      ? Math.max(0, Math.min(1, (d.refMagnitude + d.glareSpan - d.magnitude) / d.glareSpan))
      : 0
    if (glare > 0.001) {
      const glareMat = new THREE.ShaderMaterial({
        uniforms: {
          uSize: {value: d.radius * 2 * d.glareScale},
          uBias: {value: d.radius * 1.2},
          uCol: {value: rgb.clone()},
          uSharp: {value: 9000},
          // Large enough that a spike has faded out well before the quad's edge. Too slack and
          // the bars run to the quad's boundary and stop dead there, which reads as four rules
          // drawn across the sky rather than as glare.
          uLen: {value: 7.5},
          uBright: {value: 0.26 * glare * d.intensity},
        },
        vertexShader: BILLBOARD_VERT,
        fragmentShader: GLARE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
      })
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glareMat)
      g.renderOrder = 3
      g.frustumCulled = false
      this.group.add(g)
      this.uniforms.push({u: glareMat.uniforms.uBright, base: glareMat.uniforms.uBright.value})
    }

    // --- corona / prominences ----------------------------------------------------------------
    if (d.prominence > 0.001) {
      const coronaMat = new THREE.ShaderMaterial({
        uniforms: {
          uSize: {value: d.radius * 2 * d.coronaScale},
          // Only just clear of the body. Biasing it as far forward as the halo would lift the
          // arcs off the limb they are supposed to be attached to.
          uBias: {value: d.radius * 0.15},
          uCol: {value: rgb.clone()},
          uHot: {value: new THREE.Vector3(1, 1, 1).lerp(rgb, 0.45)},
          // The body's edge, expressed in the quad's own normalised radius: inside this the
          // shader discards, so the disc keeps its own shading.
          uInner: {value: 1 / d.coronaScale},
          uBright: {value: 0.9 * d.prominence * d.intensity},
          uTime: {value: 0},
          uStreak: {value: 6.5},
          uArc: {value: 11.0},
        },
        vertexShader: BILLBOARD_VERT,
        fragmentShader: CORONA_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
      })
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coronaMat)
      c.renderOrder = 1
      c.frustumCulled = false
      this.group.add(c)
      this.timed.push(coronaMat.uniforms.uTime)
    }

    // --- prominence loops ----------------------------------------------------------------------
    // The curves are the same field-line arches as before; only what is drawn along them
    // changed. Every loop on the star goes into ONE points geometry, so the whole prominence
    // system is a single draw call however many loops there are.
    const arcN = Math.round(d.arcs)
    if (arcN > 0) {
      const hot = rgb.clone().lerp(new THREE.Vector3(1, 1, 1), 0.12)
      // Cool dense gas against a hot corona: pushed toward red rather than simply darkened, so
      // the apex reads as a different material from the photosphere it is standing on.
      const cool = new THREE.Vector3(rgb.x, rgb.y * 0.45, rgb.z * 0.30)
      const R = d.radius
      const pos = [], col = [], siz = [], pha = [], par = [], cyc = []
      const SEGS = 96, STRANDS = 7

      const nrm = new THREE.Vector3(), bin = new THREE.Vector3(), tan = new THREE.Vector3()
      const at = new THREE.Vector3()

      for (let i = 0; i < arcN; i++) {
        const s = d.arcSeed + i * 13.7
        // A direction on the sphere for the loop to straddle, and a tangent for it to lean
        // along. Sampling cos(theta) uniformly rather than theta keeps them from bunching at
        // the poles of whatever frame the object happens to be built in.
        const ct = hash11(s) * 2 - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct))
        const ph = hash11(s + 1.3) * 6.2831853
        const n = new THREE.Vector3(st * Math.cos(ph), ct, st * Math.sin(ph))
        const ref = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        const t = new THREE.Vector3().crossVectors(n, ref).normalize()

        const span = 0.20 + hash11(s + 2.7) * 0.22          // half-angle between the footpoints
        const h = d.arcHeight * (0.6 + hash11(s + 3.1) * 0.8)
        const a = n.clone().multiplyScalar(Math.cos(span)).addScaledVector(t, Math.sin(span))
          .normalize().multiplyScalar(R * 0.97)
        const b = n.clone().multiplyScalar(Math.cos(span)).addScaledVector(t, -Math.sin(span))
          .normalize().multiplyScalar(R * 0.97)
        // Control points lifted along the surface normal give an arch that leaves and re-enters
        // the photosphere steeply, the way a field line anchored in it does - a straight lerp
        // toward the apex would produce a lazy hump sitting on the limb.
        const lift = n.clone().multiplyScalar(R * h * 1.9)
        const curve = new THREE.CubicBezierCurve3(
          a, a.clone().add(lift), b.clone().add(lift), b)

        const thick = R * d.arcThickness * (0.7 + hash11(s + 4.9) * 0.7)
        const loopBright = 0.75 + hash11(s + 5.5) * 0.5
        const period = d.arcPeriod * (0.65 + hash11(s + 7.3) * 0.9)
        const offset = hash11(s + 8.9)

        for (let j = 0; j < STRANDS; j++) {
          // Each strand keeps its own offset and twists at its own rate, so the loop is built
          // from separable filaments. Scattering the points uniformly through a tube volume
          // instead would just rebuild the sausage out of dots.
          const sj = s + 100 + j * 7.31
          const a0 = hash11(sj) * 6.2831853
          const twist = (hash11(sj + 1.1) - 0.5) * 5.0
          const rad = 0.12 + hash11(sj + 2.2) * 0.42
          const freq = 2.0 + hash11(sj + 3.3) * 5.0

          for (let k = 0; k < SEGS; k++) {
            const u = k / (SEGS - 1)
            curve.getPointAt(u, at)
            curve.getTangentAt(u, tan)
            bin.crossVectors(tan, n).normalize()
            nrm.crossVectors(bin, tan).normalize()

            // Taper toward the footpoints so the strands gather into the surface rather than
            // ending in mid-air at full width.
            const taper = 0.30 + 0.70 * Math.pow(Math.sin(Math.PI * u), 0.55)
            const ang = a0 + twist * u
            const rr = thick * rad * taper * (0.55 + 0.45 * Math.sin(u * freq + a0))
            const jx = (hash11(sj + k * 0.917) - 0.5) * thick * 0.25
            const jy = (hash11(sj + k * 1.373) - 0.5) * thick * 0.25

            pos.push(
              at.x + nrm.x * Math.cos(ang) * rr + bin.x * Math.sin(ang) * rr + jx,
              at.y + nrm.y * Math.cos(ang) * rr + bin.y * Math.sin(ang) * rr + jy,
              at.z + nrm.z * Math.cos(ang) * rr + bin.z * Math.sin(ang) * rr)

            // Hot and white where it leaves the photosphere, cooler and redder at the top: a
            // prominence is cool dense gas held up in a hot corona, which is why it reads red.
            const along = Math.abs(u - 0.5) * 2
            const hb = hash11(sj + k * 3.77)
            const bright = loopBright * (0.45 + 0.55 * along) * (0.28 + hb * hb * 1.25)
            col.push(
              (cool.x + (hot.x - cool.x) * along) * bright,
              (cool.y + (hot.y - cool.y) * along) * bright,
              (cool.z + (hot.z - cool.z) * along) * bright)
            const hz = hash11(sj + k * 2.11)
            siz.push(thick * (0.7 + hz * hz * 2.6))
            pha.push(hash11(sj + k * 0.511) * 6.2831853)
            par.push(u)
            cyc.push(period, offset)
          }
        }
      }

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
      geo.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1))
      geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(pha, 1))
      geo.setAttribute('aU', new THREE.Float32BufferAttribute(par, 1))
      geo.setAttribute('aCycle', new THREE.Float32BufferAttribute(cyc, 2))

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: {value: 0},
          // Filled in per frame from the drawing buffer, so a point's world size survives a
          // change of resolution or of field of view.
          uPixH: {value: 600},
          uBright: {value: 0.42 * d.intensity},
          uSoft: {value: 3.0},
          // The share of each loop's period spent actually running. The remainder is dead time,
          // and without it every site would be lit at all times and nothing would ever "appear".
          uDuty: {value: d.arcDuty},
          uEdge: {value: 0.10},
        },
        vertexShader: PLASMA_VERT,
        fragmentShader: PLASMA_FRAG,
        transparent: true,
        depthWrite: false,
        // depthTest stays ON: points on the far side must be hidden by the star's own body,
        // and that occlusion is most of what keeps the loops three-dimensional.
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        blendEquation: THREE.AddEquation,
      })
      const cloud = new THREE.Points(geo, mat)
      cloud.renderOrder = 1
      cloud.frustumCulled = false
      this.group.add(cloud)
      this.timed.push(mat.uniforms.uTime)
      this.plasmaMat = mat
    }

    this.el.setObject3D('starVisual', this.group)
  },

  // Scintillation is atmospheric, so it belongs to the glow rather than to the body: the disc
  // is not what varies, the light arriving through the air is. Two stars next to each other
  // must never pulse together, hence the per-instance phase.
  tick(time) {
    const t = time * 0.001
    for (let i = 0; i < this.timed.length; i++) this.timed[i].value = t
    if (this.plasmaMat) {
      // World size to pixels: half the drawing buffer's height over tan(half the vertical fov).
      // Hard-coding it would make the plasma coarser on a phone than on a desktop, which is
      // backwards - the phone is the device that can least afford oversized points.
      const sceneEl = this.el.sceneEl
      const cam = sceneEl && sceneEl.camera
      const rend = sceneEl && sceneEl.renderer
      if (cam && rend) {
        rend.getDrawingBufferSize(this._bufSize)
        this.plasmaMat.uniforms.uPixH.value =
          this._bufSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5))
      }
    }
    if (!this.data.twinkle || !this.uniforms.length) return
    const w = 1 + this.data.twinkle * (
      0.6 * Math.sin(t * 2.1 + this.phase) + 0.4 * Math.sin(t * 3.7 + this.phase * 1.7))
    for (let i = 0; i < this.uniforms.length; i++) {
      this.uniforms[i].u.value = this.uniforms[i].base * w
    }
  },

  dispose() {
    if (!this.group) return
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
    this.el.removeObject3D('starVisual')
    this.group = null
    this.uniforms = []
    this.timed = []
    this.plasmaMat = null
  },

  remove() {
    this.dispose()
  },
}

export {starVisualComponent, starColor, bbColor, fluxOf}
export default starVisualComponent
