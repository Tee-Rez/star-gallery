// js/hud-face.js - which typeface the HUD wears, in one place.
//
// Swapping the face used to mean editing three call sites and a stylesheet. It is now one line:
// change ACTIVE. Both faces stay in assets/fonts, so switching back to compare is instant - which
// is the whole point while the look is still being decided.
//
// THE FILENAME IS LOAD-BEARING. a-text overrides whatever `shader` you ask for when the font is
// one of A-Frame's built-in keys, or when the URL contains the literal substring '-msdf.'.
// Neither atlas below is named that way, so the `shader` named here is honoured - which is what
// leaves room for a carved shader later without renaming assets.
//
// NEGATE MUST BE FALSE. It defaults to true only because A-Frame's own Roboto atlas is stored
// inverted. Atlases from msdf-bmfont-xml are not, and at the default every glyph renders as its
// own hole: the text vanishes with nothing in the console to explain it.

// Registering the shader is a side effect of importing it.
import './hud-text-shader'

const FACES = {
  // Origin Tech, by RoninDesign. NON-COMMERCIAL licence - personal use only; a commercial
  // release needs a licence from Ronindesign.id@gmail.com. See star-gallery/origin-tech/.
  origin: {
    atlas: 'assets/fonts/origintech-atlas.json',
    family: "'Origin Tech'",
    shader: 'msdf',
    negate: false,
    letterSpacing: 1.5,
    // It HAS lowercase outlines, but they are drawn at near cap height (a: 704 vs A: 743), so
    // the face reads as unicase whatever case the string is in.
    unicase: true,
    // Origin Tech is a wide face - about 37% wider than Arial at the same size - so it needs
    // less tracking than a narrow inscriptional one, and long labels wrap sooner.
    tracking: '0.02em',
  },
  // Sigil Inscriptional, drawn for this project. Caps only - lowercase maps to small caps.
  sigil: {
    atlas: 'assets/fonts/sigil-msdf.json',
    family: "'Sigil Display'",
    shader: 'msdf',
    negate: false,
    letterSpacing: 1.5,
    unicase: true,
    tracking: '0.06em',
  },
}

const ACTIVE = 'origin'
const FACE = FACES[ACTIVE]
const FONT = FACE.atlas

// Apply the active face to an <a-text>. Nothing else about the entity is touched.
function faceText(el) {
  el.setAttribute('font', FACE.atlas)
  el.setAttribute('shader', FACE.shader)
  el.setAttribute('negate', String(FACE.negate))
  el.setAttribute('letter-spacing', FACE.letterSpacing)
  return el
}

// THE SAME FACE, FOR A text COMPONENT RATHER THAN AN <a-text>.
//
// faceText() above works only because <a-text> is a PRIMITIVE, and a primitive maps a handful
// of attributes - font, shader, negate, letter-spacing - onto the component behind it. A plain
// <a-entity> carrying a text component has no such mapping, so setAttribute('font', atlas)
// there sets an inert HTML attribute, the component keeps its default, and the label renders
// in Roboto with nothing in the console to say so. Measured rather than assumed: on an
// a-entity, text.data.font reads 'roboto' while getAttribute('font') reads the atlas path
// (orion/src/_btntest.html).
//
// Note the case change. The attribute is letter-spacing; the component property is
// letterSpacing, and passing the hyphenated form in an object is silently ignored.
function faceProps(extra) {
  return Object.assign({
    font: FACE.atlas,
    shader: FACE.shader,
    negate: FACE.negate,
    letterSpacing: FACE.letterSpacing,
  }, extra)
}

export {FACES, FACE, ACTIVE, FONT, faceText, faceProps}
export default faceText
