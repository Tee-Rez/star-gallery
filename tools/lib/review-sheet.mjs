// tools/lib/review-sheet.mjs - the page a constellation draft is reviewed on.
//
// Everything a person approves before a draft ships, on one page: the figure as the portal frames
// it, the star table, the journey with the candidates that were NOT chosen, the deep-sky objects
// and their renderer gaps, every open `_draft` gap, and the warnings. Same house style as
// render-journeys.mjs, so the two review pages read as one set.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const para = s => String(s).split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n')

// The figure in portal coordinates: +y is up in the app and down in SVG.
function figure(draft) {
  const {width: W, height: H} = draft.portal
  const pad = 0.6
  const byId = new Map(draft.stars.map(s => [s.id, s]))
  const lines = draft.connections.map((c) => {
    const a = byId.get(c.from).position2D, b = byId.get(c.to).position2D
    return `<line x1="${a.x}" y1="${-a.y}" x2="${b.x}" y2="${-b.y}" class="fig-line"/>`
  }).join('')
  const objects = draft.deepSkyObjects.map(o => `
    <g class="fig-dso${o.layer === 'none' ? ' fig-dso--none' : ''}">
      <circle cx="${o.position2D.x}" cy="${-o.position2D.y}" r="0.22"/>
      <text x="${o.position2D.x + 0.3}" y="${-o.position2D.y + 0.08}">${esc(o.designation || o.name)}</text>
    </g>`).join('')
  const stars = draft.stars.map(s => `
    <g class="fig-star">
      <circle cx="${s.position2D.x}" cy="${-s.position2D.y}" r="${(s.size * 0.9).toFixed(3)}" fill="${s.color}"/>
      <text x="${s.position2D.x + s.size + 0.12}" y="${-s.position2D.y - 0.12}">${esc(s.name)}</text>
    </g>`).join('')
  return `<svg class="figure" viewBox="${-W / 2 - pad} ${-H / 2 - pad} ${W + 2 * pad} ${H + 2 * pad}"
    role="img" aria-label="${esc(draft.metadata.name)} as the portal frames it">
    <rect x="${-W / 2}" y="${-H / 2}" width="${W}" height="${H}" class="fig-portal"/>
    ${lines}${objects}${stars}
  </svg>`
}

