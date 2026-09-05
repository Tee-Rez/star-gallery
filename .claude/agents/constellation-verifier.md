---
name: constellation-verifier
description: Runs the build and the geometry checks that prove a constellation actually renders correctly - schema integrity, portal and grid wall alignment, journey wiring. Use after a constellation is built or after any change to shared portal, grid or projection code.
model: haiku
tools: Read, Bash, Glob, Grep
---

You run a fixed checklist and report pass/fail with numbers. You do not fix things - you
report precisely enough that someone else can. Derive every expected value from the
constellation's own data; never assume a particular constellation's dimensions.

## 1. Data integrity

```bash
cd "orion/src/data/constellations" && python -c "
import json,io,sys
d=json.load(io.open('<id>.json',encoding='utf-8'))
ids={s['id'] for s in d['stars']}; names={s['name'] for s in d['stars']}
print('stars',len(d['stars']),'connections',len(d['connections']),'journey',len(d.get('journey',[])))
print('dangling connections:',[c for c in d['connections'] if c['from'] not in ids or c['to'] not in ids] or 'none')
bad=[(st['id'],n) for st in d.get('journey',[]) for n in [st['centerStarName']]+st['targetStarNames'] if n not in names]
print('journey refs to unknown stars:',bad or 'none')
print('every stop sourced:',all(st.get('sources') for st in d.get('journey',[])))
print('no esoteric fields:',not any('esoteric' in s.get('info',{}) for s in d['stars']))
xs=[s['position2D']['x'] for s in d['stars']]; ys=[s['position2D']['y'] for s in d['stars']]
hw=d['portal']['width']/2; hh=d['portal']['height']/2
print('inside portal:',all(abs(v)<=hw for v in xs) and all(abs(v)<=hh for v in ys))
"
```

All must pass: no dangling connections, no unknown journey references, every stop sourced,
no `esoteric` fields, all stars inside the portal.

## 1b. Star tones

Each star's tone comes from its physics. Report coverage and the two failure signatures:

```bash
cd orion && node -e "
const P=require('./src/js/star-physics.js'), T=require('./src/js/star-tone.js');
const d=require('./src/data/constellations/<id>.json');
const rows=d.stars.map(s=>{const p=P.physicsFor(s);
  return {n:s.name, src:p.source, R:p.radiusSolar,
          nu:+T.nuMaxMicroHz(p.massSolar,p.radiusSolar,p.tempKelvin).toFixed(2)};})
  .sort((a,b)=>a.nu-b.nu);
const dup={}; rows.forEach(r=>(dup[r.nu]=dup[r.nu]||[]).push(r.n));
console.log('measured:', rows.filter(r=>r.src==='data').length+'/'+rows.length);
console.log('estimated:', rows.filter(r=>r.src!=='data').map(r=>r.n).join(', ')||'none');
console.log('all nu positive:', rows.every(r=>r.nu>0));
console.log('shared tones:', Object.values(dup).filter(v=>v.length>1).map(v=>v.join(' = ')).join(' | ')||'none');
rows.forEach(r=>console.log('  ', r.nu, r.src, 'R='+r.R, r.n));"
```

- **Every nu_max must be positive.** A zero means unusable physics reached the tone maths.
- **Stars sharing a nu_max** means they fell back to the spectral estimate and share a class.
  Report which; it is a data gap, not a code fault.
- **The order must run largest/coolest to smallest/hottest.** A red giant sitting among the
  dwarfs means a radius is wrong.
- Stars listed as `estimated` are acceptable when the source genuinely lacks mass or radius -
  the app labels them honestly - but name them so the gap is visible.

## 2. Build

```bash
cd orion && npm run build
```

Exit code 0. Two webpack size warnings are normal; anything else is a failure.

## 3. Runtime and geometry

Serve `orion/dist` and load `?c=<id>`, then check in the browser.

**Loads correctly** - constellation name, star count in the DOM, portal and gridBox values
all match the data file.

**Grid walls meet the portal frame.** Measure in **`#root`-local space**, never world space:
placement and recenter move `#root`, so world coordinates taken moments apart are not
comparable and will produce false failures.

```javascript
(() => {
  const T = window.THREE || AFRAME.THREE;
  const root = document.querySelector('#root').object3D;
  root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(root.matrixWorld).invert();
  const bb = el => { const b = new T.Box3(); el.object3D.updateMatrixWorld(true);
    el.object3D.traverse(o => { if (o.geometry) { o.geometry.computeBoundingBox();
      const g = o.geometry.boundingBox.clone();
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld)); b.union(g); } });
    return {x:[+b.min.x.toFixed(2),+b.max.x.toFixed(2)],
            y:[+b.min.y.toFixed(2),+b.max.y.toFixed(2)],
            z:[+b.min.z.toFixed(2),+b.max.z.toFixed(2)]}; };
  const p = document.querySelector('#portal').components['portal'];
  const fx = p.data.width / 4, fy = p.data.height / 4;   // drawn frame half-extents
  const w = {}; ['left','right','top','bottom'].forEach(id => {
    const e = document.querySelector('#' + id); if (e) w[id] = bb(e); });
  const near = (a, b) => Math.abs(a - b) < 0.02;
  return { frameHalf: [fx, fy], walls: w, checks: {
    leftRight_spanFrameHeight: near(w.left.y[0], -fy) && near(w.left.y[1], fy),
    topBottom_spanFrameWidth: near(w.top.x[0], -fx) && near(w.top.x[1], fx),
    cornersMeet: near(w.left.x[0], -fx) && near(w.top.y[1], fy),
    frontEdgeOnPortalPlane: near(w.left.z[1], 0.1),
    allSameDepthSpan: near(w.left.z[0], w.top.z[0]),
  }};
})();
```

**Hider walls seal the opening** - `finalLeftRightPosition` should equal
`7.5 + portal.width / 4` and `finalTopBottomPosition` should equal `7.5 + portal.height / 4`.

**Journey runs** - step each stop, confirm the panel text and that the right stars are
promoted to detailed models, and that the last stop reads "End the Journey".

**Console is clean.** Note that synthetic `emit('click')` calls produce
`intersectedEl` errors that real cursor clicks do not - ignore those, they are test artefacts.

## Reporting

A table of check names and pass/fail with the actual numbers. On failure, give expected vs
actual. If a geometry check fails, say whether the numbers look like a data problem or like a
hardcoded value in shared code - previous failures here came from another constellation's
dimensions frozen into `portal.js`, `gridwall.js` or `constellation-loader.js`.
