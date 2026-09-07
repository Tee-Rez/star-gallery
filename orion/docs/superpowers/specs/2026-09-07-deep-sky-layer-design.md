# Deep-Sky Layer — Design Spec

**Date:** 2026-09-07
**Project:** Orion Observer / STAR Arts AR gallery (web build)
**Status:** Approved design, ready for implementation plan

## Summary

A second layer inside each constellation's portal. The deep-sky objects a figure contains — the
Orion Nebula, the Andromeda Galaxy — get a marker where they sit among the stars. Tapping one
takes you into it: the constellation fades, the object grows in its place and turns slowly, and
a single orb opens its story. A back control returns you, and so does finishing the object.

Star clusters are the exception. A cluster *is* a star figure, so it replaces the constellation
with its own stars and behaves exactly like one — same taps, same info panel, same Starsong
tones.

## Background

Three things make this cheaper than it looks.

**The data already exists and nothing renders it.** `deepSkyObjects` has been in the schema
since Andromeda was added — id, name, designation, type, distance, magnitude, angular size,
description and `position2D` for seven objects across two constellations. Grepping the source
finds no reference to `deepSky` anywhere outside the data files. This builds a view for a model
that has been sitting unused.

**Andromeda's journey already talks about an object it cannot show.** Its final stop, "The
Little Cloud", tells the story of al-Sufi recording M31 in 964 CE — and because M31 is not
rendered, the stop has to centre on Mu and Nu Andromedae and describe something invisible. That
stop is the clearest argument for the feature.

**The tracker was designed once already.** The Unity build has `DiscoveryStore.cs` (40 lines:
a per-constellation id set in `PlayerPrefs`, with `Load`/`Mark`/`Clear`) and a `StarHUD` with
three info lines. `portal-header.js` documents the gap in its own header comment: Unity's third
line *"needs discovery state the web build does not track."* This closes that.

### The seam

The reason a cluster can replace a constellation without making the 81 KB loader re-entrant:

| Lives in | Contents | Survives a figure swap |
|---|---|---|
| `#portal` — a **markup** element, not built by the loader | frame, door, header, hider walls | yes, untouched |
| `staticContainer` | grid walls | yes, untouched |
| `rotatingContainer` | star entities + connection lines | swapped |

Only `rotatingContainer` needs rebuilding. `createPortalHeader` already anticipates this, with
the comment *"Reuse a single header entity if createPortal runs again (e.g. switching
constellations)."*

## Decisions

Made during brainstorming; recorded so the reasoning survives.

| Decision | Rationale |
|---|---|
| Procedural rendering, not photographic | Zero new assets — the build was already trimmed 76→38 MB. Every object works without sourcing and licensing imagery, and the style matches the existing stars. |
| Scene stays inside the portal | The frame, grid walls and header are what sell the AR anchoring. Only the contents swap, so the way back is never in doubt. |
| Behaviour follows what the object *is* | A cluster genuinely is a star figure; a nebula genuinely is not. One mechanism for both would fit one of them badly. |
| Only the primary of a close group gets a marker | M42 and M43 sit 0.03 units apart in Orion's sword; M31, M32 and M110 within 0.2 in Andromeda. Overlapping markers are untappable. |
| Tracker is a visit counter, not an achievement system | It reports what a constellation contains and how much has been seen. No rewards, no ceremony, no completion state. |
| Cluster path designed now, though nothing exercises it | It is the existing constellation rendering pointed at different data, so the risk of specifying it early is low. |

## Goals

- Deep-sky objects are visible in the constellation and reachable in one tap.
- A nebula and a galaxy each read as themselves, not as two tints of one effect.
- A cluster is indistinguishable from a constellation once entered.
- Returning is always possible and always obvious.
- Stars and deep-sky objects visited are remembered between sessions and shown on the HUD.
- Adding an object to a future constellation is a data change, not a code change.

## Non-goals

