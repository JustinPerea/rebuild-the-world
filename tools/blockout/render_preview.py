"""Renders a preview picture of a region blockout.

    blender --background --factory-startup --python tools/blockout/render_preview.py -- \
        data/tokyo-sumida-oshiage-2/blockout/blockout.glb out.png

Buildings in the start block are drawn darker. This is a preview, not the standard render scene.
"""
import sys, math
import bpy
from mathutils import Vector

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for o in objs:
    o.color = (0.25, 0.5, 0.42, 1) if o.get("in_start_block") else (0.82, 0.8, 0.76, 1)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2; size = max(hi.x - lo.x, hi.y - lo.y)

bpy.ops.mesh.primitive_plane_add(size=size * 3, location=(centre.x, centre.y, lo.z - 0.02))
bpy.context.object.color = (0.95, 0.94, 0.9, 1)

cam_data = bpy.data.cameras.new("cam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = size * 1.25
cam = bpy.data.objects.new("cam", cam_data); bpy.context.scene.collection.objects.link(cam)
d = Vector((-1.0, -1.25, 1.1)).normalized()            # from the south-west, looking down
cam.location = centre + d * size * 3
cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.clip_end = size * 10
s = bpy.context.scene; s.camera = cam
s.render.engine = "BLENDER_WORKBENCH"
s.display.shading.light = "STUDIO"; s.display.shading.color_type = "OBJECT"
s.display.shading.show_shadows = True; s.display.shading.show_cavity = True
s.display.shading.shadow_intensity = 0.35
s.render.resolution_x, s.render.resolution_y = 1400, 1000
s.render.film_transparent = False
s.view_settings.view_transform = "Standard"
s.display.shading.background_type = "WORLD"
s.world = bpy.data.worlds.new("w"); s.world.color = (0.95, 0.94, 0.9)
s.render.filepath = out; s.render.image_settings.file_format = "PNG"
bpy.ops.render.render(write_still=True)
print("rendered", len(objs), "buildings to", out)
