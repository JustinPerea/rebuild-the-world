"""The standard render scene (docs/art-style-guide.md, "Standard render scene"), built from nothing each run.

Run by tools/render/render.mjs, which writes the job file:

    blender --background --factory-startup --python tools/render/scene.py -- job.json

The job names the mesh files and where each sits, the views, the light and the output folder.
Every asset gets the same ground, sky, scale references, colour chart and cameras, so two renders
can be compared. Five cameras frame the asset together with the references, so an asset much
smaller than the 1.8 m figure is small in them; the close camera frames the asset alone.

Opens the model files the job names and writes PNG files into the job's output folder. render.mjs
refuses a model that names images or buffers outside itself before this script runs.
"""
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

SETTINGS_VERSION = "1"
SAMPLES = 48
GROUND_GREY = 0.18            # mid-grey, linear
VIEWS = ("front", "back", "left", "right", "three_quarter", "close")
# The spec's axes (+Y up, front +Z) in Blender's (+Z up, front -Y): (x, y, z) -> (x, -z, y).
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# Flat patches, linear RGB: six greys from white to black, then red, green, blue, cyan, magenta, yellow.
CHART = [(g, g, g) for g in (0.9, 0.59, 0.36, 0.19, 0.09, 0.03)] + [
    (0.6, 0.03, 0.03), (0.03, 0.4, 0.05), (0.03, 0.05, 0.5), (0.03, 0.45, 0.6), (0.5, 0.05, 0.4), (0.8, 0.65, 0.03)]


def flat_material(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.9
    return m


def quad(name, corners, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector(c) for c in corners], [], [tuple(range(len(corners)))])
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(name, lo, hi, material):
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    v = [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    f = [(4, 6, 7, 5), (0, 1, 3, 2), (2, 3, 7, 6), (0, 4, 5, 1), (1, 5, 7, 3), (0, 2, 6, 4)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], f)
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(material)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def import_asset(job):
    """Every mesh of the asset, placed. Connector nodes and collision shapes (col_NN) are left out."""
    placed = []
    templates = {}
    for i, m in enumerate(job["meshes"]):
        if m["glb"] not in templates:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=m["glb"])
            new = [o for o in bpy.data.objects if o not in before]
            keep = [o for o in new if o.type == "MESH" and not o.name.startswith("col_")]
            bpy.context.view_layer.update()
            worlds = {o: o.matrix_world.copy() for o in keep}      # read before any parent is removed
            for o in keep:
                o.animation_data_clear()          # a clip's channels would otherwise overwrite the placement
                o.parent = None
                o.matrix_world = worlds[o]
            for o in new:
                if o not in keep:
                    bpy.data.objects.remove(o, do_unlink=True)
            templates[m["glb"]] = [(o, o.matrix_world.copy()) for o in keep]
            fresh = True
        else:
            fresh = False
        # The job's matrix is column-major in the spec's axes.
        a = m["matrix"]
        spec = Matrix([[a[c * 4 + r] for c in range(4)] for r in range(4)])
        world = C @ spec @ C.inverted()
        for o, base in templates[m["glb"]]:
            if not fresh:
                o = o.copy()                      # shares the mesh data
                bpy.context.scene.collection.objects.link(o)
            o.matrix_world = world @ base
            placed.append(o)
    return placed


def bounds(objects):
    lo = Vector((math.inf,) * 3)
    hi = Vector((-math.inf,) * 3)
    for o in objects:
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def references(lo, hi):
    """A 1.8 m figure, a 1 m ruler and the colour chart, standing just outside the asset's right side, facing the front."""
    dark = flat_material("ref_dark", (0.03, 0.03, 0.03))
    light = flat_material("ref_light", (0.8, 0.8, 0.8))
    x = hi.x + 0.35
    y = lo.y                                         # the asset's front plane (front is -Y in Blender)
    made = []
    # Figure: head, torso and legs as flat cut-outs, 1.8 m to the top of the head, 0.45 m across the shoulders.
    for name, (x0, x1, z0, z1) in {"legs": (0.11, 0.34, 0.0, 0.86), "torso": (0.0, 0.45, 0.86, 1.52), "neck": (0.18, 0.27, 1.52, 1.57), "head": (0.125, 0.325, 1.57, 1.8)}.items():
        made.append(quad(f"ref_figure_{name}", [(x + x0, y, z0), (x + x1, y, z0), (x + x1, y, z1), (x + x0, y, z1)], dark))
        # A second cut-out at right angles, so the figure also reads from the side views.
        made.append(quad(f"ref_figure_{name}_side", [(x + 0.225, y - 0.11, z0), (x + 0.225, y + 0.11, z0), (x + 0.225, y + 0.11, z1), (x + 0.225, y - 0.11, z1)], dark))
    # Ruler: 1 m tall, bands of 0.1 m.
    rx = x + 0.6
    for i in range(10):
        made.append(quad(f"ref_ruler_{i}", [(rx, y, i * 0.1), (rx + 0.06, y, i * 0.1), (rx + 0.06, y, (i + 1) * 0.1), (rx, y, (i + 1) * 0.1)], dark if i % 2 == 0 else light))
        made.append(quad(f"ref_ruler_{i}_side", [(rx + 0.03, y - 0.03, i * 0.1), (rx + 0.03, y + 0.03, i * 0.1), (rx + 0.03, y + 0.03, (i + 1) * 0.1), (rx + 0.03, y - 0.03, (i + 1) * 0.1)], dark if i % 2 == 0 else light))
    # Chart: 6 x 2 patches of 0.1 m, lying on a stand at 1.1 m beside the ruler.
    cx = rx + 0.2
    for i, rgb in enumerate(CHART):
        col, row = i % 6, i // 6
        made.append(quad(f"ref_chart_{i}", [(cx + col * 0.1, y, 1.1 + row * 0.1), (cx + col * 0.1 + 0.1, y, 1.1 + row * 0.1), (cx + col * 0.1 + 0.1, y, 1.2 + row * 0.1), (cx + col * 0.1, y, 1.2 + row * 0.1)],
                         flat_material(f"ref_chart_{i}", rgb)))
    made.append(box("ref_chart_post", (cx + 0.29, y + 0.005, 0), (cx + 0.31, y + 0.02, 1.1), dark))
    return made


