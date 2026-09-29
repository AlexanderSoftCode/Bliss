"""Generate the homepage hero shape.

Run from the repo root:
    blender --background --python blender/make_shape.py   # headless, just write the files
    blender --python blender/make_shape.py                # same, but leaves Blender open on the result

Outputs:
    blender/shape.blend       open in Blender to inspect or hand-edit
    blender/preview.png       quick render to check the look
    public/models/shape.glb   loaded by src/components/IrregularShape.astro

The band colours come from src/data/shape-palette.json (bottom -> top), shared with the site shader.
"""

import json
import random
from math import exp, radians, sqrt
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

ROOT = Path(__file__).resolve().parent.parent
PALETTE_PATH = ROOT / "src" / "data" / "shape-palette.json"
GLB_PATH = ROOT / "public" / "models" / "shape.glb"
PREVIEW_PATH = ROOT / "blender" / "preview.png"
BLEND_PATH = ROOT / "blender" / "shape.blend"

SEED = 7                                   # same seed -> same shape
GRID = 20                                  # tiles per cube edge; low so each tile stays visible
STRETCH = Vector((1.0, 0.8, 1.4))          # per-axis squash so it isn't a ball; z longest
LOBE_SCALE, LOBE_STRENGTH = 0.8, 0.45      # the big swells; higher scale or warp starts to crease
WARP = 0.3                                 # bends the noise so swells flow instead of looking like blobs
TWIST = radians(20)                        # twist around Z per unit of height
# (direction, strength, width): rounded bulges pushed out along a direction. Wider = softer shoulder.
BULGES = [
    (Vector((-0.6, -0.7, 0.4)), 0.6, 0.3),  # top-left in the preview
    (Vector((0.5, -0.2, 1.0)), 1.2, 0.15),  # the peak: one end rises well above the rest
]


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    bpy.data.orphans_purge(do_recursive=True)


def build_base():
    """Subdivided cube pushed out to a sphere. This mapping keeps the quads close to even,
    where plain normalising would bunch them up at the cube's corners."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=GRID - 1, use_grid_fill=True)
    for v in bm.verts:
        x2, y2, z2 = (c * c for c in v.co)
        v.co *= Vector((
            sqrt(1 - y2 / 2 - z2 / 2 + y2 * z2 / 3),
            sqrt(1 - z2 / 2 - x2 / 2 + z2 * x2 / 3),
            sqrt(1 - x2 / 2 - y2 / 2 + x2 * y2 / 3),
        ))
    return bm


def deform(bm):
    """Push each vertex along its own direction, then stretch and twist.
    Radius never drops near 0 and twist rotates whole horizontal slices,
    so the surface can't pass through itself for any seed."""
    noise.seed_set(SEED)  # noise_vector is randomly seeded per run otherwise; noise() only varies via offset
    rng = random.Random(SEED)
    offset = Vector([rng.uniform(-100, 100) for _ in range(3)])
    for v in bm.verts:
        d = v.co.normalized()
        warped = d + WARP * noise.noise_vector(d * LOBE_SCALE - offset)
        radius = 1 + LOBE_STRENGTH * noise.noise(warped * LOBE_SCALE + offset)
        for direction, strength, width in BULGES:
            # 1 facing the bulge, fading smoothly to ~0 by 90 degrees away
            radius += strength * exp((d.dot(direction.normalized()) - 1) / width)
        p = d * radius * STRETCH
        v.co = Matrix.Rotation(TWIST * p.z, 3, "Z") @ p


def normalise(bm):
    """Centre on the origin and fit inside a radius-1 sphere, so the shader can band z over -1..1."""
    lo = Vector([min(v.co[i] for v in bm.verts) for i in range(3)])
    hi = Vector([max(v.co[i] for v in bm.verts) for i in range(3)])
    centre = (lo + hi) / 2
    radius = max((v.co - centre).length for v in bm.verts)
    for v in bm.verts:
        v.co = (v.co - centre) / radius
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def validate(bm):
    assert all(e.is_manifold for e in bm.edges), "mesh has open or non-manifold edges"
    assert bm.calc_volume(signed=True) > 0, "normals point inward"
    assert len(bm.verts) < 65536, "too many vertices for uint16 indices"


def make_object(bm):
    mesh = bpy.data.meshes.new("Shape")
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_flat()  # each tile lit as one plane; the site shader does the same with dpdx/dpdy
    # One height per tile, so each tile gets one colour from the smooth palette blend.
    # The leading underscore makes the glTF exporter include it as a custom attribute.
    heights = mesh.attributes.new("_face_height", "FLOAT", "FACE")
    heights.data.foreach_set("value", [face.center.z for face in mesh.polygons])
    obj = bpy.data.objects.new("Shape", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def hex_to_linear(hex_color):
    """Blender colours are linear; hex is sRGB."""
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb] + [1.0]


def add_material(obj, palette):
    """Preview only: tile height -> smooth palette blend. The glb carries no material; the site shader redoes this."""
    mat = bpy.data.materials.new("HeightBlend")
    nodes, links = mat.node_tree.nodes, mat.node_tree.links

    height = nodes.new("ShaderNodeAttribute")
    height.attribute_name = "_face_height"
    to_unit = nodes.new("ShaderNodeMapRange")
    to_unit.inputs["From Min"].default_value = -1
    ramp = nodes.new("ShaderNodeValToRGB")
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.7

    stops = ramp.color_ramp.elements  # starts with one stop at 0 and one at 1
    stops[0].color = hex_to_linear(palette[0])
    stops[1].color = hex_to_linear(palette[-1])
    for i, hex_color in enumerate(palette[1:-1], start=1):
        stops.new(i / (len(palette) - 1)).color = hex_to_linear(hex_color)

    links.new(height.outputs["Fac"], to_unit.inputs["Value"])
    links.new(to_unit.outputs["Result"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.append(mat)


def export_glb(obj):
    obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_normals=False,  # flat normals are rebuilt in the shader from dpdx/dpdy
        export_texcoords=False,
        export_attributes=True,  # _face_height; tiles no longer share corners, so vertices split 4 per quad
        export_materials="NONE",
        export_yup=True,  # Blender Z (up) becomes glTF Y: the shader bands on position.y
    )


def add_sun(name, energy, tilt, spin):
    sun = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
    sun.data.energy = energy
    sun.rotation_euler = (radians(tilt), 0, radians(spin))
    bpy.context.scene.collection.objects.link(sun)


def render_preview():
    scene = bpy.context.scene
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.location = (2.8, -2.8, 0.4)
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera

    add_sun("Key", energy=3, tilt=45, spin=-40)
    add_sun("Fill", energy=2, tilt=110, spin=140)

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 1024
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"  # AgX would shift the palette away from its hex values
    scene.render.filepath = str(PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main():
    palette = json.loads(PALETTE_PATH.read_text())
    reset_scene()
    bm = build_base()
    deform(bm)
    normalise(bm)
    validate(bm)
    obj = make_object(bm)
    add_material(obj, palette)
    export_glb(obj)
    render_preview()
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    z = [v.co.z for v in obj.data.vertices]
    print(f"shape: {len(obj.data.vertices)} verts, {len(obj.data.polygons)} quads, "
          f"z {min(z):.2f}..{max(z):.2f}, glb {GLB_PATH.stat().st_size / 1024:.0f} KB")


main()
