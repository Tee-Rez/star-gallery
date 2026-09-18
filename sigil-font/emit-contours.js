// emit-contours.js - hand the outlines to the font compiler.
//
// The stroker lives in glyphs.js and nowhere else. Rather than reimplement mitre joins in Python
// and hope the two agree, build-font.py shells out to this and gets the exact contours the
// specimen page draws. One geometry implementation, so the .ttf cannot drift from what you saw.
//
//   node emit-contours.js --stroke 1.15 --mark 1.0

const {GLYPHS, CAP, GAP, SPACE, glyphContours} = require('./glyphs.js');

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? parseFloat(args[i + 1]) : dflt;
};
const stroke = arg('stroke', 1.15);
const mark = arg('mark', 1.0);

const out = {capHeight: CAP, gap: GAP, space: SPACE, stroke, mark, glyphs: {}};
for (const ch of Object.keys(GLYPHS)) {
  const g = GLYPHS[ch];
  out.glyphs[ch] = {
    advance: g.w,
    contours: glyphContours(g, stroke, mark).map(c => c.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)])),
  };
}
process.stdout.write(JSON.stringify(out));
