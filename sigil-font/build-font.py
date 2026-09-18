# build-font.py - compile Sigil Inscriptional from its skeleton table into a real .ttf
#
# The skeleton lives in ONE place: the `const G = {...}` table inside index.html, which is also
# what the design tool renders from. This script parses that table rather than keeping a second
# copy, so the font file can never drift from the specimen sheet you approved.
#
#   python build-font.py            -> sigil-inscriptional.ttf
#   python build-font.py --stroke 1.3 --node 0.6
#
# The outline construction is deliberately the same trick as the preview: every segment becomes a
# quad and every vertex a lozenge, all wound the same way, and TrueType's non-zero fill rule
# unions them. No boolean geometry, so a weight change is a number rather than a redraw.

import json, re, sys, math, argparse, os

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- read the skeleton out of the design tool --------------------------------------------------
def load_skeleton():
    src = open(os.path.join(HERE, "index.html"), "rb").read().decode("utf8")
    block = re.search(r"const G = \{(.*?)\n\};", src, re.S).group(1)
    # The apostrophe glyph's key is written "'" - swap it out before normalising quotes.
    block = block.replace('"\'":', "'@APOS@':")
    block = block.replace("'", '"')                      # JS single quotes -> JSON
    block = re.sub(r"(\w+):", r'"\1":', block)           # bare keys w:/s: -> "w":/"s":
    block = re.sub(r",\s*$", "", block.strip())
    data = json.loads("{" + block + "}")
    if "@APOS@" in data:
        data["'"] = data.pop("@APOS@")
    return data

# ---- skeleton -> outline -----------------------------------------------------------------------
def glyph_contours(g, stroke, node):
    """Same construction as the preview: quads along each segment, a lozenge at each vertex."""
    half = stroke / 2.0
    out = []
    for line in g["s"]:
        for i in range(len(line) - 1):
            (x0, y0), (x1, y1) = line[i], line[i + 1]
            dx, dy = x1 - x0, y1 - y0
            ln = math.hypot(dx, dy)
            if ln < 1e-6:
                continue
            nx, ny = -dy / ln * half, dx / ln * half
            out.append([(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)])
        r = half + node * 0.5
        for (x, y) in line:
            out.append([(x, y + r), (x + r * 0.62, y), (x, y - r), (x - r * 0.62, y)])
    return out

def signed_area(c):
    a = 0.0
    for i in range(len(c)):
        x0, y0 = c[i]
        x1, y1 = c[(i + 1) % len(c)]
        a += x0 * y1 - x1 * y0
    return a / 2.0

def build():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stroke", type=float, default=1.15)
    ap.add_argument("--node", type=float, default=0.95)
    ap.add_argument("--out", default=os.path.join(HERE, "sigil-inscriptional.ttf"))
    ap.add_argument("--smallcap", type=float, default=0.78, help="lowercase is the same form, scaled")
    args = ap.parse_args()

    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    G = load_skeleton()
    UPM, CAP_UNITS, GAP = 1000, 700, 1.5
    K = CAP_UNITS / 10.0          # grid units -> font units (cap height 10 -> 700)
    SIDE = 0.55 * K               # side bearing

    def name_for(ch):
        special = {' ': 'space', '.': 'period', ',': 'comma', ':': 'colon', '-': 'hyphen',
                   '/': 'slash', "'": 'quotesingle', '!': 'exclam', '?': 'question',
                   '(': 'parenleft', ')': 'parenright', '+': 'plus', '*': 'asterisk',
                   '\u00b7': 'periodcentered'}
        if ch in special:
            return special[ch]
        if ch.isdigit():
            return ['zero','one','two','three','four','five','six','seven','eight','nine'][int(ch)]
        return ch

    glyphs, hmtx, cmap = {}, {}, {}

    pen = TTGlyphPen(None)
    glyphs['.notdef'] = pen.glyph()
    hmtx['.notdef'] = (int(4 * K), 0)

    pen = TTGlyphPen(None)
    glyphs['space'] = pen.glyph()
    hmtx['space'] = (int(3.4 * K), 0)
    cmap[ord(' ')] = 'space'

    def add(ch, scale, suffix=""):
        g = G[ch]
        name = name_for(ch) + suffix
        pen = TTGlyphPen(None)
        for c in glyph_contours(g, args.stroke, args.node):
            # one winding direction for every contour, so overlaps union under non-zero fill
            c = c if signed_area(c) < 0 else list(reversed(c))
            pen.moveTo((round((c[0][0] * scale) * K + SIDE), round(c[0][1] * scale * K)))
            for p in c[1:]:
                pen.lineTo((round((p[0] * scale) * K + SIDE), round(p[1] * scale * K)))
            pen.closePath()
        glyphs[name] = pen.glyph()
        hmtx[name] = (int(round(g["w"] * scale * K + SIDE * 2)), int(SIDE))
        return name

    for ch in G:
        if ch == ' ':
            continue
        name = add(ch, 1.0)
        cmap[ord(ch)] = name
        # lowercase maps to the same letterform at small-cap size: an inscriptional face has no
        # minuscule, and a round lowercase beside a cut capital breaks the illusion outright.
        if ch.isalpha():
            low = add(ch, args.smallcap, ".sc")
            cmap[ord(ch.lower())] = low

    order = ['.notdef', 'space'] + [n for n in glyphs if n not in ('.notdef', 'space')]

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(hmtx)
    fb.setupHorizontalHeader(ascent=int(0.80 * UPM), descent=-int(0.20 * UPM))
    fb.setupNameTable({
        "familyName": "Sigil Inscriptional",
        "styleName": "Regular",
        "uniqueFontIdentifier": "SigilInscriptional-Regular",
        "fullName": "Sigil Inscriptional Regular",
        "psName": "SigilInscriptional-Regular",
        "version": "Version 1.000",
        "designer": "STAR Arts",
        "description": "Monolinear angular inscriptional capitals for the temple HUD. "
                       "Generated from a skeleton table; stroke weight and lozenge size are parameters.",
    })
    fb.setupOS2(sTypoAscender=int(0.80 * UPM), sTypoDescender=-int(0.20 * UPM),
                sCapHeight=CAP_UNITS, achVendID="STAR", usWeightClass=500)
    fb.setupPost(isFixedPitch=0)
    fb.save(args.out)

    print("wrote", args.out)
    print("glyphs:", len(glyphs), " codepoints mapped:", len(cmap))
    print("stroke:", args.stroke, " node:", args.node, " cap height:", CAP_UNITS, "/", UPM)

    # Fold the compiled font back into the design tool as a data: URI, so the specimen page is
    # self-contained (opens from the file system, no server) and can never show a stale build.
    import base64
    b64 = base64.b64encode(open(args.out, "rb").read()).decode("ascii")
    page_path = os.path.join(HERE, "index.html")
    page = open(page_path, "rb").read().decode("utf8")
    new_src = "    src: url('data:font/ttf;base64," + b64 + "') format('truetype');"
    page, n = re.subn(r"    src: url\('[^']*'\) format\('truetype'\);", new_src, page, count=1)
    if n:
        open(page_path, "wb").write(page.encode("utf8"))
        print("embedded the font into index.html (" + str(len(b64) // 1024) + " KB of base64)")
    else:
        print("NOTE: could not find the @font-face src line to update in index.html")

if __name__ == "__main__":
    build()
