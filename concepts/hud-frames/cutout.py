# cutout.py - turn the generated JPEG frames into UI assets with real alpha.
#
# The generator gives opaque JPEGs on black with a soft drop shadow baked in. Two problems for a
# HUD that sits over a live camera feed: there is no transparency, and a baked shadow shows as a
# grey halo over the room behind it.
#
# Keying on brightness alone would be wrong for the glass card - its interior is nearly as dark as
# the background, so a brightness key eats the middle of the card. Instead this FLOOD FILLS from
# the image border: only black that is CONNECTED to the outside is background. The marble frame is
# a closed ring, so the dark glass inside it is unreachable and survives untouched.
#
# The shadow is deliberately discarded rather than kept - it is re-made in CSS, where it can fall
# correctly over whatever is behind the panel.
#
#   python cutout.py

import os
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'cut')
os.makedirs(OUT, exist_ok=True)


def luminance(a):
    return (0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]) / 255.0


def background_mask(lum, thresh):
    """Flood fill dark pixels inward from every edge. Scanline fill - a per-pixel Python queue on
    a 1400x760 image is slow enough to notice."""
    h, w = lum.shape
    dark = lum <= thresh
    bg = np.zeros((h, w), bool)
    q = deque()

    def push(x, y):
        if 0 <= x < w and 0 <= y < h and dark[y, x] and not bg[y, x]:
            q.append((x, y))

    for x in range(w):
        push(x, 0); push(x, h - 1)
    for y in range(h):
        push(0, y); push(w - 1, y)

    while q:
        x, y = q.popleft()
        if bg[y, x]:
            continue
        x0 = x
        while x0 > 0 and dark[y, x0 - 1] and not bg[y, x0 - 1]:
            x0 -= 1
        x1 = x
        while x1 < w - 1 and dark[y, x1 + 1] and not bg[y, x1 + 1]:
            x1 += 1
        bg[y, x0:x1 + 1] = True
        for nx in range(x0, x1 + 1):
            if y > 0 and dark[y - 1, nx] and not bg[y - 1, nx]:
                q.append((nx, y - 1))
            if y < h - 1 and dark[y + 1, nx] and not bg[y + 1, nx]:
                q.append((nx, y + 1))
    return bg


def cut(name, src, bg_thresh=0.16, glass_base=None, feather=1.0):
    """glass_base: if set, dark interior pixels become semi-transparent at this alpha, so the
    room shows through the panel. Leave None for solid pieces like the pill."""
    im = Image.open(os.path.join(HERE, src)).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    lum = luminance(a)

    bg = background_mask(lum, bg_thresh)
    alpha = np.where(bg, 0.0, 1.0).astype(np.float32)

    if glass_base is not None:
        # Inside the frame, let brightness decide opacity: the marble and the gold stay solid,
        # the dark glass drops to glass_base so the camera feed reads through it. The gold
        # hairlines drawn ON the glass ride back up to full because they are bright.
        inner = (~bg) & (lum < 0.30)
        ramp = glass_base + (1.0 - glass_base) * np.clip(lum / 0.30, 0, 1) ** 0.8
        alpha = np.where(inner, ramp, alpha)

    # One pixel of softness on the cut edge only - without it the rounded corners stair-step.
    am = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), 'L')
    if feather:
        am = am.filter(ImageFilter.GaussianBlur(feather))

    out = Image.merge('RGBA', (*im.split(), am))
    bbox = Image.fromarray((np.where(bg, 0, 255)).astype(np.uint8), 'L').getbbox()
    out = out.crop(bbox)
    path = os.path.join(OUT, name)
    out.save(path)
    print('%-22s %s  ->  %s  %s' % (name, im.size, out.size, path))
    return out



def mirror_bottom_edge(im, band, feather):
    """Rebuild the bottom edge from the top one, flipped.

    The generated card wears a Greek-key meander along its bottom rail. It is the best-looking
    thing in the frame and it is the one thing a nine-slice cannot keep: the bottom-centre slice
    is stretched horizontally to whatever width the panel ends up, and a repeating key pattern
    stretched by an arbitrary factor reads as a mistake - the keys go oblong and stop matching
    the ones in the corners, which are NOT stretched.

    Mirroring the top rail rather than painting the meander out is what keeps this cheap: the
    frame is already symmetric (both silhouettes span the same columns to the pixel, and the
    corner rounding matches), so the flipped top lands exactly on the bottom with its marble,
    its gold hairline and its inner bevel all in register. It also copies the ALPHA, so the
    bottom corners come back correctly rounded for free.

    band     - how many rows to take, measured from the outer edge inward. Must reach past the
               bevel into the glass, so the seam falls somewhere flat rather than on a feature.
    feather  - of those rows, how many at the inner end crossfade instead of replace. The glass
               is a vertical gradient (lighter at the top, darker at the bottom), so a hard seam
               would show as a step; the crossfade spends it over the bevel, where there is
               already a strong light-to-dark edge to hide in.
    """
    a = np.asarray(im).astype(np.float32)
    h = a.shape[0]

    top = a[:band][::-1]                       # the top rail, flipped to point the right way
    dst = a[h - band:]

    # 1 out at the edge, ramping to 0 at the inner end of the band.
    m = np.ones(band, np.float32)
    ramp = np.linspace(1.0, 0.0, feather + 2)[1:-1]
    m[band - feather:] = ramp
    m = m[:, None, None]

    a[h - band:] = top * m + dst * (1.0 - m)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')



def flatten_band(im, y0, y1, blend=3):
    """Erase a horizontal feature from the glass by interpolating the rows either side of it.

    Same reasoning as the meander: the card's gold title rule and its little diamond sit in the
    MIDDLE slice, the one a nine-slice stretches vertically. A rule that stretches is only a
    thicker rule, but the diamond goes oblong and its position slides with the panel's height,
    so it lands wherever the content happens to end rather than under the title.

    The rule is not lost - it is re-made in CSS as a border under the header, where it sits
    against the text at whatever height the panel is and stays one pixel thick at any size.

    Interpolating rather than painting flat keeps the glass gradient, which runs light at the
    top to dark at the bottom, continuous across the gap.
    """
    a = np.asarray(im).astype(np.float32)
    top = a[y0 - blend:y0].mean(axis=0)
    bot = a[y1:y1 + blend].mean(axis=0)
    n = y1 - y0
    t = np.linspace(0.0, 1.0, n, endpoint=False)[:, None, None] + (0.5 / n)
    a[y0:y1] = top[None] * (1.0 - t) + bot[None] * t
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


print('cutting frames...')
cut('pill.png', '01-pill-small-2to1.jpg', bg_thresh=0.16)
card = cut('card-glass.png', '05-card-glass.jpg', bg_thresh=0.10, glass_base=0.78)
card = mirror_bottom_edge(card, band=74, feather=12)
# Measured on the 936x806 cut: the diamond spans rows 167-184 and the rule 175-176.
card = flatten_band(card, 165, 188)
card.save(os.path.join(OUT, 'card-glass.png'))
print('%-22s meander + title rule removed; bottom rail mirrored from the top' % 'card-glass.png')
print('done - alpha is real; shadows are NOT baked in, add them in CSS')
