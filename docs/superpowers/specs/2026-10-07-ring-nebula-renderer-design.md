# Ring Nebula renderer — design

**Date:** 2026-10-07
**Status:** approved in brainstorming; awaiting spec review
**Goal:** M57, the Ring Nebula, becomes an explorable deep-sky object in Lyra, drawn as a true 3D
planetary nebula that matches its JWST and Hubble depictions — and `planetary_nebula` becomes a
supported deep-sky type for every future constellation.

## 1. Why

Lyra shipped with M57 as `layer: "none"`, which the loader does not draw at all
(`createDeepSkyMarkers` skips it), so the viewer cannot see it. The nebula engine,
`star-gallery/nebula-shared/nebula-core.js`, already has most of what a planetary nebula needs:

| The object | The engine today |
|---|---|
| A thick shell with a glowing interior | `hollow`, `shellR`, `shellK` put the density maximum on a wall |
| Blue interior → teal → green → cream → orange → red rim | the ionisation ramp around the knot: `ionAmt`, `knotQ`, `ion0`, `ion1`, `ionDens`, and the `baseHue` / `midHue` / `coreHue` / `hotGain` stops |
| Radial spokes and dark knots in the ring | `striate`, `striaGain`, `dust` |
| The central white dwarf | the knot sprite: `sunSize`, `sunBright`, `sunHue`, `sunHalo` |
| A prolate shell seen ~30° off its axis | `stretch`, `flatten`, `tilt`, `roll` |
| **Dense at the equator, open at the poles** — why it reads as a ring | **missing**: `bipolar` brightens the poles, the opposite |
| **A faint outer halo with radial streaks** (JWST) | **missing**: with `hollow`, density outside the wall dies within a few wall-widths |

## 2. Decisions

