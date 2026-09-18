// glyphs.js - SIGIL INSCRIPTIONAL, the source of truth.
//
// This file is the typeface. Everything else - the specimen page, the .ttf, the MSDF atlas, the
// GLSL segment tables - is generated from it, and build-font.py parses this exact file rather
// than keeping a second copy.
//
// APPROVED DESIGN (concepts/font/full-slab-A-M.jpg, full-slab-N-Z.jpg, digits-v2-recommended.jpg)
//
// The alphabet has a vocabulary of four shapes and sticks to it. That is what makes it read as
// one designed system rather than 40 separate drawings:
//
//   DIAMOND   the closed bowl.     O, and by extension 0, 6, 8, 9.
//   TRIANGLE  the open bowl.       B, D, P, R - bowls that meet a stem.
//   CHEVRON   the open letter.     C, and G which is C plus a bar.
//   BRACKET   the flat-bottomed.   U, J, and the square feet of E, L, T.
//
// The numerals fall out of that vocabulary rather than being invented: 8 is two stacked diamonds
// because O is a diamond, 6 and 9 are a diamond with a stroke rising or falling from it, and 3 is
// B with its stem removed. That is why the second digit sheet reads and the first one did not -
// the first drew 8 as a triangle stack, and triangles are reserved for bowls that touch a stem.
//
// GEOMETRY. Each glyph is `s` (stroke skeletons: polylines on a 10-unit grid, y up, baseline 0,
// cap height 10) and `m` (marks: the small occult satellites, [x, y, type] where type is
// 0 dot / 1 ring / 2 crescent). A polyline whose last point equals its first is a CLOSED loop and
// is stroked as an annulus; everything else is stroked open with mitred joins.
//
// Stroke weight, mark size and mark presence are applied at render time, never baked in here -
// so a display cut with marks and a text cut without are the same data, and a second weight is a
// number rather than a second alphabet.

const CAP = 10;      // cap height in grid units
const GAP = 1.4;     // space between glyphs, in grid units
const SPACE = 3.2;   // the word space advance

