#!/usr/bin/env node
// tools/render-journeys.mjs
//
// Renders tools/brain/journeys-draft.json into a review page, pulling the live star
// figures from orion/src/data/constellations/*.json so the catalogue data on the page
// is the app's actual data rather than a copy that can drift.
//
// Usage: node tools/render-journeys.mjs [out.html]

import fs from 'node:fs'

const OUT = process.argv[2] || 'docs/lore-journeys.html'
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''))

const draft = readJSON('tools/brain/journeys-draft.json')
const keys = Object.keys(draft).filter(k => !k.startsWith('_'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const para = s => s.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n')

const sections = keys.map((key) => {
  const app = readJSON(`orion/src/data/constellations/${key}.json`)
  const byName = new Map(app.stars.map(s => [s.name, s]))
  const c = draft[key]
  const ch = c.changes

  const inJourney = new Set(c.stops.flatMap(s => [s.centerStarName, ...s.targetStarNames]))
  const unused = app.stars.filter(s => !inJourney.has(s.name))

  const chip = (name) => {
    const s = byName.get(name)
    if (!s) return `<span class="chip chip--missing">${esc(name)}</span>`
    return `<span class="chip"><span class="chip__name">${esc(s.name)}</span>` +
      `<span class="chip__meta">${s.designation ? esc(s.designation) + ' · ' : ''}mag ${s.magnitude} · HIP ${s.hip}</span></span>`
  }

  const stops = c.stops.map((s, i) => `
      <article class="stop">
        <div class="stop__index"><span>${String(i + 1).padStart(2, '0')}</span><span class="stop__view">${esc(s.view)}</span></div>
        <div class="stop__body">
          <h3>${esc(s.title)}</h3>
          <div class="chips">${s.targetStarNames.map(chip).join('')}</div>
          <div class="prose">${para(s.story)}</div>
          <p class="sources">${esc(s.sources)}</p>
        </div>
      </article>`).join('')

  const list = (items, cls) => items.length
    ? `<ul class="${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '<p class="none">none</p>'

  return `
    <section class="con" id="${key}">
      <header class="con__head">
        <h2>${esc(c.displayName)}</h2>
        <dl class="counts">
          <div><dt>stars</dt><dd>${ch.before.stars} <span class="arrow">&rarr;</span> <strong>${app.stars.length}</strong></dd></div>
          <div><dt>lines</dt><dd>${ch.before.connections} <span class="arrow">&rarr;</span> <strong>${app.connections.length}</strong></dd></div>
          <div><dt>stops</dt><dd>${ch.before.stops.length} <span class="arrow">&rarr;</span> <strong>${c.stops.length}</strong></dd></div>
        </dl>
      </header>

      <div class="delta">
        <div class="delta__col">
          <h4>Stars gone from the figure</h4>
          ${list(ch.starsRemoved, 'minus')}
        </div>
        <div class="delta__col">
          <h4>Stars new to the figure</h4>
          ${list(ch.starsAdded, 'plus')}
        </div>
        <div class="delta__col">
          <h4>Journey stops changed</h4>
          ${ch.stopsRemoved.length ? `<p class="none"><span class="tag tag--cut">cut</span> ${ch.stopsRemoved.map(esc).join(', ')}</p>` : ''}
          ${ch.stopsAdded.length ? `<p class="none"><span class="tag tag--new">new</span> ${ch.stopsAdded.map(esc).join(', ')}</p>` : ''}
          ${ch.stopsChanged.map(t => `<p class="none">${esc(t)}</p>`).join('')}
        </div>
      </div>

      <div class="stops">${stops}</div>

      ${unused.length ? `<p class="unused"><strong>Not visited by any stop:</strong> ${unused.map(s => esc(s.name)).join(', ')}. These are figure stars with no lore in the vault; they still render and can still be tapped.</p>` : ''}
    </section>`
}).join('')

const html = `<title>Constellation Lore Journeys</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
  :root {
    --paper:      #faf7f2;
    --panel:      #f2ede4;
    --ink:        #1c1b24;
    --ink-soft:   #58534a;
    --rule:       #ddd5c8;
    --brass:      #8a6420;
    --brass-dim:  #b08334;
    --lapis:      #2c4a7c;
    --cut:        #8c3a2e;
    --measure:    64ch;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:     #101320;
      --panel:     #171b2a;
      --ink:       #e9e4d9;
      --ink-soft:  #9b9585;
      --rule:      #2b3145;
      --brass:     #d8ab55;
      --brass-dim: #b08334;
      --lapis:     #86a8dd;
      --cut:       #d98a72;
    }
  }
  :root[data-theme="dark"] {
    --paper:     #101320;
    --panel:     #171b2a;
    --ink:       #e9e4d9;
    --ink-soft:  #9b9585;
    --rule:      #2b3145;
    --brass:     #d8ab55;
    --brass-dim: #b08334;
    --lapis:     #86a8dd;
    --cut:       #d98a72;
  }

  body {
    background: var(--paper);
    color: var(--ink);
    font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;
    font-size: 19px;
    line-height: 1.6;
  }
  .wrap { max-width: 62rem; margin: 0 auto; padding: 4rem 1.5rem 6rem; }

  .mast { border-bottom: 2px solid var(--ink); padding-bottom: 1.5rem; margin-bottom: 1rem; }
  .mast h1 {
    font-size: clamp(2.4rem, 6vw, 3.6rem); font-weight: 500; margin: 0 0 .4rem;
    letter-spacing: -0.015em; text-wrap: balance;
  }
  .mast p { margin: 0; max-width: var(--measure); color: var(--ink-soft); }
  .standfirst { font-size: 1.05rem; }
  .mast .note {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: .72rem; text-transform: uppercase; letter-spacing: .1em;
    color: var(--brass); margin-top: 1rem;
  }

  .toc {
    display: flex; flex-wrap: wrap; gap: 1.5rem;
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .78rem;
    padding: 1rem 0 0; margin-bottom: 4rem;
  }
  .toc a { color: var(--lapis); text-decoration: none; border-bottom: 1px solid transparent; }
  .toc a:hover, .toc a:focus-visible { border-bottom-color: var(--lapis); }

  .con { margin-bottom: 5.5rem; scroll-margin-top: 2rem; }
  .con__head {
    display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
    gap: 1rem 2rem; border-bottom: 1px solid var(--rule); padding-bottom: .75rem;
  }
  .con__head h2 { font-size: 2rem; font-weight: 500; margin: 0; letter-spacing: -0.01em; }

  .counts { display: flex; gap: 1.75rem; margin: 0; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .78rem; }
  .counts div { display: flex; gap: .45rem; align-items: baseline; }
  .counts dt { color: var(--ink-soft); text-transform: uppercase; letter-spacing: .08em; }
  .counts dd { margin: 0; font-variant-numeric: tabular-nums; color: var(--ink-soft); }
  .counts strong { color: var(--ink); font-weight: 500; }
  .arrow { color: var(--brass); }

  .delta {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1.5rem 2rem;
    background: var(--panel); padding: 1.5rem; margin: 1.5rem 0 3rem;
    border-left: 3px solid var(--brass-dim);
  }
  .delta h4 {
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .7rem;
    text-transform: uppercase; letter-spacing: .1em; color: var(--ink-soft);
    margin: 0 0 .6rem; font-weight: 500;
  }
  .delta ul { margin: 0; padding-left: 1.1rem; font-size: .95rem; }
  .delta li { margin-bottom: .15rem; }
  .minus li::marker { content: '\\2212  '; color: var(--cut); }
  .plus li::marker { content: '+  '; color: var(--lapis); }
  .delta .none { margin: 0 0 .4rem; font-size: .95rem; color: var(--ink-soft); }
  .tag {
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .62rem;
    text-transform: uppercase; letter-spacing: .08em; padding: .1rem .4rem;
    border: 1px solid currentColor; margin-right: .35rem;
  }
  .tag--cut { color: var(--cut); }
  .tag--new { color: var(--lapis); }

  .stops { display: flex; flex-direction: column; gap: 3rem; }
  .stop { display: grid; grid-template-columns: 4.5rem 1fr; gap: 1.5rem; }
  .stop__index {
    display: flex; flex-direction: column; gap: .3rem; align-items: flex-start;
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    border-top: 2px solid var(--brass); padding-top: .5rem;
  }
  .stop__index > span:first-child { font-size: 1.3rem; color: var(--brass); font-variant-numeric: tabular-nums; }
  .stop__view { font-size: .64rem; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-soft); }
  .stop__body { min-width: 0; }
  .stop h3 { font-size: 1.45rem; font-weight: 500; margin: 0 0 .8rem; text-wrap: balance; letter-spacing: -0.01em; }

  .chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1.2rem; }
  .chip {
    display: inline-flex; flex-direction: column; gap: .1rem;
    border: 1px solid var(--rule); padding: .35rem .6rem; background: var(--panel);
  }
  .chip__name { font-size: .92rem; }
  .chip__meta {
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .64rem;
    color: var(--ink-soft); font-variant-numeric: tabular-nums;
  }
  .chip--missing { color: var(--cut); border-color: var(--cut); }

  .prose p { margin: 0 0 1rem; max-width: var(--measure); }
  .prose p:last-child { margin-bottom: 0; }
  .sources {
    font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: .68rem;
    line-height: 1.55; color: var(--ink-soft); margin: 1.1rem 0 0;
    max-width: var(--measure); padding-top: .6rem; border-top: 1px solid var(--rule);
  }
  .unused {
    font-size: .92rem; color: var(--ink-soft); margin: 2.5rem 0 0;
    max-width: var(--measure); border-left: 2px solid var(--rule); padding-left: 1rem;
  }

  @media (max-width: 34rem) {
    body { font-size: 18px; }
    .stop { grid-template-columns: 1fr; gap: .75rem; }
    .stop__index { flex-direction: row; align-items: baseline; gap: .75rem; }
  }
</style>

<div class="wrap">
  <header class="mast">
    <h1>Constellation Lore Journeys</h1>
    <p class="standfirst">Rebuilt from the Constellation Brain vault after the figures were migrated to Stellarium&rsquo;s western sky culture. Every star shown below exists in the app&rsquo;s current data; every claim traces to a named source.</p>
    <p class="note">Draft &middot; not yet wired into the app</p>
  </header>

  <nav class="toc">
    ${keys.map(k => `<a href="#${k}">${esc(draft[k].displayName)}</a>`).join('')}
  </nav>

  ${sections}
</div>
`

fs.mkdirSync(OUT.replace(/[/\\][^/\\]+$/, ''), {recursive: true})
fs.writeFileSync(OUT, html, 'utf8')
const stops = keys.reduce((n, k) => n + draft[k].stops.length, 0)
console.log(`wrote ${OUT} - ${keys.length} constellations, ${stops} stops`)
