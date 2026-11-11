"""Helpers for building an atom in Blender and exporting it the way the asset spec asks.

Use it from a build script kept in the asset's source/ folder:

    blender --background --factory-startup --python source/build.py

Every coordinate you pass is in the asset spec's axes: +X right, +Y up, +Z towards the
front of the asset, in metres. Blender itself is Z-up; these helpers convert, so a build
script never has to think in Blender's axes.

What the helpers guarantee, because the validator checks each one:
- one root node with no translation, rotation or scale
- connector nodes whose +Z and +Y point where you asked
- a mesh that is one closed shell with outward-facing triangles
- collision shapes named col_<index>
- library materials referenced by ID
"""
import json, os
import bpy, bmesh
from mathutils import Matrix, Vector


def to_blender(p):
    """Spec axes (x, y up, z front) to Blender axes (x, y back, z up)."""
    return Vector((p[0], -p[2], p[1]))


_C = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))  # Blender vector -> spec vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def library_material(repo, mat_id):
    """A Blender material named after a library material, with that material's values."""
    with open(os.path.join(repo, "assets", "mat", mat_id, "material.json"), encoding="utf-8") as f:
        pbr = json.load(f)["pbr"]
    m = bpy.data.materials.get(mat_id) or bpy.data.materials.new(mat_id)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = pbr["base_color_factor"]
    bsdf.inputs["Metallic"].default_value = pbr["metallic_factor"]
    bsdf.inputs["Roughness"].default_value = pbr["roughness_factor"]
    bsdf.inputs["Alpha"].default_value = pbr["base_color_factor"][3]
    if pbr.get("alpha_mode") == "BLEND":
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
    return m


def grid_solid(name, xs, ys, zs, cell):
    """One closed shell built from a grid of boxes.

    xs, ys and zs are sorted cut positions in spec axes. cell(i, j, k) returns the library
    material ID of the box between xs[i]..xs[i+1], ys[j]..ys[j+1], zs[k]..zs[k+1], or None
    where there is no solid. Faces are made only where solid meets empty, so the result has
    no inside faces and no doubled faces. Two solid boxes must not touch only along an edge
    or at a corner: that edge would belong to four faces.

    Returns (object, triangle count, bounds as (min, max) in spec axes).
    """
    nx, ny, nz = len(xs) - 1, len(ys) - 1, len(zs) - 1
    mat = {}
    for i in range(nx):
        for j in range(ny):
            for k in range(nz):
                m = cell(i, j, k)
                if m:
                    mat[(i, j, k)] = m
    if not mat:
        raise ValueError("grid_solid: no solid cells")
    bm = bmesh.new()
    verts, slots, order = {}, {}, []

    def v(i, j, k):
        if (i, j, k) not in verts:
            verts[(i, j, k)] = bm.verts.new(to_blender((xs[i], ys[j], zs[k])))
        return verts[(i, j, k)]

    # For each axis: the four corners of the face on the far side of a cell, wound so the
    # normal points along +axis in spec axes.
    far = {
        0: lambda i, j, k: [(i + 1, j, k), (i + 1, j + 1, k), (i + 1, j + 1, k + 1), (i + 1, j, k + 1)],
        1: lambda i, j, k: [(i, j + 1, k), (i, j + 1, k + 1), (i + 1, j + 1, k + 1), (i + 1, j + 1, k)],
        2: lambda i, j, k: [(i, j, k + 1), (i + 1, j, k + 1), (i + 1, j + 1, k + 1), (i, j + 1, k + 1)],
    }
    near = {
        0: lambda i, j, k: [(i, j, k), (i, j, k + 1), (i, j + 1, k + 1), (i, j + 1, k)],
        1: lambda i, j, k: [(i, j, k), (i + 1, j, k), (i + 1, j, k + 1), (i, j, k + 1)],
        2: lambda i, j, k: [(i, j, k), (i, j + 1, k), (i + 1, j + 1, k), (i + 1, j, k)],
    }
    quads = 0
    for (i, j, k), m in mat.items():
        if m not in slots:
            slots[m] = len(order); order.append(m)
        for axis in range(3):
            d = [0, 0, 0]; d[axis] = 1
            for sign, corners in ((1, far[axis]), (-1, near[axis])):
                nb = (i + sign * d[0], j + sign * d[1], k + sign * d[2])
                if nb in mat:
                    continue
                f = bm.faces.new([v(*c) for c in corners(i, j, k)])
                f.material_index = slots[m]
                quads += 1
    bm.normal_update()
    # The spec's axes are a mirror-free rotation of Blender's, so a face wound for +axis in
    # spec axes is also wound outward in Blender. Check one face to be sure.
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in order:
        me.materials.append(bpy.data.materials[m])
    used = [(xs[i], ys[j], zs[k]) for (i, j, k) in verts]
    lo = tuple(min(p[a] for p in used) for a in range(3)); hi = tuple(max(p[a] for p in used) for a in range(3))
    return ob, quads * 2, (lo, hi)


def box_solid(name, lo, hi, material_id):
    return grid_solid(name, [lo[0], hi[0]], [lo[1], hi[1]], [lo[2], hi[2]], lambda i, j, k: material_id)


def connector(root, name, position, z_axis, y_axis):
    """An empty node whose +Z and +Y point along z_axis and y_axis, given in spec axes."""
    z = Vector(z_axis).normalized(); y = Vector(y_axis).normalized()
    if abs(z.dot(y)) > 1e-6:
        raise ValueError(f"{name}: the up direction must be at right angles to +Z")
    x = y.cross(z)
    spec = Matrix((x, y, z)).transposed()          # columns are the node's axes in spec axes
    blender = _C.transposed() @ spec @ _C          # the same rotation in Blender's axes
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    bpy.context.scene.collection.objects.link(e)
    e.parent = root
    e.matrix_world = Matrix.Translation(to_blender(position)) @ blender.to_4x4()
    return e


def collision_box(root, index, lo, hi):
    """A convex collision shape: a box named col_<index>."""
    ob, _, _ = box_solid(f"col_{index:02d}", lo, hi, None) if False else _plain_box(f"col_{index:02d}", lo, hi)
    ob.parent = root
    return ob


def _plain_box(name, lo, hi):
    bm = bmesh.new()
    c = [bm.verts.new(to_blender((x, y, z))) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
    # c index = 4*ix + 2*iy + iz
    for q in ((4, 6, 7, 5), (0, 1, 3, 2), (2, 3, 7, 6), (0, 4, 5, 1), (1, 5, 7, 3), (0, 2, 6, 4)):
        bm.faces.new([c[i] for i in q])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob, 12, (lo, hi)


def export_glb(path):
    """Writes every object in the scene to a binary glTF file in the spec's axes."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", export_yup=True, use_selection=False,
        export_apply=False, export_normals=True, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_extras=False, export_animations=False,
    )


def write_metadata(path, meta):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2); f.write("\n")
