# Constellation data schema

The contract for `orion/src/data/constellations/<id>.json`. Applies to any constellation.

Canonical copies live in that folder, but the app does **not** fetch them at runtime — the same
object is embedded in `getEmbeddedConstellationData()` in `orion/src/js/constellation-loader.js`.
Generate the embedded copy from the file with a script; hand transcription drifts.

Top-level keys, in order:
`metadata`, `portal`, `display`, `gridBox`, `stars`, `connections`, `deepSkyObjects`, `journey`.

## metadata

```json
{"name": "Andromeda", "displayName": "Andromeda the Chained Princess",
 "description": "...", "mythology": "...",
 "season": "autumn", "hemisphere": "northern", "abbreviation": "And"}
```

`name` is what the HUD shows. `abbreviation` is the IAU three-letter code — also the key used to
look the figure up in the d3-celestial line data.

## portal

```json
{"width": 8, "height": 7, "borderColor": "#00ff00", "doorHeight": 7,
 "doorDuration": 4000, "lineDrawDuration": 1000, "lineDelay": 100,
 "position": {"x": 0, "y": 0, "z": 0.1}}
```

`width`/`height` are the nominal portal size and the units `position2D` is fitted to. **The
drawn frame is half that** — `portal.js` draws its border at `width/4` and `height/4`
half-extents, and the constellation container's 0.5 scale makes the two agree. Several bugs
came from missing that relationship, so anything deriving geometry from the portal must use
`width/4`, not a constant.

Use whole numbers so a `cellSize` of 0.5 divides evenly and no partial grid cell appears.

## display

```json
{"gridWidth": 8, "gridHeight": 7, "gridSize": 0.5, "gridColor": "#00ff00",
 "distanceScale": 0.0009, "zDepthScale": 0.7,
 "scale": {"x": 0.5, "y": 0.5, "z": 0.5},
 "position": {"x": 0, "y": 0, "z": -1.5}}
```

`gridWidth`/`gridHeight` mirror the portal. `scale` and `position` place the constellation
container relative to the portal — the grid walls use them to put the shaft's front edge on the
portal plane.

## gridBox

The shaft behind the opening.

```json
{"width": 8, "height": 7, "depth": 7, "cellSize": 0.5,
 "color": "#00ff00", "opacity": 0.6}
```

`width`/`height` mirror the portal; `depth` sets both how far the shaft recedes and the 3D star
spread (`depthExtent = depth * zDepthScale`). Left and right walls span `depth × height`; top
and bottom span `width × depth`.

## stars

```json
{"id": "mirach", "name": "Mirach", "designation": "β Andromedae",
 "isMajor": true, "position2D": {"x": -1.476, "y": -0.639},
 "distance": 199, "magnitude": 2.07, "spectralClass": "M0III",
 "color": "#ff7744", "size": 0.13, "stellarType": "red_giant",
 "info": {"basic": "...", "scientific": {"class": "...", "temperature": "..."}}}
```

- `id` — lowercase snake_case, referenced by `connections`.
- `name` — the display name; the DOM exposes it as `data-name` and the journey looks stars up
  by it. Must be unique.
- `position2D` — from `tools/project-constellation.js`, fitted to this constellation's portal.
- `distance` in light-years; drives the 3D depth spread.
- `color` from spectral class, `size` from magnitude — see `constellation-builder`.
- **No `esoteric` field.** It was removed after the original text proved fabricated; lore lives
  in `journey` with sources.

## connections

```json
{"from": "almach", "to": "mirach", "type": "body"}
```

Endpoints are star `id`s and must all resolve. `type` names the limb (`belt`, `sword`, `chain`,
`arm`, `wing`, `tail`...) — free-form, drawn from the figure itself.

## deepSkyObjects

```json
{"id": "m31", "name": "Andromeda Galaxy", "designation": "M31, NGC 224",
 "type": "spiral_galaxy", "position2D": {"x": -0.315, "y": 0.462},
 "distance": 2537000, "magnitude": 3.44, "size": 2.0, "description": "..."}
```

Projected in the **same run** as the stars so they share a centre and scale.

## journey

```json
{"id": "m31", "title": "The Little Cloud", "view": "2d", "detailScale": 2.5,
 "centerStarName": "Nu Andromedae", "targetStarNames": ["Mu Andromedae", "Nu Andromedae"],
 "story": "...", "sources": "al-Sufi, Book of Fixed Stars (c. 964); Wikipedia"}
```

- `centerStarName` / `targetStarNames` use star **`name`** values, not ids.
- `view` is `"2d"`; the journey forces the flat layout so every star is coplanar.
- `detailScale` shrinks enlarged star models when targets crowd (~1.2 tight, ~2.5 loose);
  omit otherwise.
- `sources` is required on every stop.

## Validation

```bash
cd orion/src/data/constellations && python -c "
import json,io
d=json.load(io.open('<id>.json',encoding='utf-8'))
ids={s['id'] for s in d['stars']}; names={s['name'] for s in d['stars']}
assert not [c for c in d['connections'] if c['from'] not in ids or c['to'] not in ids]
assert all(st['centerStarName'] in names for st in d.get('journey',[]))
assert all(n in names for st in d.get('journey',[]) for n in st['targetStarNames'])
assert all(st.get('sources') for st in d.get('journey',[]))
assert not any('esoteric' in s.get('info',{}) for s in d['stars'])
hw=d['portal']['width']/2; hh=d['portal']['height']/2
assert all(abs(s['position2D']['x'])<=hw and abs(s['position2D']['y'])<=hh for s in d['stars'])
print('OK', len(d['stars']),'stars', len(d['connections']),'connections', len(d.get('journey',[])),'stops')
"
```

Files are UTF-8; Greek designations (α, β, δ) are expected.
