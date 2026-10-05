# Constellation Authoring Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic draft pipeline from the spec, then take Lyra through it end to end — researched, written back to the Brain, promoted, built, and deployed to app-preview with a QR code.

**Architecture:** A pure rules library and a preset registry feed `tools/draft-constellation.mjs`, which assembles a draft from the Brain import, the physics harvest, and one researched-input file per constellation. Lore is read from the vault through a filter that drops synthesis and Starseed. Promotion copies the draft into shipped data and inserts it into the embedded loader copy byte-safely.

**Tech Stack:** Node 24 (`node:test`, `node:assert`), ES modules (`.mjs`), webpack 5, A-Frame 1.3 / 8th Wall, an Obsidian vault with its own linter.

**Spec:** `docs/superpowers/specs/2026-10-05-constellation-authoring-pipeline-design.md`

## Global Constraints

- Every rule in `tools/lib/constellation-rules.mjs` is tested against the three shipped constellations.
- Shipped constellations (Orion, Andromeda, Taurus) are **never modified** by this work — not their ids, colours, sizes or any value.
- Physics is never inferred from a spectral class. A value whose harvest source reads `derived from spectral` or `typical for spectral` is an estimate and is treated as **absent**.
- Lore reaching the app comes only from the Brain's sourced tier, historical cultures — never a `[!warning] Synthesis — AI-generated` callout, never a Starseed section.
- Research the Brain should own is written into the vault **first**, linted with `node _meta/lint/lint.mjs`, then re-imported.
- `constellation-loader.js` is edited only by byte-precise splicing; run `git diff --stat` before committing it.
- JSON written by tools is LF, no BOM, `ensure_ascii`-free (Greek letters unescaped), 2-space indent.
- Shipped JSON values are typed: `portal.width` integer, `size` float, `distance` integer, `hip` integer, `isMajor` boolean.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The gallery catalogue is **live-visible**; a constellation is added to it only when promoted to live.

## File Structure

| File | Responsibility |
|---|---|
| `orion/src/js/star-color.mjs` | **new** — the blackbody ramp, the one copy shared by the app and the tools |
| `orion/src/js/star-visual.js` | **modify** — import the ramp instead of defining it |
| `tools/lib/constellation-rules.mjs` | **new** — every computed rule from spec §4.3–§4.4, pure |
| `tools/lib/brain-lore.mjs` | **new** — reads a vault note's lore with synthesis and Starseed removed |
| `tools/deep-sky-presets.json` | **new** — type → layer and seed `field`/`render` |
| `tools/draft-constellation.mjs` | **new** — draft, review sheet, `--promote` |
| `tools/sync-loader-data.mjs` | **modify** — `--add` inserts a new constellation block |
| `tools/import-brain.mjs` | **modify** — vault path; carry `pronunciation` |
| `tools/test/*.test.mjs` | **new** — `node --test tools/test/` |
| `tools/input/lyra-research.json` | **new** — Lyra's researched content |
| `docs/constellation-pipeline.md`, `docs/constellation-data-schema.md` | **modify** |
| `.claude/agents/constellation-orchestrator.md`, `lore-researcher.md`, `constellation-verifier.md` | **modify** |
| Vault: `_templates/star.md`, `CLAUDE.md`, `.claude/agents/object-harvester.md`, `stars/`, `objects/`, `sources/` | **modify / new** |
| Vault: `_meta/scripts/gen-web-data.mjs` | **delete** |

### The researched-input file

Planning found a hole in the spec: a regenerated draft would overwrite any prose written into it. So
everything researched for the app lives in `tools/input/<id>-research.json` and the generator
merges it in. The draft is then fully reproducible from its inputs.

```json
{
  "metadata": { "displayName": "", "description": "", "mythology": "" },
  "stars": {
    "<starId>": {
      "info": { "basic": "", "scientific": { "feature": "" } },
      "physics": { "massSolar": 0, "radiusSolar": 0, "tempKelvin": 0, "note": "" }
    }
  },
  "journey": [ { "id": "", "title": "", "centerStarName": "", "targetStarNames": [], "story": "", "sources": "" } ],
  "deepSky": [ { "id": "", "name": "", "designation": "", "type": "", "raH": 0, "dec": 0,
                 "distance": 0, "magnitude": 0, "size": 0, "description": "",
                 "info": { "basic": "", "scientific": {} }, "sources": "" } ]
}
```