def world_and_sun(light):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("standard")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.78, 0.82, 1)   # an even overcast sky
    bg.inputs["Strength"].default_value = 1.0 if light == "overcast" else 0.35
    scene.world = world
    if light == "sun":
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 4.0
        sun.angle = math.radians(0.53)
        ob = bpy.data.objects.new("sun", sun)
        scene.collection.objects.link(ob)
        # From the front left, 45 degrees up.
        ob.rotation_euler = (math.radians(45), 0, math.radians(-35))


def camera_for(view, lo, hi, all_lo, all_hi):
    """A camera looking at the asset. Distance follows the size of what the view frames."""
    cam = bpy.data.cameras.new(view)
    cam.lens = 50
    ob = bpy.data.objects.new(f"cam_{view}", cam)
    bpy.context.scene.collection.objects.link(ob)
    if view == "close":
        # A patch of the front at most 3 m across, at eye height on a tall asset and at mid height on a short one.
        size = max(min(max(hi.x - lo.x, hi.z - lo.z) * 0.6, 3.0), 0.15)
        centre = Vector(((lo.x + hi.x) / 2, lo.y, min((hi.z - lo.z) * 0.5, 1.5)))
        direction = Vector((0.35, -1, 0.25))
    else:
        centre = (all_lo + all_hi) / 2
        ext = all_hi - all_lo
        direction, size = {
            "front": (Vector((0, -1, 0.12)), max(ext.x, ext.z)),
            "back": (Vector((0, 1, 0.12)), max(ext.x, ext.z)),
            "left": (Vector((-1, 0, 0.12)), max(ext.y, ext.z)),
            "right": (Vector((1, 0, 0.12)), max(ext.y, ext.z)),
            "three_quarter": (Vector((0.8, -1, 0.75)), ext.length),
        }[view]
        size = max(size, 0.3)
    direction.normalize()
    half_fov = math.atan(cam.sensor_width / 2 / cam.lens)
    distance = (size / 2 * 1.15) / math.tan(half_fov) + size / 2
    ob.location = centre + direction * distance
    ob.rotation_euler = (centre - ob.location).to_track_quat("-Z", "Y").to_euler()
    cam.clip_start = max(0.01, distance / 1000)
    cam.clip_end = distance * 20 + 100
    return ob


def main():
    job = json.loads(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8").read())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"                    # the same picture on every machine
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.seed = 0
    scene.render.resolution_x = scene.render.resolution_y = job["size"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    asset = import_asset(job)
    if not asset:
        raise SystemExit("the asset has no mesh to render")
    lo, hi = bounds(asset)
    # Stand the asset on the ground: its lowest point at z = 0 in the picture.
    lift = Matrix.Translation((0, 0, -lo.z))
    for o in asset:
        o.matrix_world = lift @ o.matrix_world
    hi.z -= lo.z
    lo.z = 0
    refs = references(lo, hi)
    all_lo, all_hi = bounds(asset + refs)
    reach = max((all_hi - all_lo).length * 6, 30)
    quad("ground", [(-reach, -reach, 0), (reach, -reach, 0), (reach, reach, 0), (-reach, reach, 0)], flat_material("ground", (GROUND_GREY,) * 3))
    world_and_sun(job["light"])

    for view in job["views"]:
        scene.camera = camera_for(view, lo, hi, all_lo, all_hi)
        scene.render.filepath = f"{job['out']}/{job['prefix']}{view}.png"
        bpy.ops.render.render(write_still=True)
    print("RENDERED " + json.dumps({"views": job["views"], "size_m": [round(v, 4) for v in ((hi - lo).x, (hi - lo).z, (hi - lo).y)], "blender": bpy.app.version_string, "settings": SETTINGS_VERSION}))


if __name__ == "__main__":
    main()