const GLYPHS = {
  // ---- letters: fusion 1 ----------------------------------------------------------------------
  'A': {w: 6.2, s: [[[0, 0], [3.1, 10], [6.2, 0]], [[1.15, 3.1], [5.05, 3.1]]], m: [[3.1, 4.6, 0]]},
  'B': {w: 6.0, s: [[[0, 0], [0, 10]], [[0, 10], [5.5, 7.6], [0, 5.2]], [[0, 5.2], [5.9, 2.6], [0, 0]]], m: [[6.5, 8.8, 1]]},
  'C': {w: 5.8, s: [[[5.8, 10], [0, 5.0], [5.8, 0]]], m: [[6.6, 10.4, 0]]},
  'D': {w: 6.2, s: [[[0, 0], [0, 10], [6.2, 5.0], [0, 0]]], m: [[6.9, 5.0, 0]]},
  'E': {w: 5.6, s: [[[5.6, 10], [0, 10], [0, 0], [5.6, 0]], [[0, 5.0], [4.4, 5.0]]], m: [[5.3, 5.0, 1]]},
  'F': {w: 5.6, s: [[[5.6, 10], [0, 10], [0, 0]], [[0, 5.4], [4.4, 5.4]]], m: [[5.3, 5.4, 2]]},
  'G': {w: 6.0, s: [[[6.0, 10], [0, 5.0], [6.0, 0], [6.0, 4.4], [3.6, 4.4]]], m: [[6.7, 10.4, 1]]},
  'H': {w: 6.0, s: [[[0, 10], [0, 0]], [[6.0, 10], [6.0, 0]], [[0, 5.0], [6.0, 5.0]]], m: [[3.0, 6.7, 0]]},
  'I': {w: 1.3, s: [[[0.65, 10], [0.65, 0]]], m: [[0.65, 11.1, 0]]},
  'J': {w: 5.2, s: [[[5.2, 10], [5.2, 2.0], [2.6, 0], [0, 2.0]]], m: [[5.2, 11.1, 2]]},
  'K': {w: 6.0, s: [[[0, 10], [0, 0]], [[6.0, 10], [0.2, 5.0], [6.0, 0]]], m: [[6.7, 10.3, 0]]},
  'L': {w: 5.2, s: [[[0, 10], [0, 0], [5.2, 0]]], m: [[5.9, 0, 0]]},
  'M': {w: 7.4, s: [[[0, 0], [0, 10], [3.7, 4.2], [7.4, 10], [7.4, 0]]], m: [[3.7, 2.8, 0]]},
  'N': {w: 6.2, s: [[[0, 0], [0, 10], [6.2, 0], [6.2, 10]]], m: [[6.2, 11.1, 0]]},
  'O': {w: 6.2, s: [[[3.1, 10], [6.2, 5.0], [3.1, 0], [0, 5.0], [3.1, 10]]], m: [[3.1, 11.1, 0]]},
  'P': {w: 5.8, s: [[[0, 0], [0, 10], [5.8, 7.4], [0, 4.8]]], m: [[6.5, 9.0, 1]]},
  'Q': {w: 6.2, s: [[[3.1, 10], [6.2, 5.0], [3.1, 0], [0, 5.0], [3.1, 10]], [[4.3, 2.1], [6.6, -0.5]]], m: [[3.1, 11.1, 0]]},
  'R': {w: 6.0, s: [[[0, 0], [0, 10], [5.6, 7.4], [0, 4.8]], [[2.7, 4.8], [6.0, 0]]], m: [[6.5, 9.0, 0]]},
  // S is the one letter with no obvious angular answer: two opposed hooks joined by a long
  // diagonal. The horizontal top and bottom are what separate it from Z, which has flat bars.
  'S': {w: 5.8, s: [[[5.8, 8.6], [4.3, 10], [1.3, 10], [0, 8.5], [0, 7.1], [5.8, 3.1], [5.8, 1.5], [4.4, 0], [1.2, 0], [0, 1.4]]], m: [[6.5, 10.4, 0]]},
  'T': {w: 5.8, s: [[[0, 10], [5.8, 10]], [[2.9, 10], [2.9, 0]]], m: [[6.5, 10.0, 0]]},
  'U': {w: 6.0, s: [[[0, 10], [0, 0], [6.0, 0], [6.0, 10]]], m: [[6.7, 10.0, 0]]},
  'V': {w: 6.2, s: [[[0, 10], [3.1, 0], [6.2, 10]]], m: [[6.9, 10.3, 0]]},
  'W': {w: 8.6, s: [[[0, 10], [2.0, 0], [4.3, 6.2], [6.6, 0], [8.6, 10]]], m: [[9.3, 10.3, 0]]},
  'X': {w: 6.0, s: [[[0, 10], [6.0, 0]], [[6.0, 10], [0, 0]]], m: [[6.7, 10.3, 0]]},
  'Y': {w: 6.0, s: [[[0, 10], [3.0, 5.2], [6.0, 10]], [[3.0, 5.2], [3.0, 0]]], m: [[6.7, 10.3, 0]]},
  'Z': {w: 5.8, s: [[[0, 10], [5.8, 10], [0, 0], [5.8, 0]]], m: [[6.5, 10.4, 0]]},

  // ---- numerals: digits v2 ---------------------------------------------------------------------
  // The diamond does the work of every round bowl, which is what makes these sit with the letters.
  '0': {w: 6.0, s: [[[3.0, 10], [6.0, 5.0], [3.0, 0], [0, 5.0], [3.0, 10]]], m: [[3.0, 5.0, 0]]},
  '1': {w: 3.4, s: [[[0, 7.6], [1.9, 10], [1.9, 0]]], m: [[2.9, 10.2, 0]]},
  '2': {w: 5.6, s: [[[0, 8.6], [1.4, 10], [4.2, 10], [5.6, 8.6], [5.6, 7.2], [0, 0], [5.6, 0]]], m: [[6.3, 0, 0]]},
  // 3 is B with the stem taken away - two bowls opening left, and a flat top so it cannot be read
  // as a zigzag rune the way the first attempt was.
  '3': {w: 5.8, s: [[[0.4, 10], [5.2, 10], [1.9, 5.5], [5.8, 5.5], [5.8, 1.5], [4.3, 0], [1.1, 0], [0, 1.3]]], m: [[6.5, 10.2, 0]]},
  '4': {w: 6.0, s: [[[4.5, 0], [4.5, 10], [0, 3.3], [6.0, 3.3]]], m: [[6.7, 3.3, 0]]},
  '5': {w: 5.8, s: [[[5.6, 10], [0.6, 10], [0.1, 5.7], [4.3, 5.4], [5.8, 3.4], [4.1, 0], [0, 1.2]]], m: [[6.3, 10.2, 2]]},
  '6': {w: 5.8, s: [[[5.2, 10], [0.4, 3.3]], [[0.4, 3.3], [2.9, 5.5], [5.5, 3.3], [2.9, 0.1], [0.4, 3.3]]], m: [[5.9, 10.2, 0]]},
  '7': {w: 5.6, s: [[[0, 10], [5.6, 10], [1.9, 0]]], m: [[6.3, 10.2, 0]]},
  '8': {w: 5.8, s: [[[2.9, 10], [5.2, 7.6], [2.9, 5.2], [0.6, 7.6], [2.9, 10]], [[2.9, 5.2], [5.8, 2.6], [2.9, 0], [0, 2.6], [2.9, 5.2]]], m: [[6.3, 7.6, 0]]},
  '9': {w: 5.8, s: [[[2.9, 10], [5.4, 7.4], [2.9, 4.8], [0.4, 7.4], [2.9, 10]], [[5.4, 7.4], [1.0, 0]]], m: [[0.2, 0.2, 0]]},

  // ---- punctuation -------------------------------------------------------------------------------
  '.': {w: 1.2, s: [[[0.6, 0.5], [0.6, 0.5]]], m: []},
  ',': {w: 1.4, s: [[[0.9, 0.7], [0.1, -1.4]]], m: []},
  ':': {w: 1.2, s: [[[0.6, 0.5], [0.6, 0.5]], [[0.6, 5.2], [0.6, 5.2]]], m: []},
  '-': {w: 4.2, s: [[[0.3, 5.0], [3.9, 5.0]]], m: []},
  '/': {w: 4.6, s: [[[0, -0.6], [4.6, 10.4]]], m: []},
  "'": {w: 1.2, s: [[[0.6, 10], [0.6, 7.4]]], m: []},
  '!': {w: 1.3, s: [[[0.65, 10], [0.65, 2.6]], [[0.65, 0.5], [0.65, 0.5]]], m: []},
  '?': {w: 5.2, s: [[[0, 8.5], [1.5, 10], [3.7, 10], [5.2, 8.5], [5.2, 7.0], [2.6, 4.6], [2.6, 2.8]], [[2.6, 0.5], [2.6, 0.5]]], m: [[5.9, 10.2, 0]]},
  '(': {w: 3.0, s: [[[2.8, 10.4], [0.5, 7.2], [0.5, 2.8], [2.8, -0.4]]], m: []},
  ')': {w: 3.0, s: [[[0.2, 10.4], [2.5, 7.2], [2.5, 2.8], [0.2, -0.4]]], m: []},
  '+': {w: 5.4, s: [[[0.3, 5.0], [5.1, 5.0]], [[2.7, 7.4], [2.7, 2.6]]], m: []},
  '·': {w: 2.2, s: [[[1.1, 5.0], [1.1, 5.0]]], m: []},
};

