// js/hud-text-shader.js - colour inside the letterform.
//
// THE QUESTION THIS ANSWERS: "can I add colour to this font?"
//
// Three different things get called that, and only one of them works everywhere:
//
//  1. Colour per string. Already available - the `color` attribute on a-text, `color` in CSS.
//     Any font, no work. But the whole string is one colour.
//
//  2. A COLOUR FONT (COLRv1/CPAL, SVG-in-OpenType, CBDT). The font itself carries coloured
//     layers. Browsers render these in DOM text, and fontTools can add the tables to an existing
//     outline font. It is a dead end here: an MSDF atlas is a monochrome distance field and
//     Unity's TextMeshPro is single-channel SDF, so neither the in-world text nor the VR build
//     can carry colour layers. It would colour the 2D HUD only, and the HUD would then not match
//     itself across platforms.
//
//  3. Colour from the DISTANCE FIELD, in the shader. This one. The atlas gives a signed distance
//     to the glyph edge at every pixel, so "how deep inside the letter am I" is a number - and
//     anything can be driven from it: a rim in one colour, a brighter core in another, a glow
//     outside, gold pooled in the middle exactly as the carved stone panels do. It is per-pixel,
//     resolution independent, works with ANY font we put through the atlas, and the same maths
//     ports to a TMP shader for Unity.
//
// WHY THIS IS REGISTERED AS ITS OWN SHADER RATHER THAN PATCHING THE BUILT-IN: a-text force-selects
// its own msdf shader when the font URL contains '-msdf.'. Our atlases are deliberately not named
// that way, so the shader named on the entity is honoured.
//
// ALPHATEST MUST COME DOWN. The built-in discards everything below 0.5, which is exactly the band
// outside the glyph edge where a rim and a glow live. Left at the default the outline is clipped
// away and only the fill survives.

/* global AFRAME */

const VERT = `#version 300 es
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
// a-text's geometry gives position as TWO components, not three - it is a flat run of quads.
in vec2 position;
in vec2 uv;
out vec2 vUV;
void main() {
  vUV = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D map;
uniform vec3 color;        // the fill
uniform vec3 edgeColor;    // a rim just inside the edge
uniform vec3 coreColor;    // deeper inside again - the inlay
uniform vec3 glowColor;    // outside the glyph
uniform float edgeWidth, coreWidth, glowWidth, glowStrength;
uniform float opacity, alphaTest;
uniform bool negate;
in vec2 vUV;
out vec4 fragColor;

float median(float r, float g, float b) { return max(min(r, g), min(max(r, g), b)); }

void main() {
  vec3 s = texture(map, vUV).rgb;
  if (negate) s = 1.0 - s;
  // The signed distance to the glyph edge: positive inside, negative outside, in texel units
  // until fwidth converts it to screen pixels. Everything below reads off this one number.
  float sigDist = median(s.r, s.g, s.b) - 0.5;
  float px = max(fwidth(sigDist), 1e-5);
  float inside = clamp(sigDist / px + 0.5, 0.0, 1.0);        // the glyph itself, anti-aliased
  float depth = sigDist / px;                                // pixels inside the edge

  // Bands measured in PIXELS from the edge, so the colour treatment holds its proportions as the
  // text moves nearer or further - which a band measured in texels would not.
  float core = smoothstep(coreWidth, coreWidth + 1.5, depth);
  float rim = smoothstep(edgeWidth + 1.5, edgeWidth, depth) * inside;

  vec3 c = color;
  c = mix(c, edgeColor, rim);
  c = mix(c, coreColor, core);

  float a = inside;
  // The glow lives OUTSIDE the glyph, where alphaTest would have discarded it.
  float glow = exp(-max(-depth, 0.0) / max(glowWidth, 0.001)) * (1.0 - inside) * glowStrength;
  c += glowColor * glow;
  a = max(a, glow);

  a *= opacity;
  if (a < alphaTest) discard;
  fragColor = vec4(c, a);
}`

const hudTextShader = {
  schema: {
    // a-text sets these three itself; they must exist or it throws.
    color: {type: 'color', is: 'uniform', default: '#ffffff'},
    map: {type: 'map', is: 'uniform'},
    opacity: {type: 'number', is: 'uniform', default: 1},
    alphaTest: {type: 'number', is: 'uniform', default: 0.02},
    negate: {type: 'boolean', is: 'uniform', default: false},

    edgeColor: {type: 'color', is: 'uniform', default: '#f0b458'},
    edgeWidth: {type: 'number', is: 'uniform', default: 1.6},
    coreColor: {type: 'color', is: 'uniform', default: '#ffffff'},
    coreWidth: {type: 'number', is: 'uniform', default: 2.6},
    glowColor: {type: 'color', is: 'uniform', default: '#f0b458'},
    glowWidth: {type: 'number', is: 'uniform', default: 1.4},
    glowStrength: {type: 'number', is: 'uniform', default: 0.0},
  },
  raw: true,
  vertexShader: VERT,
  fragmentShader: FRAG,
}

if (typeof AFRAME !== 'undefined' && !AFRAME.shaders['hud-text']) {
  AFRAME.registerShader('hud-text', hudTextShader)
}

export {hudTextShader, VERT, FRAG}
export default hudTextShader
