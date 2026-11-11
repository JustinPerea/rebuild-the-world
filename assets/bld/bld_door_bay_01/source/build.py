"""Builds bld_door_bay_01: a rendered wall module with a door opening and its frame.

    blender --background --factory-startup --python assets/bld/bld_door_bay_01/source/build.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(ASSET, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "skill"))
import rtw_blender as rtw

W, H, T = 1.0, 2.8, 0.15
X0, X1, TOP, F, STOP = 0.1, 0.9, 2.0, 0.03, -0.07     # opening, frame width, front of the frame
WALL, FRAME = "mat_render_cream_01", "mat_aluminium_dark_01"
xs = [0, X0, X0 + F, X1 - F, X1, W]
ys = [0, TOP - F, TOP, H]
zs = [-T, STOP, 0]


def cell(i, j, k):
    x, y, back = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2, k == 0
    if x < X0 or x > X1 or y > TOP:
        return WALL
    in_frame = x < X0 + F or x > X1 - F or y > TOP - F
    return FRAME if back and in_frame else None


rtw.reset()
for m in (WALL, FRAME):
    rtw.library_material(REPO, m)
root, triangles, (lo, hi) = rtw.grid_solid("bld_door_bay_01", xs, ys, zs, cell)
rtw.connector(root, "conn_facade_edge_a_01", (W, 0, 0), (1, 0, 0), (0, 1, 0))
rtw.connector(root, "conn_facade_edge_b_01", (0, 0, 0), (-1, 0, 0), (0, 1, 0))
rtw.connector(root, "conn_storey_stack_a_01", (0, H, 0), (0, 1, 0), (0, 0, 1))
rtw.connector(root, "conn_storey_stack_b_01", (0, 0, 0), (0, -1, 0), (0, 0, 1))
rtw.connector(root, "conn_door_hinge_a_01", (X0, 0, -0.05), (1, 0, 0), (0, 1, 0))
rtw.collision_box(root, 1, (0, 0, -T), (X0, H, 0))
rtw.collision_box(root, 2, (X1, 0, -T), (W, H, 0))
rtw.collision_box(root, 3, (0, TOP, -T), (W, H, 0))
rtw.export_glb(os.path.join(ASSET, "asset.glb"))

edge = {"storey_height": H, "wall_thickness": T}
stack = {"module_width": W, "wall_thickness": T}
rtw.write_metadata(os.path.join(ASSET, "asset.json"), {
    "asset_id": "bld_door_bay_01", "version": "0.1.0", "task_id": "task_bld_door_bay_01",
    "spec_version": "0.5", "profile": "Profile 1 (2026)", "style_version": "0.3",
    "library": "Earth, Again", "kind": "library", "class": "Facade module", "tier": 1, "size": "S",
    "dimensions_m": [round(hi[a] - lo[a], 4) for a in range(3)], "triangles": triangles,
    "connectors": [
        {"name": "conn_facade_edge_a_01", "type": "facade_edge", "side": "a", "mating": edge},
        {"name": "conn_facade_edge_b_01", "type": "facade_edge", "side": "b", "mating": edge},
        {"name": "conn_storey_stack_a_01", "type": "storey_stack", "side": "a", "mating": stack},
        {"name": "conn_storey_stack_b_01", "type": "storey_stack", "side": "b", "mating": stack},
        {"name": "conn_door_hinge_a_01", "type": "door_hinge", "side": "a", "limits": [-100, 0], "rest": 0,
         "mating": {"leaf_width": X1 - X0, "leaf_height": TOP}},
    ],
    "mirror_safe": False,
    "materials": {"library": [WALL, FRAME], "custom": []},
    "behaviours": [],
    "description": "A rendered wall module, 1.0 m wide and one storey high, with a door opening 0.8 m by 2.0 m and a dark aluminium frame that the door closes against. The door leaf is a separate atom.",
    "licence": "Not yet chosen for this project (see LICENSE.md)",
    "sources": [],
    "considered": [],
    "provenance": {
        "author": "claude-code-session", "co_authors": [],
        "tools": [{"name": "Claude Fable 5.2", "used_for": "planning and the build script"}, {"name": "Blender 5.0.1", "used_for": "geometry and export"}],
        "created": "2026-11-11", "dimension_source": "estimated",
    },
})
print("built", triangles, "triangles")
