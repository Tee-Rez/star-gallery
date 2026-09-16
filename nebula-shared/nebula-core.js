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
          '  float b = length(q)/max(0.001,uGalBulge); return exp(-b*b); }',
          'float galaxyDensity(vec3 p){',
          ' float r = length(p.xz); float rn = r/uGalRadius;',
          ' if (rn > 1.0) return 0.0;',
          // The disk thickens toward the rim, the way a real one flares.
          ' float h = uGalThick * (1.0 + uGalFlare * rn * 2.0);',
          ' float vert = exp(-(p.y*p.y)/(h*h));',
          ' float radial = pow(max(0.0, 1.0 - rn), uGalFalloff);',
          // Logarithmic spiral: the arm phase winds with log(radius).
          ' float th = atan(p.z, p.x);',
          ' float phase = th * uGalArms - log(max(rn, 0.05)) * uGalWind;',
          ' float arm = pow(0.5 + 0.5*cos(phase), uGalArmWidth);',
          ' float d = (radial * (0.22 + 0.78*arm) + galBulge(p) * uGalBulgeGain) * vert;',
          ' vec3 w = p;',
          ' if (uWarp > 0.0) { float k = uTurb*0.5;',
          '   w += (vec3(fbm(p*k+vec3(uSeed+3.1),2), fbm(p*k+vec3(uSeed+17.7),2), fbm(p*k+vec3(uSeed+31.3),2)) - 0.5) * uWarp * 0.6; }',
          ' d *= pow(fbm(w*uTurb+vec3(11.3+uSeed,4.7,19.1),4), uContrast);',
          ' float du=ridged(w*uTurb*0.65+vec3(51.2+uSeed,8.4,33.9),3); d *= 1.0-uDust*du*du;',
          ' if (uClump > 0.0) { float cl = fbm(w*uTurb*uClumpScale + vec3(137.1+uSeed,95.9,178.3), 2);',
          '   d *= (1.0 - uClump) + uClump * 2.15 * cl; }',
          ' return max(d,0.0);',
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
          '   if (uIonAmt > 0.5) {',
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
          useTex ? 'uniform vec3 uCloudA[6]; uniform vec3 uCloudB[6]; uniform int uCloudN;' : '',
          useTex ? '' : 'uniform float uGalRadius, uGalThick, uGalFlare, uGalBulge, uGalBulgeGain, uGalArms, uGalWind, uGalArmWidth, uGalFalloff, uGalBulgeFlat;',
          useTex ? 'uniform sampler3D uVol;' : NOISE,
          // Interleaved gradient noise (Jimenez). fract(sin(dot)) is white noise, and its
          // energy sits in exactly the low frequencies the eye picks out as banding; this is
          // roughly blue in screen space and buys most of a doubled step count for five ops.
          'float ign(vec2 q){ return fract(52.9829189*fract(dot(q, vec2(0.06711056,0.00583715)))); }',
          'float coreAt(vec3 p){ float b=0.0;',
          ' for(int i=0;i<4;i++){ vec3 d=p-uCores[i].xyz; b += exp(-dot(d,d)/(uCores[i].w*uCores[i].w)); }',
          ' return b; }',
          useTex ? 'vec2 darkAt(vec3 p){ return vec2(0.0); }' : [
            'vec2 hitEllipsoid(vec3 ro, vec3 rd, vec3 R){',
            ' vec3 o=ro/R, dd=rd/R;',
            ' float a=dot(dd,dd), b=dot(o,dd), c=dot(o,o)-1.0, h=b*b-a*c;',
            ' if (h < 0.0) return vec2(1.0, -1.0);',
            ' h = sqrt(h);',
            ' return vec2((-b-h)/a, (-b+h)/a); }',
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
          ' float t=tEnter+dt*dither; vec3 col=vec3(0.0); float T=1.0;',
          ' for(int i=0;i<128;i++){',
          '  if(i>=steps || T<0.035) break;',
          '  vec3 p=ro+rd*t;',
          '  vec2 dk = (uDarkAbsorb > 0.0) ? darkAt(p) : vec2(0.0);',
          '  float rho = (dk.x < 0.985) ? densityAt(p) : 0.0;',
          '  float d = rho*uDensity;',
          '  if(d>0.002 || dk.x>0.01){',
          // Two absorbers in one exponential: the gas emits and extinguishes, the dark cloud
          // only extinguishes. So raising uDarkAbsorb raises alpha without adding light, and
          // the lane genuinely blocks what is behind it.
          '   float a=1.0-exp(-(d*uAbsorb + dk.x*uDarkAbsorb)*dt);',
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
          '   col += T*emit*a; T *= 1.0-a;',
          '  }',
          '  t += dt;',
          ' }',
          ' if (uWhite > 0.0) {',
          // A sensor clips each channel on its own, which is why a very bright patch washes
          // to WHITE instead of to a saturated hue. It has to happen on the HDR value, before
          // the curve, or the curve just hands back a bright pink core.
          '  float mx = max(max(col.r,col.g),col.b);',
          '  float bl = uWhite*0.35;',
          '  col = mix(col, vec3(mx), smoothstep(bl, bl*3.0, mx));',
          // Extended Reinhard: near-identity below about half the white point, so the faint
          // outskirts keep their colour and their structure, and reaching 1.0 exactly at it.
          '  col = col*(1.0 + col/(uWhite*uWhite))/(1.0 + col);',
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
    for (var i = 0; i < n; i++) {
      var ct = 2 * Math.random() - 1, ph = Math.random() * 6.2831853
      var st = Math.sqrt(Math.max(0, 1 - ct * ct))
      var r = Math.pow(v3 + Math.random() * dv, 1 / 3)   // uniform in VOLUME -> flat on the sky
      var f = starFlux(P.fieldAlpha, P.fieldCap), c = bbColor(starTemp()), b = P.fieldBright * f
      var t = f > P.fieldGlareAt ? F : B
      t.p.push(r * st * Math.cos(ph), r * ct, r * st * Math.sin(ph))
      // Deliberately not normalised: the brightest clip all three channels and read white
      // while the outer wings of the PSF keep their tint. That blowout is free.
      t.c.push(c[0] * b, c[1] * b, c[2] * b)
      // A recorded disc grows only logarithmically with flux - seeing plus saturation - which
      // is why real field stars stay small and hard while getting obviously brighter.
      t.s.push(1 + 0.40 * Math.log(1 + f))
      t.g.push(f > P.fieldGlareAt ? Math.min(1, (f - P.fieldGlareAt) / P.fieldGlareAt) : 0)
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
      if (!t.p.length) return
      var g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(t.p, 3))
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(t.c, 3))
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(t.s, 1))
      g.setAttribute('aGlare', new THREE.Float32BufferAttribute(t.g, 1))
      var o = new THREE.Points(g, state.fieldMat)
      o.renderOrder = order
      // The bounding sphere is computed before the shader runs, so it would cull the whole
      // draw the moment the camera is inside the shell.
      o.frustumCulled = false
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
  function galaxyDensityAt(x, y, z, P) {
    var r = Math.sqrt(x * x + z * z), rn = r / P.galRadius
    if (rn > 1) return {d: 0, bulge: 0, arm: 0}
    var h = P.galThick * (1 + P.galFlare * rn * 2)
    var vert = Math.exp(-(y * y) / (h * h))
    var radial = Math.pow(Math.max(0, 1 - rn), P.galFalloff)
    var yb = y / Math.max(0.05, P.galBulgeFlat)
    var br = Math.sqrt(x * x + yb * yb + z * z) / Math.max(0.001, P.galBulge)
    var bulge = Math.exp(-br * br)
    var th = Math.atan2(z, x)
    var phase = th * P.galArms - Math.log(Math.max(rn, 0.05)) * P.galWind
    var arm = Math.pow(0.5 + 0.5 * Math.cos(phase), P.galArmWidth)
    var d = (radial * (0.22 + 0.78 * arm) + bulge * P.galBulgeGain) * vert
    return {d: Math.max(0, d), bulge: bulge, arm: arm}
  }

  // Stars are a separate population from the gas: a thin disc biased into the arms, plus a
  // rounder, older bulge crowd. Arms read blue (young, hot), the bulge warm - which is the
  // single clearest colour cue that something is a spiral galaxy.
  function buildGalaxyStars(P, state) {
    var n = Math.round(P.starCount), pos = [], col = [], siz = [], seed = [], guard = 0
    var armCol = hsl(P.starArmHue, P.sat * 0.9, 0.72)
    var coreCol = hsl(P.partHue, P.sat * 0.8, 0.76)
    var inBulge = Math.round(n * P.starBulge)
    while (pos.length / 3 < n && guard < n * 60) {
      guard++
      var bulgeStar = pos.length / 3 < inBulge
      var x, y, z
      if (bulgeStar) {
        var rb = P.galBulge * Math.pow(Math.random(), 0.6)
        var a1 = Math.random() * 6.2831853, a2 = Math.acos(2 * Math.random() - 1)
        x = rb * Math.sin(a2) * Math.cos(a1)
        y = rb * Math.cos(a2) * P.galBulgeFlat
        z = rb * Math.sin(a2) * Math.sin(a1)
      } else {
        x = (Math.random() * 2 - 1) * P.galRadius
        z = (Math.random() * 2 - 1) * P.galRadius
        // Sample a band around the mid-plane, then reject against the disc's own vertical
        // profile. The stars sit in a THINNER disc than the gas by default - young stars form
        // near the mid-plane - and starThick scales that independently.
        var hStar = P.galThick * P.starThick
        y = (Math.random() * 2 - 1) * hStar * 3
        var rr = Math.sqrt(x * x + z * z), rn2 = rr / P.galRadius
        if (rn2 > 1) continue
        var hLocal = hStar * (1 + P.galFlare * rn2 * 2)
        var vert = Math.exp(-(y * y) / (hLocal * hLocal))
        var radial = Math.pow(Math.max(0, 1 - rn2), P.galFalloff)
        var phase2 = Math.atan2(z, x) * P.galArms - Math.log(Math.max(rn2, 0.05)) * P.galWind
        var armW = Math.pow(0.5 + 0.5 * Math.cos(phase2), P.galArmWidth)
        // Every factor is already 0..1, so the probability needs no arbitrary gain - which is
        // what previously saturated it and filled the whole sampling box.
        var keep = radial * vert * (P.starScatter + (1 - P.starScatter) * armW)
        if (Math.random() > keep) continue
      }
      var gg = galaxyDensityAt(x, y, z, P)
      var hot = bulgeStar ? 0 : Math.min(1, gg.arm)
      var base = bulgeStar ? coreCol : [
        armCol[0] + (coreCol[0] - armCol[0]) * (1 - hot),
        armCol[1] + (coreCol[1] - armCol[1]) * (1 - hot),
        armCol[2] + (coreCol[2] - armCol[2]) * (1 - hot)]
      var b = bulgeStar ? 0.7 + Math.random() * 0.5 : 0.5 + hot * 0.8
      pos.push(x, y, z)
      col.push(base[0] * b, base[1] * b, base[2] * b)
      siz.push(0.35 + Math.random() * Math.random() * 2.4 + (bulgeStar ? 0.4 : hot * 1.2))
      seed.push(Math.random())
    }
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
    var pts = new THREE.Points(geo, state.partMat)
    pts.renderOrder = -1
    state.particleCount = pos.length / 3
    return pts
  }

  // A bright nucleus at the centre. A Sprite rather than a particle so it always faces the
  // viewer and scales in world units, and it draws after the gas so it reads as the brightest
  // thing in the object - which is what a galactic core looks like from outside.
  // `knot` adds a second, much tighter sprite inside the halo: a nebula's ionising cluster
  // reads as one overwhelming point with a wide glow around it, where a galactic core is all
  // glow. A galaxy passes knot false and gets exactly the single sprite it always had.
  function buildGalaxyCore(P, state, knot) {
    if (!state.sunTex) {
      state.sunTex = radial([
        [0, 'rgba(255,255,255,1)'],
        [0.12, 'rgba(255,255,255,0.92)'],
        [0.32, 'rgba(255,255,255,0.30)'],
        [0.62, 'rgba(255,255,255,0.07)'],
        [1, 'rgba(255,255,255,0)']])
    }
    if (knot && !state.knotTex) {
      state.knotTex = radial([
        [0, 'rgba(255,255,255,1)'],
        [0.06, 'rgba(255,255,255,0.95)'],
        [0.16, 'rgba(255,255,255,0.30)'],
        [0.40, 'rgba(255,255,255,0.06)'],
        [1, 'rgba(255,255,255,0)']])
    }
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
      uWhite: {value: P.white}, uHalf: {value: 0.5}
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
      grp.rotation.x = tiltOf(P)
      return {object3D: grp, march: null,
        note: (modeId === 'dust' ? 'pts+dust ' : 'pts ') + Math.round(global.performance.now() - t0) + 'ms'}
    }

    // 'volume' marches a baked 3D texture; everything else marches procedural fBm.
    P._galaxy = modeId === 'galaxy'
    var useTex = modeId === 'volume'
    if (useTex && !isGL2) return {object3D: null, march: null, note: 'needs WebGL2'}
    var mesh = raymarchMesh(P, useTex, state)
    if (modeId !== 'particles' && modeId !== 'galaxy') {
      mesh.rotation.x = tiltOf(P)
      return {object3D: mesh, march: mesh, note: useTex ? state.note : 'procedural'}
    }
    var group = new THREE.Group()
    group.add(mesh)
    group.add(modeId === 'galaxy' ? buildGalaxyStars(P, state) : buildParticles(P, state))
    // A nebula opts into the core sprite with sunHalo, so no saved galaxy preset changes.
    if (P.sunBright > 0 && (modeId === 'galaxy' || P.sunHalo > 0)) {
      group.add(buildGalaxyCore(P, state, modeId !== 'galaxy'))
    }
    var field = buildFieldStars(P, state)
    if (field) group.add(field)
    group.rotation.x = tiltOf(P)
    return {object3D: group, march: mesh,
      note: (modeId === 'galaxy' ? 'disk + ' : 'procedural + ') + state.particleCount +
        (modeId === 'galaxy' ? ' stars' : 'p') + (state.fieldCount ? ' + ' + state.fieldCount + ' field' : '')}
  }

  function tiltOf(P) { return (Number(P.tilt) || 0) * Math.PI / 180 }

  function dispose(object3D) {
    if (!object3D) return
    object3D.traverse(function (o) {
      if (o.geometry) o.geometry.dispose()
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
    fieldMinDist: 2.2
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
    'fieldPsf', 'fieldHalo', 'fieldGlareAt', 'fieldGlare', 'fieldMinDist']
  var TONE = ['premul', 'white']
  var SHAPE = ['clouds', 'seed', 'stretch', 'flatten', 'falloff', 'warp', 'layout', 'clump', 'clumpScale']
  var MODES = [
    {id: 'points', name: 'Points', sub: 'additive (today)', ctls: ['count', 'sizeRatio', 'opacity', 'contrast', 'dust', 'scale'].concat(SHAPE)},
    {id: 'dust', name: 'Points + Dust', sub: 'absorption pass', ctls: ['count', 'sizeRatio', 'opacity', 'dustAmount', 'scale'].concat(SHAPE)},
    {id: 'march', name: 'Raymarch', sub: 'procedural fBm', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'turbulence', 'contrast', 'scale'].concat(SHAPE).concat(COLOUR).concat(TONE).concat(ION).concat(CAVITY).concat(DARKLANE)},
    {id: 'volume', name: 'Raymarch', sub: '3D texture', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'texSize', 'scale'].concat(SHAPE).concat(COLOUR)},
    {id: 'particles', name: 'Volume + Particles', sub: 'gas with stars in it', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'partCount', 'partSize', 'partHue', 'partTwinkle', 'partDrift', 'scale'].concat(SHAPE).concat(COLOUR).concat(TONE).concat(ION).concat(CAVITY).concat(DARKLANE).concat(KNOT).concat(FIELD)},
    {id: 'galaxy', name: 'Galaxy', sub: 'disk, arms and stars', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'galRadius', 'galThick', 'galFlare', 'galFalloff', 'tilt', 'galArms', 'galWind', 'galArmWidth', 'galBulge', 'galBulgeGain', 'galBulgeFlat', 'sunSize', 'sunBright', 'sunHue', 'starCount', 'starSize', 'starThick', 'starScatter', 'starBulge', 'starArmHue', 'partTwinkle', 'partDrift', 'scale'].concat(['seed', 'warp', 'clump', 'clumpScale', 'turbulence', 'contrast', 'dust']).concat(COLOUR).concat(TONE).concat(FIELD)},
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
    galBulgeGain: [0, 4, 0.1, 'bulge brightness'], galArms: [1, 6, 1, 'arms'],
    galWind: [0.5, 8, 0.1, 'arm winding'], galArmWidth: [0.5, 6, 0.1, 'arm tightness'],
    galFalloff: [0.4, 4, 0.1, 'radial falloff'], galBulgeFlat: [0.15, 1.5, 0.05, 'bulge flatten'],
    tilt: [-90, 90, 1, 'tilt'],
    starCount: [0, 12000, 250, 'stars'], starSize: [0.0005, 0.02, 0.0005, 'star size'],
    starScatter: [0, 1, 0.05, 'stars between arms'], starBulge: [0, 0.6, 0.02, 'bulge share'],
    starArmHue: [0, 360, 2, 'arm star hue'], starThick: [0.1, 2, 0.05, 'star disk thickness'],
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
    fieldCount: [0, 8000, 100, 'field stars'], fieldPx: [1, 6, 0.1, 'star size (px)'],
    fieldRadius: [0.35, 1.5, 0.05, 'field radius'], fieldBright: [0.1, 2.5, 0.05, 'star brightness'],
    fieldAlpha: [0.8, 3, 0.1, 'magnitude slope'], fieldCap: [4, 120, 2, 'brightest star'],
    fieldPsf: [2, 20, 0.5, 'star hardness'], fieldHalo: [0, 0.4, 0.01, 'star halo'],
    fieldGlareAt: [4, 60, 1, 'glare threshold'], fieldGlare: [0, 12, 0.5, 'glare size'],
    fieldMinDist: [0.5, 8, 0.1, 'star lock dist']
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
    darkScale: 'uDarkScale', darkEdge: 'uDarkEdge', rimGain: 'uRimGain', rimW: 'uRimW'}

  // Not plain scalars: each of these feeds a vec3 or a normalised direction, so it goes
  // through refreshDerived rather than straight into a uniform slot.
  var DERIVED = {stretch: 1, flatten: 1, lobeAz: 1, lobeEl: 1, darkAz: 1, darkEl: 1,
    darkX: 1, darkY: 1, darkZ: 1, dark2X: 1, dark2Y: 1, dark2Z: 1, darkHue: 1, darkLev: 1,
    midHue: 1, hotGain: 1, sunX: 1, sunY: 1, sunZ: 1}
  // These change the size of the proxy box, which is geometry, not a uniform.
  var HULL = {marchPad: 1}
  // These change the JS density field as well, so the particles only follow after a rebuild.
  var SHAPEJS = {hollow: 1, shellR: 1, shellK: 1, bipolar: 1, lobeSharp: 1, lobeBias: 1,
    lobeAz: 1, lobeEl: 1, stretch: 1, flatten: 1, sunX: 1, sunY: 1, sunZ: 1}
  var SUNP = {sunX: 1, sunY: 1, sunZ: 1, sunSize: 1, sunHalo: 1, sunBright: 1, sunHue: 1,
    sunKnotBright: 1}
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