- **True 3D shape** (user's choice): from the front the portal shows the ring as photographed;
  rotating it reveals the barrel. Not a camera-facing billboard.
- **Approach 1** (user's choice): a preset on the existing `particles` mode, plus two engine
  parameters. Rejected: preset-only (a sphere, no halo), and a dedicated planetary-nebula mode
  (much new shader code beside the existing nebula path for little gain).
- **Rollout (a)** (user's choice): app-preview and a QR first; live only after the user has seen it
  on a device.
- **M56 stays `layer: "none"`.** A globular-cluster renderer is a separate design.

## 3. Engine additions — `star-gallery/nebula-shared/nebula-core.js`

Both are added to the GLSL `envAt()` and to its JavaScript twin `shapeMulJS()`, which places the
particles inside the same shape. Each is gated on `> 0`, so at the default `0` no new code runs
and every existing preset renders exactly as before.

### 3.1 `waist` and `waistSharp`

The equatorial belt. Uses the existing outflow axis (`lobeAz` / `lobeEl`, through the knot), so
the belt and any lobes share one axis.

```
ax  = dot(normalize(p - knot), axis)              // cosine to the axis, as bipolar computes it
belt = pow(1 - ax*ax, 1 + waistSharp * 6)         // 1 on the equator, 0 at the poles
d   *= mix(1, belt, waist)
```

`waist` 0..1 (0 = off). `waistSharp` 0..1 narrows the belt (0 → `1-ax²`, 1 → `(1-ax²)^7`).

### 3.2 `halo` and `haloR`

Faint gas outside the cavity wall. Applied inside the existing `uHollow` branch, after the wall
term:

```
r    = sqrt(e)                                     // normalised envelope radius, 0..1
out  = smoothstep(shellR, shellR + 1/shellK, r)    // 0 inside the wall, 1 past it
fade = 1 - smoothstep(shellR, haloR, r)            // fades to 0 at haloR
d   += halo * out * fade * (1 - e)
```

`halo` 0..0.5 (0 = off); `haloR` 0.5..1 (default 0.95), the outer edge as a fraction of the
envelope. The halo picks up the existing `striate` term like the rest of the gas, so it breaks
into radial spokes. Because it sits far from the knot, the ionisation ramp already colours it at
the red end — no colour code is added.

### 3.3 Wiring

New keys in `DEFAULTS` (`waist: 0, waistSharp: 0.5, halo: 0, haloR: 0.95`), in `CAVITY` (the
lab's shell controls), in the slider ranges, in the uniform map, and in `SHAPEJS` so a slider
change re-places the particles.

### 3.4 Safety for Orion and Andromeda

The shipped M42 and M31 presets contain none of the new keys, so `Object.assign(core.params(),
preset)` gives them the defaults, and the gated code never runs. This is **proved, not assumed**:
M42 and M31 are rendered in the nebula lab at a fixed size, seed and camera, with the old engine
file and the new one, and the two readbacks must be pixel-identical. Any difference stops the
work.

## 4. The M57 look

Tuned in the nebula lab against two references (Wikimedia Commons): JWST NIRCam, 2023
(weic2320b, CC BY 4.0) and Hubble, 1998 (public domain). Front view, from the centre out:

1. **White dwarf** — a small blue-white point with a faint halo; present, never dominant.
2. **Interior** — low but non-zero density (`hollow` below 1); deep blue at the centre to teal
   toward the ring.
3. **Ring** — oval, about 1.3:1, tilted as photographed. Pale green inner edge → cream-yellow band
   (brightest, near white) → orange → deep red rim. Clumpy, radially streaked, with dark knots.
4. **Halo** — faint red-violet to about twice the ring radius, in radial streaks.
5. **Field stars** — a sparse sprinkle.

**Geometry:** the barrel's axis points about 30° from the viewer — the published geometry, a
prolate shell with an equatorial concentration seen ~30° off its axis. The wall sits near 0.5 of
the envelope radius so the halo has room inside the march bounds.

**Performance:** march steps and particle count near M42's (24 steps, ~1,200 particles); the lab's
8-second benchmark for M57 should land close to M42's.

**Sign-off:** a lab screenshot beside both references, approved by the user before integration.

## 5. Data and app

1. **`tools/deep-sky-presets.json`** — `planetary_nebula` moves to `supported`: `layer: "nebula"`,
   `seededFrom: "M57 (Lyra)"`, a `field` block (the points fallback, M42's values recoloured) and
   the tuned `render` block. `tools/test/deep-sky-presets.test.mjs` checks M57 is seeded from Lyra's
   shipped object, as it does for M42 and M31.
2. **`tools/input/lyra-research.json`** — M57 gains `info.basic`, `info.scientific` (a string, as
   M42's is: the expanding shell and white dwarf, why it reads as a ring, the true distance of
   about 2,570 light-years, and that depth here is expressive, not measured) and `sources`
   (SEDS Messier catalogue; Wikipedia, Ring Nebula). Every claim is already in the vault's
   `objects/Ring Nebula.md`, so the vault is not changed. Its `description` drops the
   "not in the explorable layer" sentence.
3. **Journey** — the last stop keeps its sourced story and gains one closing line:
   "Tap its marker to step inside."
4. **Re-draft and `--promote`** — M57 drafts as `layer: "nebula"` with no renderer gap; the
   loader is re-synced through `sync-loader-data.mjs`, never by hand.
5. **In the app** — a marker between Sheliak and Sulafat; the HUD's Deep Sky Explored reads 0/1;
   tapping enters the nebula. No app code changes: the nebula layer, its panel, visited state and
   back path already exist.
6. **Docs** — the pipeline doc and presets note stop listing planetary nebulae as a renderer gap.

## 6. Verification

1. **Node tests** — `shapeMulJS` is already exported on `NebulaCore`, and the engine loads in node
   with `window` set to a permissive `THREE` stub (only `Vector3` is real; checked 2026-10-07). With
   `waist` and `halo` at 0 it returns exactly what the current function returns over a grid of
   points (the grid's values are recorded from the current file before it is edited); above 0,
   the equator is denser than the poles and density is non-zero just outside the wall. These test
   the JavaScript twin only - the GLSL is held to it by §3.4's pixel identity and §4's look. The
   presets test above. The full suite stays green.
2. **Pixel identity** — §3.4.
3. **Look** — §4 sign-off.
4. **Speed** — §4 benchmark.
5. **App, headless** (`gallery-node` preview, `?c=lyra`): the M57 marker exists; entering grows the
   nebula at the centre of the grid; the panel shows M57's text with no Starsong tab; Deep Sky
   Explored increments and the marker dims; back restores the figure; Orion's M42 and Andromeda's
   M31 still enter and render; the console is clean.

## 7. Rollout

1. Commit the engine and `app-preview/bundle.js` in `star-gallery/`; push (with the gh credential
   helper — see the project memory on push failures).
   - The engine file is shared by live and preview, so it reaches live at once. That is safe only
     because §3.4 has proved the existing objects unchanged — which is why §3.4 runs first.
2. A QR for `app-preview/?c=lyra`, decoded and checked, sent to the user.
3. **Live waits for the user's device check.** Then `app/bundle.js` takes the preview bundle.
4. Source pushed to `source/main` by explicit refspec.

## 8. Out of scope

- M56's globular-cluster renderer.
- Any change to M42's or M31's look.
- A camera-facing billboard mode.