// =================================================================================================
// STROKING
//
// The old build overlapped a quad per segment with a lozenge at each vertex and let the non-zero
// fill rule union them. That was cheap but it blunted every apex with a diamond, which is exactly
// the spur the approved drawings do not have. This builds ONE mitred contour per polyline instead:
// offset both sides, intersect consecutive edges to get a true mitre, and fall back to a bevel
// only where the angle is too sharp to mitre without a spike.
// =================================================================================================
const MITER_LIMIT = 4.0;

// Winding decides what is solid and what is a hole under the non-zero rule, in SVG and in
// TrueType alike. Rather than reason about it per shape, every contour is forced: filled shapes
// clockwise, holes counter-clockwise. Get this wrong and an O fills in solid.
function area(c) {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i], q = c[(i + 1) % c.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;                       // positive is counter-clockwise with y up
}
function orient(c, wantCW) {
  const cw = area(c) < 0;
  return cw === wantCW ? c : c.slice().reverse();
}

function unitsAndNormals(line, half) {
  const dirs = [], nrms = [];
  for (let i = 0; i < line.length - 1; i++) {
    const dx = line[i + 1][0] - line[i][0], dy = line[i + 1][1] - line[i][1];
    const L = Math.hypot(dx, dy) || 1;
    dirs.push([dx / L, dy / L]);
    nrms.push([-dy / L * half, dx / L * half]);
  }
  return {dirs, nrms};
}

// Where do the two offset edges meet? Solving for the intersection is what produces a sharp point
// at an apex instead of a rounded or chopped one.
function meet(pt, nA, dA, nB, dB) {
  const ax = pt[0] + nA[0], ay = pt[1] + nA[1];
  const bx = pt[0] + nB[0], by = pt[1] + nB[1];
  const den = dA[0] * dB[1] - dA[1] * dB[0];
  if (Math.abs(den) < 1e-9) return [bx, by];        // parallel: no corner to cut
  const t = ((bx - ax) * dB[1] - (by - ay) * dB[0]) / den;
  return [ax + dA[0] * t, ay + dA[1] * t];
}

