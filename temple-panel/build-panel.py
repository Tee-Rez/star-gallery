# build-panel.py - generate the stone-and-glass HUD panel as a real 3D model (.glb).
#
#   python build-panel.py --width 2.1 --height 0.9 --out temple-panel-info.glb
#
# The panel is a parametric model rather than a sculpt, because it has to be produced at two
# sizes today (the portal band's info and controls groups) and probably more later, and the
# frame must keep the same physical thickness at every size - scaling one model non-uniformly
# would stretch the bevels and squash the corner blocks.
#
# What is in the file, and why each piece is its own material:
#   stone   the frame: a bevelled profile swept round the opening with mitred corners, plus a
#           proud block at each corner. Rough dielectric, tileable granite albedo + normal map,
#           so it shades under the scene's lights and the bevels catch a highlight as you move.
#   gold    a groove cut into the front face just outside the opening. Metallic, slightly
#           emissive, so it still reads as gold in a dark room with no bright reflections.
#   glass   a flat pane recessed a few millimetres behind the frame face. Dark, 62% opaque,
#           BLEND mode - the generated text sits in front of it at the group's z 0.01.
#
# Everything is generated: the granite is periodic value noise, so it tiles seamlessly across
# the frame with no seam and no texture file to ship separately - the .glb is self-contained.
# Geometry is emitted flat-shaded (each triangle owns its vertices) because a chamfered stone
# edge SHOULD read as a facet; smoothing it would make it look like moulded plastic.
#
# Coordinates are metres, +Y up, +Z towards the viewer - glTF's convention and three.js's. The
# opening is centred on the origin and the whole model lives at z >= 0, which matters: the
# portal's hider walls sit 1 cm behind the band's mount plane and occlude anything behind it.

import argparse, io, json, math, os, struct
import numpy as np
from PIL import Image

# ---- proportions, in metres, shared by every size ------------------------------------------------
T = 0.090     # frame thickness, opening edge to outer edge
D = 0.060     # frame depth, mount plane to front face
B = 0.014     # chamfer on the front edges
G0, G1 = 0.020, 0.036   # the gold groove: outward distance from the opening
GD = 0.007    # groove depth
CS = 0.160    # corner block size (square), measured from the opening's corner outward
CP = 0.012    # how proud the corner blocks stand of the frame face
GLASS_Z = 0.004
TILE = 0.32   # metres per texture repeat on the stone

STONE, GOLD, GLASS = 0, 1, 2

# The cross-section of the frame: (u = outward from the opening, z = forward), each segment
# tagged with its material. Walked inner-wall -> front -> outer-wall, so that (-dz, du) is the
# outward normal of every segment without special cases.
PROFILE = [
    ((0.0, 0.0),      (0.0, D - B),   STONE),   # inner wall, facing the glass
    ((0.0, D - B),    (B, D),         STONE),   # inner chamfer
    ((B, D),          (G0, D),        STONE),   # front face, up to the groove
    ((G0, D),         (G0, D - GD),   GOLD),    # groove wall
    ((G0, D - GD),    (G1, D - GD),   GOLD),    # groove floor
    ((G1, D - GD),    (G1, D),        GOLD),    # groove wall
    ((G1, D),         (T - B, D),     STONE),   # front face, groove to outer chamfer
    ((T - B, D),      (T, D - B),     STONE),   # outer chamfer
    ((T, D - B),      (T, 0.0),       STONE),   # outer wall
]

