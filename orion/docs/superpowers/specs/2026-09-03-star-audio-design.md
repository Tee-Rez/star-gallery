# Star Audio (Starsong) — Design Spec

**Date:** 2026-09-03
**Project:** Orion Observer / STAR Arts AR gallery (web build)
**Status:** Approved design, ready for implementation plan

## Summary

Give every star a voice, synthesised from its physics rather than sampled — porting the Unity
build's star-tone system to the web with the Web Audio API. A new **Starsong** tab in the star
info panel plays a star's tone on demand, and each Lore journey stop sounds its star as it
arrives.

## Background

The Unity port (`Star-Map-Gallery`) already has this system, and it is not sample playback:
there are no star audio files, only UI clicks. Each tone is derived from real asteroseismology,
following Prof. Conny Aerts's *Unravelling the Symphonies of the Stars* (documented in that
project's `Docs/AudioDesign.md`).

The chain is:

```
ν_max  ∝  M / (R² √T_eff)      calibrated against the Sun (3090 μHz, 5777 K)
```

That peak oscillation frequency becomes the star's pitch. Surface temperature sets overtone
brightness — cool red stars stay near-sine, hot blue ones gain harmonics. Internal rotation
splits the fundamental into a detuned triplet whose interference is the audible shimmer.

Unity's `StarTone` is deliberately pure maths with no engine state; its own comment says it
mirrors a web bench "so what was tuned there transfers here exactly". The port is therefore a
transliteration, not a reinvention.

The web build has neither audio nor the numeric physics the formula needs —
`star-info-overlay.js` says so in its header, and its Info/Sound tabs were omitted for exactly
that reason. This spec closes both gaps.

## Decisions

| Question | Decision |
|---|---|
| Fidelity | **Musical by default**, with true sonification reachable on demand |
| Physics source | **Spectral-class fallback**, overridden by researched values where present |
| Triggers | **Starsong tab** in the info panel (on demand) + **journey stops** (automatic) |
| Tab name | **Starsong** |
| Journey behaviour | **Swell in, hold, fade under** |

Tapping a star does **not** sound it. Audio is either explicitly requested from the Starsong
tab or played by the journey — so exploring stays quiet.

## Goals

- Every star has a plausible tone immediately, including in constellations not yet built.
- Musical mode stays consonant however many stars sound at once.
- True sonification remains available and honest about its own accuracy.
- Nothing regresses when audio is unavailable, blocked or muted.

## Non-goals

- No ambient/drone bed (considered and dropped — fatiguing, and the heaviest on a phone).
- No audio in the Quest WebXR POC yet; that build is separate.
- No sampled or recorded audio of any kind.

## Architecture

Four new modules and three edited files. The split keeps the maths testable without audio, and
the audio testable without the app.

| File | Responsibility | Depends on |
|---|---|---|
| `src/js/star-tone.js` | Pure maths: `nuMaxMicroHz`, `toPitchHz`, `quantize`, `heat`. No DOM, no Web Audio. | nothing |
| `src/js/star-physics.js` | `physicsFor(star)` → `{massSolar, radiusSolar, tempKelvin, source}`. Star's own `physics` block wins; otherwise derived from `spectralClass`. | nothing |
| `src/js/star-voice.js` | One sounding voice: oscillator graph, envelope, panner. `configure()`, `fadeIn()`, `fadeOut()`, `release()`. | Web Audio |
| `src/js/star-audio.js` | A-Frame component `star-audio`: context, master gain, voice pool, `playStar` / `playChord` / `stopAll`, autoplay unlock, constellation ν_max range. | the three above |
| `src/star-info-overlay.js` *(edit)* | Info \| Starsong tabs; Play and True sound buttons. | `star-audio` |
| `src/js/lore-journey.js` *(edit)* | Sound the stop's targets on arrival. | `star-audio` |
| `src/data/constellations/*.json` *(edit)* | Optional per-star `physics` block. | — |

### Signal chain

```
star data
  → physics        (star.physics  ||  derived from spectralClass)
  → ν_max          M / (R² √T)  × 3090 μHz
  → pitch          compressed across THIS constellation's ν_max range, quantized to pentatonic
  → voice          partials 1/p^1.7; fundamental split into a ±beatCents triplet; normalised
  → panner         at the star's world position
  → master gain    → destination
```

Compress mapping needs the minimum and maximum ν_max **of the loaded constellation**, so that a
bigger star always sounds lower *within that figure*. This range is computed once when a
constellation loads and recomputed on constellation change.

### Settings

Ported verbatim from Unity's `StarToneSettings`, exposed as the component's schema:

