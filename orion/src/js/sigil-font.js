// js/sigil-font.js - the in-world face, in one place.
//
// a-text renders from an MSDF atlas: a JSON of glyph metrics plus a PNG whose RGB channels hold a
// multi-channel distance field. That is how the built-in fonts work too, so a custom face is a
// swap rather than a new pipeline - it is only the details below that are easy to get wrong.
//
// THE FILENAME IS LOAD-BEARING. A-Frame overrides whatever `shader` you ask for when the font is
// one of its built-in keys, or when the URL contains the literal substring '-msdf.'. Our file is
// named sigil-msdf.json precisely so it takes the msdf shader automatically. If a carved shader
// is added later, the file has to be RENAMED so that override stops firing.
//
// NEGATE MUST BE FALSE. It defaults to true, purely because A-Frame's own Roboto atlas is stored
// inverted. An atlas from msdf-bmfont-xml is not, and left at the default every glyph renders as
// its own hole - the text disappears and nothing in the console says why.
//
// fontImage is deliberately NOT set: a-text resolves the PNG from the JSON's pages[0] relative to
// the JSON, and the build pins pages[0] to a bare filename so that resolution works.

const FONT = 'assets/fonts/sigil-msdf.json'

// Apply the face to an <a-text>. Everything else about the entity is left alone.
function sigilText(el) {
  el.setAttribute('font', FONT)
  el.setAttribute('negate', 'false')
  // Inscriptional capitals were cut with air between them; set solid they close up.
  el.setAttribute('letter-spacing', 1.5)
  return el
}

export {FONT, sigilText}
export default sigilText