# ---- mesh accumulator ----------------------------------------------------------------------------
class Mesh:
    def __init__(self):
        self.parts = {STONE: [], GOLD: [], GLASS: []}   # material -> list of (p0,p1,p2,n,uv0,uv1,uv2)

    def tri(self, mat, a, b, c, normal_hint, uvs=None):
        a, b, c = map(np.asarray, (a, b, c))
        n = np.cross(b - a, c - a)
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            return
        n /= ln
        if np.dot(n, normal_hint) < 0:          # wind so the face looks the way it should
            b, c = c, b
            uvs = (uvs[0], uvs[2], uvs[1]) if uvs else None
        if uvs is None:
            uvs = tuple((p[0] / TILE, p[1] / TILE) for p in (a, b, c))   # planar, tileable
        self.parts[mat].append((a, b, c, n, uvs))

    def quad(self, mat, p0, p1, p2, p3, normal_hint, uvs=None):
        u = uvs
        self.tri(mat, p0, p1, p2, normal_hint, (u[0], u[1], u[2]) if u else None)
        self.tri(mat, p0, p2, p3, normal_hint, (u[0], u[2], u[3]) if u else None)

# ---- the frame: a profile swept round four sides with mitred corners -------------------------------
def build_frame(m, w, h):
    hw, hh = w / 2, h / 2
    # For each side: the outward direction, and how a point at outward distance u maps to 3D at
    # each end. The mitre comes free: a side's strip at distance u is longer by u at both ends,
    # so adjacent strips meet exactly on the 45-degree diagonal.
    sides = [
        (np.array([0, -1, 0.0]), lambda u, z: (np.array([-(hw + u), -(hh + u), z]), np.array([(hw + u), -(hh + u), z]))),
        (np.array([0, 1, 0.0]),  lambda u, z: (np.array([(hw + u), (hh + u), z]), np.array([-(hw + u), (hh + u), z]))),
        (np.array([-1, 0, 0.0]), lambda u, z: (np.array([-(hw + u), (hh + u), z]), np.array([-(hw + u), -(hh + u), z]))),
        (np.array([1, 0, 0.0]),  lambda u, z: (np.array([(hw + u), -(hh + u), z]), np.array([(hw + u), (hh + u), z]))),
    ]
    fwd = np.array([0, 0, 1.0])
    for out, at in sides:
        for (u0, z0), (u1, z1), mat in PROFILE:
            du, dz = u1 - u0, z1 - z0
            hint = out * (-dz) + fwd * du        # (-dz, du) rotated into this side's plane
            a0, a1 = at(u0, z0)
            b0, b1 = at(u1, z1)
            m.quad(mat, a0, a1, b1, b0, hint)
    # a back face, so the frame is closed if it is ever seen from behind (Unity, or a debug view)
    for out, at in sides:
        a0, a1 = at(0.0, 0.0)
        b0, b1 = at(T, 0.0)
        m.quad(STONE, a0, a1, b1, b0, -fwd)

def build_corner_blocks(m, w, h):
    hw, hh = w / 2, h / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            x0, x1 = sorted((sx * hw, sx * (hw + CS)))
            y0, y1 = sorted((sy * hh, sy * (hh + CS)))
            z0, z1 = 0.0, D + CP
            c = lambda x, y, z: np.array([x, y, z])
            # six faces, each with its outward hint
            m.quad(STONE, c(x0,y0,z1), c(x1,y0,z1), c(x1,y1,z1), c(x0,y1,z1), np.array([0,0,1.0]))
            m.quad(STONE, c(x0,y0,z0), c(x1,y0,z0), c(x1,y1,z0), c(x0,y1,z0), np.array([0,0,-1.0]))
            m.quad(STONE, c(x1,y0,z0), c(x1,y1,z0), c(x1,y1,z1), c(x1,y0,z1), np.array([1,0,0.0]))
            m.quad(STONE, c(x0,y0,z0), c(x0,y1,z0), c(x0,y1,z1), c(x0,y0,z1), np.array([-1,0,0.0]))
            m.quad(STONE, c(x0,y1,z0), c(x1,y1,z0), c(x1,y1,z1), c(x0,y1,z1), np.array([0,1,0.0]))
            m.quad(STONE, c(x0,y0,z0), c(x1,y0,z0), c(x1,y0,z1), c(x0,y0,z1), np.array([0,-1,0.0]))