```
baseHz 110      octaves 2       scale pentatonic
maxPartials 4   beatCents 6     voiceGain 0.18
attack 1.2s     release 2.0s
spatial: refDistance 1.5, maxDistance 40, distanceModel inverse
maxVoices 12 (desktop) / 6 (mobile)
```

The mobile cap is lower because the phone is already running SLAM, camera and bloom. `maxVoices`
is a schema value; its default is chosen once at init by a coarse touch-device check
(`matchMedia('(pointer: coarse)')`), so it can always be overridden per scene rather than being
decided by device sniffing alone.

## Data model

New optional block per star, mirroring Unity's `StarPhysics`:

```json
"physics": {"massSolar": 3.8, "radiusSolar": 2.7, "tempKelvin": 13800}
```

When absent, `star-physics.js` derives values from `spectralClass`, which every star already
has. Parse the class into a letter, a numeric subclass and a luminosity class
(`B8IVpMnHg` → `B`, `8`, `IV`), interpolate main-sequence temperature from letter+subclass, then
apply a luminosity-class adjustment to mass and radius. Representative anchors:

| Class | T (K) | M☉ | R☉ |
|---|---|---|---|
| B5V | 15200 | 5.9 | 3.9 |
| A5V | 8100 | 2.0 | 1.7 |
| G2V (Sun) | 5777 | 1.0 | 1.0 |
| K3III | 4400 | 2.5 | 15 |
| M0III | 3800 | 2.5 | 40 |
| K3IIb | 4250 | 8 | 80 |

The derived value carries `source: 'spectral'` so the UI can be honest in true mode.

`physicsFor` must always return usable numbers — an unparseable class falls back to solar
values rather than producing a silent or NaN voice.

## Behaviour

### Starsong tab

The info panel becomes tabbed: **Info** | **Starsong**. Info keeps today's content unchanged.

Starsong shows the star's derived tone data — pitch in Hz, and the physics used with a marker
when it was derived rather than researched — plus two buttons:

- **Play** — musical rendering (compress + pentatonic). The shipped sound.
- **True sound** — Aerts's method: ×10⁵ fold, no scale snapping. Physically faithful; red
  giants land near a few hertz and read as a felt pulse rather than a pitch, which is the
  point, not a defect.

When the physics were derived from spectral class, the tab says so, because true mode is only
as honest as its inputs.

### Journey

On stop arrival, the stop's `targetStarNames` sound together: swell over the 1.2 s attack, hold
~2.5 s, then fade **to silence** over 2 s so the story reads in quiet. ("Fade under" here means
the tone recedes beneath the reading, not that a bed is left running — the floor is 0, exposed
as a setting in case a low bed is wanted later.) Group stops (Orion's Belt, Andromeda's Chains)
therefore arrive as a chord — the case pentatonic quantizing exists to serve. Advancing or
ending the journey stops any sounding voices.

### Autoplay

`AudioContext` is created suspended and resumed on the first user gesture. The tap that places
the portal already provides one; the Starsong buttons also resume it as a backstop. If the
context cannot start, the UI stays functional and the buttons report that audio is unavailable.

## Error handling

- No Web Audio support → Starsong tab renders with its buttons disabled and a short reason.
- Context suspended/blocked → first button press attempts a resume before playing.
- Voice pool exhausted → steal the oldest voice, matching Unity's pool behaviour.
- Missing or unparseable physics → solar fallback; never NaN, never a silent failure.
- Constellation switch → `stopAll()` and recompute the ν_max range.

## Verification

`star-tone.js` is pure maths, so most of this is genuinely checkable:

- **Sun calibration** — `nuMaxMicroHz(1, 1, 5777)` returns 3090 μHz.
- **Ordering** — a larger radius yields a lower ν_max and therefore a lower pitch.
- **Quantize** — output pitches land on pentatonic degrees of `baseHz`.
- **Range** — compress output stays within `[baseHz, baseHz × 2^octaves]`.
- **Physics fallback** — every star in both shipped constellations produces finite, positive
  mass/radius/temperature.
- **Pool** — never exceeds `maxVoices`; voices are released and reused.
- **Context** — starts suspended, resumes on gesture.

The sound itself is judged by ear on device.

## Risks

- **iOS silent switch** mutes web audio entirely. Not fixable in code; it is a support answer.
- **Mobile performance** — 6 voices × up to 12 oscillators is the budget; if it costs frames in
  AR, reduce `maxPartials` before reducing voices, since partials are cheaper to lose than
  polyphony.
- **True mode accuracy** depends on physics provenance. Spectral-derived stars give a
  characteristic-of-type tone rather than that individual star's. The UI must not overclaim.
- **Journey pacing** — the 1.2 / 2.5 / 2.0 s envelope is a starting point and expected to need
  tuning by ear.