- No completion, reward, unlock or ceremony system. Visits are counted, nothing is earned.
- No elliptical-galaxy renderer. M32 and M110 are out of scope, so nothing would use it.
- No nesting past depth 2 — a cluster's stars do not themselves contain deep-sky objects.
- No new lore journey stops. Andromeda's existing M31 stop is not rewritten here.
- No photographic imagery.

## Scope

**In:** M42 in Orion (nebula), M31 in Andromeda (spiral galaxy). The cluster path built
generically, with no instance until Taurus brings the Pleiades.

**Out:** M43, M32, M110 (companions of a marked primary); NGC 7662 and NGC 752 (deferred by
request). They stay in the data untouched — out of the layer, not deleted.

## Architecture

Four new modules, each with one job.

```
deep-sky-marker.js    the rotating dashed ring in the constellation; tap target
deep-sky-field.js     procedural particle field; generators chosen by kind
deep-sky-layer.js     the mode: enter, frame, exit, completion, the back control
discovery-store.js    localStorage visit record (port of DiscoveryStore.cs)
```

Plus edits to three existing files:

- `constellation-loader.js` — create markers alongside stars; a `swapFigure(data)` that rebuilds
  only `rotatingContainer`; include markers in `updatePositions` and `showSelectionState`.
- `portal-header.js` — a third info line, and line 2 becomes explored-of-total.
- `star-info-overlay.js` — accept a deep-sky object as a subject, not only a star name.

`deep-sky-layer` follows the mode pattern `lore-journey.js` already proves: `enterMode()`
strips `xrextras-one-finger-rotate`, hides the Recenter button, emits `starInfoClosed`, and
remembers the 2D/3D state; `exitMode()` puts all of it back. The two modes are mutually
exclusive — the Lore button is hidden inside the layer, and markers are unclickable during a
journey.

## Data model

`type` keeps its astronomical meaning (`emission_nebula`, `spiral_galaxy`, `open_cluster`, …).
A new **`layer`** field selects behaviour, defaulting by derivation from `type` so existing
entries need no editing:

| `type` contains | derived `layer` |
|---|---|
| `nebula` | `nebula` |
| `galaxy` | `galaxy` |
| `cluster` | `cluster` |

Objects absent from the layer carry `"layer": "none"` — that is how M43, M32, M110, NGC 7662
and NGC 752 stay in the data without producing markers.

### Nebula and galaxy

```json
{
  "id": "m42",
  "layer": "nebula",
  "field": {
    "count": 5000, "spread": 3.4, "sizeRatio": 0.13, "opacity": 0.24,
    "turbulence": 3.6, "contrast": 3.2, "cores": 4, "coreGain": 0.9,
    "dust": 0.8, "fill": 1.9, "embedded": 4, "spin": 0.05,
    "colors": ["#eaf2ff", "#ffe0c4", "#ff4d6a", "#8e1e46"]
  },
  "info": {
    "basic": "...", "scientific": "..."
  },
  "sources": "..."
}
```

`info` mirrors the star schema, so the existing info panel renders it unchanged. `colors` is an
ordered ramp, centre to edge — 2 to 8 stops.

### Cluster

```json
{
  "id": "m45",
  "layer": "cluster",
  "stars": [ /* exact constellation star schema, physics included */ ],
  "connections": [ /* exact constellation connection schema */ ]
}
```

Identical to a constellation's arrays, so `createStarEntity` and `createConnectionLine` consume
them with no changes and cluster stars get Starsong tones for free. The cluster does **not**
carry its own `portal` or `gridBox`: it borrows the parent's, which keeps the AR anchoring
fixed and the frame from jumping.

### Positioning

Markers are positioned exactly as stars are, from `position2D` in 2D mode and from `distance`
in 3D mode, so they participate in `updatePositions` and move with the view toggle.

**In 3D mode a deep-sky object's depth is clamped to the constellation's own box, and the box
is never extended to reach it.** The bounds are the existing `gridBox.depth * zDepthScale`
extent that the stars already use. An object further away than any star parks at the far face
of that box and stops there; M31 at 2.54 Mly and M42 at 1344 ly both simply sit at the back.

