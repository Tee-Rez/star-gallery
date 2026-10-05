// tools/lib/brain-lore.mjs - a vault note's lore, with everything the app must not show removed.
//
// The Constellation Brain holds three provenance tiers - public-domain quotes, sourced
// paraphrase, and labelled AI synthesis - and one deliberately non-historical tradition,
// Starseed, kept there as a dated control case. The app's star panel and journey take only
// sourced, historical lore. This is the one place that rule is enforced in code rather than
// left to whoever is writing the journey.
//
// Starseed is dropped by name. It is the vault's only modern tradition by design (Home.md);
// if another is ever added, it belongs in MODERN too.
import fs from 'node:fs'
import path from 'node:path'

const MODERN = ['starseed']
const LORE_HEADINGS = /^##\s+(Names and lore|Names|Across traditions)\s*$/i
const SYNTHESIS_OPEN = /^>\s*\[!warning\]\s*Synthesis/i

function sourceNames(vault) {
  const dir = path.join(vault, 'sources')
  return new Set(fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)))
}

// Remove every synthesis callout: its opening line and every `>` line that continues it.
function stripSynthesis(lines) {
  const out = []
  let dropped = 0
  for (let i = 0; i < lines.length; i++) {
    if (SYNTHESIS_OPEN.test(lines[i])) {
      dropped++
      while (i + 1 < lines.length && /^>/.test(lines[i + 1])) i++
      continue
    }
    out.push(lines[i])
  }
  return {lines: out, dropped}
}

function byHeading(body) {
  const subs = []
  for (const l of body) {
    const h = l.match(/^###\s+(.+?)\s*$/)
    if (h) subs.push({culture: h[1], lines: []})
    else if (subs.length) subs[subs.length - 1].lines.push(l)
  }
  return subs
}

// A bold label opens a section, and the next label or synthesis callout closes it - not a blank
// line, since one tradition can run to several paragraphs and a quote callout. Synthesis callouts
// here sit BETWEEN sections rather than inside one, so they are counted as dropped on the spot -
// they would otherwise vanish without being recorded.
function byBoldLabel(body, result) {
  const subs = []
  let current = null
  for (let i = 0; i < body.length; i++) {
    const l = body[i]
    if (!l.trim()) { if (current) current.lines.push(l); continue }
    if (SYNTHESIS_OPEN.test(l)) {
      result.dropped.synthesis++
      while (i + 1 < body.length && /^>/.test(body[i + 1])) i++
      current = null
      continue
    }
    const label = l.match(/^\*\*([^*]+?)\.?\*\*\s*(.*)$/)
    if (label) {
      current = {culture: label[1].trim(), lines: [label[2]]}
      subs.push(current)
    } else if (current) {
      current.lines.push(l)
    }
  }
  return subs
}

export function readStarLore(vault, noteRelPath) {
  const text = fs.readFileSync(path.join(vault, noteRelPath), 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)
  const sources = sourceNames(vault)
  const result = {sections: [], dropped: {synthesis: 0, starseed: 0}}

  const start = lines.findIndex(l => LORE_HEADINGS.test(l))
  if (start === -1) return result
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l) && !/^###/.test(l))
  if (end === -1) end = lines.length
  const body = lines.slice(start + 1, end)

  // Star notes split their lore into `### <Culture>` subsections; constellation notes label each
  // tradition as a bold paragraph instead - `**Greek and Roman.** The lyre is ...`.
  const hasHeadings = body.some(l => /^###\s/.test(l))
  const subs = hasHeadings ? byHeading(body) : byBoldLabel(body, result)

  for (const sub of subs) {
    if (MODERN.includes(sub.culture.toLowerCase())) {
      result.dropped.starseed++
      continue
    }
    const {lines: kept, dropped} = stripSynthesis(sub.lines)
    result.dropped.synthesis += dropped
    const prose = kept.join('\n').trim()
    if (!prose) continue
    const links = [...prose.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map(m => m[1].trim())
    result.sections.push({
      culture: sub.culture,
      text: prose,
      citations: [...new Set(links.filter(l => sources.has(l)))],
    })
  }
  return result
}