`stars.<id>.physics` is an override, used only for values researched from the star's own article.

---

### Task 1: Correct the spec with what planning found

**Files:** Modify `docs/superpowers/specs/2026-10-05-constellation-authoring-pipeline-design.md`

- [ ] **Step 1:** §3 — replace "measured mass, radius and temperature for 657 of 691" with the real figure: about 401 of 691 genuinely measured; the rest carry spectral-type estimates recorded in each entry's `sources`.
- [ ] **Step 2:** §4.1 — move `season` and `hemisphere` from Imported to Computed: Lyra's vault note carries neither. Add to §4.3: `season` from the figure's centroid RA (autumn 20h–4h, winter 4h–8h, spring 8h–14h, summer 14h–20h); `hemisphere` from centroid declination (`northern` ≥ +10°, `southern` ≤ −10°, otherwise `both`). Both fit all three shipped constellations.
- [ ] **Step 3:** §4.2 / §5.2 — physics is taken from the harvest only where every one of mass, radius and temperature is measured; an estimate makes the whole block absent. Unnamed stars' designations are recovered from the harvest's `xhipName`.
- [ ] **Step 4:** §5 — add the researched-input file above; §5.4 — `--promote` does **not** touch the catalogue, which is live-visible; the entry is added at promotion to live.
- [ ] **Step 5:** §5.4 — `sync-loader-data.mjs` cannot add a constellation; promotion uses its new `--add`.
- [ ] **Step 6:** Commit: `docs: correct the authoring spec with what planning found`.

### Task 2: Repairs

**Files:** Modify `tools/import-brain.mjs`; delete vault `_meta/scripts/gen-web-data.mjs`

- [ ] **Step 1:** In `tools/import-brain.mjs`, change the default `VAULT` to `'C:/Users/TearS/STAR-Arts/Consetellations/Constellation Brain'`.
- [ ] **Step 2:** Run `node tools/import-brain.mjs`; expect it to complete and `tools/brain/manifest.json` to report 88 constellations.
- [ ] **Step 3:** In the vault, `git rm _meta/scripts/gen-web-data.mjs`; remove any mention of it from the vault's docs (`grep -rn gen-web-data`). Commit in the vault: `retire gen-web-data: it wrote into the app's shipped data, bypassing its embedded copy`.
- [ ] **Step 4:** Commit the app repo: `fix(import-brain): point at the vault's current location`.

### Task 3: One blackbody ramp, shared

**Files:** Create `orion/src/js/star-color.mjs`, `tools/test/star-color.test.mjs`; modify `orion/src/js/star-visual.js`

**Interfaces — Produces:** `BB`, `CLASS_K`, `bbColor(t) → [r,g,b]`, `tempToRamp(kelvin) → t|-1`, `rampForStar({tempKelvin, spectralClass}) → t|-1`, `rgbToHex([r,g,b]) → '#rrggbb'`

- [ ] **Step 1: Write the failing test** — `tools/test/star-color.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {bbColor, tempToRamp, rampForStar, rgbToHex, BB} from '../../orion/src/js/star-color.mjs'

test('ends of the ramp are its first and last stops', () => {
  assert.deepEqual(bbColor(0), BB[0])
  assert.deepEqual(bbColor(1), BB[BB.length - 1])
})
test('ramp is log-T between 2500K and 30000K', () => {
  assert.equal(tempToRamp(2500), 0)
  assert.equal(tempToRamp(30000), 1)
  assert.equal(tempToRamp(0), -1)
})
test('spectral class is the fallback when no temperature', () => {
  assert.equal(rampForStar({spectralClass: 'B7III'}), tempToRamp(15000))
  assert.equal(rampForStar({tempKelvin: 9330, spectralClass: 'B'}), tempToRamp(9330))
})
test('hex is lower-case and six digits', () => {
  assert.equal(rgbToHex([1, 0.5, 0]), '#ff8000')
})
```