function isClosed(line) {
  const a = line[0], b = line[line.length - 1];
  return line.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
}

// An open polyline: one contour, up one side and back down the other, with flat caps.
function strokeOpen(line, half) {
  const {dirs, nrms} = unitsAndNormals(line, half);
  const n = line.length;
  const side = (sg) => {
    const out = [[line[0][0] + sg * nrms[0][0], line[0][1] + sg * nrms[0][1]]];
    for (let i = 1; i < n - 1; i++) {
      const nA = [sg * nrms[i - 1][0], sg * nrms[i - 1][1]];
      const nB = [sg * nrms[i][0], sg * nrms[i][1]];
      const p = meet(line[i], nA, dirs[i - 1], nB, dirs[i]);
      if (Math.hypot(p[0] - line[i][0], p[1] - line[i][1]) <= half * MITER_LIMIT) out.push(p);
      else { out.push([line[i][0] + nA[0], line[i][1] + nA[1]]); out.push([line[i][0] + nB[0], line[i][1] + nB[1]]); }
    }
    out.push([line[n - 1][0] + sg * nrms[n - 2][0], line[n - 1][1] + sg * nrms[n - 2][1]]);
    return out;
  };
  return [orient(side(1).concat(side(-1).reverse()), true)];
}

// A closed loop: two contours, an outer and an inner, so the counter of an O is a real hole.
function strokeClosed(line, half) {
  const pts = line.slice(0, -1), n = pts.length;
  const dirs = [], nrms = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
    const L = Math.hypot(dx, dy) || 1;
    dirs.push([dx / L, dy / L]);
    nrms.push([-dy / L * half, dx / L * half]);
  }
  const ring = (sg) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = (i - 1 + n) % n;
      const nA = [sg * nrms[k][0], sg * nrms[k][1]];
      const nB = [sg * nrms[i][0], sg * nrms[i][1]];
      const p = meet(pts[i], nA, dirs[k], nB, dirs[i]);
      if (Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]) <= half * MITER_LIMIT) out.push(p);
      else { out.push([pts[i][0] + nA[0], pts[i][1] + nA[1]]); out.push([pts[i][0] + nB[0], pts[i][1] + nB[1]]); }
    }
    return out;
  };
  // Which side is outside depends on which way the loop was drawn, so ask the loop rather than
  // assuming: a clockwise loop puts its outer edge on the +1 side, a counter-clockwise one does not.
  const sg = area(pts) < 0 ? 1 : -1;
  return [orient(ring(sg), true), orient(ring(-sg), false)];
}

// A degenerate one-point "line" is a dot - the period, the colon, the point of an exclamation.
function dotContour(p, r) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    out.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]);
  }
  return out;
}

// ---- the marks ----------------------------------------------------------------------------------
// Three shapes and no more. A vocabulary this small is what stops the satellites reading as noise;
// each is built from octagons so a ring and a crescent are just a hole placed differently.
function poly(cx, cy, r, sides, rot) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + (rot || 0);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
function markContours(mark, scale) {
  const [x, y, type] = mark;
  const r = 0.42 * scale;
  if (type === 1) return [orient(poly(x, y, r, 8, 0.4), true), orient(poly(x, y, r * 0.48, 8, 0.4), false)];
  if (type === 2) return [orient(poly(x, y, r, 8, 0.4), true), orient(poly(x + r * 0.44, y + r * 0.22, r * 0.8, 8, 0.4), false)];
  return [orient(poly(x, y, r * 0.62, 8, 0.4), true)];
}

// ---- one glyph ----------------------------------------------------------------------------------
function glyphContours(g, stroke, markScale) {
  const half = stroke / 2, out = [];
  for (const line of g.s) {
    if (line.length === 2 && Math.hypot(line[0][0] - line[1][0], line[0][1] - line[1][1]) < 1e-6) {
      out.push(orient(dotContour(line[0], half * 1.15), true));
    } else if (isClosed(line)) {
      for (const c of strokeClosed(line, half)) out.push(c);
    } else {
      for (const c of strokeOpen(line, half)) out.push(c);
    }
  }
  if (markScale > 0) for (const m of (g.m || [])) for (const c of markContours(m, markScale)) out.push(c);
  return out;
}

if (typeof window !== 'undefined') window.SIGIL_GLYPHS = {GLYPHS, CAP, GAP, SPACE, glyphContours, isClosed};
if (typeof module !== 'undefined') module.exports = {GLYPHS, CAP, GAP, SPACE, glyphContours, isClosed};