This is deliberately expressive rather than truthful. Honest scaling would let M31 alone — three
orders of magnitude beyond Andromeda's 44–700 ly stars — set the depth scale and flatten the
whole figure to a plane. Clamping keeps the constellation readable and keeps every object inside
the portal's shaft, which is also what stops a marker drifting behind the grid walls.

## Rendering

`deep-sky-field` builds one `THREE.Points` from a generator chosen by `layer`. Two generators
ship. Both are pure functions of `(count, params, stops)` returning typed arrays, so they are
testable without a DOM.

**Sprite.** A soft radial gradient drawn once on a `<canvas>` at runtime. No image asset, so
this adds nothing to the bundle.

**Nebula** — rejection sampling against a turbulent density field:

```
density = envelope(ellipsoid)          fades out at the edge
        × (1 + coreGain · Σ cores)     seeds the gas gathers around
        × fBm(4 octaves) ^ contrast    filaments and voids
        × (1 − dust · ridged³)         absorbing dust, stringy not blobby
```

Clumping is emergent — no clump is placed by hand. `contrast` is the exponent on the noise and
is the dial that matters: raising it drives thin regions toward empty and leaves dense knots
standing. Brightness and colour both follow the same density, so dense gas reads hot and
ionised while the outskirts fall to deep H-alpha red. Embedded stars are seated **on** the
cores, which is where young stars actually form.

**Spiral** — logarithmic arms plus a dense bulge:

```
r = 0.12R + f·0.88R,  θ = arm·2π/arms + ln(r/0.12R + 1)·wind
```

with perpendicular scatter growing outward, a thin disc flaring with radius, and a separate
warm bulge of `bulge`·count points.

### The two treatments are opposites

Established in the prototype, and the single most useful thing it produced:

| | Nebula | Spiral |
|---|---|---|
| Points *(prototype; see Performance for shipping counts)* | 9,000 | 16,000 |
| Sprite size | 0.13 × spread — **large** | 0.020 × spread — **small** |
| Opacity | 0.24 — **faint** | 0.85 — **crisp** |
| Reads as | gas accumulating into cloud | resolved individual stars |

Gas looks like gas only when big faint sprites pile up; a galaxy is genuinely made of stars, so
the same treatment turns it into a smear. Sprite size is a **ratio of spread**, not an absolute,
so density holds at any object scale.

### Performance

Desktop prototype: 60 fps at both counts, 115 ms one-time build for the nebula including noise.
That build cost is paid on entering an object, never per frame.

The phone also runs the camera feed, SLAM tracking, portal geometry and grid walls, so shipped
counts are **5,000 nebula / 8,000 galaxy**, in data so they can be tuned per object without
touching code. Measure on device before trusting these.

## Behaviour

### The marker

A dashed ring — `THREE.LineLoop` with `LineDashedMaterial`, `computeLineDistances()` called —
rotating slowly on its own axis. Radius scales from the object's angular `size`, floored so a
small object stays tappable. It is **not** part of the connection graph, which is automatic:
connections are built from the `connections` array and reference star ids only.

Tapping needs the existing convention, so the marker carries a `.cantap` collision sphere like
stars do, and joins `showSelectionState`'s distance-based resizing so it stays tappable at
range. Once visited, the ring dims.

### Entering a nebula or galaxy

1. `enterMode()` — rotation off, Recenter hidden, info panel closed, 2D/3D state remembered.
2. Stars, connection lines and other markers fade opacity to 0 over ~600 ms. They stay in the
   DOM; nothing is destroyed.
3. `#root` transforms so the marker's position swings in front of the camera and scales up —
   the same framing maths `lore-journey.frameStar()` already uses.