function starTable(draft) {
  const rows = draft.stars.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong>${s.pronunciation ? `<span class="say">${esc(s.pronunciation)}</span>` : ''}</td>
      <td>${esc(s.designation)}</td>
      <td class="num">${s.magnitude}</td>
      <td>${esc(s.spectralClass)}</td>
      <td class="num">${s.distance ?? '<span class="gap">—</span>'}</td>
      <td class="num">${s.physics ? `${s.physics.tempKelvin.toLocaleString('en-US')} K · ${s.physics.massSolar} M☉ · ${s.physics.radiusSolar} R☉` : '<span class="absent">not published</span>'}</td>
      <td>${s.info ? 'written' : '<span class="gap">missing</span>'}</td>
    </tr>`).join('')
  return `<div class="scroll"><table>
    <thead><tr><th>Star</th><th>Designation</th><th class="num">Mag</th><th>Class</th><th class="num">ly</th><th class="num">Physics</th><th>Panel</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`
}

function journey(draft) {
  const stops = (draft.journey || []).map((s, i) => `
    <article class="stop">
      <div class="stop__index">${i + 1}</div>
      <div>
        <h3>${esc(s.title)}</h3>
        <p class="targets">${s.targetStarNames.map(esc).join(' · ')}</p>
        <div class="prose">${para(s.story)}</div>
        <p class="sources">${esc(s.sources)}</p>
      </div>
    </article>`).join('')
  const used = new Set((draft.journey || []).flatMap(s => s.targetStarNames))
  const unchosen = draft._draft.journeyCandidates.filter(c =>
    c.kind === 'single' ? !used.has(c.star) : !c.stars.some(n => used.has(n)))
  const cand = unchosen.map(c => c.kind === 'single'
    ? `<li>${esc(c.star)} <span class="meta">single star · mag ${c.magnitude}</span></li>`
    : `<li>${esc(c.object)} <span class="meta">pointer · from ${c.stars.map(esc).join(' and ')}</span></li>`).join('')
  return `${stops || '<p class="gap">No journey yet.</p>'}
    <h3 class="sub">Candidates not chosen</h3>
    ${cand ? `<ul class="plain">${cand}</ul>` : '<p class="none">none</p>'}`
}

function deepSky(draft) {
  if (!draft.deepSkyObjects.length) return '<p class="none">none</p>'
  const gaps = new Map(draft._draft.rendererGaps.map(g => [g.object, g]))
  return draft.deepSkyObjects.map((o) => {
    const g = gaps.get(o.id)
    return `<article class="dso">
      <h3>${esc(o.name)} <span class="meta">${esc(o.designation)} · ${esc(o.type.replace(/_/g, ' '))} · layer ${esc(o.layer)}</span></h3>
      <p>${esc(o.description)}</p>
      ${g ? `<p class="gapnote"><strong>Renderer gap.</strong> Ships as data only - a layer-none object draws nothing in the scene. ${esc(g.startingPoint)}</p>` : ''}
    </article>`
  }).join('')
}

function gapList(items, render) {
  return items.length ? `<ul class="plain">${items.map(render).join('')}</ul>` : '<p class="none">none</p>'
}

export function renderReview(draft, {id}) {
  const d = draft._draft
  const m = draft.metadata
  const blocking = d.required.length
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.displayName || m.name)} Draft</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper: #faf7f2; --panel: #f2ede4; --ink: #1c1b24; --ink-soft: #58534a; --rule: #ddd5c8;
    --brass: #8a6420; --lapis: #2c4a7c; --cut: #8c3a2e; --sky: #141a2c; --sky-line: #6f8fc4;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #101320; --panel: #171b2a; --ink: #e9e4d9; --ink-soft: #9b9585; --rule: #2b3145;
      --brass: #d8ab55; --lapis: #86a8dd; --cut: #d98a72; --sky: #0a0d18; --sky-line: #6f8fc4;
    }
  }
  :root[data-theme="dark"] {
    --paper: #101320; --panel: #171b2a; --ink: #e9e4d9; --ink-soft: #9b9585; --rule: #2b3145;
    --brass: #d8ab55; --lapis: #86a8dd; --cut: #d98a72; --sky: #0a0d18; --sky-line: #6f8fc4;
  }
  body { margin: 0; background: var(--paper); color: var(--ink);
    font-family: 'EB Garamond', Georgia, serif; font-size: 19px; line-height: 1.6; }
  .wrap { max-width: 62rem; margin: 0 auto; padding: 3rem 16px 5rem; }
  h1 { font-size: clamp(2.2rem, 6vw, 3.2rem); font-weight: 500; margin: 0; text-wrap: balance; }
  h2 { font-size: 1.5rem; font-weight: 500; margin: 3rem 0 1rem; padding-bottom: .3rem; border-bottom: 1px solid var(--rule); }
  h3 { font-size: 1.15rem; font-weight: 600; margin: 0 0 .3rem; }
  h3.sub { margin-top: 2rem; }
  .mono, .meta, .num, th, .say, .sources, .targets, .status {
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .78rem; }
  .meta, .sources, .targets { color: var(--ink-soft); font-weight: 400; }
  .status { display: inline-block; margin-top: 1rem; padding: .25rem .7rem; border-radius: 999px;
    border: 1px solid currentColor; letter-spacing: .04em; text-transform: uppercase; }
  .status--open { color: var(--cut); } .status--ready { color: var(--lapis); }
  .lede { max-width: 64ch; color: var(--ink-soft); }
  .figure { display: block; width: 100%; max-width: 40rem; margin: 1rem auto; background: var(--sky); border-radius: 6px; }
  .fig-portal { fill: none; stroke: #2fbf5a; stroke-width: .04; }
  .fig-line { stroke: var(--sky-line); stroke-width: .035; }
  .fig-star text, .fig-dso text { fill: #d8deea; font: .28px 'IBM Plex Mono', monospace; }
  .fig-dso circle { fill: none; stroke: #e0a85a; stroke-width: .03; stroke-dasharray: .08 .06; }
  .fig-dso--none circle { stroke: #7a7f8c; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: .95rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid var(--rule); vertical-align: top; }
  th { color: var(--ink-soft); font-weight: 500; text-transform: uppercase; letter-spacing: .05em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .say { display: block; color: var(--brass); }
  .gap { color: var(--cut); } .absent { color: var(--ink-soft); font-style: italic; }
  .stop { display: grid; grid-template-columns: 2.2rem 1fr; gap: 1rem; padding: 1.2rem 0; border-bottom: 1px solid var(--rule); }
  .stop__index { font-family: 'IBM Plex Mono', monospace; color: var(--brass); padding-top: .2rem; }
  .prose p { margin: .4rem 0; max-width: 64ch; }
  .dso { padding: 1rem 0; border-bottom: 1px solid var(--rule); }
  .gapnote { background: var(--panel); padding: .7rem .9rem; border-radius: 4px; font-size: .95rem; }
  ul.plain { padding-left: 1.1rem; } ul.plain li { margin: .3rem 0; }
  .none { color: var(--ink-soft); font-style: italic; }
  code { font-family: 'IBM Plex Mono', monospace; font-size: .8em; }
</style></head>
<body><main class="wrap">
  <header>
    <p class="meta">${esc(m.abbreviation)} · ${esc(m.season)} · ${esc(m.hemisphere)} hemisphere · portal ${draft.portal.width}×${draft.portal.height} · tools/drafts/${esc(id)}.json</p>
    <h1>${esc(m.displayName || m.name)}</h1>
    ${m.description ? `<p class="lede">${esc(m.description)}</p>` : ''}
    <span class="status ${blocking ? 'status--open' : 'status--ready'}">${blocking ? `${blocking} required gap${blocking === 1 ? '' : 's'} open` : 'ready to promote'}</span>
  </header>

  <h2>Figure</h2>
  ${figure(draft)}

  <h2>Stars</h2>
  ${starTable(draft)}

  <h2>Journey</h2>
  ${journey(draft)}

  <h2>Deep-sky objects</h2>
  ${deepSky(draft)}

  <h2>Open gaps</h2>
  ${gapList(d.required, g => `<li><code>${esc(g.path)}</code> <span class="meta">${esc(g.fill)}</span></li>`)}

  <h2>Honest absences</h2>
  <p class="lede">Shipped without: no source publishes a measured value, and physics is never inferred from the spectral class. The app labels these tones as estimated.</p>
  ${gapList(d.absences, a => `<li><code>${esc(a.path)}</code> <span class="meta">${esc(a.reason)}</span></li>`)}

  <h2>Warnings</h2>
  ${gapList(d.warnings, w => `<li>${esc(w)}</li>`)}
</main></body></html>
`
}