- [ ] **Step 2:** Run `node --test tools/test/star-color.test.mjs` — expect FAIL, module not found.
- [ ] **Step 3: Implement** `orion/src/js/star-color.mjs` by **moving** (not copying) `BB`, `bbColor`, `tempToRamp`, `CLASS_K` from `star-visual.js`, adding `rampForStar` (temperature first, then the spectral letter through `CLASS_K`) and `rgbToHex`.
- [ ] **Step 4:** In `star-visual.js`, delete the moved definitions and add `import {BB, bbColor, tempToRamp, CLASS_K, rampForStar} from './star-color.mjs'`. `starColor()` keeps its own hex fallback for `data.color`, since that path uses `THREE.Color`.
- [ ] **Step 5:** Run the test — expect PASS. Run `cd orion && npm run build` — expect `compiled` with no ERROR.
- [ ] **Step 6:** Commit: `refactor: share the blackbody ramp between star-visual and the tools`.

### Task 4: The rules library

**Files:** Create `tools/lib/constellation-rules.mjs`, `tools/test/constellation-rules.test.mjs`

**Interfaces — Produces:**
`starId(designation, hip) → string` · `isMajor(mag) → bool` · `starSize(mag) → number` ·
`stellarType(spectralClass) → string` · `portalDerived(w, h) → {portal, display, gridBox}` ·
`season(raH) → string` · `hemisphere(dec) → string` · `centroid(stars) → {raH, dec}` ·
`measuredPhysics(rec) → {massSolar, radiusSolar, tempKelvin, note} | null` ·
`scientificLines(physics, spectralClass) → {class, temperature, mass, radius}` ·
`designationFromXhip(xhipName) → string | null` · `bayerName(designation) → string`

- [ ] **Step 1: Write the failing tests** — `tools/test/constellation-rules.test.mjs`. The shipped-data tests are the point: each rule must reproduce the three shipped constellations.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as R from '../lib/constellation-rules.mjs'

const load = id => JSON.parse(fs.readFileSync(`orion/src/data/constellations/${id}.json`, 'utf8'))
const SHIPPED = ['orion', 'andromeda', 'taurus'].map(load)