4. The field builds and scales in from zero. It turns at `spin` while parked.
5. The portal header retitles to the object's name.
6. A single orb sits at the centre. Tapping it opens the info panel with the object's `info`
   and `sources`, and marks it visited.

### Entering a cluster

1. `enterMode()` as above.
2. `swapFigure(cluster)` — clear only `rotatingContainer`, rebuild stars and connections from
   the cluster's arrays, re-run `setupInteractions()`.
3. Header retitles; star count becomes the cluster's.
4. Everything else already works: taps, info panel, Starsong, 2D/3D toggle, rotation.

### Leaving

Both routes restore identically, via `exitMode()`:

- **Manual** — a back control in the portal's button column, styled like the existing 3D View
  and Lore buttons.
- **On completion** — nebula or galaxy: the orb has been opened. Cluster: every star visited.
  A ~900 ms beat, then an automatic return.

`deep-sky-layer` owns a stack rather than a single "previous" field. Depth is 2 today; a stack
costs nothing now and avoids a rewrite if that ever changes.

## Discovery tracker

`discovery-store.js`, a direct port of `DiscoveryStore.cs`, using `localStorage` — already used
in this project for `starsong.volume`.

```
key    discovered:<constellationId>
value  comma-separated ids, stars and deep-sky objects together
```

API: `load(c)`, `isVisited(c, id)`, `mark(c, id)`, `clear(c)`. Marking is idempotent and writes
only on change. A quota or privacy-mode failure is caught and degrades to in-memory for the
session — the layer must work with no persistence at all.

Stars mark on selection; deep-sky objects mark when their orb is opened, or when a cluster's
stars are all visited.

The portal header gains Unity's third line, and line 2 changes from a total to a ratio:

```
Constellation Name: Orion
# of Stars Explored: 7 / 15
Deep Sky Explored: 1 / 1
```

The third line is omitted entirely when a constellation has no layer objects, rather than
showing `0 / 0`.

## Error handling

| Situation | Behaviour |
|---|---|
| `layer` missing | Derive from `type`; unrecognised means `none`. |
| Object has no `field` block | Generator defaults; log once, still renders. |
| Cluster with no `stars` | Refuse to enter, log, leave the constellation untouched. |
| `localStorage` unavailable | In-memory for the session; nothing else changes. |
| WebGL context lost while inside | Exit the layer and restore the constellation. |
| Lore journey running | Markers unclickable; layer entry refused. |

## Verification

- **Unit** — generators are pure, so point count, finite coordinates, colours within the ramp,
  and density response to `contrast` are all testable in plain node, like `star-tone.js` is.
- **Data** — every `layer` object resolves to a known generator; cluster stars satisfy the star
  schema; marker positions fall inside the portal bounds.
- **Geometry** — after entering and leaving a cluster, portal, grid walls and header measure
  identical to before, in **`#root`-local space** (world space is invalid: `#root` moves).
- **Behaviour** — enter and leave by both routes; confirm rotation, Recenter and 2D/3D state
  are restored; confirm a visit survives a reload.
- **Device** — frame rate on a real phone with the camera running, which the desktop number
  does not predict.

## Risks

**Particle load on a phone.** The desktop figure is not evidence. Counts live in data so they
can be cut without a code change; if it is still too heavy, the fallback is fewer, larger, more
transparent points, which costs less fill rate than it sounds.

**The cluster path ships unexercised.** Nothing in either constellation uses it, so it is
correct-by-construction only. Accepted deliberately: it is the existing rendering pointed at
different data. Taurus is the real test.

**Depth is expressive, not truthful.** A clamped object sits at the back of the box regardless
of whether it is 1,300 or 2,540,000 light-years away, so depth carries no distance information
for deep-sky objects and two objects at wildly different distances can look equally far. This is
the accepted trade for a readable figure; the object's `info.scientific` should state the real
distance so the number is never lost, only the geometry.

**Header crowding.** A third line has to fit Unity's 4000×800 canvas band without colliding
with the button column. Measure against the existing two lines before assuming it fits.
