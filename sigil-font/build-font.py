# build-font.py - compile Sigil Inscriptional into a real .ttf and .woff2
#
# The typeface is glyphs.js. This script does not know how to draw a letter: it asks
# emit-contours.js (node) for the outlines, so the font file and the specimen page are produced by
# the same stroker and cannot drift apart.
#
#   python build-font.py
#   python build-font.py --stroke 1.3 --mark 0        # the text cut: no satellite marks
#
# Lowercase maps to the same capitals at small-cap size. An inscriptional face has no minuscule,
# and a round lowercase beside a cut capital breaks the illusion immediately.

import json, os, subprocess, argparse, base64, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def contours_from_node(stroke, mark):
    r = subprocess.run(
        ["node", os.path.join(HERE, "emit-contours.js"), "--stroke", str(stroke), "--mark", str(mark)],
        capture_output=True, cwd=HERE, shell=(os.name == "nt"))
    if r.returncode != 0:
        sys.exit("emit-contours.js failed:\n" + r.stderr.decode("utf8", "replace"))
    return json.loads(r.stdout.decode("utf8"))

GLYPH_NAMES = {
    ' ': 'space', '.': 'period', ',': 'comma', ':': 'colon', '-': 'hyphen', '/': 'slash',
    "'": 'quotesingle', '!': 'exclam', '?': 'question', '(': 'parenleft', ')': 'parenright',
    '+': 'plus', '·': 'periodcentered',
}
DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

def name_for(ch):
    if ch in GLYPH_NAMES: return GLYPH_NAMES[ch]
    if ch.isdigit(): return DIGITS[int(ch)]
    return ch

def build():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stroke", type=float, default=1.15)
    ap.add_argument("--mark", type=float, default=1.0, help="satellite mark size; 0 for the text cut")
    ap.add_argument("--smallcap", type=float, default=0.78)
    ap.add_argument("--name", default="Sigil Inscriptional")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    data = contours_from_node(args.stroke, args.mark)
    UPM, CAP_UNITS = 1000, 700
    K = CAP_UNITS / data["capHeight"]          # grid units -> font units
    SIDE = (data["gap"] / 2.0) * K             # half the inter-glyph gap, each side

    glyphs, hmtx, cmap = {}, {}, {}

    pen = TTGlyphPen(None); glyphs['.notdef'] = pen.glyph(); hmtx['.notdef'] = (int(4 * K), 0)
    pen = TTGlyphPen(None); glyphs['space'] = pen.glyph()
    hmtx['space'] = (int(data["space"] * K), 0); cmap[ord(' ')] = 'space'

    def add(ch, scale, suffix=""):
        g = data["glyphs"][ch]
        nm = name_for(ch) + suffix
        pen = TTGlyphPen(None)
        for c in g["contours"]:
            pen.moveTo((round(c[0][0] * scale * K + SIDE), round(c[0][1] * scale * K)))
            for p in c[1:]:
                pen.lineTo((round(p[0] * scale * K + SIDE), round(p[1] * scale * K)))
            pen.closePath()
        glyphs[nm] = pen.glyph()
        hmtx[nm] = (int(round(g["advance"] * scale * K + SIDE * 2)), int(SIDE))
        return nm

    for ch in data["glyphs"]:
        nm = add(ch, 1.0)
        cmap[ord(ch)] = nm
        if ch.isalpha():
            cmap[ord(ch.lower())] = add(ch, args.smallcap, ".sc")

    order = ['.notdef', 'space'] + [n for n in glyphs if n not in ('.notdef', 'space')]
    ps = args.name.replace(" ", "")

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(hmtx)
    fb.setupHorizontalHeader(ascent=int(0.82 * UPM), descent=-int(0.18 * UPM))
    fb.setupNameTable({
        "familyName": args.name, "styleName": "Regular",
        "uniqueFontIdentifier": ps + "-Regular", "fullName": args.name + " Regular",
        "psName": ps + "-Regular", "version": "Version 2.000", "designer": "STAR Arts",
        "description": "Angular inscriptional capitals with alchemical marks, for the temple HUD. "
                       "Generated from a skeleton table; stroke weight and mark size are parameters.",
    })
    fb.setupOS2(sTypoAscender=int(0.82 * UPM), sTypoDescender=-int(0.18 * UPM),
                sCapHeight=CAP_UNITS, achVendID="STAR", usWeightClass=500)
    fb.setupPost(isFixedPitch=0)

    out = args.out or os.path.join(HERE, ps + "-Regular.ttf")
    fb.save(out)
    print("wrote", out)
    print("  glyphs", len(glyphs), " mapped", len(cmap), " stroke", args.stroke, " mark", args.mark)

    # WOFF2 for the DOM HUD - brotli is present, so this is free.
    try:
        from fontTools.ttLib import TTFont
        f = TTFont(out); f.flavor = "woff2"
        w2 = out.replace(".ttf", ".woff2"); f.save(w2)
        print("wrote", w2, os.path.getsize(w2), "bytes")
    except Exception as e:
        print("woff2 skipped:", e)

    # Fold glyphs.js AND the compiled font into the specimen page, so it opens straight from the
    # file system with no server and can never show a stale build.
    if args.mark > 0:
        page_path = os.path.join(HERE, "index.html")
        if os.path.exists(page_path):
            page = open(page_path, "rb").read().decode("utf8")

            src = open(os.path.join(HERE, "glyphs.js"), "rb").read().decode("utf8")
            page, n1 = re.subn(r"// <<<GLYPHS>>>.*?// <<<END GLYPHS>>>",
                               "// <<<GLYPHS>>>\n" + src + "\n// <<<END GLYPHS>>>",
                               page, count=1, flags=re.S)

            b64 = base64.b64encode(open(out, "rb").read()).decode("ascii")
            page, n2 = re.subn(r"    src: url\('[^']*'\) format\('truetype'\);",
                               "    src: url('data:font/ttf;base64," + b64 + "') format('truetype');",
                               page, count=1)
            if n1 and n2:
                open(page_path, "wb").write(page.encode("utf8"))
                print("  inlined glyphs.js + font into index.html (" + str(len(b64) // 1024) + " KB base64)")
            else:
                print("  NOTE: could not find the inline markers in index.html (glyphs", n1, "font", n2, ")")

if __name__ == "__main__":
    build()