test('portal, grid and box derive from the portal for every shipped constellation', () => {
  for (const c of SHIPPED) {
    const d = R.portalDerived(c.portal.width, c.portal.height)
    assert.deepEqual(d.portal, c.portal)
    assert.deepEqual(d.display, c.display)
    assert.deepEqual(d.gridBox, c.gridBox)
  }
})
test('isMajor is magnitude < 4.0, Merope the one documented exception', () => {
  const misses = []
  for (const c of SHIPPED) {
    const all = [...c.stars, ...(c.deepSkyObjects || []).flatMap(o => o.stars || [])]
    for (const s of all) if (R.isMajor(s.magnitude) !== s.isMajor) misses.push(s.name)
  }
  assert.deepEqual(misses, ['Merope'])
})
test('season and hemisphere fit every shipped constellation', () => {
  // Shipped files carry no RA/Dec, so the stage-1 inputs supply the coordinates.
  const inputs = {orion: 'winter/both', andromeda: 'autumn/northern', taurus: 'winter/northern'}
  for (const [id, want] of Object.entries(inputs)) {
    const st = JSON.parse(fs.readFileSync(`tools/input/${id}-stars.json`, 'utf8').replace(/^\uFEFF/, '')).stars
    const ctr = R.centroid(st)
    assert.equal(`${R.season(ctr.raH)}/${R.hemisphere(ctr.dec)}`, want, id)
  }
})
test('star ids come from the designation', () => {
  assert.equal(R.starId('θ² Tauri', 1), 'theta2_tauri')
  assert.equal(R.starId('64 Orionis', 1), '64_orionis')
  assert.equal(R.starId('η Tauri (25 Tau)', 1), 'eta_tauri')
  assert.equal(R.starId(null, 91971), 'hip_91971')
})
test('size curve is the least-squares fit, clamped', () => {
  assert.equal(R.starSize(0), 0.154)
  assert.equal(R.starSize(-2), 0.17)
  assert.equal(R.starSize(9), 0.05)
})
test('physics with any spectral-type estimate is absent', () => {
  const measured = {massSolar: 2.51, radiusSolar: 2.69, tempKelvin: 9330,
    sources: {mass: 'Allende Prieto & Lambert 1999', radius: 'Allende Prieto & Lambert 1999',
      temp: 'Allende Prieto & Lambert 1999'}}
  assert.ok(R.measuredPhysics(measured))
  const est = {...measured, sources: {...measured.sources, mass: 'typical for spectral type A8V'}}
  assert.equal(R.measuredPhysics(est), null)
  const sb = {...measured, sources: {...measured.sources, temp: 'derived from spectral type A1III',
    radius: 'Stefan-Boltzmann from XHIP luminosity and Teff'}}
  assert.equal(R.measuredPhysics(sb), null)
})
test('designations recover from the harvest name', () => {
  assert.equal(R.designationFromXhip('6 Zeta-1 Lyrae (HR 7056)'), 'ζ¹ Lyrae')
  assert.equal(R.designationFromXhip('12 Delta-2 Lyrae (HR 7139)'), 'δ² Lyrae')
  assert.equal(R.designationFromXhip('3 Alpha Lyrae (Vega)'), 'α Lyrae')
  assert.equal(R.bayerName('ζ¹ Lyrae'), 'Zeta1 Lyrae')
})
test('stellar type reads letter and luminosity class', () => {
  assert.equal(R.stellarType('A1V'), 'white_main_sequence')
  assert.equal(R.stellarType('M4II'), 'red_bright_giant')
  assert.equal(R.stellarType('B7IIIe'), 'blue_white_giant')
  assert.equal(R.stellarType('O9.5Ib'), 'blue_supergiant')
})
test('scientific lines are drafted in one format', () => {
  const l = R.scientificLines({massSolar: 2.51, radiusSolar: 2.69, tempKelvin: 9330}, 'A1V')
  assert.equal(l.temperature, 'About 9,330 K')
  assert.equal(l.mass, "About 2.5 times the Sun's mass")
  assert.equal(l.radius, "About 2.7 times the Sun's radius")
  assert.equal(l.class, 'A1V white main-sequence star')
})
```

- [ ] **Step 2:** `node --test tools/test/constellation-rules.test.mjs` — expect FAIL, module not found.
- [ ] **Step 3: Implement** `tools/lib/constellation-rules.mjs` with exactly these rules:
  - Greek spelled out (`α`→`alpha` …), superscripts `¹²³⁴⁵⁶`→digits, parenthetical dropped, lower-case, runs of non-alphanumerics → `_`, trimmed. No designation → `hip_<hip>`.
  - `starSize = round3(clamp(0.1538 − 0.0205·mag, 0.05, 0.17))`.
  - `portalDerived(w, h)`: `portal = {width:w, height:h, borderColor:'#00ff00', doorHeight:min(h,7), doorDuration:4000, lineDrawDuration:1000, lineDelay:100, position:{x:0,y:0,z:0.1}}`; `display = {gridWidth:w, gridHeight:h, gridSize:0.5, gridColor:'#00ff00', distanceScale:0.0009, zDepthScale:0.7, scale:{x:0.5,y:0.5,z:0.5}, position:{x:0,y:0,z:-1.5}}`; `gridBox = {width:w, height:h, depth:min(w,h), cellSize:0.5, color:'#00ff00', opacity:0.6, wallZ:-1.6}`. **Copy each shared value from the shipped files and keep key order identical** so `deepEqual` holds; adjust if a shipped value differs.
  - `season`: autumn [20,24)∪[0,4), winter [4,8), spring [8,14), summer [14,20). `hemisphere`: northern ≥ 10, southern ≤ −10, else both.
  - `centroid`: circular mean of `raH` (hours→radians), arithmetic mean of `dec`.
  - `measuredPhysics`: estimate if a source contains `derived from spectral` or `typical for spectral`; a `Stefan-Boltzmann` radius counts only when temperature is measured; any estimate → `null`. Otherwise round mass/radius to 2 dp, temperature to integer, `note` = the distinct source names joined with `; `.
  - `stellarType`: first of `OBAFGKM` → blue, blue_white, white, yellow_white, yellow, orange, red; luminosity `Ia|Iab|Ib|I` supergiant, `II` bright_giant, `III` giant, `IV` subgiant, `V` main_sequence (default `V`).
  - `scientificLines`: temperature `About <n rounded to 10, thousands comma> K`; mass/radius `About <n> times the Sun's mass|radius` with 1 dp under 10, integer otherwise; class `<spectralClass> <colour words> <type words>` — `main-sequence star`, `giant`, `bright giant`, `subgiant`, `supergiant`; colour words hyphenated.
  - `designationFromXhip`: drop the leading Flamsteed number and any parenthetical; `<Greek>-<n> <Genitive>` → Greek letter plus superscript digit. `bayerName`: Greek letter → capitalised Latin name, superscript → digit.
