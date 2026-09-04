#!/usr/bin/env node
// tools/project-constellation.js
//
// Projects a constellation's stars from J2000 sky coordinates onto the flat "face-on" plane
// the app draws, and reports the portal aspect that fits them. This is the same gnomonic
// tangent-plane projection used for Orion and Andromeda, factored out so every constellation
// is built the same way instead of the maths being re-derived each time.
//
// Usage:
//   node tools/project-constellation.js <input.json> [portalW portalH]
//
// Input JSON:
//   {
//     "stars": [ {"id":"mirach","raH":1.162167,"dec":35.620833,"dist":199,"mag":2.07}, ... ],
//     "deepSky": [ {"id":"m31","raH":0.712306,"dec":41.269167}, ... ]     // optional
//   }
//   raH = right ascension in HOURS (J2000), dec = declination in DEGREES.
//
// With no portal size it reports the natural aspect so you can choose one; with a portal size
// it emits the position2D values to paste into the constellation data.
//
// IMPORTANT: the projection centre is the centroid of the stars you pass in, so adding or
// removing a star shifts EVERY position. Always re-run for the whole final star set - never
// project one new star against an older run's centre.

const fs = require('fs')

const D2R = Math.PI / 180
const vec = (raDeg, decDeg) => {
  const ra = raDeg * D2R
  const dec = decDeg * D2R
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function project(stars, deepSky, portalW, portalH) {
  stars.forEach((s) => { s.v = vec(s.raH * 15, s.dec) })

  // Centre of projection: the mean direction of the star set.
  let c = [0, 0, 0]
  stars.forEach((s) => { c[0] += s.v[0]; c[1] += s.v[1]; c[2] += s.v[2] })
  const n = Math.hypot(c[0], c[1], c[2])
  c = c.map(x => x / n)

  const decC = Math.asin(c[2])
  const raC = Math.atan2(c[1], c[0])
  const east = [-Math.sin(raC), Math.cos(raC), 0]
  const north = [
    -Math.sin(decC) * Math.cos(raC),
    -Math.sin(decC) * Math.sin(raC),
    Math.cos(decC),
  ]

  // Gnomonic projection onto the tangent plane. East is LEFT when facing the sky, so x is
  // negated - this is what makes the rendered figure match a naked-eye view.
  const toPlane = (o) => {
    const v = vec(o.raH * 15, o.dec)
    const d = dot(v, c)
    return {px: -dot(v, east) / d, py: dot(v, north) / d}
  }
  stars.forEach(s => Object.assign(s, toPlane(s)))

  const maxX = Math.max(...stars.map(s => Math.abs(s.px)))
  const maxY = Math.max(...stars.map(s => Math.abs(s.py)))
  const aspect = maxX / maxY

  // A gnomonic projection is only well behaved near its tangent point: it diverges towards 90
  // degrees away and cannot represent anything at or beyond it. Sprawling constellations
  // (Hydra, Eridanus, Draco) can exceed that, so report the worst separation and say plainly
  // whether the result is trustworthy rather than silently emitting warped coordinates.
  const maxSep = Math.max(...stars.map(s => Math.acos(Math.min(1, dot(s.v, c))) / D2R))
  let projectionWarning = null
  if (maxSep >= 75) {
    projectionWarning = 'UNUSABLE: a star lies ' + maxSep.toFixed(1) + ' degrees from the ' +
      'projection centre. Gnomonic projection diverges near 90 degrees. Split the figure into ' +
      'sections or choose a different projection.'
  } else if (maxSep >= 45) {
    projectionWarning = 'DISTORTION: a star lies ' + maxSep.toFixed(1) + ' degrees from the ' +
      'projection centre. Outer stars will be noticeably stretched; check the rendered figure ' +
      'against a star chart before accepting it.'
  }

  const out = {
    centre: {raHours: +(raC / D2R / 15).toFixed(4), dec: +(decC / D2R).toFixed(4)},
    maxSeparationDeg: +maxSep.toFixed(2),
    projectionWarning,
    halfExtent: {x: +maxX.toFixed(4), y: +maxY.toFixed(4)},
    aspect: +aspect.toFixed(3),
    suggestedPortal: suggestPortal(aspect),
  }

  if (portalW && portalH) {
    // One uniform scale for both axes, so real sky proportions are preserved; 0.9 keeps a
    // margin between the outermost star and the frame.
    const scale = Math.min((portalW / 2) / maxX, (portalH / 2) / maxY) * 0.9
    out.portal = {width: portalW, height: portalH}
    out.scale = +scale.toFixed(4)
    out.stars = stars.map(s => ({
      id: s.id,
      position2D: {x: +(s.px * scale).toFixed(3), y: +(s.py * scale).toFixed(3)},
      distance: s.dist,
      magnitude: s.mag,
    }))
    if (deepSky && deepSky.length) {
      out.deepSky = deepSky.map((o) => {
        const p = toPlane(o)
        return {id: o.id, position2D: {x: +(p.px * scale).toFixed(3), y: +(p.py * scale).toFixed(3)}}
      })
    }
    const xs = out.stars.map(s => s.position2D.x)
    const ys = out.stars.map(s => s.position2D.y)
    out.fittedExtent = {
      x: [Math.min(...xs), Math.max(...xs)],
      y: [Math.min(...ys), Math.max(...ys)],
    }
    out.insidePortal = xs.every(v => Math.abs(v) <= portalW / 2) &&
      ys.every(v => Math.abs(v) <= portalH / 2)
  }
  return out
}

// Portal sizes are kept to whole units so the 0.5 grid divides evenly.
function suggestPortal(aspect) {
  const options = []
  for (let w = 4; w <= 12; w++) {
    for (let h = 4; h <= 12; h++) options.push({w, h, err: Math.abs((w / h) - aspect)})
  }
  options.sort((a, b) => a.err - b.err || (a.w + a.h) - (b.w + b.h))
  const best = options[0]
  return {width: best.w, height: best.h, aspectError: +best.err.toFixed(3)}
}

const [file, pw, ph] = process.argv.slice(2)
if (!file) {
  console.error('usage: node tools/project-constellation.js <input.json> [portalW portalH]')
  process.exit(1)
}
const input = JSON.parse(fs.readFileSync(file, 'utf8'))
if (!input.stars || !input.stars.length) {
  console.error('input needs a non-empty "stars" array')
  process.exit(1)
}
console.log(JSON.stringify(
  project(input.stars, input.deepSky, pw && +pw, ph && +ph), null, 2
))