def build_glass(m, w, h):
    # slightly larger than the opening so its edge tucks under the inner wall - no light leak
    hw, hh = w / 2 + 0.006, h / 2 + 0.006
    p = [np.array([-hw, -hh, GLASS_Z]), np.array([hw, -hh, GLASS_Z]), np.array([hw, hh, GLASS_Z]), np.array([-hw, hh, GLASS_Z])]
    m.quad(GLASS, p[0], p[1], p[2], p[3], np.array([0, 0, 1.0]), uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])

# ---- the granite: periodic noise, so it tiles ------------------------------------------------------
def periodic_value_noise(size, cells, rng):
    lattice = rng.random((cells, cells)).astype(np.float32)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32) * (cells / size)
    x0, y0 = np.floor(xs).astype(int) % cells, np.floor(ys).astype(int) % cells
    x1, y1 = (x0 + 1) % cells, (y0 + 1) % cells
    fx, fy = xs - np.floor(xs), ys - np.floor(ys)
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = lattice[y0, x0], lattice[y0, x1], lattice[y1, x0], lattice[y1, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def fbm(size, base_cells, octaves, rng):
    out, amp, cells, total = np.zeros((size, size), np.float32), 1.0, base_cells, 0.0
    for _ in range(octaves):
        out += amp * periodic_value_noise(size, cells, rng)
        total += amp
        amp *= 0.5
        cells *= 2
    return out / total

def granite_textures(size=512, seed=7):
    rng = np.random.default_rng(seed)
    mottle = fbm(size, 4, 5, rng)                 # broad colour variation
    grain = fbm(size, 32, 3, rng)                 # the crystal grain
    fleck = rng.random((size, size)).astype(np.float32)
    quartz = (fleck > 0.985).astype(np.float32)   # sparse bright flecks
    dark = (fleck < 0.012).astype(np.float32)     # sparse dark feldspar
    base = np.array([0.56, 0.54, 0.50], np.float32)
    col = base[None, None, :] * (0.78 + 0.44 * mottle)[..., None]
    col = col * (0.85 + 0.30 * grain)[..., None]
    col = col + quartz[..., None] * 0.28 - dark[..., None] * 0.22
    col = np.clip(col, 0, 1)
    albedo = Image.fromarray((col * 255).astype(np.uint8), "RGB")

    # height -> normal. Wrap with roll so the map tiles like the colour does.
    height = 0.6 * grain + 0.4 * mottle + 0.5 * quartz - 0.4 * dark
    k = 2.6
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * k
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * k
    n = np.dstack([-dx, -dy, np.ones_like(height)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    normal = Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), "RGB")
    return albedo, normal

def png_bytes(img):
    b = io.BytesIO()
    img.save(b, "PNG", optimize=True)
    return b.getvalue()

# ---- glTF writer -----------------------------------------------------------------------------------
def write_glb(path, mesh, albedo_png, normal_png, external=False):
    bin_parts, views, accessors = [], [], []
    offset = 0

    def add_view(data, target=None):
        nonlocal offset
        pad = (-len(data)) % 4
        bin_parts.append(data + b"\0" * pad)
        v = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
        if target: v["target"] = target
        views.append(v)
        offset += len(data) + pad
        return len(views) - 1

    def add_accessor(view, ctype, count, atype, mn=None, mx=None):
        a = {"bufferView": view, "componentType": ctype, "count": count, "type": atype}
        if mn is not None: a["min"], a["max"] = mn, mx
        accessors.append(a)
        return len(accessors) - 1

    primitives = []
    for mat in (STONE, GOLD, GLASS):
        tris = mesh.parts[mat]
        if not tris:
            continue
        pos = np.array([p for t in tris for p in t[:3]], np.float32)
        nrm = np.array([t[3] for t in tris for _ in range(3)], np.float32)
        uv = np.array([u for t in tris for u in t[4]], np.float32)
        # glTF UV origin is top-left; flip v so the planar mapping is not mirrored
        uv[:, 1] = 1.0 - uv[:, 1]
        idx = np.arange(len(pos), dtype=np.uint32)
        vp = add_view(pos.tobytes(), 34962)
        vn = add_view(nrm.tobytes(), 34962)
        vt = add_view(uv.tobytes(), 34962)
        vi = add_view(idx.tobytes(), 34963)
        primitives.append({
            "attributes": {
                "POSITION": add_accessor(vp, 5126, len(pos), "VEC3", pos.min(0).tolist(), pos.max(0).tolist()),
                "NORMAL": add_accessor(vn, 5126, len(nrm), "VEC3"),
                "TEXCOORD_0": add_accessor(vt, 5126, len(uv), "VEC2"),
            },
            "indices": add_accessor(vi, 5125, len(idx), "SCALAR"),
            "material": mat,
        })

    # Textures either ride inside the GLB or are referenced by URI, relative to the GLB. Two
    # panels of different sizes share one granite, so referencing lets the browser fetch and
    # decode it once instead of once per panel.
    if external:
        images = [{"uri": albedo_png, "name": "granite-albedo"},
                  {"uri": normal_png, "name": "granite-normal"}]
    else:
        images = [{"bufferView": add_view(albedo_png), "mimeType": "image/png", "name": "granite-albedo"},
                  {"bufferView": add_view(normal_png), "mimeType": "image/png", "name": "granite-normal"}]

    gltf = {
        "asset": {"version": "2.0", "generator": "STAR Arts temple-panel/build-panel.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "temple-panel"}],
        "meshes": [{"name": "temple-panel", "primitives": primitives}],
        "materials": [
            {"name": "stone",
             "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.92},
             "normalTexture": {"index": 1, "scale": 1.0}},
            {"name": "gold",
             "pbrMetallicRoughness": {"baseColorFactor": [0.86, 0.66, 0.26, 1.0], "metallicFactor": 1.0, "roughnessFactor": 0.32},
             "emissiveFactor": [0.42, 0.27, 0.06]},
            {"name": "glass",
             "pbrMetallicRoughness": {"baseColorFactor": [0.015, 0.022, 0.035, 0.62], "metallicFactor": 0.0, "roughnessFactor": 0.12},
             "alphaMode": "BLEND", "doubleSided": False},
        ],
        "textures": [{"sampler": 0, "source": 0}, {"sampler": 0, "source": 1}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "images": images,
        "bufferViews": views,
        "accessors": accessors,
        "buffers": [{"byteLength": offset}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode("utf8")
    js += b" " * ((-len(js)) % 4)
    bn = b"".join(bin_parts)
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bn), 0x004E4942)); f.write(bn)
    return sum(len(mesh.parts[m]) for m in mesh.parts)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=float, required=True, help="opening width, metres")
    ap.add_argument("--height", type=float, required=True, help="opening height, metres")
    ap.add_argument("--out", required=True)
    ap.add_argument("--texture", type=int, default=512)
    ap.add_argument("--shared-textures", metavar="NAME",
                    help="write NAME-albedo.png and NAME-normal.png beside the GLB and reference "
                         "them by URI instead of embedding a copy in every panel")
    args = ap.parse_args()

    m = Mesh()
    build_frame(m, args.width, args.height)
    build_corner_blocks(m, args.width, args.height)
    build_glass(m, args.width, args.height)
    albedo, normal = granite_textures(args.texture)
    if args.shared_textures:
        out_dir = os.path.dirname(os.path.abspath(args.out))
        names = [args.shared_textures + "-albedo.png", args.shared_textures + "-normal.png"]
        for name, png in zip(names, (png_bytes(albedo), png_bytes(normal))):
            with open(os.path.join(out_dir, name), "wb") as f:
                f.write(png)
        tris = write_glb(args.out, m, names[0], names[1], external=True)
    else:
        tris = write_glb(args.out, m, png_bytes(albedo), png_bytes(normal))
    print("wrote %s  %.1f KB  %d triangles  opening %.2f x %.2f m  outer %.2f x %.2f m" % (
        args.out, os.path.getsize(args.out) / 1024, tris, args.width, args.height,
        args.width + 2 * T, args.height + 2 * T))

if __name__ == "__main__":
    main()
