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

      function frag(useTex) {
        return [
          'precision highp float;',
          useTex ? 'precision highp sampler3D;' : '',
          'in vec3 vLocal;', 'out vec4 fragColor;',
          'uniform vec3 uCamLocal, uHa, uOiii;',
          'uniform float uSteps,uDensity,uAbsorb,uEmission,uTurb,uContrast,uDust,uCoreGain,uFrame,uLight;',
          'uniform float uSpread, uClump, uClumpScale;',
          'uniform float uSeed, uStretch, uFlatten, uFalloff, uWarp;',
          'uniform vec4 uCores[4];',
          useTex ? 'uniform vec3 uCloudA[6]; uniform vec3 uCloudB[6]; uniform int uCloudN;' : '',
          useTex ? 'uniform sampler3D uVol;' : NOISE,
          'float coreAt(vec3 p){ float b=0.0;',
          ' for(int i=0;i<4;i++){ vec3 d=p-uCores[i].xyz; b += exp(-dot(d,d)/(uCores[i].w*uCores[i].w)); }',
          ' return b; }',
          'float densityAt(vec3 p){',
          useTex ? ' return texture(uVol, p+0.5).r;' : [
            ' vec3 q=p/vec3(0.5*uStretch, 0.36*uFlatten, 0.40); float e=dot(q,q); if(e>1.0) return 0.0;',
            ' float d=pow(1.0-e, uFalloff); d *= 1.0+coreAt(p)*uCoreGain;',
            // Domain warping bends the noise lookup, turning round clumps into strands.
            ' vec3 w = p;',
            ' if (uWarp > 0.0) { float k = uTurb*0.5;',
            '   w += (vec3(fbm(p*k+vec3(uSeed+3.1),2), fbm(p*k+vec3(uSeed+17.7),2), fbm(p*k+vec3(uSeed+31.3),2)) - 0.5) * uWarp * 0.6; }',
            ' d *= pow(fbm(w*uTurb+vec3(11.3+uSeed,4.7,19.1),4), uContrast);',
            ' float du=ridged(w*uTurb*0.65+vec3(51.2+uSeed,8.4,33.9),3); d *= 1.0-uDust*du*du;',
            // Large-scale clumping, so parts of the cloud come out far denser than others.
            ' if (uClump > 0.0) { float cl = fbm(w*uTurb*uClumpScale + vec3(137.1+uSeed,95.9,178.3), 2);',
            '   d *= (1.0 - uClump) + uClump * 2.15 * cl; }',
            ' return max(d,0.0);'].join('\n'),
          '}',
          'void main(){',
          ' vec3 ro=uCamLocal; vec3 rd=normalize(vLocal-ro); vec3 inv=1.0/rd;',
          ' vec3 t0=(vec3(-0.5)-ro)*inv, t1=(vec3(0.5)-ro)*inv;',
          ' vec3 tn=min(t0,t1), tf=max(t0,t1);',
          ' float tEnter=max(max(tn.x,tn.y),tn.z), tExit=min(min(tf.x,tf.y),tf.z);',
          ' tEnter=max(tEnter,0.0); if(tExit<=tEnter) discard;',
          ' int steps=int(uSteps); float dt=(tExit-tEnter)/uSteps;',
          // Dithered start: trades banding for grain so the step count can stay low.
          ' float dither=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453+uFrame*0.618);',
          ' float t=tEnter+dt*dither; vec3 col=vec3(0.0); float T=1.0;',
          ' for(int i=0;i<128;i++){',
          '  if(i>=steps || T<0.04) break;',
          '  vec3 p=ro+rd*t; float d=densityAt(p)*uDensity;',
          '  if(d>0.002){',
          '   float a=1.0-exp(-d*uAbsorb*dt);',
          useTex ? [
            '   vec4 vol = texture(uVol, p+0.5);',
            '   float raw = vol.r;',
            // Density still drives colour, but uSpread widens that gradient and blends in
            // a baked tint field so hue varies across the cloud, not only where it is dense.
            '   float lo = 0.30 - uSpread * 0.26, hi = 0.85 - uSpread * 0.45;',
            '   float cd = smoothstep(lo, max(lo + 0.05, hi), raw);',
            '   float c = clamp(mix(cd, vol.b, uSpread * 0.65), 0.0, 1.0);',
            '   float g = vol.g * float(max(1, uCloudN - 1));',
            '   int k0 = clamp(int(floor(g)), 0, uCloudN - 1);',
            '   int k1 = clamp(k0 + 1, 0, uCloudN - 1);',
            '   float kf = fract(g);',
            '   vec3 emit = mix(mix(uCloudA[k0],uCloudA[k1],kf), mix(uCloudB[k0],uCloudB[k1],kf), c) * uEmission;'
          ].join(String.fromCharCode(10)) : [
            '   float cd = clamp(coreAt(p)*0.3, 0.0, 1.0);',
            // Same idea as the baked tint: hue varies across the cloud, not only where dense.
            '   float tn = fbm(p*uTurb*0.55 + vec3(61.7,43.2,88.1), 2);',
            '   float tint = clamp((tn - 0.28) / 0.44, 0.0, 1.0);',
            '   float c = clamp(mix(cd, tint, uSpread * 0.65), 0.0, 1.0);',
            '   vec3 emit=mix(uHa,uOiii,c)*uEmission;'
          ].join(String.fromCharCode(10)),
          '   if(uLight>0.5){ vec3 L=normalize(-p);',
          '    float lit=clamp((d-densityAt(p+L*0.09)*uDensity)/0.09,0.0,1.0);',
          '    emit *= 0.45+0.55*lit*uLight; }',
          '   col += T*emit*a; T *= 1.0-a;',
          '  }',
          '  t += dt;',
          ' }',
          ' fragColor=vec4(col, 1.0-T);',
          '}'
        ].filter(Boolean).join('\n')
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
      if (s.d <= 0 || Math.random() > Math.min(1, s.d * 2.6)) continue
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
      uFalloff: {value: P.falloff}, uWarp: {value: P.warp}, uCores: {value: shaderCores(P)}
    }
    if (useTex) {
      u.uVol = {value: bake(P, Math.round(P.texSize), state)}
      u.uCloudN = {value: Math.max(1, Math.round(P.clouds))}
      u.uCloudA = {value: cloudPalette(P, 0.55, 'baseHue')}
      u.uCloudB = {value: cloudPalette(P, 0.62, 'coreHue')}
    }
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, uniforms: u, vertexShader: VERT, fragmentShader: frag(useTex),
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.NormalBlending
    }))
  }

  // Returns {object3D, march, note}. march is null for the point modes.
  function build(P, modeId, state, isGL2) {
    var t0 = global.performance.now()
    state.note = ''
    state.partMat = null
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
      return {object3D: grp, march: null,
        note: (modeId === 'dust' ? 'pts+dust ' : 'pts ') + Math.round(global.performance.now() - t0) + 'ms'}
    }

    // 'volume' marches a baked 3D texture; 'march' and 'particles' march procedural fBm.
    var useTex = modeId === 'volume'
    if (useTex && !isGL2) return {object3D: null, march: null, note: 'needs WebGL2'}
    var mesh = raymarchMesh(P, useTex, state)
    if (modeId !== 'particles') {
      return {object3D: mesh, march: mesh, note: useTex ? state.note : 'procedural'}
    }
    var group = new THREE.Group()
    group.add(mesh)
    group.add(buildParticles(P, state))
    return {object3D: group, march: mesh, note: 'procedural + ' + state.particleCount + 'p'}
  }

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
    seed: 0, stretch: 1, flatten: 1, falloff: 1, warp: 0,
    baseHue: 6, coreHue: 168, sat: 0.72, partCount: 1200, partSize: 0.004,
    partHue: 40, partTwinkle: 0.6, partDrift: 0.006
  }

  var COLOUR = ['baseHue', 'coreHue', 'sat', 'spread']
  var SHAPE = ['clouds', 'seed', 'stretch', 'flatten', 'falloff', 'warp', 'layout', 'clump', 'clumpScale']
  var MODES = [
    {id: 'points', name: 'Points', sub: 'additive (today)', ctls: ['count', 'sizeRatio', 'opacity', 'contrast', 'dust', 'scale'].concat(SHAPE)},
    {id: 'dust', name: 'Points + Dust', sub: 'absorption pass', ctls: ['count', 'sizeRatio', 'opacity', 'dustAmount', 'scale'].concat(SHAPE)},
    {id: 'march', name: 'Raymarch', sub: 'procedural fBm', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'turbulence', 'contrast', 'scale'].concat(SHAPE).concat(COLOUR)},
    {id: 'volume', name: 'Raymarch', sub: '3D texture', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'texSize', 'scale'].concat(SHAPE).concat(COLOUR)},
    {id: 'particles', name: 'Volume + Particles', sub: 'gas with stars in it', ctls: ['steps', 'density', 'absorb', 'emission', 'light', 'partCount', 'partSize', 'partHue', 'partTwinkle', 'partDrift', 'scale'].concat(SHAPE).concat(COLOUR)},
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
    partHue: [0, 360, 2, 'particle hue'], partTwinkle: [0, 1, 0.05, 'twinkle'], partDrift: [0, 0.03, 0.002, 'drift']
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
    clump: 'uClump', clumpScale: 'uClumpScale'}

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
          if (rt.march && UNIFORM[key]) { rt.march.material.uniforms[UNIFORM[key]].value = P[key]; return }
          if (rt.march && (key === 'baseHue' || key === 'coreHue' || key === 'sat' || key === 'spread')) {
            var u = rt.march.material.uniforms
            u.uHa.value.fromArray(hsl(P.baseHue, P.sat, 0.55))
            u.uOiii.value.fromArray(hsl(P.coreHue, P.sat, 0.62))
            if (u.uSpread) u.uSpread.value = P.spread
            if (u.uCloudA) {
              u.uCloudA.value = cloudPalette(P, 0.55, 'baseHue')
              u.uCloudB.value = cloudPalette(P, 0.62, 'coreHue')
            }
            // Particle colour is baked into geometry, so spread still needs their rebuild.
            if (mode.id !== 'particles' || key !== 'spread') return
          }
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
    if (modeId === 'points' || modeId === 'dust') return Math.round(P.count) + 'pts'
    return Math.round(P.steps) + 'st' +
      (modeId === 'volume' ? '/' + Math.round(P.texSize) + '\u00b3' : '') +
      (modeId === 'particles' ? '+' + Math.round(P.partCount) + 'p' : '')
  }

  global.NebulaCore = {
    densityAt: densityAt, ensureLayout: ensureLayout, tintAt: tintAt,
    hsl: hsl, hueOffset: hueOffset, cloudPalette: cloudPalette,
    build: build, dispose: dispose, bake: bake,
    DEFAULTS: DEFAULTS, MODES: MODES, RANGE: RANGE, PRESETS: PRESETS,
    initUI: initUI, Bench: Bench, detailFor: detailFor, copyResults: copyResults,
    copySettings: copySettings, applySettings: applySettings, settingsText: settingsText,
    params: function () {
      var P = {}
      for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) P[k] = DEFAULTS[k]
      return P
    }
  }
})(window)
