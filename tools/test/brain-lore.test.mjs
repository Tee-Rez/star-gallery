// Against the REAL vault, deliberately: Vega's note carries both of the things that must never
// reach the app - a labelled AI-synthesis callout and a Starseed section.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readStarLore} from '../lib/brain-lore.mjs'

const VAULT = 'C:/Users/TearS/STAR-Arts/Consetellations/Constellation Brain'

test('Vega keeps its historical cultures and loses synthesis and Starseed', () => {
  const lore = readStarLore(VAULT, 'stars/Vega.md')
  const cultures = lore.sections.map(s => s.culture)
  assert.ok(cultures.includes('Arabic') && cultures.includes('Greek'), cultures.join(','))
  assert.ok(!cultures.includes('Starseed'))
  const kept = lore.sections.map(s => s.text).join('\n')
  assert.doesNotMatch(kept, /Synthesis/)
  assert.doesNotMatch(kept, /\[!warning\]/)
  assert.doesNotMatch(kept, /Royal and Priest/)
  assert.ok(lore.dropped.synthesis >= 1)
  assert.equal(lore.dropped.starseed, 1)
})

test('citations are only links to source notes, not to stars or cultures', () => {
  const lore = readStarLore(VAULT, 'stars/Vega.md')
  const arabic = lore.sections.find(s => s.culture === 'Arabic')
  assert.ok(arabic.citations.includes('Allen 1899'), arabic.citations.join(','))
  assert.ok(arabic.citations.includes('Kunitzsch and Smart 2006'))
  for (const s of lore.sections) {
    assert.ok(!s.citations.includes('Altair') && !s.citations.includes('Arabic'))
  }
})

// Constellation notes label each tradition as a bold paragraph - "**Arabic.** ..." - rather than
// a ### subsection, so the reader has to handle both. An earlier version of this test only
// checked Lyra did not crash, and passed while returning nothing at all.
test('a constellation note reads its bold-labelled traditions, filtered the same way', () => {
  const lore = readStarLore(VAULT, 'constellations/Lyra.md')
  const byCulture = Object.fromEntries(lore.sections.map(s => [s.culture, s]))
  assert.deepEqual(Object.keys(byCulture).sort(), ['Arabic', 'Chinese', 'Greek and Roman', 'Summer Triangle'])
  // A tradition runs across paragraphs and a quote: Ptolemy is cited in the LAST paragraph of the
  // Greek section, after a blank line and a [!quote] callout.
  assert.ok(byCulture['Greek and Roman'].citations.includes('Ptolemy Almagest'))
  assert.ok(byCulture['Greek and Roman'].citations.includes('Catasterismi'))
  assert.ok(byCulture['Arabic'].citations.includes('Allen 1899'))
  assert.match(byCulture['Greek and Roman'].text, /Orpheus/)
  assert.doesNotMatch(byCulture['Greek and Roman'].text, /^\*\*/)
  const kept = lore.sections.map(s => s.text).join('\n')
  assert.doesNotMatch(kept, /Royal and Priest|Synthesis|\[!warning\]/)
  assert.equal(lore.dropped.starseed, 1)
  assert.equal(lore.dropped.synthesis, 2)
})

test('a section with no source citation is kept but marked unsourced', () => {
  const lore = readStarLore(VAULT, 'stars/Sheliak.md')
  const greek = lore.sections.find(s => s.culture === 'Greek')
  assert.deepEqual(greek.citations, [])
})

test('a note with no lore section reads as empty, not as an error', () => {
  const lore = readStarLore(VAULT, 'sources/Allen 1899.md')
  assert.deepEqual(lore.sections, [])
})
