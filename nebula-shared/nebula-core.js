// nebula-shared/nebula-core.js - the single source of truth for the nebula test engine.
//
// The nebula engine, shared by both test harnesses so they can never drift:
//   nebula-ar/    an 8th Wall A-Frame scene, over the live camera feed
//   nebula-lab/   a plain three.js scene against black, for quick desktop iteration
//
// Everything below is host-agnostic: the density field, the shaders, the object builders,
// the parameter schema and the control panel. A host supplies a renderer, a camera and a
// place to put the object.
(function (global) {
  'use strict'
  var THREE = global.THREE || (global.AFRAME && global.AFRAME.THREE)


      // ------------------------------------------------ density field (shared by all modes)
      // Same construction as the app's deep-sky-field.js: an ellipsoidal envelope, gaussian
      // cores, fBm to the power of contrast, minus a ridged dust term. Used to place points
      // AND to bake the 3D texture, so every technique draws the same object.
      function hash(x, y, z) { var s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123; return s - Math.floor(s) }
      function vnoise(x, y, z) {
        var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
        var xf = x - xi, yf = y - yi, zf = z - zi
        var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
        function L(a, b, t) { return a + (b - a) * t }
        return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
          L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w)
      }
      function fbm(x, y, z, o) { var a = .5, f = 1, s = 0, n = 0; for (var i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); n += a; a *= .5; f *= 2.02 } return s / n }
      function ridged(x, y, z, o) { var a = .5, f = 1, s = 0, n = 0; for (var i = 0; i < o; i++) { s += a * (1 - Math.abs(vnoise(x * f, y * f, z * f) * 2 - 1)); n += a; a *= .5; f *= 2.02 } return s / n }
      function chash(i, salt) { var v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v) }
      var LAYOUT = [], LAYOUT_KEY = null
      function ensureLayout(P) {
        var key = Math.round(P.clouds) + ':' + Math.round(P.layout) + ':' + Math.round(P.seed)
        if (key === LAYOUT_KEY) return LAYOUT
        var n = Math.max(1, Math.round(P.clouds)), lay = Math.round(P.layout) + Math.round(P.seed) * 7, out = []
        for (var i = 0; i < n; i++) {
          var ang = chash(i + 1, lay + 1) * 6.2831853
          var off = n === 1 ? 0 : 0.30 * Math.sqrt(chash(i + 13, lay + 5))
          // More clouds means smaller ones, so the object keeps roughly the same presence.
          var r = (n === 1 ? 0.48 : 0.46 / Math.pow(n, 0.42)) * (0.75 + 0.5 * chash(i + 19, lay + 7))
          var cx = Math.cos(ang) * off, cy = (chash(i + 23, lay + 11) - 0.5) * 0.40, cz = Math.sin(ang) * off * 0.9
          var cores = []
          for (var k = 0; k < 4; k++) {
            cores.push([
              cx + (chash(k + 2, lay + i * 7 + 1) - 0.5) * r * 0.8,
              cy + (chash(k + 5, lay + i * 7 + 2) - 0.5) * r * 0.6,
              cz + (chash(k + 9, lay + i * 7 + 3) - 0.5) * r * 0.7,
              r * (0.26 + 0.24 * chash(k + 11, lay + i * 7 + 4))])
          }
          out.push({x: cx, y: cy, z: cz, r: r, cores: cores, seed: 17.3 * (i + 1) + lay * 3.7})
        }
        LAYOUT = out; LAYOUT_KEY = key
        return LAYOUT
      }
      // A slow, large-scale field used twice: to make some regions of a cloud much denser
      // than others, and (baked separately) to vary colour independently of density.
      function lowFreq(x, y, z, scale, seed) {
        return fbm(x * scale + seed, y * scale + seed * 0.7, z * scale + seed * 1.3, 2)
      }
      function tintAt(x, y, z, P) {
        var L = LAYOUT.length ? LAYOUT[0] : {seed: 0}, best = -1, t = 0.5
        for (var i = 0; i < LAYOUT.length; i++) {
          var c = LAYOUT[i]
          var dx = x - c.x, dy = y - c.y, dz = z - c.z
          var q = 1 - Math.min(1, (dx * dx + dy * dy + dz * dz) / (c.r * c.r))
          if (q > best) { best = q; L = c }
        }
        t = lowFreq(x, y, z, P.turbulence * 0.55, L.seed + 61.7)
        return Math.max(0, Math.min(1, (t - 0.28) / 0.44))
      }

      function densityAt(x, y, z, P) {
        var best = 0, bestCore = 0, bestIdx = 0
        for (var ci = 0; ci < LAYOUT.length; ci++) {
          var L = LAYOUT[ci]
          // Shape: the envelope radii are scriptable, so a cloud can be stretched, flattened
          // or given a harder edge without touching the noise that fills it.
          var qx = (x - L.x) / (L.r * P.stretch), qy = (y - L.y) / (L.r * .72 * P.flatten), qz = (z - L.z) / (L.r * .80)
          var e = qx * qx + qy * qy + qz * qz
          if (e > 1) continue
          var d = Math.pow(1 - e, P.falloff), b = 0
          for (var i = 0; i < 4; i++) {
            var c = L.cores[i], dx = x - c[0], dy = y - c[1], dz = z - c[2]
            b += Math.exp(-(dx * dx + dy * dy + dz * dz) / (c[3] * c[3]))
          }
          d *= 1 + b * P.coreGain
          var t = P.turbulence, sd = L.seed + P.seed * 13.7
          // Domain warping bends the noise lookup, turning round clumps into strands.
          var wx = x, wy = y, wz = z
          if (P.warp > 0) {
            var k = t * 0.5, w = P.warp * 0.6
            wx += (fbm(x * k + sd + 3.1, y * k + sd, z * k + sd, 2) - 0.5) * w
            wy += (fbm(x * k + sd + 17.7, y * k + sd, z * k + sd, 2) - 0.5) * w
            wz += (fbm(x * k + sd + 31.3, y * k + sd, z * k + sd, 2) - 0.5) * w
          }
          d *= Math.pow(fbm(wx * t + 11.3 + sd, wy * t + 4.7 + sd, wz * t + 19.1 + sd, 4), P.contrast)
          var du = ridged(wx * t * .65 + 51.2 + sd, wy * t * .65 + 8.4 + sd, wz * t * .65 + 33.9 + sd, 3)
          d *= 1 - P.dust * du * du
          // Patchiness: some parts of the same cloud come out far denser than others.
          if (P.clump > 0) {
            var cl = lowFreq(x, y, z, t * P.clumpScale, sd + 137.1)
            d *= (1 - P.clump) + P.clump * 2.15 * cl
          }
          if (d > best) { best = d; bestCore = Math.min(1, b); bestIdx = ci }
        }
        return {d: Math.max(0, best), core: bestCore, cloud: bestIdx}
      }

      // ------------------------------------------------ shaders
      var VERT = 'out vec3 vLocal;\nvoid main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      var NOISE = [
        'float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453123); }',
        'float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); vec3 u=f*f*(3.0-2.0*f);',
        ' float c000=h3(i),c100=h3(i+vec3(1,0,0)),c010=h3(i+vec3(0,1,0)),c110=h3(i+vec3(1,1,0));',
        ' float c001=h3(i+vec3(0,0,1)),c101=h3(i+vec3(1,0,1)),c011=h3(i+vec3(0,1,1)),c111=h3(i+vec3(1,1,1));',
        ' return mix(mix(mix(c000,c100,u.x),mix(c010,c110,u.x),u.y), mix(mix(c001,c101,u.x),mix(c011,c111,u.x),u.y), u.z); }',
        'float fbm(vec3 p,int o){ float a=0.5,f=1.0,s=0.0,n=0.0; for(int i=0;i<6;i++){ if(i>=o) break; s+=a*vnoise(p*f); n+=a; a*=0.5; f*=2.02; } return s/n; }',
        'float ridged(vec3 p,int o){ float a=0.5,f=1.0,s=0.0,n=0.0; for(int i=0;i<5;i++){ if(i>=o) break; s+=a*(1.0-abs(vnoise(p*f)*2.0-1.0)); n+=a; a*=0.5; f*=2.02; } return s/n; }'
      ].join('\n')

      // The galaxy keeps its own density function, its own box slab and its own two-stop
      // colour: everything added for the nebula defaults to zero, so a galaxy preset renders
      // exactly what it did before.
      function frag(useTex) {
var GALAXY = [
          'float galBulge(vec3 p){ vec3 q = vec3(p.x, p.y/max(0.05,uGalBulgeFlat), p.z);',
          '  float b = length(q)/max(0.001,uGalBulge); float g = exp(-b*b);',
          // With a bulge this small, one or two march samples land inside exp(-b*b) and WHICH
          // ones changes every frame with the dither, so the core boils. Widening what the
          // march sees guarantees three; the sprite keeps the hard centre. 0 is the old bulge.
          '  if (uGalBulgeSoft > 0.0) g = mix(g, exp(-b*b*0.18), uGalBulgeSoft);',
          '  return g; }',
          'float galaxyDensity(vec3 p){',
          // Cleared first, so an early return cannot leave the previous sample's arm weight
          // standing for the colour pass to read.
          ' gArm = 0.0; gFbm = 0.5; gBul = 0.0;',
          ' float r = length(p.xz); float rn = r/uGalRadius;',
          ' if (rn > 1.0) return 0.0;',
          // The disk thickens toward the rim, the way a real one flares.
          ' float h = uGalThick * (1.0 + uGalFlare * rn * 2.0);',
          ' float vert = exp(-(p.y*p.y)/(h*h));',
          ' float radial = pow(max(0.0, 1.0 - rn), uGalFalloff);',
          ' float bul = galBulge(p) * uGalBulgeGain;',
          // Lifting the bulge OUT of the disc gaussian and out of the fBm multiply is what
          // lets galBulgeFlat govern its isophotes, and stops it collapsing to a razor streak
          // when galThick drops for a real inclination. Lift 0 is exactly the old behaviour.
          ' float bl = bul*uGalBulgeLift, bd = bul - bl;',
          ' gBul = bul;',
          // An EXACT upper bound, not an approximation: arm <= 1, pow(fbm,c) <= 1 for c >= 1,
          // the dust factor is <= 1, and the clump factor tops out at 1 + 1.15*uClump. Tested
          // against the march loop's own d > 0.002 discard, so a cull below that can only skip
          // samples the loop would have thrown away. uGalCull 0 makes this never fire.
          ' float hi = (radial + bd)*vert*(1.0 + 1.15*uClump) + bl;',
          ' if (hi*uDensity < uGalCull) return 0.0;',
          ' vec3 w = p;',
          ' if (uWarp > 0.0) { float k = uTurb*0.5;',
          '   w += (vec3(fbm(p*k+vec3(uSeed+3.1),2), fbm(p*k+vec3(uSeed+17.7),2), fbm(p*k+vec3(uSeed+31.3),2)) - 0.5) * uWarp * 0.6; }',
          // Hoisted above the arm so one fetch serves the density, the arm wobble, the
          // fragmenter and the colour mottle. Same arguments, same value as before.
          ' float fn = fbm(w*uTurb+vec3(11.3+uSeed,4.7,19.1),4);',
          ' gFbm = fn;',
          // Logarithmic spiral: the arm phase winds with log(radius).
          ' float th = atan(p.z, p.x);',
          ' float lr = log(max(rn, 0.05));',
          ' float phase = th * uGalArms - lr * uGalWind;',
          // Real arms wander in and out of the log spiral. Free - fn is already in a register.
          ' if (uGalArmWobble > 0.0) phase += (fn - 0.5)*uGalArmWobble;',
          ' float arm = pow(0.5 + 0.5*cos(phase), uGalArmWidth);',
          // Cells in SPIRAL coordinates: lr runs along the arm and phase across it, so they
          // come out long one way and short the other and the arm breaks into short arcs
          // rather than round blobs. M31 is flocculent, not grand design.
          ' if (uGalFrag > 0.0) {',
          '  float fg = vnoise(vec3(lr*uGalFragAlong, phase*uGalFragAcross, uSeed*3.7 + p.y*6.0));',
          '  arm *= mix(1.0, smoothstep(0.30, 0.72, fg)*1.5, uGalFrag);',
          ' }',
          ' gArm = clamp(arm, 0.0, 1.0);',
          // uGalArmFloor was a hardcoded 0.22, which caps arm-to-interarm contrast at 4.5:1
          // however tight the arms are. 0.12 lifts it to 8.3:1.
          ' float d = (radial * (uGalArmFloor + (1.0-uGalArmFloor)*arm) + bd) * vert;',
          ' d *= pow(fn, uContrast);',
          // Guarded where it was unconditional: identical whenever uDust > 0, and it hands
          // back three noise fetches a step the moment a preset sets dust to 0. uDust is the
          // INVERSE of a dust lane anyway - it thins the gas, giving a hole with LOWER alpha
          // that you see through. The lanes are galDust().
          ' if (uDust > 0.0) { float du=ridged(w*uTurb*0.65+vec3(51.2+uSeed,8.4,33.9),3); d *= 1.0-uDust*du*du; }',
          ' if (uClump > 0.0) { float cl = fbm(w*uTurb*uClumpScale + vec3(137.1+uSeed,95.9,178.3), 2);',
          '   d *= (1.0 - uClump) + uClump * 2.15 * cl; }',
          // The lifted bulge is added last and unmottled: a real bulge is smooth.
          ' return max(d,0.0) + bl;',
          '}',
          // ---- dust lanes ---------------------------------------------------------------
          // Feeds the extinction exponent with NO emission, so it blocks the bulge and the far
          // half of the disc instead of thinning the gas in front of them.
          'float galDust(vec3 p){',
          ' if (uLaneAmt <= 0.0) return 0.0;',
          ' float rn = length(p.xz)/uGalRadius;',
          // Windowed FIRST, so the atan, the log and the noise are only paid for inside the
          // annulus that has lanes at all. M31's dust peaks near half the visible radius, with
          // a real deficit in the middle - not out at the rim.
          ' float win = smoothstep(uLaneIn, uLaneIn*2.4, rn)*(1.0 - smoothstep(uLaneOut*0.72, uLaneOut, rn));',
          ' if (win <= 0.0001) return 0.0;',
          // A third of the gas scale height, and THAT difference is the whole silhouette: at
          // this inclination only the near half of the sheet lies in front of the bulge, so
          // there you see the full exp(-tau) while the far side is diluted by the emission in
          // front of it. Front-to-back accumulation gives that asymmetry for free, and it is
          // the strongest cue for which way the disc is tipped.
          ' float hd = uGalThick*(1.0 + uGalFlare*rn*2.0)*uLaneThick;',
          ' float vd = exp(-(p.y*p.y)/(hd*hd));',
          ' if (vd < 0.02) return 0.0;',
          ' float th = atan(p.z, p.x);',
          ' float lr = log(max(rn, 0.05));',
          // The same logarithmic spiral the arms use, in TURNS so the fract() below folds
          // exactly one lane per unit. phase falls with radius, so a NEGATIVE offset puts the
          // lane INSIDE its arm, on the trailing edge where the shock compresses the gas - and
          // arm and lane then alternate as you move outward.
          ' float u1 = (th*uGalArms - lr*uGalWind*uLaneWind)*0.15915494 + uLaneOff;',
          ' if (uLaneWob > 0.0) u1 += (vnoise(vec3(lr*4.3, th*1.7, uSeed*2.9)) - 0.5)*uLaneWob;',
          // Triangle fold: one narrow trough per unit of u1, at constant width however many
          // lanes the winding produces. pow(cos) would need an exponent near 300 for the same
          // width, and its shoulders would grey out the gaps between lanes.
          ' float t1 = abs(fract(u1) - 0.5);',
          ' float L = exp(-t1*t1*uLaneK);',
          // A second family at the golden ratio never realigns with the first, so the radial
          // spacing is aperiodic for one exp rather than another noise octave.
          ' if (uLane2 > 0.0) { float t2 = abs(fract(u1*1.6180340 + 0.37) - 0.5);',
          '   L = max(L, uLane2*exp(-t2*t2*uLaneK*1.7)); }',
          ' return clamp(L*vd*win*uLaneAmt, 0.0, 1.0);',
          '}'
        ].join('\n')

        // The shape of the gas, with no noise in it. Its own function because the lighting
        // term samples it too, and because it can return zero - which culls the ten noise
        // fetches below before any of them are paid for.
        var ENV = [
          'float envAt(vec3 p){',
          ' vec3 q = p/uEnvR; float e = dot(q,q);',
          ' if (e > 1.0) return 0.0;',
          ' float d = pow(1.0 - e, uFalloff);',
          ' if (uHollow > 0.0) {',
          // A blister HII region is a cavity blown in the face of a molecular cloud: the
          // density MAXIMUM sits on the cavity wall, not at the centre. uHollow at 0 is the
          // solid ellipsoid this has always been.
          '  float wl = (sqrt(e) - uShellR)*uShellK;',
          '  d = mix(d, exp(-wl*wl)*(1.0 - e), uHollow);',
          ' }',
          ' if (uBipolar > 0.0) {',
          // cos^2 about the outflow axis: fat at both poles, pinched at the waist, which is
          // the two-winged silhouette. uLobeBias makes one wing the larger one. No atan.
          '  vec3 r = p - uKnot;',
          '  float ax = dot(r, uLobeAxis)*inversesqrt(max(dot(r,r), 1e-6));',
          '  float lobe = clamp(ax*ax*(1.0 + uLobeBias*ax), 0.0, 1.0);',
          '  lobe = mix(lobe, lobe*lobe, uLobeSharp);',
          '  d *= mix(1.0, lobe, uBipolar);',
          ' }',
          ' return d; }'
        ].join('\n')

        // An authored opaque cloud sitting IN the gas: it absorbs and does not emit. The old
        // uDust term multiplies density down, which makes a lane a hole with LOWER alpha that
        // you see straight through - the exact inverse of a dark nebula.
        //
        // sd is monotone across the boundary, so the scallop noise only has to be evaluated
        // inside a thin band around it, and that band is a coherent surface on screen.
        var DARK = [
          'vec2 darkAt(vec3 p){',
          // Bounded to the gas. A bare half-space keeps absorbing out into empty sky, where
          // there is nothing behind it to occlude and nothing lighting it - so it renders as
          // a flat brown disc cut off at the march bounds rather than as a cloud.
          ' vec3 eq = p/uEnvR; float ee = dot(eq,eq);',
          ' if (ee > 1.15) return vec2(0.0);',
          ' float eb = 1.0 - smoothstep(0.45, 1.1, ee);',
          // A sphere centred OUTSIDE the gas takes a curved bite out of one side, which is
          // what a dark intrusion looks like. A bare half-space just paints out half the
          // object. Radius 0 falls back to the plane, for a lane that crosses the whole body.
          ' float sd = (uDarkR > 0.0) ? (length(p - uDarkPos) - uDarkR)',
          '                           : dot(p - uDarkPos, uDarkDir);',
          ' if (uDark2R > 0.0) sd = min(sd, length(p - uDark2Pos) - uDark2R);',
          ' float band = uDarkScallop + uRimW + uDarkEdge;',
          ' if (sd >  band) return vec2(0.0);',
          ' if (sd < -band) return vec2(eb, 0.0);',
          ' sd += (vnoise(p*uDarkScale + uSeed*7.3) - 0.5)*2.0*uDarkScallop;',
          ' float dk  = 1.0 - smoothstep(-uDarkEdge, uDarkEdge, sd);',
          // Gas piles up and is lit hardest right where it meets the cloud - the
          // photoevaporative flow. It reuses sd, so the rim costs four instructions.
          ' float rim = (sd > 0.0) ? (1.0 - smoothstep(0.0, uRimW, sd)) : 0.0;',
          ' return vec2(dk*eb, rim*eb); }'
        ].join('\n')

        var BOUNDS = useTex ? [
          ' vec3 inv=1.0/rd; vec3 t0=(vec3(-uHalf)-ro)*inv, t1=(vec3(uHalf)-ro)*inv;',
          ' vec3 tn=min(t0,t1), tf=max(t0,t1);',
          ' tEnter=max(max(tn.x,tn.y),tn.z); tExit=min(min(tf.x,tf.y),tf.z);'
        ] : [
          ' if (uIsGalaxy > 0.5) {',
          '  vec3 inv=1.0/rd; vec3 t0=(vec3(-uHalf)-ro)*inv, t1=(vec3(uHalf)-ro)*inv;',
          '  vec3 tn=min(t0,t1), tf=max(t0,t1);',
          '  tEnter=max(max(tn.x,tn.y),tn.z); tExit=min(min(tf.x,tf.y),tf.z);',
          // A disc is a thin slab through the middle of its marching box, so a ray through the
          // box spends most of its steps in empty space above and below it - and at a low step
          // count most pixels barely sample the disc at all. Clipping the ray to the slab and
          // the cylinder the disc can occupy puts every step where there is something to see.
          // The slab half-height covers the flared rim and the softened bulge.
          '  if (uGalBound > 0.5) {',
          '   float H = max(uGalThick*(1.0 + uGalFlare*2.0)*2.6,',
          '                 uGalBulge*max(0.05, uGalBulgeFlat)*mix(3.0, 8.0, uGalBulgeSoft));',
          '   if (abs(rd.y) > 1e-5) {',
          '    float s0 = (-H - ro.y)/rd.y, s1 = (H - ro.y)/rd.y;',
          '    tEnter = max(tEnter, min(s0, s1)); tExit = min(tExit, max(s0, s1));',
          '   } else if (abs(ro.y) > H) discard;',
          '   float ca = dot(rd.xz, rd.xz), cb = dot(ro.xz, rd.xz), cc = dot(ro.xz, ro.xz) - uGalRadius*uGalRadius;',
          '   if (ca > 1e-8) {',
          '    float ch = cb*cb - ca*cc; if (ch < 0.0) discard; ch = sqrt(ch);',
          '    tEnter = max(tEnter, (-cb - ch)/ca); tExit = min(tExit, (-cb + ch)/ca);',
          '   } else if (cc > 0.0) discard;',
          '  }',
          ' } else {',
          // A unit cube's inscribed ellipsoid is under a third of its volume, so most rays
          // were spending most of their steps in empty corners.
          '  vec2 eh = hitEllipsoid(ro, rd, uEnvR*uMarchPad);',
          '  tEnter = eh.x; tExit = eh.y;',
          ' }'
        ]

        var COLOUR = useTex ? [
          '   vec4 vol = texture(uVol, p+0.5);',
          '   float raw = vol.r;',
          '   float lo = 0.30 - uSpread * 0.26, hi = 0.85 - uSpread * 0.45;',
          '   float cd = smoothstep(lo, max(lo + 0.05, hi), raw);',
          '   float c = clamp(mix(cd, vol.b, uSpread * 0.65), 0.0, 1.0);',
          '   float g = vol.g * float(max(1, uCloudN - 1));',
          '   int k0 = clamp(int(floor(g)), 0, uCloudN - 1);',
          '   int k1 = clamp(k0 + 1, 0, uCloudN - 1);',
          '   float kf = fract(g);',
          '   emit = mix(mix(uCloudA[k0],uCloudA[k1],kf), mix(uCloudB[k0],uCloudB[k1],kf), c) * uEmission;'
        ] : [
          // gArm, gFbm and gBul are written by galaxyDensity(). Load-bearing ordering: this
          // block runs BEFORE the lighting block, and lighting is the only thing that re-enters
          // densityAt() within a step.
          '   if (uGalPal > 0.5) {',
          // Colour by RADIUS, not by brightness: a bright knot in the outer disc has to stay
          // blue and a faint patch of inner disc has to stay peach. The branch below cannot do
          // that at all - its only radius term is galBulge(), which is dead beyond about twice
          // the bulge scale.
          '    float rc = length(p.xz)/uGalRadius;',
          '    float s = clamp((rc - uColIn)*uColSlope, 0.0, 1.0);',
          // A bare radial ramp reads flat because its level sets are circles. Each of these
          // bends them into something that is not a circle, and all three are already in a
          // register. uColArm earns the most: blue arms against peach interarm gas at the SAME
          // radius is the one cue that stops this being a vignette.
          '    s += uColArm*(gArm - 0.5) + uColNoise*(gFbm - 0.5);',
          '    s -= uColDense*min(rho*uColDenseK, 1.0);',
          '    s = clamp(s + (dither - 0.5)*0.03, 0.0, 1.0);',
          '    float k2 = s*2.0;',
          '    vec3 cc = mix(uCream, uPeach, clamp(k2,       0.0, 1.0));',
          '    cc      = mix(cc,     uArmC,  clamp(k2 - 1.0, 0.0, 1.0));',
          // The bulge overrides using its OWN profile, so gas and stars turn warm over the
          // same distance and one slider moves both.
          '    cc = mix(cc, uCream, clamp(gBul*uBulgeMix, 0.0, 1.0));',
          '    emit = cc*uEmission;',
          '   } else if (uIonAmt > 0.5) {',
          // The ionisation parameter goes as Q/(r^2 n). Q/(Q+r^2) is 1 at the source and
          // falls with a POWER-LAW tail, which is the slow grade over roughly ten core radii
          // that the photographs show - a gaussian dies far too fast to look like this.
          '    vec3 kr = p - uKnot;',
          '    float ion = uKnotQ/(uKnotQ + dot(kr,kr));',
          // Dividing by density is what stops this reading as a plain radial vignette: a
          // dense clump close in stays red, so the colour boundary inherits the fractal
          // shape of the gas instead of being a sphere.
          '    ion /= 1.0 + rho*uIonDens;',
          '    float s = clamp((ion - uIon0)/max(1e-3, uIon1 - uIon0), 0.0, 1.0);',
          '    s = clamp(s + (dither - 0.5)*0.02, 0.0, 1.0);',   // just enough to break the four stops
          '    float k3 = s*3.0;',
          // Four stops: deep rose, magenta, blue-white, then uHot - which is above 1 on all
          // three channels, so the core drives past the white point and the tone curve clips
          // it to white the way a sensor does.
          '    vec3 cc = mix(uHa,  uMid,  clamp(k3,       0.0, 1.0));',
          '    cc      = mix(cc,   uOiii, clamp(k3 - 1.0, 0.0, 1.0));',
          '    cc      = mix(cc,   uHot,  clamp(k3 - 2.0, 0.0, 1.0));',
          '    emit = cc*uEmission;',
          '   } else {',
          '    float cd = uIsGalaxy > 0.5 ? clamp(galBulge(p)*1.6, 0.0, 1.0) : clamp(coreAt(p)*0.3, 0.0, 1.0);',
          '    float tn = fbm(p*uTurb*0.55 + vec3(61.7,43.2,88.1), 2);',
          '    float tint = clamp((tn - 0.28) / 0.44, 0.0, 1.0);',
          '    float c = clamp(mix(cd, tint, uSpread * 0.65), 0.0, 1.0);',
          '    emit = mix(uHa,uOiii,c)*uEmission;',
          '   }'
        ]

        var LIGHT = useTex ? [
          '   if(uLight>0.5){ vec3 L=normalize(uKnot-p);',
          '    float lit=clamp((d-densityAt(p+L*0.09)*uDensity)/0.09,0.0,1.0);',
          '    emit *= 0.45+0.55*lit*uLight; }'
        ] : [
          '   if(uLight>0.5){ vec3 kl=uKnot-p; vec3 L=kl*inversesqrt(max(dot(kl,kl),1e-6));',
          // The galaxy keeps the full density tap. For the nebula it is the noise-free
          // envelope instead: a quarter of the cost, and it is allowed to exceed 1, so a lit
          // face reads lit rather than merely less dark.
          '    float lit = uIsGalaxy > 0.5 ? clamp((d-densityAt(p+L*0.09)*uDensity)/0.09,0.0,1.0)',
          '                                : clamp((envAt(p)-envAt(p+L*0.09))/0.09,0.0,1.0);',
          '    emit *= uIsGalaxy > 0.5 ? (0.45+0.55*lit*uLight) : (0.45+0.9*lit*uLight); }'
        ]

        return [
          'precision highp float;',
          useTex ? 'precision highp sampler3D;' : '',
          'in vec3 vLocal;', 'out vec4 fragColor;',
          'uniform vec3 uCamLocal, uHa, uOiii;',
          'uniform float uSteps,uDensity,uAbsorb,uEmission,uTurb,uContrast,uDust,uCoreGain,uFrame,uLight;',
          'uniform float uSpread, uClump, uClumpScale;',
          'uniform float uSeed, uStretch, uFlatten, uFalloff, uWarp;',
          'uniform vec4 uCores[4];',
          'uniform float uIsGalaxy, uHalf;',
          // Everything below is new and defaults to zero, so it costs a branch and nothing else
          // until a preset turns it on. Declared ONCE, shared by both variants: a uniform
          // declared in both arms of the useTex switch would be a duplicate and fail to link.
          'uniform vec3 uEnvR, uKnot, uLobeAxis, uDarkPos, uDarkDir, uDark2Pos, uDarkTint, uMid, uHot;',
          'uniform float uMarchPad, uDetail, uHollow, uShellR, uShellK, uBipolar, uLobeSharp, uLobeBias;',
          'uniform float uStriate, uStriaGain;',
          'uniform float uDarkAbsorb, uDarkR, uDark2R, uDarkScallop, uDarkScale, uDarkEdge, uRimGain, uRimW;',
          'uniform float uEmitRho, uIonAmt, uKnotQ, uIon0, uIon1, uIonDens, uWhite;',
          // Read inside the SHARED march loop and the shared tone tail, so they are declared
          // once here. A uniform declared in both arms of the useTex switch fails to link.
          'uniform float uGalDustAbsorb, uGalDustBlue, uGalDustVeil, uHueKeep, uHueBreak;',
          useTex ? 'uniform vec3 uCloudA[6]; uniform vec3 uCloudB[6]; uniform int uCloudN;' : '',
          useTex ? '' : 'uniform float uGalRadius, uGalThick, uGalFlare, uGalBulge, uGalBulgeGain, uGalArms, uGalWind, uGalArmWidth, uGalFalloff, uGalBulgeFlat;',
          useTex ? '' : 'uniform float uGalCull, uGalBulgeLift, uGalBulgeSoft, uGalArmFloor, uGalArmWobble, uGalFrag, uGalFragAlong, uGalFragAcross, uGalBound;',
          useTex ? '' : 'uniform float uLaneAmt, uLaneK, uLaneWind, uLaneOff, uLane2, uLaneThick, uLaneIn, uLaneOut, uLaneWob;',
          useTex ? '' : 'uniform float uGalPal, uColIn, uColSlope, uColArm, uColNoise, uColDense, uColDenseK, uBulgeMix;',
          useTex ? '' : 'uniform vec3 uCream, uPeach, uArmC;',
          useTex ? 'uniform sampler3D uVol;' : NOISE,
          // Interleaved gradient noise (Jimenez). fract(sin(dot)) is white noise, and its
          // energy sits in exactly the low frequencies the eye picks out as banding; this is
          // roughly blue in screen space and buys most of a doubled step count for five ops.
          'float ign(vec2 q){ return fract(52.9829189*fract(dot(q, vec2(0.06711056,0.00583715)))); }',
          'float coreAt(vec3 p){ float b=0.0;',
          ' for(int i=0;i<4;i++){ vec3 d=p-uCores[i].xyz; b += exp(-dot(d,d)/(uCores[i].w*uCores[i].w)); }',
          ' return b; }',
          useTex ? 'vec2 darkAt(vec3 p){ return vec2(0.0); } float galDust(vec3 p){ return 0.0; }' : [
            'vec2 hitEllipsoid(vec3 ro, vec3 rd, vec3 R){',
            ' vec3 o=ro/R, dd=rd/R;',
            ' float a=dot(dd,dd), b=dot(o,dd), c=dot(o,o)-1.0, h=b*b-a*c;',
            ' if (h < 0.0) return vec2(1.0, -1.0);',
            ' h = sqrt(h);',
            ' return vec2((-b-h)/a, (-b+h)/a); }',
            // Written by galaxyDensity(), read by the galaxy colour branch. Declared in the
            // PROCEDURAL arm only - the texture variant neither writes nor reads them.
            'float gArm = 0.0; float gFbm = 0.5; float gBul = 0.0;',
            GALAXY, ENV, DARK].join('\n'),
          'float densityAt(vec3 p){',
          useTex ? ' return texture(uVol, p+0.5).r;' : [
            ' if (uIsGalaxy > 0.5) return galaxyDensity(p);',
            ' float d = envAt(p);',
            ' d *= 1.0+coreAt(p)*uCoreGain;',
            ' if (d < 0.0015) return 0.0;',
            ' vec3 w = p;',
            ' if (uWarp > 0.0) { float k = uTurb*0.5;',
            // One octave, not three two-octave fBms. At this displacement the second octave
            // moves the lookup by well under a percent of the object and costs three fetches.
            '  vec3 wv = vec3(vnoise(p*k+vec3(uSeed+3.1)), vnoise(p*k+vec3(uSeed+17.7)), vnoise(p*k+vec3(uSeed+31.3))) - 0.5;',
            '  if (uStriate > 0.0) {',
            // Keeping only the component along the radius from the knot drags the same noise
            // into strands that run outward - filaments for one dot product and a mix.
            '   vec3 rv = p - uKnot;',
            '   vec3 rn = rv*inversesqrt(max(dot(rv,rv), 1e-6));',
            '   wv = mix(wv, rn*dot(wv,rn)*uStriaGain, uStriate);',
            '  }',
            '  w += wv*uWarp*0.6;',
            ' }',
            ' d *= pow(fbm(w*uTurb+vec3(11.3+uSeed,4.7,19.1), int(uDetail)), uContrast);',
            ' if (uDust > 0.0) { float du=ridged(w*uTurb*0.65+vec3(51.2+uSeed,8.4,33.9),2); d *= 1.0-uDust*du*du; }',
            ' if (uClump > 0.0) { float cl = fbm(w*uTurb*uClumpScale + vec3(137.1+uSeed,95.9,178.3), 2);',
            '   d *= (1.0 - uClump) + uClump * 2.15 * cl; }',
            ' return max(d,0.0);'].join('\n'),
          '}',
          'void main(){',
          ' vec3 ro=uCamLocal; vec3 rd=normalize(vLocal-ro);',
          ' float tEnter, tExit;'
        ].concat(BOUNDS).concat([
          ' tEnter=max(tEnter,0.0); if(tExit<=tEnter) discard;',
          ' float span = tExit - tEnter;',
          // Grazing rays get proportionally fewer steps, so dt stays constant across the
          // silhouette instead of the edge quietly marching at a finer rate than the middle.
          ' float fs = (uIsGalaxy > 0.5) ? uSteps : clamp(uSteps*span, 8.0, uSteps);',
          ' int steps=int(fs); float dt=span/fs;',
          ' float dither=fract(ign(gl_FragCoord.xy) + uFrame*0.618034);',
          ' float t=tEnter+dt*dither; vec3 col=vec3(0.0); float T=1.0; float Tb=1.0;',
          ' for(int i=0;i<128;i++){',
          '  if(i>=steps || T<0.035) break;',
          '  vec3 p=ro+rd*t;',
          '  vec2 dk = (uDarkAbsorb > 0.0) ? darkAt(p) : vec2(0.0);',
          // Evaluated BEFORE the gas, so where a lane is opaque the noise fetches below are
          // never paid for: the lanes make the march cheaper, not dearer.
          '  float lane = (uIsGalaxy > 0.5 && uGalDustAbsorb > 0.0) ? galDust(p) : 0.0;',
          '  float rho = (dk.x < 0.985) ? densityAt(p) : 0.0;',
          '  float d = rho*uDensity;',
          '  if(d>0.002 || dk.x>0.01 || lane>0.004){',
          // Two absorbers in one exponential: the gas emits and extinguishes, the dark cloud
          // only extinguishes. So raising uDarkAbsorb raises alpha without adding light, and
          // the lane genuinely blocks what is behind it.
          // Three absorbers in one exponential. The lane raises alpha without adding any
          // light, so it genuinely blocks the bulge behind it.
          '   float a=1.0-exp(-(d*uAbsorb + dk.x*uDarkAbsorb + lane*uGalDustAbsorb)*dt);',
          '   vec3 emit;'
        ]).concat(COLOUR).concat([
          // Recombination is a two-body process, so emissivity goes as n^2 while extinction
          // goes as n: one multiply, and a three-times denser filament reads three times
          // brighter than the haze around it instead of exactly as bright.
          '   if (uEmitRho > 0.0) emit *= clamp(rho*uEmitRho, 0.0, 6.0);',
          '   if (uRimGain > 0.0) emit *= 1.0 + uRimGain*dk.y;'
        ]).concat(LIGHT).concat([
          // The cloud is warm-brown-black rather than pure black: light leaks through its edge.
          '   if (uDarkAbsorb > 0.0) emit = mix(emit, uDarkTint, dk.x);',
          '   if (uGalDustAbsorb > 0.0) emit = mix(emit, uDarkTint, lane*uGalDustVeil);',
          // Interstellar reddening as ONE extra scalar - the blue channel's transmittance -
          // rather than a vec3 T, which would cost three exponentials a step. For R_V 3.1
          // dust green sits about 45% of the way from red to blue. Because Tb is applied at
          // ACCUMULATION time, light emitted in FRONT of a lane is not reddened and light
          // behind it is, so deeper lanes come out progressively browner as well as darker
          // instead of wearing one flat tint that reads like a decal.
          '   float eb = (lane > 0.004) ? exp(-lane*uGalDustAbsorb*uGalDustBlue*dt) : 1.0;',
          '   col += vec3(T, mix(T, Tb, 0.45), Tb)*emit*a;',
          '   T *= 1.0-a; Tb *= (1.0-a)*eb;',
          '  }',
          '  t += dt;',
          ' }',
          ' if (uWhite > 0.0) {',
          // A sensor clips each channel on its own, which is why a very bright patch washes
          // to WHITE instead of to a saturated hue. It has to happen on the HDR value, before
          // the curve, or the curve just hands back a bright pink core.
          '  float mx = max(max(col.r,col.g),col.b);',
          '  float bl = uWhite*0.35;',
          // The explicit clip to white is right for an ionising knot and wrong for a galactic
          // bulge, which a photograph shows holding a warm cream right into the centre.
          // uHueKeep 0 leaves the multiplier at 1.0 - the nebula is untouched.
          '  col = mix(col, vec3(mx), smoothstep(bl, bl*3.0, mx)*(1.0-uHueKeep));',
          // Extended Reinhard: near-identity below about half the white point, so the faint
          // outskirts keep their colour and their structure, and reaching 1.0 exactly at it.
          '  vec3 pc = col*(1.0 + col/(uWhite*uWhite))/(1.0 + col);',
          '  if (uHueKeep > 0.0) {',
          // Per-channel Reinhard is itself a desaturator: every channel asymptotes to 1, so
          // ratios converge and anything bright drifts to white on its own. Running the same
          // curve on LUMINANCE and scaling RGB by the ratio preserves hue exactly, then hands
          // off to per-channel only where a channel would genuinely leave gamut.
          '   float Lm = dot(col, vec3(0.2126,0.7152,0.0722));',
          '   float Ln = Lm*(1.0 + Lm/(uWhite*uWhite))/(1.0 + Lm);',
          '   vec3 hu = col*(Ln/max(Lm, 1e-5));',
          '   float ov = clamp((max(max(hu.r,hu.g),hu.b) - 0.92)*uHueBreak, 0.0, 1.0);',
          '   col = mix(pc, mix(hu, pc, ov), uHueKeep);',
          '  } else col = pc;',
          '  col += (dither - 0.5)/255.0;',
          ' }',
          ' fragColor=vec4(col, 1.0-T);',
          '}'
        ]).filter(Boolean).join('\n')
      }

      // HSL is the sane way to expose colour on a phone: two hues and one saturation.
      function hsl(h, sat, l) {
        h = ((h % 360) + 360) % 360 / 360
        var q = l < .5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q
        function c(t) { t = (t + 1) % 1
          if (t < 1 / 6) return p + (q - p) * 6 * t
          if (t < 1 / 2) return q
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
          return p }
        return [c(h + 1 / 3), c(h), c(h - 1 / 3)]
      }

      // Complementary spacing: cloud 1 is the exact complement (+180), later clouds fan out.
      function hueOffset(k) {
        if (k === 0) return 0
        return k % 2 === 1 ? 180 + ((k - 1) / 2) * 28 : (k / 2) * 28
      }

      // Particles get their own tiny shader so they can drift and twinkle per-particle,
      // which PointsMaterial cannot do.
      var PART_VERT = [
        'attribute float aSize; attribute float aSeed; attribute vec3 aColor;',
        'uniform float uTime, uSize, uTwinkle, uDrift, uPixH;',
        'varying vec3 vCol; varying float vTw;',
        'void main(){',
        ' vec3 p = position;',
        ' p += uDrift * vec3(sin(uTime*0.30 + aSeed*6.2), cos(uTime*0.24 + aSeed*5.1), sin(uTime*0.19 + aSeed*4.3));',
        ' vec4 mv = modelViewMatrix * vec4(p, 1.0);',
        ' vTw = mix(1.0, 0.65 + 0.35*sin(uTime*2.2 + aSeed*12.0), uTwinkle);',
        ' vCol = aColor;',
        ' gl_PointSize = clamp(uSize * aSize * uPixH * projectionMatrix[1][1] / max(0.05, -mv.z), 1.0, 96.0);',
        ' gl_Position = projectionMatrix * mv;',
        '}'].join('\n')
      var PART_FRAG = [
        'precision mediump float;',
        'varying vec3 vCol; varying float vTw;',
        'void main(){',
        ' float r = length(gl_PointCoord - 0.5);',
        ' if (r > 0.5) discard;',
        ' float a = pow(1.0 - r * 2.0, 2.2);',
        ' gl_FragColor = vec4(vCol * vTw * a, a);',
        '}'].join('\n')

      function dirFrom(az, el) {
    var a = az * Math.PI / 180, e = el * Math.PI / 180, ce = Math.cos(e)
    return new THREE.Vector3(Math.cos(a) * ce, Math.sin(e), Math.sin(a) * ce)
  }

  // The envelope radii, NORMALISED so the largest is exactly 0.5. The march used to clip
  // against the unit box, so any stretch above 1 sliced the gas flat against two faces of it;
  // normalising keeps the whole envelope inside the proxy and makes the adaptive step count
  // exact. At stretch and flatten 1 this returns the same radii the shader always used.
  function envRadii(P) {
    var r = new THREE.Vector3(0.5 * P.stretch, 0.36 * P.flatten, 0.40)
    return r.multiplyScalar(0.5 / Math.max(r.x, Math.max(r.y, r.z)))
  }

  // Everything a slider can change that is not a bare float. Called at build AND from the
  // panel, so the two can never disagree about what a parameter means.
  function refreshDerived(P, u) {
    u.uEnvR.value.copy(envRadii(P))
    u.uLobeAxis.value.copy(dirFrom(P.lobeAz, P.lobeEl))
    u.uDarkDir.value.copy(dirFrom(P.darkAz, P.darkEl))
    u.uKnot.value.set(P.sunX, P.sunY, P.sunZ)
    u.uDarkPos.value.set(P.darkX, P.darkY, P.darkZ)
    u.uDark2Pos.value.set(P.dark2X, P.dark2Y, P.dark2Z)
    u.uDarkTint.value.fromArray(hsl(P.darkHue, 0.55, P.darkLev))
    u.uHa.value.fromArray(hsl(P.baseHue, P.sat, 0.55))
    u.uMid.value.fromArray(hsl(P.midHue, P.sat * 0.85, 0.60))
    u.uOiii.value.fromArray(hsl(P.coreHue, P.sat, 0.62))
    u.uHot.value.setScalar(P.hotGain)
    u.uCream.value.fromArray(hsl(P.creamHue, P.sat * P.creamSat, P.creamLev))
    u.uPeach.value.fromArray(hsl(P.peachHue, P.sat * P.peachSat, P.peachLev))
    u.uArmC.value.fromArray(hsl(P.armHue, P.sat * P.armSat, P.armLev))
  }

  // The same cavity and lobe shaping the shader applies to the gas, so the particles sit in
  // the hollow with it rather than filling the hole it just blew. Returns 1 when both are off.
  function shapeMulJS(x, y, z, P) {
    var m = 1
    if (P.hollow > 0) {
      var R = envRadii(P), qx = x / R.x, qy = y / R.y, qz = z / R.z
      var e = qx * qx + qy * qy + qz * qz
      if (e > 1) return 0
      var wl = (Math.sqrt(e) - P.shellR) * P.shellK
      m *= (1 - P.hollow) + P.hollow * Math.exp(-wl * wl)
    }
    if (P.bipolar > 0) {
      var ax = dirFrom(P.lobeAz, P.lobeEl)
      var rx = x - P.sunX, ry = y - P.sunY, rz = z - P.sunZ
      var len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1e-6
      var c = (rx * ax.x + ry * ax.y + rz * ax.z) / len
      var lobe = Math.max(0, Math.min(1, c * c * (1 + P.lobeBias * c)))
      lobe = lobe + (lobe * lobe - lobe) * P.lobeSharp
      m *= 1 + (lobe - 1) * P.bipolar
    }
    return m
  }

  // ---------------------------------------------------------------- field stars
  // Blackbody ramp, every entry peaked at 1.0 so brightness rides on the flux and a faint
  // blue star stays blue rather than drifting to grey.
  var BB = [[1, .52, .22], [1, .70, .43], [1, .86, .70], [1, .95, .89], [.96, .96, 1], [.82, .88, 1], [.70, .80, 1]]
  function bbColor(t) {
    var f = Math.max(0, Math.min(1, t)) * (BB.length - 1)
    var i = Math.min(BB.length - 2, Math.floor(f)), k = f - i, a = BB[i], b = BB[i + 1]
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  }
  function starTemp() {
    var u = Math.random()
    if (u < 0.60) return 0.64 + Math.random() * 0.36
    if (u < 0.87) return 0.42 + Math.random() * 0.22
    return Math.random() * 0.34
  }
  // Euclidean star counts go as N(>F) ~ F^-3/2, so the inverse CDF is F = u^(-1/alpha):
  // many faint, a few bright. That tail is what supplies the handful that carry a glare.
  function starFlux(alpha, cap) {
    var u = Math.random()
    return Math.min(cap, Math.pow(u < 1e-4 ? 1e-4 : u, -1 / Math.max(0.4, alpha)))
  }

  var STAR_VERT = [
    'attribute float aSize; attribute float aGlare; attribute vec3 aColor;',
    'uniform float uStarPx, uDpr, uMinPx, uMinDist, uGlareSize;',
    'varying vec3 vCol; varying float vCoreScale, vDim;',
    'void main(){',
    ' vec4 mv = modelViewMatrix*vec4(position, 1.0);',
    // The shell is finite, so once the object is scaled up in the portal and the camera is
    // inside it, near stars would sweep past the viewer. Pushing anything closer than
    // uMinDist back out ALONG ITS OWN DIRECTION holds the pattern fixed in the sky.
    ' float dd = length(mv.xyz);',
    ' mv.xyz *= max(1.0, uMinDist/max(dd, 1e-4));',
    // No 1/z. A star is a point source: its image is the instrument PSF, so its angular size
    // is constant. The particle shader's depth division is exactly why points turn to mush
    // when you walk up to them.
    ' float want = uStarPx*aSize*uDpr;',
    ' float core = max(want, uMinPx);',
    ' vDim = (want*want)/(core*core);',
    ' float quad = core*(1.0 + aGlare*uGlareSize);',
    ' vCoreScale = quad/core;',
    ' vCol = aColor;',
    ' gl_PointSize = clamp(quad, 1.0, 48.0);',
    ' gl_Position = projectionMatrix*mv;',
    '}'].join('\n')
  var STAR_FRAG = [
    'precision mediump float;',
    'varying vec3 vCol; varying float vCoreScale, vDim;',
    'uniform float uPsf, uHalo;',
    'void main(){',
    ' float r = length(gl_PointCoord - 0.5)*2.0*vCoreScale;',
    ' float a = (exp(-r*r*uPsf) + uHalo*exp(-r*r*uPsf*0.045))*vDim;',
    ' if (a < 0.003) discard;',
    ' gl_FragColor = vec4(vCol*a, a);',
    '}'].join('\n')

  function starPoints(t, mat, order, cull) {
    if (!t.p.length) return null
    var g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(t.p, 3))
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(t.c, 3))
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(t.s, 1))
    g.setAttribute('aGlare', new THREE.Float32BufferAttribute(t.g, 1))
    var o = new THREE.Points(g, mat)
    o.renderOrder = order
    // The bounding sphere is computed before the shader runs, so it would cull the whole
    // draw the moment the camera is inside the shell.
    o.frustumCulled = !!cull
    return o
  }

  var _lp = new THREE.Vector3(), _lq = new THREE.Quaternion(), _ls = new THREE.Vector3()
  var _li = new THREE.Quaternion(), _fp = new THREE.Vector3(), _fs = new THREE.Vector3()
  // The renderer calls onBeforeRender BEFORE it builds modelViewMatrix from matrixWorld, so
  // rewriting matrixWorld here is the sanctioned way to opt ONE child out of its parent's
  // rotation - here the disc's tilt, its roll, and the host's spin. Position and scale are
  // kept. A background star field does not turn with the galaxy in front of it.
  //
  // The orientation comes from `frame` when a host supplies one, and otherwise from whatever
  // the tilting group sits in. Plain world axes are wrong as soon as the object lives inside
  // something that is itself turned - an AR portal placed to face the viewer - and they are
  // badly wrong for a field confined to a box, which then no longer lines up with its box.
  function lockToWorld(o, frame) {
    o.onBeforeRender = function () {
      var p = this.parent
      if (!p) return
      p.matrixWorld.decompose(_lp, _lq, _ls)
      var f = frame || (p.parent && p.parent.parent)
      if (f) f.matrixWorld.decompose(_fp, _li, _fs)
      else _li.identity()
      this.matrixWorld.compose(_lp, _li, _ls)
    }
  }

  // Stars filling the whole shell, placed with no reference to the gas at all - which is the
  // point. buildParticles seeds FROM the density field, so its points crowd exactly where the
  // gas is brightest and leave the corners empty; a photograph is the other way round.
  function buildFieldStars(P, state) {
    var n = Math.round(P.fieldCount)
    if (n <= 0) return null
    // Split by MAGNITUDE, not position: the faint majority goes behind the gas so the bright
    // nebula washes them out, and the brightest handful goes in front the way a foreground
    // star does.
    var B = {p: [], c: [], s: [], g: []}, F = {p: [], c: [], s: [], g: []}
    var rIn = P.fieldRadius * 0.45, v3 = rIn * rIn * rIn
    var dv = P.fieldRadius * P.fieldRadius * P.fieldRadius - v3
    // A box, when one is given, instead of the open shell: a field meant to stay inside a
    // container - the AR portal - rather than surround the viewer. Its z range is its own,
    // since the object rarely sits at the centre of what holds it. fieldConc gathers the stars
    // toward the object and lets them thin out toward the walls.
    var boxed = P.fieldBoxX > 0 && P.fieldBoxY > 0 && P.fieldBoxZ1 > P.fieldBoxZ0
    var cr2 = Math.max(1e-4, P.fieldConcR * P.fieldConcR), placed = 0, tries = 0
    while (placed < n && tries < n * 40) {
      tries++
      var px, py, pz
      if (boxed) {
        px = (Math.random() * 2 - 1) * P.fieldBoxX
        py = (Math.random() * 2 - 1) * P.fieldBoxY
        pz = P.fieldBoxZ0 + Math.random() * (P.fieldBoxZ1 - P.fieldBoxZ0)
        if (P.fieldConc > 0 &&
            Math.random() > (1 - P.fieldConc) + P.fieldConc * Math.exp(-(px * px + py * py + pz * pz) / cr2)) continue
      } else {
        var ct = 2 * Math.random() - 1, ph = Math.random() * 6.2831853
        var st = Math.sqrt(Math.max(0, 1 - ct * ct))
        var r = Math.pow(v3 + Math.random() * dv, 1 / 3)   // uniform in VOLUME -> flat on the sky
        px = r * st * Math.cos(ph); py = r * ct; pz = r * st * Math.sin(ph)
      }
      placed++
      var f = starFlux(P.fieldAlpha, P.fieldCap), c = bbColor(starTemp()), b = P.fieldBright * f
      var t = f > P.fieldGlareAt ? F : B
      t.p.push(px, py, pz)
      // Deliberately not normalised: the brightest clip all three channels and read white
      // while the outer wings of the PSF keep their tint. That blowout is free.
      t.c.push(c[0] * b, c[1] * b, c[2] * b)
      // A recorded disc grows only logarithmically with flux - seeing plus saturation - which
      // is why real field stars stay small and hard while getting obviously brighter.
      t.s.push(1 + 0.40 * Math.log(1 + f))
      t.g.push(f > P.fieldGlareAt ? Math.min(1, (f - P.fieldGlareAt) / P.fieldGlareAt) : 0)
    }
    if (P.fgBright > 0) {
      // One authored foreground star. It lands in the bright bucket, drawn in FRONT of the
      // gas where a foreground star belongs; its core clips all three channels and reads
      // white while the saturated colour survives in the wings of the PSF.
      var fc = bbColor(P.fgTemp)
      F.p.push(P.fgX, P.fgY, P.fgZ)
      F.c.push(fc[0] * P.fgBright, fc[1] * P.fgBright, fc[2] * P.fgBright)
      F.s.push(1 + 0.40 * Math.log(1 + P.fgBright))
      F.g.push(P.fgGlare)
    }
    state.fieldMat = new THREE.ShaderMaterial({
      uniforms: {uStarPx: {value: P.fieldPx}, uDpr: {value: Math.min(2, global.devicePixelRatio || 1)},
        uMinPx: {value: 1.0}, uMinDist: {value: P.fieldMinDist}, uGlareSize: {value: P.fieldGlare},
        uPsf: {value: P.fieldPsf}, uHalo: {value: P.fieldHalo}},
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false,
      // Premultiplied additive. Plain AdditiveBlending is SRC_ALPHA,ONE, which would square
      // the falloff and undo the flux-conservation term.
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation
    })
    var grp = new THREE.Group()
    function pts(t, order) {
      var o = starPoints(t, state.fieldMat, order, false)
      if (!o) return
      if (P.fieldLock > 0) lockToWorld(o, state.lockFrame)
      grp.add(o)
    }
    pts(B, -2)
    pts(F, 3)
    state.fieldCount = (B.p.length + F.p.length) / 3
    return grp
  }

  // Six slots because the shader declares vec3[6]; unused ones are harmless.
      function cloudPalette(P, light, hueKey) {
        var out = []
        for (var i = 0; i < 6; i++) out.push(new THREE.Vector3().fromArray(hsl(P[hueKey] + hueOffset(i), P.sat, light)))
        return out
      }
      // ------------------------------------------------ the component

  // ---------------------------------------------------------------- object builders
  // A host passes in a plain "state" object; the builders keep their caches on it (the baked
  // volume, the sprites, the live materials) so two hosts never share one cache.

  function radial(stops) {
    var c = global.document.createElement('canvas')
    c.width = c.height = 64
    var g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    stops.forEach(function (s) { grd.addColorStop(s[0], s[1]) })
    g.fillStyle = grd
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }

  function gasSprite(state) {
    if (!state.gasSprite) {
      state.gasSprite = radial([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']])
    }
    return state.gasSprite
  }

  // Multiply blending reads the sprite's RGB and ignores alpha, so dust has to fade to WHITE
  // at the rim (multiply by 1 = no change) or every particle stamps a dark square.
  function dustSprite(amount) {
    var d = Math.round(255 * (1 - amount))
    var m = function (f) { return Math.round(255 - (255 - d) * f) }
    return radial([
      [0, 'rgb(' + d + ',' + Math.round(d * 0.92) + ',' + Math.round(d * 0.86) + ')'],
      [0.55, 'rgb(' + m(0.35) + ',' + m(0.32) + ',' + m(0.3) + ')'],
      [1, 'rgb(255,255,255)']])
  }

  var HA = [0.89, 0.28, 0.25], OIII = [0.25, 0.85, 0.75]

  function samplePoints(P, wantDust) {
    ensureLayout(P)
    var pos = [], col = [], guard = 0
    var n = Math.round(P.count), max = n * 60
    while (pos.length / 3 < n && guard < max) {
      guard++
      var x = Math.random() - 0.5, y = (Math.random() - 0.5) * 0.72, z = (Math.random() - 0.5) * 0.80
      var s = densityAt(x, y, z, P)
      if (s.d <= 0) continue
      var keep = wantDust ? (1 - Math.min(1, s.d * 3)) * 0.5 : Math.min(1, s.d * 2.2)
      if (Math.random() > keep) continue
      pos.push(x, y, z)
      var c = Math.min(1, s.core * 0.6)
      col.push(HA[0] + (OIII[0] - HA[0]) * c, HA[1] + (OIII[1] - HA[1]) * c, HA[2] + (OIII[2] - HA[2]) * c)
    }
    var g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }

  function bake(P, size, state) {
    var key = size + ':' + P.turbulence + ':' + P.contrast + ':' + P.dust + ':' + P.coreGain +
      ':' + P.clouds + ':' + P.layout + ':' + P.clump + ':' + P.clumpScale
    if (state.volTex && state.volKey === key) return state.volTex
    ensureLayout(P)
    var t0 = global.performance.now()
    var data = new Uint8Array(size * size * size * 4), i = 0
    var span = Math.max(1, Math.round(P.clouds) - 1)
    for (var z = 0; z < size; z++) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var px = x / (size - 1) - 0.5, py = y / (size - 1) - 0.5, pz = z / (size - 1) - 0.5
          var s = densityAt(px, py, pz, P)
          data[i++] = Math.max(0, Math.min(255, Math.round(s.d * 255)))
          data[i++] = Math.round(255 * s.cloud / span)
          data[i++] = Math.round(255 * tintAt(px, py, pz, P))
          data[i++] = 255
        }
      }
    }
    var Tex3D = THREE.Data3DTexture || THREE.DataTexture3D
    if (state.volTex) state.volTex.dispose()
    var t = new Tex3D(data, size, size, size)
    t.format = THREE.RGBAFormat
    t.type = THREE.UnsignedByteType
    t.minFilter = t.magFilter = THREE.LinearFilter
    t.unpackAlignment = 1
    t.needsUpdate = true
    state.volTex = t
    state.volKey = key
    state.note = 'bake ' + size + '\u00b3 x' + Math.round(P.clouds) + ' ' + Math.round(global.performance.now() - t0) + 'ms'
    return t
  }

  // Particles are seeded BY the density field, so they sit in the gas rather than in a box
  // around it, and they redden where the gas is thick - a cheap stand-in for the extinction
  // the volume cannot apply to them.
  function buildParticles(P, state) {
    ensureLayout(P)
    var n = Math.round(P.partCount)
    var pos = [], col = [], siz = [], seed = [], guard = 0
    var warms = []
    for (var w = 0; w < 6; w++) warms.push(hsl(P.partHue + hueOffset(w), P.sat * 0.8, 0.72))
    while (pos.length / 3 < n && guard < n * 80) {
      guard++
      var x = Math.random() - 0.5, y = (Math.random() - 0.5) * 0.72, z = (Math.random() - 0.5) * 0.80
      var s = densityAt(x, y, z, P)
      if (s.d <= 0) continue
      // The gas shader may have blown a cavity or pinched the waist; the particles have to
      // respect the same shape or they fill the hole it just made.
      if (Math.random() > Math.min(1, s.d * 2.6 * shapeMulJS(x, y, z, P))) continue
      pos.push(x, y, z)
      var warm = warms[Math.min(5, s.cloud || 0)]
      if (P.spread > 0) {
        var tv = (tintAt(x, y, z, P) - 0.5) * P.spread
        warm = [warm[0] * (1 - tv * 0.5), warm[1] * (1 + tv * 0.15), warm[2] * (1 + tv * 0.6)]
      }
      var thick = Math.min(1, s.d * 1.8), hot = Math.min(1, s.core * 0.8)
      col.push(
        warm[0] * (0.55 + 0.45 * hot) + hot * 0.35,
        warm[1] * (0.55 + 0.45 * hot) * (1 - thick * 0.35) + hot * 0.3,
        warm[2] * (0.55 + 0.45 * hot) * (1 - thick * 0.55) + hot * 0.3)
      siz.push(0.35 + Math.random() * Math.random() * 2.2 + hot * 1.6)
      seed.push(Math.random())
    }
    var g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1))
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
    state.partMat = new THREE.ShaderMaterial({
      uniforms: {uTime: {value: 0}, uSize: {value: P.partSize}, uTwinkle: {value: P.partTwinkle},
        uDrift: {value: P.partDrift}, uPixH: {value: 400}},
      vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    })
    var pts = new THREE.Points(g, state.partMat)
    pts.renderOrder = -1   // drawn before the volume, so gas in front of a particle dims it
    state.particleCount = pos.length / 3
    return pts
  }

  // The four dense cores move with the seed and follow the envelope shape, so a new seed
  // gives a genuinely different cloud rather than the same one wearing different noise.
  function shaderCores(P) {
    var out = []
    for (var k = 0; k < 4; k++) {
      out.push(new THREE.Vector4(
        (chash(k + 2, P.seed + 1) - 0.5) * 0.5 * P.stretch,
        (chash(k + 5, P.seed + 2) - 0.5) * 0.36 * P.flatten,
        (chash(k + 9, P.seed + 3) - 0.5) * 0.40,
        0.10 + 0.14 * chash(k + 11, P.seed + 4)))
    }
    return out
  }

  // Mirrors galaxyDensity() in the shader, so the stars land where the gas actually is.
  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / ((b - a) || 1e-6))); return t * t * (3 - 2 * t) }

  // Mirrors galaxyDensity() and galDust() so the points sit in the same gas the shader
  // marches - including thinning out where a lane is.
  function galaxyDensityAt(x, y, z, P) {
    var r = Math.sqrt(x * x + z * z), rn = r / P.galRadius
    if (rn > 1) return {d: 0, bulge: 0, arm: 0, lane: 0}
    var h = P.galThick * (1 + P.galFlare * rn * 2)
    var vert = Math.exp(-(y * y) / (h * h))
    var radial = Math.pow(Math.max(0, 1 - rn), P.galFalloff)
    var yb = y / Math.max(0.05, P.galBulgeFlat)
    var br = Math.sqrt(x * x + yb * yb + z * z) / Math.max(0.001, P.galBulge)
    var bulge = Math.exp(-br * br)
    var th = Math.atan2(z, x), lr = Math.log(Math.max(rn, 0.05))
    var phase = th * P.galArms - lr * P.galWind
    var arm = Math.pow(0.5 + 0.5 * Math.cos(phase), P.galArmWidth)
    var bul = bulge * P.galBulgeGain, bl = bul * P.galBulgeLift
    var d = (radial * (P.galArmFloor + (1 - P.galArmFloor) * arm) + (bul - bl)) * vert + bl
    var lane = 0
    if (P.laneAmt > 0) {
      var win = sstep(P.laneIn, P.laneIn * 2.4, rn) * (1 - sstep(P.laneOut * 0.72, P.laneOut, rn))
      if (win > 0.0001) {
        var hd = h * P.laneThick
        var u1 = (th * P.galArms - lr * P.galWind * P.laneWind) * 0.15915494 + P.laneOff
        var t1 = Math.abs(u1 - Math.floor(u1) - 0.5)
        lane = Math.exp(-t1 * t1 * P.laneK)
        if (P.lane2 > 0) {
          var u2 = u1 * 1.618034 + 0.37, t2 = Math.abs(u2 - Math.floor(u2) - 0.5)
          lane = Math.max(lane, P.lane2 * Math.exp(-t2 * t2 * P.laneK * 1.7))
        }
        lane = Math.min(1, lane * Math.exp(-(y * y) / (hd * hd)) * win * P.laneAmt)
      }
    }
    return {d: Math.max(0, d), bulge: bulge, arm: arm, lane: lane}
  }

  // Stars are a separate population from the gas: a thin disc biased into the arms, plus a
  // rounder, older bulge crowd. Arms read blue (young, hot), the bulge warm - which is the
  // single clearest colour cue that something is a spiral galaxy.
  // Three stops, warm to cold, with RADIUS rather than with brightness. The bulge stop takes
  // the core sprite's own hue so the sprite and the stars underneath it cannot disagree. The
  // old code keyed colour on local arm strength, which is exactly what a photograph shows the
  // colour is NOT a function of.
  function galStarRamp(P) {
    return {core: hsl(P.sunHue, P.sat * 0.40, 0.82),
      mid: hsl(P.starMidHue, P.sat * 0.62, 0.74),
      arm: hsl(P.starArmHue, P.sat * 0.85, 0.76)}
  }
  function rampAt(R, t) {
    var a, b, k
    if (t < 0.5) { a = R.core; b = R.mid; k = t * 2 } else { a = R.mid; b = R.arm; k = (t - 0.5) * 2 }
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
  }

  function buildGalaxyStars(P, state) {
    // starPx 0 keeps the world-space points this has always used. Above 0 it switches to the
    // field-star shader, which sizes in DEVICE PIXELS and so is immune to the roughly ninefold
    // model scale the portal applies - the reason points turn to mush when you walk into the
    // disc. starPx is read as pixels; do not repurpose starSize, which is metres.
    var modern = P.starPx > 0
    var n = Math.round(P.starCount), guard = 0, made = 0
    var armCol = hsl(P.starArmHue, P.sat * 0.9, 0.72)
    var coreCol = hsl(P.partHue, P.sat * 0.8, 0.76)
    var R = modern ? galStarRamp(P) : null
    var kBlue = hsl(P.knotHue, 0.45, 0.84), kPink = hsl(P.hiiHue, 0.78, 0.68)
    // The disc draws BEFORE the gas so the arms veil it, as before. Knots draw AFTER, so an
    // OB clump reads as a clump ON the arm rather than a brighter piece of arm the gas has
    // already multiplied down - and a near-side knot punches through a dust lane.
    function mk() { return {p: [], c: [], s: [], g: []} }
    var D = mk(), K = mk()
    var pos = [], col = [], siz = [], seed = []
    var inBulge = Math.round(n * P.starBulge), invR = 1 / Math.max(0.001, P.galRadius)
    // The try budget scales with how picky placement is. With tight arms, few sparse gaps and a
    // small bulge share most tries are rejected, and a flat 60 per star ran out long before the
    // requested count - 12,000 stars came out as 6,600. Rejected tries cost a handful of
    // arithmetic ops; only accepted ones reach galaxyDensityAt.
    var budget = n * Math.round(40 * Math.max(1, P.starArmSharp) / Math.max(0.02, P.starScatter + 0.1))
    while (made < n && guard < budget) {
      guard++
      var bulgeStar = made < inBulge
      var x, y, z
      if (bulgeStar) {
        var rb = P.galBulge * Math.pow(Math.random(), 0.6)
        var a1 = Math.random() * 6.2831853, a2 = Math.acos(2 * Math.random() - 1)
        x = rb * Math.sin(a2) * Math.cos(a1)
        y = rb * Math.cos(a2) * P.galBulgeFlat
        z = rb * Math.sin(a2) * Math.sin(a1)
      } else {
        // The same distribution the old square-and-reject produced, drawn in an order that lets
        // most tries fail before paying for any trig. That matters once the arms are tight: with
        // most placements rejected, the old loop spent ~0.5 s per build computing atan2, log and
        // pow for positions it then threw away.
        //
        // Uniform over the disc's area...
        var rr = P.galRadius * Math.sqrt(Math.random()), th = Math.random() * 6.2831853
        var rn2 = rr * invR
        // ...weighted by the radial falloff AND by the local thickness, since a thicker slice of
        // disc used to accept proportionally more of its uniform vertical band. Both cheap.
        var hStar = P.galThick * P.starThick
        var flare = (1 + P.galFlare * rn2 * 2) / (1 + P.galFlare * 2)
        if (Math.random() > Math.pow(Math.max(0, 1 - rn2), P.galFalloff) * flare) continue
        // Only now the spiral. starArmSharp tightens the arm the STARS follow without touching the
        // gas: above 1 they crowd onto the arm's ridge instead of spreading into its soft shoulders,
        // which is what leaves the gaps between arms dark. 1 is the gas's own profile.
        // (th stands in for atan2(z, x): they differ by 2*pi, which an integer arm count absorbs.)
        var phase2 = th * P.galArms - Math.log(Math.max(rn2, 0.05)) * P.galWind
        var armW = Math.pow(0.5 + 0.5 * Math.cos(phase2), P.galArmWidth * P.starArmSharp)
        if (Math.random() > P.starScatter + (1 - P.starScatter) * armW) continue
        // Height from the disc's own vertical profile - a gaussian truncated at three star scale
        // heights, exactly what the uniform band and its exp() rejection used to give.
        var hLocal = hStar * (1 + P.galFlare * rn2 * 2)
        do {
          y = Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(6.2831853 * Math.random()) * hLocal / Math.SQRT2
        } while (Math.abs(y) > hStar * 3)
        x = rr * Math.cos(th)
        z = rr * Math.sin(th)
      }
      var gg = galaxyDensityAt(x, y, z, P)
      var hot = bulgeStar ? 0 : Math.min(1, gg.arm)
      // In a photograph the lanes are visible THROUGH the star cloud, not only through the
      // gas: the disc population thins where the dust is.
      if (P.starLaneCut > 0 && gg.lane > 0 && Math.random() < P.starLaneCut * gg.lane) continue
      if (!modern) {
        var base = bulgeStar ? coreCol : [
          armCol[0] + (coreCol[0] - armCol[0]) * (1 - hot),
          armCol[1] + (coreCol[1] - armCol[1]) * (1 - hot),
          armCol[2] + (coreCol[2] - armCol[2]) * (1 - hot)]
        var lb = bulgeStar ? 0.7 + Math.random() * 0.5 : 0.5 + hot * 0.8
        pos.push(x, y, z)
        col.push(base[0] * lb, base[1] * lb, base[2] * lb)
        siz.push(0.35 + Math.random() * Math.random() * 2.4 + (bulgeStar ? 0.4 : hot * 1.2))
        seed.push(Math.random())
        made++
        continue
      }
      var rn = Math.sqrt(x * x + z * z) * invR
      var c = rampAt(R, Math.min(1, rn / Math.max(0.05, P.starRamp)))
      // Dragged back toward cream by the bulge's own profile, the same weight the gas branch
      // uses, so gas and stars turn warm over the same distance.
      var blw = Math.min(1, gg.bulge * 1.6)
      if (blw > 0) {
        c = [c[0] + (R.core[0] - c[0]) * blw,
          c[1] + (R.core[1] - c[1]) * blw,
          c[2] + (R.core[2] - c[2]) * blw]
      }
      // Knots live on the OUTER arms: an association is a place the arm has just made stars,
      // and the inner disc finished doing that long ago. arm*arm puts them in the ridge rather
      // than the skirts. HII regions read pink rather than red, and there are far fewer of
      // them than blue clumps - they are the reddest thing in the galaxy.
      var outer = Math.max(0, Math.min(1, (rn - P.knotR0) / 0.45))
      var pk = bulgeStar ? 0 : P.knotFrac * hot * hot * outer
      var t = D, b, sz, gl = 0
      if (Math.random() < pk) {
        t = K; c = kBlue; b = 1.6 + Math.random() * 1.8
        sz = 1.5 + Math.random() * 1.4; gl = 0.35 + Math.random() * 0.65
      } else if (Math.random() < pk * P.hiiFrac) {
        t = K; c = kPink; b = 1.1 + Math.random() * 0.7; sz = 0.9 + Math.random() * 0.5
      } else {
        b = bulgeStar ? 0.7 + Math.random() * 0.5 : 0.45 + hot * 0.7
        // Log of flux, the same curve the field stars use: a recorded disc grows only
        // logarithmically, which is why real stars stay small and hard while brightening.
        sz = 0.55 + 0.45 * Math.log(1 + Math.random() * 6)
      }
      t.p.push(x, y, z)
      // Deliberately not normalised: the brightest clip all three channels and read white
      // while the wings of the PSF keep the tint.
      t.c.push(c[0] * b, c[1] * b, c[2] * b)
      t.s.push(sz)
      t.g.push(gl)
      made++
    }
    if (!modern) {
      var geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3))
      geo.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1))
      geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
      state.partMat = new THREE.ShaderMaterial({
        uniforms: {uTime: {value: 0}, uSize: {value: P.starSize}, uTwinkle: {value: P.partTwinkle},
          uDrift: {value: P.partDrift * 0.2}, uPixH: {value: 400}},
        vertexShader: PART_VERT, fragmentShader: PART_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      })
      var legacy = new THREE.Points(geo, state.partMat)
      legacy.renderOrder = -1
      state.particleCount = made
      var lg = new THREE.Group()
      lg.add(legacy)
      return lg
    }
    state.partMat = new THREE.ShaderMaterial({
      uniforms: {
        uStarPx: {value: P.starPx}, uDpr: {value: Math.min(2, global.devicePixelRatio || 1)},
        uMinPx: {value: 1.0},
        // 0, NOT fieldMinDist. The field shell stands for infinity and wants its pattern
        // frozen; the disc is the thing you walk INTO, and its parallax is the reason the
        // portal is worth entering. max(1.0, 0.0/dd) is an exact no-op.
        uMinDist: {value: 0},
        uGlareSize: {value: P.starGlare}, uPsf: {value: P.starPsf}, uHalo: {value: P.starHalo},
        // The star shader declares none of these four, but all three hosts poke uTime and
        // uPixH unconditionally and the panel writes uTwinkle and uDrift. The SLOTS have to
        // exist or those lines throw; three.js silently skips uniforms a program does not
        // declare, so this costs nothing and no host file needs editing.
        uTime: {value: 0}, uPixH: {value: 400}, uTwinkle: {value: 0}, uDrift: {value: 0},
        uSize: {value: P.starPx}
      },
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false,
      // Premultiplied additive: the fragment shader emits vec4(col*a, a), and plain
      // AdditiveBlending would square the falloff and undo the flux conservation.
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation
    })
    var grp = new THREE.Group()
    var disc = starPoints(D, state.partMat, -1, true)
    var knot = starPoints(K, state.partMat, 3, true)
    if (disc) grp.add(disc)
    if (knot) grp.add(knot)
    state.particleCount = made
    return grp
  }

  // A bright nucleus at the centre. A Sprite rather than a particle so it always faces the
  // viewer and scales in world units, and it draws after the gas so it reads as the brightest
  // thing in the object - which is what a galactic core looks like from outside.
  // `knot` adds a second, much tighter sprite inside the halo: a nebula's ionising cluster
  // reads as one overwhelming point with a wide glow around it, where a galactic core is all
  // glow. A galaxy passes knot false and gets exactly the single sprite it always had.
  function buildGalaxyCore(P, state, knot) {
    coreTextures(state)
    var grp = new THREE.Group()
    state.sunMats = []
    state.suns = []
    for (var i = 0; i < (knot ? 2 : 1); i++) {
      var mat = new THREE.SpriteMaterial({
        map: i === 0 ? state.sunTex : state.knotTex,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      })
      var s = new THREE.Sprite(mat)
      s.renderOrder = 2
      state.sunMats.push(mat)
      state.suns.push(s)
      grp.add(s)
    }
    state.sunMat = state.sunMats[0]
    state.sun = state.suns[0]
    applySun(P, state)
    grp.renderOrder = 2
    return grp
  }

  function coreTextures(state) {
    if (!state.sunTex) {
      state.sunTex = radial([
        [0, 'rgba(255,255,255,1)'],
        [0.12, 'rgba(255,255,255,0.92)'],
        [0.32, 'rgba(255,255,255,0.30)'],
        [0.62, 'rgba(255,255,255,0.07)'],
        [1, 'rgba(255,255,255,0)']])
    }
    if (!state.knotTex) {
      state.knotTex = radial([
        [0, 'rgba(255,255,255,1)'],
        [0.06, 'rgba(255,255,255,0.95)'],
        [0.16, 'rgba(255,255,255,0.30)'],
        [0.40, 'rgba(255,255,255,0.06)'],
        [1, 'rgba(255,255,255,0)']])
    }
  }

  // Authored as a flat NUMBERED set, the way the dark lane already is, because the copy and
  // paste settings box only moves numbers - a nested object would not survive the round trip.
  function companionSpecs(P) {
    var out = []
    for (var i = 1; i <= 2; i++) {
      var k = 'comp' + i
      if (!(P[k + 'R'] > 0) || !(P[k + 'Bright'] > 0)) continue
      out.push({x: P[k + 'X'], y: P[k + 'Y'], z: P[k + 'Z'], r: P[k + 'R'], flat: P[k + 'Flat'],
        rot: P[k + 'Rot'] * Math.PI / 180, bright: P[k + 'Bright'], core: P[k + 'Core'], hue: P[k + 'Hue']})
    }
    return out
  }

  // An elliptical galaxy is defined by having no internal structure, which is what the halo
  // texture already draws. Points would need hundreds per core pixel to look smooth, and
  // granular reads as a star CLUSTER - the opposite of a fuzzy elongated smudge. A second
  // volume would double the cost of the most expensive pass in the scene. Four sprites.
  function buildCompanions(P, state) {
    var specs = companionSpecs(P)
    if (!specs.length) return null
    coreTextures(state)
    var grp = new THREE.Group()
    state.compSprites = []
    for (var i = 0; i < specs.length; i++) {
      for (var j = 0; j < 2; j++) {
        // Two sprites each: the halo carries the shape and the colour, the nucleus is driven
        // past white. M32 is unmistakably both - a cusped core inside a smooth fuzz.
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: j === 0 ? state.sunTex : state.knotTex,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending}))
        sp.renderOrder = 2
        sp.userData.comp = i
        sp.userData.part = j
        state.compSprites.push(sp)
        grp.add(sp)
      }
    }
    applyCompanions(P, state)
    grp.renderOrder = 2
    return grp
  }

  function applyCompanions(P, state) {
    var sp = state.compSprites
    if (!sp || !sp.length) return
    var specs = companionSpecs(P)
    for (var k = 0; k < sp.length; k++) {
      var o = sp[k], d = specs[o.userData.comp]
      if (!d) continue
      var nuc = o.userData.part === 1
      var c = hsl(d.hue, P.sat * 0.40, 0.80)   // an old population: warm, with no blue in it
      var w = nuc ? 0.7 : 0, b = d.bright * (nuc ? d.core : 1)
      o.material.color.setRGB((c[0] + (1 - c[0]) * w) * b, (c[1] + (1 - c[1]) * w) * b, (c[2] + (1 - c[2]) * w) * b)
      // An elliptical's isophotes really do get rounder inward, so the nucleus is less
      // elongated than the halo. That is the profile, not a cheat.
      var r = nuc ? d.r * 0.34 : d.r
      var f = nuc ? 1 + (d.flat - 1) * 0.4 : d.flat
      o.scale.set(r * f, r, 1)
      o.position.set(d.x, d.y, d.z)
      // This rotation is a SCREEN-space roll, so the long axis sits at the authored angle but
      // turns with the view if you orbit. Invisible below an elongation of about 1.5.
      o.material.rotation = d.rot
    }
  }

  // Colour, brightness and position in one place, so a rebuild and a slider agree.
  function applySun(P, state) {
    var mats = state.sunMats || (state.sunMat ? [state.sunMat] : [])
    if (!mats.length) return
    var c = hsl(P.sunHue, P.sat * 0.55, 0.78)
    for (var i = 0; i < mats.length; i++) {
      // The halo carries the colour; the knot is pushed well past 1 so its centre clips to
      // white and only its wings keep the tint - the same blowout the field stars get.
      var w = i === 0 ? 0 : 0.7
      var b = P.sunBright * (i === 0 ? 1 : P.sunKnotBright)
      // Additive blending accumulates, so values above 1 genuinely brighten rather than clip.
      mats[i].color.setRGB((c[0] + (1 - c[0]) * w) * b, (c[1] + (1 - c[1]) * w) * b, (c[2] + (1 - c[2]) * w) * b)
    }
    var ss = state.suns || (state.sun ? [state.sun] : [])
    for (var k = 0; k < ss.length; k++) {
      ss[k].scale.setScalar(k === 0 ? P.sunSize * Math.max(1, P.sunHalo || 1) : P.sunSize)
      // The same point the colour ramp uses as the ionising source.
      ss[k].position.set(P.sunX, P.sunY, P.sunZ)
    }
  }

  function raymarchMesh(P, useTex, state) {
    var u = {
      uCamLocal: {value: new THREE.Vector3()}, uSteps: {value: P.steps}, uDensity: {value: P.density},
      uAbsorb: {value: P.absorb}, uEmission: {value: P.emission}, uTurb: {value: P.turbulence},
      uContrast: {value: P.contrast}, uDust: {value: P.dust}, uCoreGain: {value: P.coreGain},
      uFrame: {value: 0}, uLight: {value: P.light},
      uHa: {value: new THREE.Vector3().fromArray(hsl(P.baseHue, P.sat, 0.55))},
      uOiii: {value: new THREE.Vector3().fromArray(hsl(P.coreHue, P.sat, 0.62))},
      uSpread: {value: P.spread}, uClump: {value: P.clump}, uClumpScale: {value: P.clumpScale},
      uSeed: {value: P.seed}, uStretch: {value: P.stretch}, uFlatten: {value: P.flatten},
      uFalloff: {value: P.falloff}, uWarp: {value: P.warp}, uCores: {value: shaderCores(P)},
      uIsGalaxy: {value: P._galaxy ? 1 : 0},
      uGalRadius: {value: P.galRadius}, uGalThick: {value: P.galThick}, uGalFlare: {value: P.galFlare},
      uGalBulge: {value: P.galBulge}, uGalBulgeGain: {value: P.galBulgeGain}, uGalArms: {value: P.galArms},
      uGalWind: {value: P.galWind}, uGalArmWidth: {value: P.galArmWidth}, uGalFalloff: {value: P.galFalloff},
      uGalBulgeFlat: {value: P.galBulgeFlat},
      uEnvR: {value: new THREE.Vector3()}, uKnot: {value: new THREE.Vector3()},
      uLobeAxis: {value: new THREE.Vector3(0, 1, 0)}, uDarkPos: {value: new THREE.Vector3()},
      uDarkDir: {value: new THREE.Vector3(0, -1, 0)}, uDark2Pos: {value: new THREE.Vector3()},
      uDarkTint: {value: new THREE.Vector3()}, uMid: {value: new THREE.Vector3()},
      uHot: {value: new THREE.Vector3(1, 1, 1)},
      uMarchPad: {value: P.marchPad}, uDetail: {value: P.detail},
      uHollow: {value: P.hollow}, uShellR: {value: P.shellR}, uShellK: {value: P.shellK},
      uBipolar: {value: P.bipolar}, uLobeSharp: {value: P.lobeSharp}, uLobeBias: {value: P.lobeBias},
      uStriate: {value: P.striate}, uStriaGain: {value: P.striaGain},
      uDarkAbsorb: {value: P.darkAbsorb}, uDarkR: {value: P.darkR}, uDark2R: {value: P.dark2R},
      uDarkScallop: {value: P.darkScallop}, uDarkScale: {value: P.darkScale},
      uDarkEdge: {value: P.darkEdge}, uRimGain: {value: P.rimGain}, uRimW: {value: P.rimW},
      uEmitRho: {value: P.emitRho}, uIonAmt: {value: P.ionAmt}, uKnotQ: {value: P.knotQ},
      uIon0: {value: P.ion0}, uIon1: {value: P.ion1}, uIonDens: {value: P.ionDens},
      uWhite: {value: P.white}, uHalf: {value: 0.5},
      uGalCull: {value: P.galCull}, uGalBulgeLift: {value: P.galBulgeLift},
      uGalBulgeSoft: {value: P.galBulgeSoft}, uGalArmFloor: {value: P.galArmFloor},
      uGalArmWobble: {value: P.galArmWobble}, uGalFrag: {value: P.galFrag},
      uGalFragAlong: {value: P.galFragAlong}, uGalFragAcross: {value: P.galFragAcross},
      uGalBound: {value: P.galBound},
      uLaneAmt: {value: P.laneAmt}, uLaneK: {value: P.laneK}, uLaneWind: {value: P.laneWind},
      uLaneOff: {value: P.laneOff}, uLane2: {value: P.lane2}, uLaneThick: {value: P.laneThick},
      uLaneIn: {value: P.laneIn}, uLaneOut: {value: P.laneOut}, uLaneWob: {value: P.laneWob},
      uGalDustAbsorb: {value: P.galDustAbsorb}, uGalDustBlue: {value: P.galDustBlue},
      uGalDustVeil: {value: P.galDustVeil},
      uGalPal: {value: P.galPal}, uColIn: {value: P.colIn}, uColSlope: {value: P.colSlope},
      uColArm: {value: P.colArm}, uColNoise: {value: P.colNoise},
      uColDense: {value: P.colDense}, uColDenseK: {value: P.colDenseK},
      uBulgeMix: {value: P.bulgeMix},
      uCream: {value: new THREE.Vector3()}, uPeach: {value: new THREE.Vector3()},
      uArmC: {value: new THREE.Vector3()},
      uHueKeep: {value: P.hueKeep}, uHueBreak: {value: P.hueBreak}
    }
    refreshDerived(P, u)
    if (useTex) {
      u.uVol = {value: bake(P, Math.round(P.texSize), state)}
      u.uCloudN = {value: Math.max(1, Math.round(P.clouds))}
      u.uCloudA = {value: cloudPalette(P, 0.55, 'baseHue')}
      u.uCloudB = {value: cloudPalette(P, 0.62, 'coreHue')}
    }
    // The proxy box has to contain whatever the march bounds against, or the shader is never
    // asked to shade the part that sticks out. The baked volume and the galaxy keep the unit
    // cube they have always used; a padded ellipsoid grows the box to match.
    var half = (useTex || P._galaxy) ? 0.5 : Math.max(0.5, 0.5 * P.marchPad + 0.01)
    u.uHalf.value = half
    return new THREE.Mesh(new THREE.BoxGeometry(2 * half, 2 * half, 2 * half), new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: u, vertexShader: VERT, fragmentShader: frag(useTex),
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.NormalBlending,
      // col is accumulated premultiplied (col += T*emit*a), but ShaderMaterial defaults this
      // to false, so NormalBlending multiplies by alpha a SECOND time and faint gas is
      // crushed. Off by default because it brightens every preset tuned without it.
      premultipliedAlpha: P.premul > 0.5
    }))
  }

  // Returns {object3D, march, note}. march is null for the point modes.
  function build(P, modeId, state, isGL2) {
    var t0 = global.performance.now()
    state.note = ''
    state.partMat = null
    state.fieldMat = null
    state.fieldCount = 0
    state.compSprites = null
    if (modeId === 'none') return {object3D: null, march: null, note: 'none'}

    if (modeId === 'points' || modeId === 'dust') {
      ensureLayout(P)
      var grp = new THREE.Group()
      grp.add(new THREE.Points(samplePoints(P, false), new THREE.PointsMaterial({
        size: P.sizeRatio, sizeAttenuation: true, vertexColors: true, transparent: true,
        map: gasSprite(state), opacity: P.opacity, blending: THREE.AdditiveBlending, depthWrite: false
      })))
      if (modeId === 'dust') {
        var saved = P.count
        P.count = Math.round(saved * 0.6)
        var dust = new THREE.Points(samplePoints(P, true), new THREE.PointsMaterial({
          size: P.sizeRatio * 1.8, sizeAttenuation: true, map: dustSprite(P.dustAmount),
          blending: THREE.MultiplyBlending, depthWrite: false, transparent: false
        }))
        P.count = saved
        dust.renderOrder = 1
        grp.add(dust)
      }
      orientGroup(grp, P)
      return {object3D: grp, march: null,
        note: (modeId === 'dust' ? 'pts+dust ' : 'pts ') + Math.round(global.performance.now() - t0) + 'ms'}
    }

    // 'volume' marches a baked 3D texture; everything else marches procedural fBm.
    P._galaxy = modeId === 'galaxy'
    var useTex = modeId === 'volume'
    if (useTex && !isGL2) return {object3D: null, march: null, note: 'needs WebGL2'}
    var mesh = raymarchMesh(P, useTex, state)
    if (modeId !== 'particles' && modeId !== 'galaxy') {
      orientGroup(mesh, P)
      return {object3D: mesh, march: mesh, note: useTex ? state.note : 'procedural'}
    }
    var group = new THREE.Group()
    group.add(mesh)
    group.add(modeId === 'galaxy' ? buildGalaxyStars(P, state) : buildParticles(P, state))
    // A nebula opts into the core sprite with sunHalo, so no saved galaxy preset changes.
    if (P.sunBright > 0 && (modeId === 'galaxy' || P.sunHalo > 0)) {
      group.add(buildGalaxyCore(P, state, modeId !== 'galaxy'))
    }
    if (modeId === 'galaxy') {
      var comps = buildCompanions(P, state)
      if (comps) group.add(comps)
    }
    var field = buildFieldStars(P, state)
    if (field) group.add(field)
    orientGroup(group, P)
    return {object3D: group, march: mesh,
      note: (modeId === 'galaxy' ? 'disk + ' : 'procedural + ') + state.particleCount +
        (modeId === 'galaxy' ? ' stars' : 'p') + (state.fieldCount ? ' + ' + state.fieldCount + ' field' : '')}
  }

  function tiltOf(P) { return (Number(P.tilt) || 0) * Math.PI / 180 }
  function rollOf(P) { return (Number(P.roll) || 0) * Math.PI / 180 }

  // Euler order ZXY composes as Rz * Rx * Ry, so a vector meets Ry first - the host's own
  // `rotation.y += spin`, about the disc's normal, exactly as before - then Rx for the
  // inclination, then Rz outermost, which is a true roll about the line of sight. At roll 0
  // this is Rx * Ry, identical to the default XYZ order with z left at zero.
  function orientGroup(o, P) {
    o.rotation.order = 'ZXY'
    o.rotation.x = tiltOf(P)
    o.rotation.z = rollOf(P)
  }

  function dispose(object3D) {
    if (!object3D) return
    object3D.traverse(function (o) {
      // THREE.Sprite shares ONE module-level geometry across every sprite in the app, so
      // disposing it here disposes it for all of them. Harmless while there was one sprite;
      // the galaxy now has five, and the AR host rebuilds on every slider release.
      if (o.geometry && !o.isSprite) o.geometry.dispose()
      if (o.material) o.material.dispose()
    })
  }

  // ---------------------------------------------------------------- schema
  var DEFAULTS = {
    count: 5000, sizeRatio: 0.04, opacity: 0.24, dustAmount: 0.55,
    steps: 40, density: 4.0, absorb: 2.6, emission: 2.0, light: 1, texSize: 64,
    turbulence: 3.6, contrast: 3.2, dust: 0.8, coreGain: 0.9, scale: 1.0,
    clouds: 1, layout: 0, clump: 0.45, clumpScale: 0.35, spread: 0.5,
    seed: 0, stretch: 1, flatten: 1, falloff: 1, warp: 0, tilt: 0,
    galRadius: 0.46, galThick: 0.028, galFlare: 0.4, galBulge: 0.11, galBulgeGain: 1.8, galBulgeFlat: 0.55,
    galArms: 2, galWind: 3.2, galArmWidth: 2.2, galFalloff: 1.6,
    starCount: 3500, starSize: 0.0028, starScatter: 0.25, starBulge: 0.22, starArmHue: 212, starThick: 0.6,
    sunSize: 0.09, sunBright: 1.6, sunHue: 45,
    baseHue: 6, coreHue: 168, sat: 0.72, partCount: 1200, partSize: 0.004,
    partHue: 40, partTwinkle: 0.6, partDrift: 0.006,
    premul: 0, white: 0, marchPad: 1.03, detail: 4, emitRho: 0,
    hollow: 0, shellR: 0.42, shellK: 4, bipolar: 0, lobeSharp: 0.35, lobeBias: 0,
    lobeAz: 120, lobeEl: 30, striate: 0, striaGain: 1.8,
    ionAmt: 0, knotQ: 0.012, ion0: 0.04, ion1: 0.80, ionDens: 0, midHue: 300, hotGain: 2.0,
    darkAbsorb: 0, darkR: 0, darkX: -0.18, darkY: 0.16, darkZ: 0, darkAz: 0, darkEl: -30,
    darkScallop: 0.08, darkScale: 7, darkEdge: 0.014, darkHue: 24, darkLev: 0.16,
    dark2R: 0, dark2X: -0.24, dark2Y: -0.20, dark2Z: 0.05,
    rimGain: 0, rimW: 0.018,
    sunX: 0, sunY: 0, sunZ: 0, sunHalo: 0, sunKnotBright: 2.5,
    fieldCount: 0, fieldPx: 2.2, fieldRadius: 0.62, fieldBright: 0.85, fieldAlpha: 1.5,
    fieldCap: 46, fieldPsf: 7, fieldHalo: 0.06, fieldGlareAt: 16, fieldGlare: 3.5,
    fieldMinDist: 2.2,
    fieldBoxX: 0, fieldBoxY: 0, fieldBoxZ0: 0, fieldBoxZ1: 0, fieldConc: 0, fieldConcR: 0.3,
    galBound: 0,
    roll: 0,
    galCull: 0, galBulgeLift: 0, galBulgeSoft: 0, galArmFloor: 0.22, galArmWobble: 0,
    galFrag: 0, galFragAlong: 8, galFragAcross: 0.45,
    laneAmt: 0, laneK: 260, laneWind: 1, laneOff: -0.13, lane2: 0.55, laneThick: 0.34,
    laneIn: 0.12, laneOut: 0.80, laneWob: 0.30,
    galDustAbsorb: 0, galDustBlue: 0.55, galDustVeil: 0.8,
    galPal: 0, colIn: 0.10, colSlope: 1.7, colArm: 0.30, colNoise: 0.09,
    colDense: 0.16, colDenseK: 3, bulgeMix: 1.8,
    creamHue: 44, creamSat: 0.40, creamLev: 0.88,
    peachHue: 26, peachSat: 0.68, peachLev: 0.70,
    armHue: 214, armSat: 1.08, armLev: 0.66,
    hueKeep: 0, hueBreak: 7,
    starPx: 0, starPsf: 10, starHalo: 0.05, starGlare: 2.4, starRamp: 0.60, starMidHue: 28, starArmSharp: 1,
    starLaneCut: 0, knotFrac: 0, knotHue: 205, knotR0: 0.36, hiiFrac: 0.13, hiiHue: 332,
    fieldLock: 0, fgBright: 0, fgTemp: 0.10, fgX: -0.22, fgY: 0.16, fgZ: 0.50, fgGlare: 1,
    comp1X: 0, comp1Y: 0, comp1Z: 0, comp1R: 0, comp1Flat: 1.35, comp1Rot: 0,
    comp1Bright: 1.8, comp1Core: 2.4, comp1Hue: 44,
    comp2X: 0, comp2Y: 0, comp2Z: 0, comp2R: 0, comp2Flat: 1.7, comp2Rot: 0,
    comp2Bright: 0.5, comp2Core: 1.15, comp2Hue: 40
  }

  var COLOUR = ['baseHue', 'coreHue', 'sat', 'spread']
  // The photographic set: the shape of a blister cavity, the ionisation colour ramp, the
  // opaque intrusion, the tone curve, the ionising knot and a field of real stars.
  var ION = ['ionAmt', 'knotQ', 'ion0', 'ion1', 'ionDens', 'midHue', 'hotGain', 'emitRho']
  var CAVITY = ['hollow', 'shellR', 'shellK', 'bipolar', 'lobeSharp', 'lobeBias', 'lobeAz', 'lobeEl',
    'striate', 'striaGain', 'marchPad', 'detail']
  var DARKLANE = ['darkAbsorb', 'darkR', 'darkX', 'darkY', 'darkZ', 'darkAz', 'darkEl', 'darkScallop',
    'darkScale', 'darkEdge', 'darkHue', 'darkLev', 'dark2R', 'dark2X', 'dark2Y', 'dark2Z',
    'rimGain', 'rimW']
  var KNOT = ['sunSize', 'sunBright', 'sunHue', 'sunHalo', 'sunKnotBright', 'sunX', 'sunY', 'sunZ']
  var FIELD = ['fieldCount', 'fieldPx', 'fieldRadius', 'fieldBright', 'fieldAlpha', 'fieldCap',
    'fieldPsf', 'fieldHalo', 'fieldGlareAt', 'fieldGlare', 'fieldMinDist',
    'fieldBoxX', 'fieldBoxY', 'fieldBoxZ0', 'fieldBoxZ1', 'fieldConc', 'fieldConcR']
  var TONE = ['premul', 'white', 'hueKeep', 'hueBreak']
  var GALDUST = ['laneAmt', 'galDustAbsorb', 'laneK', 'laneWind', 'laneOff', 'lane2', 'laneThick',
    'laneIn', 'laneOut', 'laneWob', 'galDustBlue', 'galDustVeil', 'darkHue', 'darkLev']
  var GALARM = ['galBound', 'galArmFloor', 'galArmWobble', 'galFrag', 'galFragAlong', 'galFragAcross',
    'galBulgeLift', 'galBulgeSoft', 'galCull', 'roll']
  var GALPAL = ['galPal', 'colIn', 'colSlope', 'colArm', 'colNoise', 'colDense', 'colDenseK',
    'bulgeMix', 'creamHue', 'creamSat', 'creamLev', 'peachHue', 'peachSat', 'peachLev',
    'armHue', 'armSat', 'armLev']
  var STARPOP = ['starArmSharp', 'starPx', 'starPsf', 'starHalo', 'starGlare', 'starRamp', 'starMidHue',
    'starLaneCut', 'knotFrac', 'knotHue', 'knotR0', 'hiiFrac', 'hiiHue']
  var FGSTAR = ['fieldLock', 'fgBright', 'fgTemp', 'fgX', 'fgY', 'fgZ', 'fgGlare']
  var COMPANION = ['comp1X', 'comp1Y', 'comp1Z', 'comp1R', 'comp1Flat', 'comp1Rot', 'comp1Bright',
    'comp1Core', 'comp1Hue', 'comp2X', 'comp2Y', 'comp2Z', 'comp2R', 'comp2Flat', 'comp2Rot',
    'comp2Bright', 'comp2Core', 'comp2Hue']
  var SHAPE = ['clouds', 'seed', 'stretch', 'flatten', 'falloff', 'warp', 'layout', 'clump', 'clumpScale']
  var MODES = [
    {id: 'points', name: 'Points', sub: 'additive (today)', ctls: ['count', 'sizeRatio', 'opacity', 'contrast', 'dust', 'scale'].concat(SHAPE)},
    {id: 'dust', name: 'Points + Dust', sub: 'absorption pass', ctls: ['count', 'sizeRatio', 'opacity', 'dustAmount', 'scale'].concat(SHAPE)},
    {id: 'march', name: 'Raymarch', sub: 'procedural fBm', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'turbulence', 'contrast', 'scale'].concat(SHAPE).concat(COLOUR).concat(TONE).concat(ION).concat(CAVITY).concat(DARKLANE)},
    {id: 'volume', name: 'Raymarch', sub: '3D texture', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'texSize', 'scale'].concat(SHAPE).concat(COLOUR)},
    {id: 'particles', name: 'Volume + Particles', sub: 'gas with stars in it', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'partCount', 'partSize', 'partHue', 'partTwinkle', 'partDrift', 'scale'].concat(SHAPE).concat(COLOUR).concat(TONE).concat(ION).concat(CAVITY).concat(DARKLANE).concat(KNOT).concat(FIELD)},
    {id: 'galaxy', name: 'Galaxy', sub: 'disk, arms and stars', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'galRadius', 'galThick', 'galFlare', 'galFalloff', 'tilt', 'galArms', 'galWind', 'galArmWidth', 'galBulge', 'galBulgeGain', 'galBulgeFlat', 'sunSize', 'sunBright', 'sunHue', 'starCount', 'starSize', 'starThick', 'starScatter', 'starBulge', 'starArmHue', 'partTwinkle', 'partDrift', 'scale'].concat(['seed', 'warp', 'clump', 'clumpScale', 'turbulence', 'contrast', 'dust']).concat(COLOUR).concat(TONE).concat(FIELD).concat(ION).concat(GALDUST).concat(GALARM).concat(GALPAL).concat(STARPOP).concat(FGSTAR).concat(COMPANION)},
    {id: 'none', name: 'Nothing', sub: 'baseline floor', ctls: []}
  ]
  var RANGE = {
    count: [500, 20000, 500, 'points'], sizeRatio: [0.005, 0.15, 0.005, 'size'], opacity: [0.02, 1, 0.02, 'opacity'],
    dustAmount: [0, 1, 0.05, 'dust opacity'], steps: [8, 128, 4, 'march steps'], density: [0.2, 8, 0.2, 'density'],
    absorb: [0.2, 8, 0.2, 'absorption'], emission: [0.1, 4, 0.1, 'emission'], light: [0, 1, 0.1, 'lighting'],
    texSize: [16, 128, 16, 'texture size'], turbulence: [1, 8, 0.2, 'turbulence'], contrast: [1, 6, 0.1, 'contrast'],
    dust: [0, 1, 0.05, 'dust cut'], scale: [0.3, 3, 0.1, 'size (m)'],
    baseHue: [0, 360, 2, 'cloud hue'], coreHue: [0, 360, 2, 'core hue'], sat: [0, 1, 0.05, 'saturation'],
    spread: [0, 1, 0.05, 'colour spread'], clouds: [1, 6, 1, 'clouds'], layout: [0, 9, 1, 'arrangement'],
    clump: [0, 1, 0.05, 'clumping'], clumpScale: [0.1, 1.2, 0.05, 'clump size'],
    seed: [0, 99, 1, 'seed'], stretch: [0.5, 2, 0.05, 'stretch X'], flatten: [0.3, 1.5, 0.05, 'flatten Y'],
    falloff: [0.3, 3, 0.1, 'edge falloff'], warp: [0, 1, 0.05, 'filament warp'],
    partCount: [0, 6000, 100, 'particles'], partSize: [0.0005, 0.03, 0.0005, 'particle size'],
    partHue: [0, 360, 2, 'particle hue'], partTwinkle: [0, 1, 0.05, 'twinkle'], partDrift: [0, 0.03, 0.002, 'drift'],
    galRadius: [0.15, 0.5, 0.01, 'disk radius'], galThick: [0.005, 0.2, 0.005, 'disk thickness'],
    galFlare: [0, 1.5, 0.05, 'rim flare'], galBulge: [0.02, 0.3, 0.01, 'bulge size'],
    galBulgeGain: [0, 4, 0.1, 'bulge brightness'], galArms: [1, 12, 1, 'arms'],
    galWind: [0.5, 16, 0.1, 'arm winding'], galArmWidth: [0.5, 24, 0.1, 'arm tightness'],
    galFalloff: [0.4, 4, 0.1, 'radial falloff'], galBulgeFlat: [0.15, 1.5, 0.05, 'bulge flatten'],
    tilt: [-90, 90, 1, 'tilt'],
    starCount: [0, 20000, 250, 'stars'], starSize: [0.0005, 0.02, 0.0005, 'star size'],
    starScatter: [0, 1, 0.05, 'stars between arms'], starBulge: [0, 0.6, 0.02, 'bulge share'],
    starArmHue: [0, 360, 2, 'arm star hue'], starThick: [0.1, 4, 0.05, 'star disk thickness'],
    sunSize: [0, 0.4, 0.005, 'core size'], sunBright: [0, 4, 0.1, 'core brightness'], sunHue: [0, 360, 2, 'core hue'],
    premul: [0, 1, 1, 'premultiplied'], white: [0, 8, 0.25, 'white point'],
    marchPad: [1, 1.6, 0.01, 'march padding'], detail: [2, 5, 1, 'noise octaves'],
    emitRho: [0, 20, 0.5, 'density contrast'],
    hollow: [0, 1, 0.05, 'cavity hollow'], shellR: [0.1, 0.9, 0.02, 'wall radius'],
    shellK: [1, 12, 0.5, 'wall thickness'], bipolar: [0, 1, 0.05, 'wing strength'],
    lobeSharp: [0, 1, 0.05, 'wing tightness'], lobeBias: [-0.8, 0.8, 0.05, 'wing asymmetry'],
    lobeAz: [0, 360, 2, 'wing azimuth'], lobeEl: [-90, 90, 2, 'wing elevation'],
    striate: [0, 1, 0.05, 'radial filaments'], striaGain: [0.5, 3, 0.1, 'filament stretch'],
    ionAmt: [0, 1, 1, 'ionisation colour'], knotQ: [0.0005, 0.2, 0.0005, 'knot reach'],
    ion0: [0, 0.5, 0.01, 'rose edge'], ion1: [0.1, 1, 0.02, 'white edge'],
    ionDens: [0, 6, 0.25, 'density reddening'], midHue: [0, 360, 2, 'mid hue'],
    hotGain: [1, 6, 0.1, 'core blowout'],
    darkAbsorb: [0, 12, 0.25, 'intrusion opacity'], darkR: [0, 1.2, 0.01, 'intrusion radius'],
    darkX: [-0.5, 0.5, 0.01, 'intrusion x'], darkY: [-0.5, 0.5, 0.01, 'intrusion y'],
    darkZ: [-0.5, 0.5, 0.01, 'intrusion z'], darkAz: [0, 360, 2, 'intrusion azimuth'],
    darkEl: [-90, 90, 2, 'intrusion elevation'], darkScallop: [0, 0.25, 0.005, 'scallop depth'],
    darkScale: [2, 20, 0.5, 'scallop size'], darkEdge: [0.002, 0.08, 0.002, 'edge hardness'],
    darkHue: [0, 360, 2, 'intrusion hue'], darkLev: [0, 0.5, 0.01, 'intrusion glow'],
    dark2R: [0, 0.3, 0.01, 'second lane size'], dark2X: [-0.5, 0.5, 0.01, 'second lane x'],
    dark2Y: [-0.5, 0.5, 0.01, 'second lane y'], dark2Z: [-0.5, 0.5, 0.01, 'second lane z'],
    rimGain: [0, 4, 0.1, 'lit rim'], rimW: [0.004, 0.06, 0.002, 'rim width'],
    sunX: [-0.4, 0.4, 0.01, 'core x'], sunY: [-0.4, 0.4, 0.01, 'core y'],
    sunZ: [-0.4, 0.4, 0.01, 'core z'], sunHalo: [0, 16, 0.5, 'core halo'],
    sunKnotBright: [0.5, 6, 0.1, 'knot brightness'],
    fieldCount: [0, 20000, 250, 'field stars'], fieldPx: [1, 6, 0.1, 'star size (px)'],
    fieldRadius: [0.35, 1.5, 0.05, 'field radius'], fieldBright: [0.1, 2.5, 0.05, 'star brightness'],
    fieldAlpha: [0.8, 3, 0.1, 'magnitude slope'], fieldCap: [4, 120, 2, 'brightest star'],
    fieldPsf: [2, 20, 0.5, 'star hardness'], fieldHalo: [0, 0.4, 0.01, 'star halo'],
    fieldGlareAt: [4, 60, 1, 'glare threshold'], fieldGlare: [0, 12, 0.5, 'glare size'],
    fieldMinDist: [0.5, 8, 0.1, 'star lock dist'],
    fieldBoxX: [0, 1.5, 0.005, 'star box half-width'], fieldBoxY: [0, 1.5, 0.005, 'star box half-height'],
    fieldBoxZ0: [-1.5, 1.5, 0.005, 'star box back'], fieldBoxZ1: [-1.5, 1.5, 0.005, 'star box front'],
    fieldConc: [0, 1, 0.05, 'stars gather at centre'], fieldConcR: [0.05, 1.5, 0.01, 'gather radius'],
    galBound: [0, 1, 1, 'march only the disk'],
    roll: [-90, 90, 1, 'roll'],
    galCull: [0, 0.0019, 0.0001, 'empty-space cull'],
    galBulgeLift: [0, 1, 0.05, 'bulge out of disk'], galBulgeSoft: [0, 1, 0.05, 'bulge softening'],
    galArmFloor: [0.02, 0.6, 0.01, 'interarm light'], galArmWobble: [0, 2, 0.05, 'arm meander'],
    galFrag: [0, 1, 0.05, 'arm fragmentation'], galFragAlong: [2, 24, 0.5, 'fragments per arm'],
    galFragAcross: [0.05, 2, 0.05, 'fragment width'],
    laneAmt: [0, 1, 0.05, 'dust lanes'], laneK: [40, 900, 10, 'lane narrowness'],
    laneWind: [0.5, 4, 0.05, 'lane pitch'], laneOff: [-0.5, 0.5, 0.01, 'lane offset from arm'],
    lane2: [0, 1, 0.05, 'second lane family'], laneThick: [0.1, 1, 0.02, 'lane layer thickness'],
    laneIn: [0.02, 0.5, 0.01, 'lane inner radius'], laneOut: [0.3, 1, 0.02, 'lane outer radius'],
    laneWob: [0, 1, 0.05, 'lane wander'],
    galDustAbsorb: [0, 160, 2, 'lane opacity'], galDustBlue: [0, 1.5, 0.05, 'lane reddening'],
    galDustVeil: [0, 1, 0.05, 'lane glow'],
    galPal: [0, 1, 1, 'radial colour'], colIn: [0, 0.5, 0.01, 'cream radius'],
    colSlope: [0.5, 4, 0.1, 'colour ramp rate'], colArm: [0, 1, 0.05, 'arms bluer'],
    colNoise: [0, 0.4, 0.01, 'colour mottle'], colDense: [0, 0.6, 0.02, 'dense gas redder'],
    colDenseK: [0.5, 10, 0.5, 'density colour knee'], bulgeMix: [0, 4, 0.1, 'bulge colour reach'],
    creamHue: [0, 360, 2, 'bulge hue'], creamSat: [0, 1.5, 0.02, 'bulge saturation'],
    creamLev: [0.3, 1, 0.01, 'bulge lightness'],
    peachHue: [0, 360, 2, 'inner disc hue'], peachSat: [0, 1.5, 0.02, 'inner disc saturation'],
    peachLev: [0.2, 1, 0.01, 'inner disc lightness'],
    armHue: [0, 360, 2, 'outer arm hue'], armSat: [0, 1.5, 0.02, 'outer arm saturation'],
    armLev: [0.2, 1, 0.01, 'outer arm lightness'],
    hueKeep: [0, 1, 0.05, 'keep hue in highlights'], hueBreak: [1, 24, 0.5, 'highlight whitening'],
    starPx: [0, 6, 0.1, 'star size (px)'], starPsf: [2, 20, 0.5, 'star hardness'],
    starHalo: [0, 0.4, 0.01, 'star halo'], starGlare: [0, 8, 0.25, 'knot glare'],
    starRamp: [0, 1.2, 0.02, 'star colour radius'], starMidHue: [0, 360, 2, 'inner disc star hue'],
    starArmSharp: [0.5, 6, 0.1, 'stars hug the arms'],
    starLaneCut: [0, 1, 0.05, 'lanes cut stars'],
    knotFrac: [0, 0.4, 0.01, 'blue knots'], knotHue: [0, 360, 2, 'knot hue'],
    knotR0: [0, 0.8, 0.02, 'knot inner radius'],
    hiiFrac: [0, 0.6, 0.02, 'hii share'], hiiHue: [0, 360, 2, 'hii hue'],
    fieldLock: [0, 1, 1, 'lock star field'],
    fgBright: [0, 60, 0.5, 'bright star'], fgTemp: [0, 1, 0.02, 'bright star colour'],
    fgX: [-1.5, 1.5, 0.01, 'bright star x'], fgY: [-1.5, 1.5, 0.01, 'bright star y'],
    fgZ: [-1.5, 1.5, 0.01, 'bright star z'], fgGlare: [0, 1, 0.05, 'bright star glare'],
    comp1X: [-0.9, 0.9, 0.01, 'm32 x'], comp1Y: [-0.9, 0.9, 0.01, 'm32 y'],
    comp1Z: [-0.9, 0.9, 0.01, 'm32 z'], comp1R: [0, 0.4, 0.005, 'm32 size'],
    comp1Flat: [1, 3, 0.05, 'm32 elongation'], comp1Rot: [-90, 90, 2, 'm32 angle'],
    comp1Bright: [0, 4, 0.05, 'm32 brightness'], comp1Core: [1, 6, 0.1, 'm32 nucleus'],
    comp1Hue: [0, 360, 2, 'm32 hue'],
    comp2X: [-0.9, 0.9, 0.01, 'm110 x'], comp2Y: [-0.9, 0.9, 0.01, 'm110 y'],
    comp2Z: [-0.9, 0.9, 0.01, 'm110 z'], comp2R: [0, 0.4, 0.005, 'm110 size'],
    comp2Flat: [1, 3, 0.05, 'm110 elongation'], comp2Rot: [-90, 90, 2, 'm110 angle'],
    comp2Bright: [0, 4, 0.05, 'm110 brightness'], comp2Core: [1, 6, 0.1, 'm110 nucleus'],
    comp2Hue: [0, 360, 2, 'm110 hue']
  }
  // Grounded in the emission lines: true colour is Ha red with an [O III] core; the Hubble
  // palette is the gold/teal false colour everyone recognises; reflection nebulae (the
  // Pleiades) are blue from dust scattering and have no core line at all.
  var PRESETS = [
    {name: 'True colour', baseHue: 6, coreHue: 168, sat: 0.72, partHue: 40},
    {name: 'Hubble', baseHue: 34, coreHue: 190, sat: 0.62, partHue: 52},
    {name: 'Reflection', baseHue: 212, coreHue: 205, sat: 0.5, partHue: 205}
  ]
  var UNIFORM = {steps: 'uSteps', density: 'uDensity', absorb: 'uAbsorb', emission: 'uEmission',
    light: 'uLight', turbulence: 'uTurb', contrast: 'uContrast', dust: 'uDust',
    falloff: 'uFalloff', warp: 'uWarp',
    galRadius: 'uGalRadius', galThick: 'uGalThick', galFlare: 'uGalFlare',
    galBulgeGain: 'uGalBulgeGain', galWind: 'uGalWind', galArmWidth: 'uGalArmWidth', galFalloff: 'uGalFalloff',
    clump: 'uClump', clumpScale: 'uClumpScale',
    white: 'uWhite', detail: 'uDetail', emitRho: 'uEmitRho', marchPad: 'uMarchPad',
    hollow: 'uHollow', shellR: 'uShellR', shellK: 'uShellK', bipolar: 'uBipolar',
    lobeSharp: 'uLobeSharp', lobeBias: 'uLobeBias', striate: 'uStriate', striaGain: 'uStriaGain',
    ionAmt: 'uIonAmt', knotQ: 'uKnotQ', ion0: 'uIon0', ion1: 'uIon1', ionDens: 'uIonDens',
    darkAbsorb: 'uDarkAbsorb', darkR: 'uDarkR', dark2R: 'uDark2R', darkScallop: 'uDarkScallop',
    darkScale: 'uDarkScale', darkEdge: 'uDarkEdge', rimGain: 'uRimGain', rimW: 'uRimW',
    galCull: 'uGalCull', galBound: 'uGalBound', galBulgeLift: 'uGalBulgeLift', galBulgeSoft: 'uGalBulgeSoft',
    galArmFloor: 'uGalArmFloor', galArmWobble: 'uGalArmWobble', galFrag: 'uGalFrag',
    galFragAlong: 'uGalFragAlong', galFragAcross: 'uGalFragAcross',
    laneAmt: 'uLaneAmt', laneK: 'uLaneK', laneWind: 'uLaneWind', laneOff: 'uLaneOff',
    lane2: 'uLane2', laneThick: 'uLaneThick', laneIn: 'uLaneIn', laneOut: 'uLaneOut',
    laneWob: 'uLaneWob', galDustAbsorb: 'uGalDustAbsorb', galDustBlue: 'uGalDustBlue',
    galDustVeil: 'uGalDustVeil',
    galPal: 'uGalPal', colIn: 'uColIn', colSlope: 'uColSlope', colArm: 'uColArm',
    colNoise: 'uColNoise', colDense: 'uColDense', colDenseK: 'uColDenseK', bulgeMix: 'uBulgeMix',
    hueKeep: 'uHueKeep', hueBreak: 'uHueBreak'}

  // Not plain scalars: each of these feeds a vec3 or a normalised direction, so it goes
  // through refreshDerived rather than straight into a uniform slot.
  var DERIVED = {stretch: 1, flatten: 1, lobeAz: 1, lobeEl: 1, darkAz: 1, darkEl: 1,
    darkX: 1, darkY: 1, darkZ: 1, dark2X: 1, dark2Y: 1, dark2Z: 1, darkHue: 1, darkLev: 1,
    midHue: 1, hotGain: 1, sunX: 1, sunY: 1, sunZ: 1,
    creamHue: 1, creamSat: 1, creamLev: 1, peachHue: 1, peachSat: 1, peachLev: 1,
    armHue: 1, armSat: 1, armLev: 1}
  // These change the size of the proxy box, which is geometry, not a uniform.
  var HULL = {marchPad: 1}
  // These change the JS density field as well, so the particles only follow after a rebuild.
  var SHAPEJS = {hollow: 1, shellR: 1, shellK: 1, bipolar: 1, lobeSharp: 1, lobeBias: 1,
    lobeAz: 1, lobeEl: 1, stretch: 1, flatten: 1, sunX: 1, sunY: 1, sunZ: 1}
  var SUNP = {sunX: 1, sunY: 1, sunZ: 1, sunSize: 1, sunHalo: 1, sunBright: 1, sunHue: 1,
    sunKnotBright: 1}
  var COMPP = {}
  ;['X', 'Y', 'Z', 'R', 'Flat', 'Rot', 'Bright', 'Core', 'Hue'].forEach(function (k) {
    COMPP['comp1' + k] = 1
    COMPP['comp2' + k] = 1
  })
  // The disc star population when it is using the pixel-sized star shader. The uStarPx guard
  // is what stops this firing on the nebula's own particle material.
  var STARU = {starPx: 'uStarPx', starGlare: 'uGlareSize', starPsf: 'uPsf', starHalo: 'uHalo'}
  var FIELDU = {fieldPx: 'uStarPx', fieldGlare: 'uGlareSize', fieldPsf: 'uPsf',
    fieldHalo: 'uHalo', fieldMinDist: 'uMinDist'}

  // ---------------------------------------------------------------- control panel
  // opts: {tabs, ctls, P, getMode, setMode, rebuild, runtime}
  // runtime() returns {march, partMat, object3D} so a slider can update a live uniform
  // instead of paying for a rebuild.
  function initUI(opts) {
    var P = opts.P

    MODES.forEach(function (m, i) {
      var b = global.document.createElement('button')
      b.innerHTML = m.name + '<small>' + m.sub + '</small>'
      b.setAttribute('aria-selected', i === 0 ? 'true' : 'false')
      b.onclick = function () {
        opts.setMode(m.id, i)
        Array.prototype.forEach.call(opts.tabs.children, function (c, j) {
          c.setAttribute('aria-selected', i === j ? 'true' : 'false')
        })
        controls()
        opts.rebuild()
      }
      opts.tabs.appendChild(b)
    })

    function presetRow() {
      var wrap = global.document.createElement('div')
      wrap.className = 'actions'
      wrap.style.marginTop = '0'
      PRESETS.forEach(function (p) {
        var b = global.document.createElement('button')
        b.textContent = p.name
        b.onclick = function () {
          P.baseHue = p.baseHue; P.coreHue = p.coreHue; P.sat = p.sat; P.partHue = p.partHue
          controls(); opts.rebuild()
        }
        wrap.appendChild(b)
      })
      return wrap
    }

    function controls() {
      var mode = MODES.filter(function (m) { return m.id === opts.getMode() })[0] || MODES[0]
      opts.ctls.innerHTML = ''
      if (mode.ctls.indexOf('baseHue') !== -1) opts.ctls.appendChild(presetRow())
      mode.ctls.forEach(function (key) {
        var r = RANGE[key]
        var row = global.document.createElement('div')
        row.className = 'ctl'
        var lab = global.document.createElement('label')
        // In the hybrid the count means particle clusters, not separate gas clouds.
        lab.textContent = (mode.id === 'particles' && key === 'clouds') ? 'clusters' : r[3]
        var inp = global.document.createElement('input')
        inp.type = 'range'; inp.min = r[0]; inp.max = r[1]; inp.step = r[2]; inp.value = P[key]
        var out = global.document.createElement('output')
        out.textContent = P[key]
        inp.oninput = function () {
          P[key] = parseFloat(inp.value)
          out.textContent = P[key]
          var rt = opts.runtime() || {}
          if (key === 'scale' && rt.object3D) { rt.object3D.scale.setScalar(P.scale); return }
          if ((key === 'roll' || key === 'tilt') && rt.object3D) {
            rt.object3D.rotation.order = 'ZXY'
            rt.object3D.rotation.x = P.tilt * Math.PI / 180
            rt.object3D.rotation.z = P.roll * Math.PI / 180
            return
          }
          if (rt.march && DERIVED[key]) {
            refreshDerived(P, rt.march.material.uniforms)
            if (rt.state && SUNP[key]) applySun(P, rt.state)
          } else if (rt.march && UNIFORM[key]) {
            rt.march.material.uniforms[UNIFORM[key]].value = P[key]
          }
          // A live uniform is enough UNLESS the key also resized the proxy box or moved the
          // field the particles are placed in - both of those are baked, so they still have
          // to reach the rebuild below.
          if (rt.march && (DERIVED[key] || UNIFORM[key]) && !HULL[key] &&
              !(mode.id === 'particles' && SHAPEJS[key])) return
          if (rt.march && (key === 'baseHue' || key === 'coreHue' || key === 'sat' || key === 'spread')) {
            var u = rt.march.material.uniforms
            refreshDerived(P, u)
            if (u.uSpread) u.uSpread.value = P.spread
            if (u.uCloudA) {
              u.uCloudA.value = cloudPalette(P, 0.55, 'baseHue')
              u.uCloudB.value = cloudPalette(P, 0.62, 'coreHue')
            }
            // Particle colour is baked into geometry, so spread still needs their rebuild.
            if (mode.id !== 'particles' || key !== 'spread') return
          }
          if (rt.state && (key === 'sunSize' || key === 'sunBright' || key === 'sunHue')) {
            P[key] = parseFloat(inp.value)
            applySun(P, rt.state)
            // Turning the core off entirely has to rebuild, since the sprite is removed.
            if (!(key === 'sunBright' && (P.sunBright === 0 || !rt.state.sunMat))) return
          }
          if (rt.partMat && rt.partMat.uniforms.uStarPx && STARU[key]) {
            rt.partMat.uniforms[STARU[key]].value = P[key]
            return
          }
          if (rt.state && rt.state.compSprites && COMPP[key]) { applyCompanions(P, rt.state); return }
          if (rt.state && rt.state.fieldMat && FIELDU[key]) {
            rt.state.fieldMat.uniforms[FIELDU[key]].value = P[key]
            return
          }
          if (rt.state && rt.state.sunMats && SUNP[key]) { applySun(P, rt.state); return }
          if (rt.partMat && (key === 'partSize' || key === 'partTwinkle' || key === 'partDrift')) {
            rt.partMat.uniforms[key === 'partSize' ? 'uSize' : key === 'partTwinkle' ? 'uTwinkle' : 'uDrift'].value = P[key]
            return
          }
          clearTimeout(inp._t)
          inp._t = setTimeout(opts.rebuild, 200)
        }
        row.appendChild(lab); row.appendChild(inp); row.appendChild(out)
        opts.ctls.appendChild(row)
      })
    }

    controls()
    return {refresh: controls}
  }

  // ---------------------------------------------------------------- benchmark
  // Frame timing is the point of both harnesses, so it lives here too.
  function Bench(storeKey) {
    var results = []
    try { results = JSON.parse(global.localStorage.getItem(storeKey) || '[]') } catch (e) { results = [] }
    var run = null
    return {
      results: function () { return results },
      running: function () { return !!run },
      start: function (name) { run = {frames: [], cov: [], start: global.performance.now(), warm: true, name: name} },
      clear: function () { results = []; try { global.localStorage.removeItem(storeKey) } catch (e) {} },
      text: function () {
        return results.map(function (r) {
          return r.name + ' | ' + r.avg + ' fps | 1% low ' + r.low + ' | ' + r.ms + ' ms | ' + r.detail
        }).join('\n')
      },
      // Returns null while running, a result row when it finishes, 'warm' during warm-up.
      sample: function (dt, coverage, detail) {
        if (!run) return null
        var now = global.performance.now(), el = now - run.start
        if (run.warm) { if (el > 1000) { run.warm = false; run.start = now; run.frames = [] } return 'warm' }
        run.frames.push(dt)
        if (coverage !== null && coverage !== undefined) run.cov.push(coverage)
        if (now - run.start < 8000) return 'running:' + Math.ceil(8 - (now - run.start) / 1000)
        var f = run.frames.slice().sort(function (a, b) { return a - b })
        var avg = f.reduce(function (a, b) { return a + b }, 0) / f.length
        var p99 = f[Math.floor(f.length * 0.99)] || f[f.length - 1]
        var mc = run.cov.length ? run.cov.reduce(function (a, b) { return a + b }, 0) / run.cov.length : 0
        var row = {name: run.name, avg: (1000 / avg).toFixed(0), low: (1000 / p99).toFixed(0),
          ms: avg.toFixed(1), detail: detail + (mc ? ' ' + mc.toFixed(0) + '%' : '')}
        results.unshift(row)
        results = results.slice(0, 12)
        try { global.localStorage.setItem(storeKey, JSON.stringify(results)) } catch (e) {}
        run = null
        return row
      }
    }
  }

  // Copying has to be honest about failing. The clipboard API rejects in plenty of mobile
  // contexts, and the button used to claim success either way - so a blocked copy looked
  // identical to a real one and you pasted whatever was on the clipboard already.
  function copyText(txt, btn, host, emptyMsg) {
    var label = btn.getAttribute('data-label') || btn.textContent
    btn.setAttribute('data-label', label)
    function flash(msg) {
      btn.textContent = msg
      setTimeout(function () { btn.textContent = label }, 1800)
    }
    if (!txt) { flash(emptyMsg || 'Nothing to copy'); return }
    function fallback() {
      var ta = host.querySelector('textarea.copybox')
      if (!ta) { ta = global.document.createElement('textarea'); ta.className = 'copybox'; ta.readOnly = true; host.appendChild(ta) }
      ta.value = txt
      ta.focus()
      ta.select()
    }
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(txt).then(function () { flash('Copied') },
        function () { fallback(); flash('Copy blocked - select below') })
    } else { fallback(); flash('Select the text below') }
  }

  function copyResults(bench, btn, host) {
    copyText(bench.text(), btn, host, 'No results yet')
  }

  // The tuned parameter set, as JSON. Round-trips through applySettings, so a look you find
  // on the desktop lab can be carried to the phone (and into the app) exactly.
  function settingsText(P, modeId) {
    var o = {mode: modeId}
    Object.keys(DEFAULTS).sort().forEach(function (k) {
      if (typeof DEFAULTS[k] === 'number') o[k] = P[k]
    })
    return JSON.stringify(o, null, 2)
  }

  function copySettings(P, modeId, btn, host) {
    copyText(settingsText(P, modeId), btn, host, 'Nothing to copy')
  }

  // Reads the paste box, applies what it recognises, and says what it did. Unknown keys are
  // ignored and numbers are clamped to their slider range, so a bad paste cannot wedge things.
  function applySettings(P, host, setMode, btn) {
    var label = btn.getAttribute('data-label') || btn.textContent
    btn.setAttribute('data-label', label)
    function flash(msg) {
      btn.textContent = msg
      setTimeout(function () { btn.textContent = label }, 2200)
    }
    var ta = host.querySelector('textarea.copybox')
    if (!ta) {
      ta = global.document.createElement('textarea')
      ta.className = 'copybox'
      ta.placeholder = 'Paste settings JSON here, then press Apply again'
      host.appendChild(ta)
      ta.focus()
      flash('Paste, then Apply')
      return null
    }
    var data
    try { data = JSON.parse(ta.value) } catch (e) { flash('Not valid JSON'); return null }
    var n = 0
    Object.keys(data).forEach(function (k) {
      if (k === 'mode') return
      if (typeof DEFAULTS[k] !== 'number' || typeof data[k] !== 'number') return
      var r = RANGE[k]
      P[k] = r ? Math.max(r[0], Math.min(r[1], data[k])) : data[k]
      n++
    })
    var mode = null
    if (data.mode && MODES.filter(function (m) { return m.id === data.mode })[0]) {
      mode = data.mode
      setMode(mode)
    }
    flash('Applied ' + n + ' values')
    return {applied: n, mode: mode}
  }

  function detailFor(P, modeId) {
    if (modeId === 'none') return 'baseline'
    if (modeId === 'galaxy') return Math.round(P.steps) + 'st+' + Math.round(P.starCount) + 'stars'
    if (modeId === 'points' || modeId === 'dust') return Math.round(P.count) + 'pts'
    return Math.round(P.steps) + 'st' +
      (modeId === 'volume' ? '/' + Math.round(P.texSize) + '\u00b3' : '') +
      (modeId === 'particles' ? '+' + Math.round(P.partCount) + 'p' : '')
  }

  global.NebulaCore = {
    buildFieldStars: buildFieldStars, refreshDerived: refreshDerived, shapeMulJS: shapeMulJS,
    buildCompanions: buildCompanions, applyCompanions: applyCompanions,
    densityAt: densityAt, ensureLayout: ensureLayout, tintAt: tintAt,
    hsl: hsl, hueOffset: hueOffset, cloudPalette: cloudPalette,
    build: build, dispose: dispose, bake: bake,
    DEFAULTS: DEFAULTS, MODES: MODES, RANGE: RANGE, PRESETS: PRESETS,
    initUI: initUI, Bench: Bench, detailFor: detailFor, copyResults: copyResults,
    copySettings: copySettings, applySettings: applySettings, settingsText: settingsText,
    applySun: applySun,
    params: function () {
      var P = {}
      for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) P[k] = DEFAULTS[k]
      return P
    }
  }
})(window)