- [ ] **Step 4:** Run the tests — expect PASS. If a shipped-data test fails, fix the **rule**, never the shipped file.
- [ ] **Step 5:** Commit: `feat(tools): the constellation rules, checked against the shipped three`.

### Task 5: The deep-sky preset registry

**Files:** Create `tools/deep-sky-presets.json`, `tools/test/deep-sky-presets.test.mjs`; add `presetFor(type, hasNamedMembers)` to `tools/lib/constellation-rules.mjs`

- [ ] **Step 1: Write the failing test:**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {presetFor} from '../lib/constellation-rules.mjs'

const ship = id => JSON.parse(fs.readFileSync(`orion/src/data/constellations/${id}.json`, 'utf8'))
test('supported presets are seeded from the shipped objects', () => {
  const m42 = ship('orion').deepSkyObjects.find(o => o.id === 'm42')
  const p = presetFor('emission_nebula', false)
  assert.equal(p.layer, 'nebula')
  assert.deepEqual(p.field, m42.field)
  assert.deepEqual(p.render, m42.render)
  assert.equal(presetFor('spiral_galaxy', false).layer, 'galaxy')
  assert.equal(presetFor('open_cluster', true).layer, 'cluster')
})
test('a type with no renderer is a marker with a reason', () => {
  for (const t of ['planetary_nebula', 'globular_cluster', 'supernova_remnant']) {
    const p = presetFor(t, false)
    assert.equal(p.layer, 'none')
    assert.ok(p.rendererGap && p.rendererGap.startingPoint, t)
  }
  assert.equal(presetFor('open_cluster', false).layer, 'none')
})
```

- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3: Implement.** Build `tools/deep-sky-presets.json` with a small script that copies `field`/`render` from shipped M42 and M31; supported entries `emission_nebula`, `spiral_galaxy`, `open_cluster` (named members, layer `cluster`, no field); `needs-renderer` entries with `startingPoint` text for elliptical/dwarf galaxy, reflection nebula, planetary nebula, supernova remnant, globular cluster, open cluster without named members — wording from spec §7.2. `presetFor` returns `{layer, field, render}` or `{layer:'none', rendererGap:{type, startingPoint}}`; unknown types are a renderer gap too.
- [ ] **Step 4:** Run — expect PASS. Commit: `feat(tools): deep-sky preset registry seeded from M42, M31 and M45`.

### Task 6: Reading lore from the Brain, filtered

**Files:** Create `tools/lib/brain-lore.mjs`, `tools/test/brain-lore.test.mjs`

**Interfaces — Produces:** `readStarLore(vaultPath, noteRelPath) → {sections: [{culture, text, citations:[string]}], dropped: {synthesis:n, starseed:n}}`

- [ ] **Step 1: Write the failing test** against the real Vega note, which carries both a synthesis callout and a Starseed section:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {readStarLore} from '../lib/brain-lore.mjs'
const VAULT = 'C:/Users/TearS/STAR-Arts/Consetellations/Constellation Brain'

test('Vega keeps its historical cultures and loses synthesis and Starseed', () => {
  const lore = readStarLore(VAULT, 'stars/Vega.md')
  const cultures = lore.sections.map(s => s.culture)
  assert.ok(cultures.includes('Arabic') && cultures.includes('Greek'))
  assert.ok(!cultures.includes('Starseed'))
  const all = lore.sections.map(s => s.text).join('\n')
  assert.ok(!/Synthesis/.test(all) && !/\[!warning\]/.test(all))
  assert.ok(lore.dropped.synthesis >= 1 && lore.dropped.starseed === 1)
  assert.ok(lore.sections.find(s => s.culture === 'Arabic').citations.includes('al-Sufi 964'))
})
```

- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3: Implement:** split `## Names and lore` (or `## Names`) into `### <Culture>` subsections; drop any subsection whose culture is in `STARSEED = ['Starseed']`; inside the rest, remove every callout block starting `> [!warning] Synthesis` through its last `>` line; collect `[[...]]` links matching a source note name as `citations`. Count what was dropped.
- [ ] **Step 4:** Run — PASS. Commit: `feat(tools): read Brain lore with synthesis and Starseed removed`.

### Task 7: The draft generator

**Files:** Create `tools/draft-constellation.mjs`, `tools/test/draft-constellation.test.mjs`; modify `tools/import-brain.mjs` to carry `pronunciation` from star frontmatter into `tools/brain/stars.json`

**Interfaces — Consumes:** Tasks 3–6. **Produces:** `buildDraft(abbr) → {draft, review}`; CLI `node tools/draft-constellation.mjs <Abbr> [--promote]`; files `tools/drafts/<id>.json`, `tools/drafts/<id>.html`.

- [ ] **Step 1: Write the failing tests:**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {buildDraft} from '../draft-constellation.mjs'

test('Lyra drafts the five figure stars with designation ids', () => {
  const {draft} = buildDraft('Lyr')
  assert.deepEqual(draft.stars.map(s => s.id).sort(),
    ['alpha_lyrae', 'beta_lyrae', 'delta2_lyrae', 'gamma_lyrae', 'zeta1_lyrae'])
  assert.equal(draft.connections.length, 5)
  for (const c of draft.connections) {
    assert.ok(draft.stars.some(s => s.id === c.from) && draft.stars.some(s => s.id === c.to))
  }
  assert.equal(draft.metadata.season, 'summer')
  assert.equal(draft.metadata.hemisphere, 'northern')
})
test('estimated physics is absent and recorded, never shipped', () => {
  const {draft} = buildDraft('Lyr')
  const vega = draft.stars.find(s => s.id === 'alpha_lyrae')
  assert.ok(vega.physics && vega.physics.tempKelvin === 9330)
  const gaps = draft._draft.absences.map(a => a.path)
  for (const s of draft.stars.filter(x => !x.physics)) assert.ok(gaps.includes(`stars.${s.id}.physics`))
})
test('drafting twice is byte-identical', () => {
  assert.equal(JSON.stringify(buildDraft('Lyr').draft), JSON.stringify(buildDraft('Lyr').draft))
})
test('journey candidates rank named stars and point at deep-sky objects', () => {
  const {draft} = buildDraft('Lyr')
  const singles = draft._draft.journeyCandidates.filter(c => c.kind === 'single').map(c => c.star)
  assert.equal(singles[0], 'Vega')
  assert.ok(draft._draft.journeyCandidates.some(c => c.kind === 'pointer'))
})
test('researched fields missing from the input are required gaps', () => {
  const {draft} = buildDraft('Lyr', {research: {}})
  const req = draft._draft.required.map(g => g.path)
  assert.ok(req.includes('journey') && req.includes('metadata.description'))
  assert.ok(req.includes('stars.alpha_lyrae.info'))
})
```

- [ ] **Step 2:** Run — expect FAIL.
- [ ] **Step 3: Implement `buildDraft(abbr, opts)`:**
  1. Load `tools/brain/constellations.json[abbr]`, `stars.json`, `physics.json`, and `tools/input/<id>-research.json` (or `opts.research`); `id` is the lower-cased constellation name.
  2. Per figure HIP: designation = Brain designation, else `designationFromXhip(physics.xhipName)`; `name` = Brain name, else `bayerName(designation)`; `id = starId(designation, hip)`; `pronunciation` from the Brain when present; `magnitude`; `spectralClass` = physics' class when it is a clean MK type, else the Brain's; `distance = round(physics.distanceLy)`; `physics` = research override if present, else `measuredPhysics(rec)`; `isMajor`, `size`, `stellarType`, `color = rgbToHex(bbColor(rampForStar(...)))`; `info.scientific` = `scientificLines` merged under the research's `info`.
  3. Write `tools/input/<id>-stars.json` (`{stars:[{id,raH,dec,dist,mag}], deepSky:[{id,raH,dec}]}`), run `node tools/project-constellation.js <file>` for the suggested portal, then `... <file> <W> <H>`; take `position2D` for stars and deep-sky objects. Fail loudly if `insidePortal` is false.
  4. `portalDerived(W, H)`; connections from Brain pairs, `type: 'figure'`; deep-sky from research with `presetFor(type, hasNamedMembers)` applied inline; metadata from research plus `name`, `abbreviation`, `season`, `hemisphere`; journey from research with `view: '2d'`.
  5. `_draft = {builtFrom:{vaultCommit}, required:[...], absences:[...], rendererGaps:[...], warnings:[...], journeyCandidates:[...]}`. `journeyCandidates` per spec §6.3: named stars ranked by magnitude as `{kind:'single', star}`, and for each deep-sky object the two figure stars nearest its `position2D` as `{kind:'pointer', object, stars}`. Group and whole-figure stops are not proposed — they come from the sources. Required: each missing `stars.<id>.info`, `pronunciation` on named stars, `journey`, `metadata.displayName|description|mythology`. Absences: each star without physics. Warnings: `maxSeparationDeg > 45`.
  6. Key order matches the shipped files; numbers and booleans typed.
- [ ] **Step 4:** CLI: write `tools/drafts/<id>.json` (LF, 2-space, unescaped Unicode) and the review sheet (Task 8). Run the tests — PASS.
- [ ] **Step 5:** Commit: `feat(tools): draft a constellation from the Brain and the harvest`.

### Task 8: The review sheet

**Files:** Modify `tools/draft-constellation.mjs` (add `renderReview(draft)`)

- [ ] **Step 1:** `renderReview` writes self-contained HTML: an inline SVG of the figure from `position2D` and connections; the star table (name, designation, pronunciation, magnitude, physics or "unpublished"); journey stops with sources; deep-sky objects with layer and renderer gaps; the four `_draft` lists. Light and dark via `prefers-color-scheme`.
- [ ] **Step 2:** Run the CLI for `Lyr`, open `tools/drafts/lyra.html` in the browser pane, confirm the figure matches the five-star Lyra shape and every section renders.
- [ ] **Step 3:** Commit: `feat(tools): review sheet for a constellation draft`.

### Task 9: Promotion

**Files:** Modify `tools/sync-loader-data.mjs` (add `--add`), `tools/draft-constellation.mjs` (`--promote`); test `tools/test/promote.test.mjs`

- [ ] **Step 1: Write the failing test** — run `--add` against a temporary copy of `constellation-loader.js` with a fixture constellation, assert the block is inserted immediately before the literal's closing `    }`, the file still contains every other line byte-identical, and a following `--check` passes.
- [ ] **Step 2:** Implement `--add <name>`: if the block exists, behave as the plain sync; otherwise find the last `      '<x>': {` block, its `      },` close, and the next line matching `^    \}\r?$`; insert `      '<name>': {` and `      },` before it using that file's own line terminator; then run the normal sync for `<name>`. Accept an optional `LOADER` env override for the test.
- [ ] **Step 3:** Implement `--promote`: refuse (exit 1, listing them) while `_draft.required` is non-empty; otherwise write `orion/src/data/constellations/<id>.json` without `_draft`, then `node tools/sync-loader-data.mjs <id> --add`, then `--check`.
- [ ] **Step 4:** Run tests — PASS. Commit: `feat(tools): promote a finished draft into shipped data`.

### Task 10: The vault learns pronunciation and objects

**Files (vault):** Modify `_templates/star.md`, `CLAUDE.md`; create `.claude/agents/object-harvester.md`

- [ ] **Step 1:** Add `pronunciation:` to `_templates/star.md` frontmatter. In `CLAUDE.md`, document it (plain respelling, stress in capitals, sourced from a published IPA) and the app's vault-first write-back from the spec §8.
- [ ] **Step 2:** Write `object-harvester.md`: `star-harvester`'s brief applied to `_templates/object.md` — tiers, public-domain quoting, anchors, the back-half.
- [ ] **Step 3:** `node _meta/lint/lint.mjs` exits clean. Commit in the vault.

### Task 11: The verifier and the docs

**Files:** Modify `.claude/agents/constellation-verifier.md`, `constellation-orchestrator.md`, `lore-researcher.md`; `docs/constellation-pipeline.md`; `docs/constellation-data-schema.md`

- [ ] **Step 1:** Verifier gains: no `_draft` block in shipped data; `pronunciation` on every named star; no `Synthesis` or `[!warning]` text in shipped data.
- [ ] **Step 2:** Orchestrator rewritten to spec §9; lore-researcher narrowed to Brain-first, write-back, and spec §6.
- [ ] **Step 3:** Pipeline doc: new flow; reference table with Taurus and correct counts; projection regression asserts positions. Schema doc: `pronunciation`, `_draft`, the research file, the preset registry.
- [ ] **Step 4:** Commit: `docs: the pipeline and schema for draft-based authoring`.

### Task 12: Lyra — research into the vault

Research tasks cannot contain their content in advance. Each step's acceptance criteria are exact.

- [ ] **Step 1: Draft.** `node tools/draft-constellation.mjs Lyr`; record the required gaps and absences.
- [ ] **Step 2: Physics.** For each star whose harvest is an estimate, read its own Wikipedia infobox; if mass, radius and temperature are all published, add them to `tools/input/lyra-research.json` with the article as `note`; otherwise it ships without, recorded as an absence. β Lyrae is an eclipsing binary: use the primary's figures only if the article publishes them for the primary.
- [ ] **Step 3: Pronunciations** for Vega, Sheliak, Sulafat from a published IPA, written into each star's vault frontmatter as a respelling.
- [ ] **Step 4: Deep-sky objects.** M57 (Ring Nebula, planetary) and M56 (globular cluster): coordinates, distance, magnitude, size, sourced info. Write each as a vault `objects/` note following `object-harvester`, then add them to the research file. Both are renderer gaps and ship as markers.
- [ ] **Step 5: Lore.** For each named star, read it through `readStarLore`; add any sourced, historical-culture lore found fresh to the star's vault note with its citation, plus the back-half (sources' `Quoted in`, cultures' `Stars and threads`). New sources get `sources/` notes with `rights:` first.
- [ ] **Step 6:** `node _meta/lint/lint.mjs` exits clean. Commit in the vault: `harvest: Lyra for the AR app — pronunciations, M57, M56`.
- [ ] **Step 7:** `node tools/import-brain.mjs` to re-import.

### Task 13: Lyra — the app's own content, then promotion

- [ ] **Step 1: Journey** per spec §6: candidates from the draft; eligible only with sourced historical lore; 4–5 stops, fewer rather than padded; a path across the figure; a pointer stop last if one exists. Stories retell only what the cited sources say.
- [ ] **Step 2: Prose:** `metadata.displayName`, `description`, `mythology`; each star's `info.basic` and `info.scientific.feature`, revising drafted lines wherever a source gives a range.
- [ ] **Step 3:** Re-draft; confirm `_draft.required` is empty; review `tools/drafts/lyra.html`.
- [ ] **Step 4:** `node tools/draft-constellation.mjs Lyr --promote`; `git diff --stat orion/src/js/constellation-loader.js` shows only Lyra's added lines.
- [ ] **Step 5:** Commit: `feat: Lyra`.

### Task 14: Build, verify, deploy, QR

- [ ] **Step 1:** `cd orion && npm run build` — compiled, no ERROR. `node tools/sync-loader-data.mjs lyra --check` passes.
- [ ] **Step 2: Headless check** in the browser pane at `app-preview/?c=lyra` after syncing: the loader picks `lyra`; five stars with `star-visual`; five connections; markers for M57 and M56; the journey's stops resolve to real star entities; no console errors.
- [ ] **Step 3:** Sync `orion/dist` to `star-gallery/app-preview`; commit and push both repos; poll until `https://tee-rez.github.io/star-gallery/app-preview/bundle.js` contains `'lyra'`.
- [ ] **Step 4:** Generate a QR for `https://tee-rez.github.io/star-gallery/app-preview/?c=lyra` with `segno` (error correction H), decode it with OpenCV to confirm the exact URL, send it.
- [ ] **Step 5:** Do **not** add Lyra to the live catalogue or promote to live — report and offer.
