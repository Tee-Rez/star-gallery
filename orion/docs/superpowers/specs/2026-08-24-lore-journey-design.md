# Lore Journey — Design Spec

**Date:** 2026-08-24
**Project:** Orion Observer (exported 8th Wall / A-Frame AR)
**Status:** Approved design, ready for implementation plan

## Summary

Add a guided, **sourced** "Lore" story journey to the Orion AR experience. A button in the
portal frame launches a narrated tour that zooms into each major star (using the existing
detailed textured star model), slowly rotates the constellation around it, and shows a panel
with that star's real, cited mythological/cultural/astrological story. A screen-locked
"Next Star" button advances through the stops; the final stop ends the journey and recenters
the constellation.

Separately, the fabricated "esoteric" text is removed from the normal star-click panel, which
becomes physical-properties-only.

## Goals

- Replace the invented per-star "esoteric" text with genuinely sourced lore, surfaced through a
  dedicated journey rather than the click panel.
- Provide a guided tour of the stars that actually have documented lore.
- Reuse existing, proven, performant patterns (single detailed star at a time, recenter math).

## Non-goals

- No changes to image targets, tracking, or the 2D/3D position math (already done).
- No promoting all 15 stars to detailed models (mobile-AR performance).
- No new lore for stars without sourced material.

## Key AR constraint

In world-tracking AR the camera **is** the phone and cannot be moved programmatically. All
"camera movement / zoom" is achieved by transforming the **constellation content** so the
focused star swings to a point in front of the current camera and scales up to fill the view.
This reuses the approach in `reset-view-button.js` (`recenterConstellation`).

## Stops (order + sourced content)

All content is sourced (R.H. Allen, *Star Names* 1899; Vivian Robson, *Fixed Stars* 1923, both
via constellationsofwords.com; Wikipedia; Mexicolore for Maya astronomy). Faint/thin-lore stars
are intentionally excluded.

1. **Betelgeuse** — Arabic *Yad al-Jawzā'* ("hand of Orion"); the 13th-c. transcription error
   (yā'→bā') that produced the European name; cross-cultural color records (Ptolemy "orange-tawny,"
   Chinese ~3rd c. BCE "yellow," Inuit *Ulluriajjuaq*, South Australian Aboriginal variability
   traditions); Mars-nature fixed-star astrology (Robson).
2. **Bellatrix** — Arabic *Al Najīd* ("the Conqueror") → Latin "Female Warrior" / "Amazon Star"
   (Alfonsine Tables); Robson: great honor with danger of sudden downfall.
3. **Orion's Belt** *(frames all three belt stars; **Alnilam**, the center star, is centered on
   screen; all three shown detailed)* — Arabic names *Al Nitāk* / *Al Nithām* / *Al Mintaqah*;
   worldwide folk names (Three Kings, Three Marys, Jacob's Rod, Golden Yard-arm); the **Maya
   three hearthstones of creation** with the Orion Nebula as the fire; Robson's collective belt
   influence.
4. **Saiph** — Arabic *Saif al-Jabbār* ("sword of the giant"); its role as one of the Maya
   hearthstones (with Rigel and the belt).
5. **Rigel** — Arabic *Rijl Jawzā'* ("left foot of Orion"); the **Norse** Aurvandil/Orwandil's-toe
   myth (the frostbitten toe became Alcor); Roman association with winter storms; Robson
   Jupiter/Saturn honor & riches.

Each stop's final prose is written from these sources and ends with a short **Sources** line.

## Behavior

### Launch
- Tapping the **"Lore"** button (bottom band of the portal frame) emits `loreJourneyRequested`.
- The journey: forces **3D depth** layout, hides the Recenter button, suppresses normal
  star-click info, shows the HUD "Next Star" button, and frames stop 1.

### Per stop
- **Framing:** re-frame to the *current* camera — the focused star (belt: Alnilam) animates to a
  point ~2 units in front of the camera, scaled so it fills most of the view. Transition between
  stops takes **3 seconds** (`easeInOutQuad`).
- **Rotation:** while parked, the constellation slowly rotates around the focused star (star stays
  centered, the rest orbits it).
- **Detailed star:** spawn the existing `dynamic-star` (textured sphere + glow) **at the focused
  star's position**, scaled to fill view; **hide that star's basic sphere** (and disable its
  collision sphere). Only one detailed star at a time — except the **Belt** stop, which shows the
  three belt stars detailed. Despawn / restore basic spheres on advance.
- **Lore panel:** same visual style as `star-info-overlay`, driven by the journey. Shows the
  stop's **title**, the **sourced story**, and a **Sources** line.

### Advance / end
- **"Next Star"** HUD button (screen-locked DOM, bottom-right) advances to the next stop.
- On the **final** stop the button reads **"End the Journey"**; tapping it runs Recenter (restore
  front view), closes the lore panel, despawns detailed stars, un-hides basic spheres, and
  restores normal mode (Recenter button back, clicks re-enabled).

## Components

- **New `src/js/lore-journey.js`** — registered in `app.js`. Owns journey state (active, index),
  staging/zoom/rotation, the HUD "Next Star" button, the lore panel, and end/recenter. Reuses the
  recenter math and the `dynamic-star` component.
- **Extend `src/js/portal-header.js`** — add the tappable **"Lore"** button in the bottom band
  (world-space, `cantap`/`clickable`, styled like the "3D View" toggle). Emits `loreJourneyRequested`.
- **Edit `src/js/constellation-loader.js`**:
  - `formatStarInfo()` — remove the `Esoteric significance:` append (click panel = physical only).
  - Add a `journey` array to the embedded constellation data (the 5 stops above).
  - Instantiate the `lore-journey` component (e.g. on the scene or `#root`) and pass it the journey
    data.
- **Reuse** — `dynamic-star` component (detailed star), `reset-view-button` recenter logic (shared
  or duplicated for the end-of-journey recenter).

## Data shape (embedded constellation data)

```js
journey: [
  {
    id: 'betelgeuse',
    title: 'Betelgeuse',
    targetStarIds: ['betelgeuse'],   // belt stop lists all three; centerStarId picks the framing target
    centerStarId: 'betelgeuse',
    story: '…sourced prose…',
    sources: 'Allen (1899); Robson (1923); Wikipedia',
  },
  // bellatrix, belt (centerStarId: 'alnilam', targetStarIds: [alnitak, alnilam, mintaka]),
  // saiph, rigel
]
```

## Constants

- Stop transition duration: **3000 ms**, `easeInOutQuad`.
- Focus distance in front of camera: ~2 units (tunable).
- Rotation: slow continuous yaw while parked (e.g. ~0.1–0.2 rad/s, tunable).
- HUD button: bottom-right; Recenter hidden during journey.

## Risks / edge cases

- **Re-entrancy:** guard against double-taps on "Next" during the 3s transition (ignore input
  while animating), mirroring `reset-view-button`'s `isRecentering` guard.
- **Journey started before placement:** the "Lore" button only exists once the portal/header is
  built (after placement), so this is naturally gated.
- **Cleanup:** despawn detailed stars and restore all basic-sphere visibility on end/interrupt so
  the constellation returns to its normal state.
- **Belt framing:** center on Alnilam but frame loosely enough that Alnitak and Mintaka remain in
  view; all three promoted to detailed for that stop only.
