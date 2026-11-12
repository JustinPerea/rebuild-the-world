"""Builds bld_corner_post_01: a square rendered corner post, 0.15 m by 2.8 m by 0.15 m.

    blender --background --factory-startup --python assets/bld/bld_corner_post_01/source/build.py
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ASSET = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(ASSET, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "skill"))
import rtw_blender as rtw

T, H = 0.15, 2.8
rtw.reset()
rtw.library_material(REPO, "mat_render_cream_01")
root, triangles, (lo, hi) = rtw.box_solid("bld_corner_post_01", (0, 0, -T), (T, H, 0), "mat_render_cream_01")
rtw.connector(root, "conn_facade_edge_b_01", (0, 0, 0), (-1, 0, 0), (0, 1, 0))
rtw.connector(root, "conn_facade_edge_a_01", (T, 0, -T), (0, 0, -1), (0, 1, 0))
rtw.connector(root, "conn_storey_stack_a_01", (0, H, 0), (0, 1, 0), (0, 0, 1))
rtw.connector(root, "conn_storey_stack_b_01", (0, 0, 0), (0, -1, 0), (0, 0, 1))
rtw.collision_box(root, 1, (0, 0, -T), (T, H, 0))
rtw.export_glb(os.path.join(ASSET, "asset.glb"))

mating = {"storey_height": H, "wall_thickness": T}
stack = {"module_width": T, "wall_thickness": T}
rtw.write_metadata(os.path.join(ASSET, "asset.json"), {
    "asset_id": "bld_corner_post_01", "version": "0.2.0", "task_id": "task_bld_corner_post_01",
    "spec_version": "0.6", "profile": "Profile 1 (2026)", "style_version": "0.3",
    "library": "Earth, Again", "kind": "library", "class": "Facade module", "tier": 1, "size": "S",
    "dimensions_m": [round(hi[a] - lo[a], 4) for a in range(3)], "triangles": triangles,
    "connectors": [
        {"name": "conn_facade_edge_a_01", "type": "facade_edge", "side": "a", "mating": mating},
        {"name": "conn_facade_edge_b_01", "type": "facade_edge", "side": "b", "mating": mating},
        {"name": "conn_storey_stack_a_01", "type": "storey_stack", "side": "a", "mating": stack},
        {"name": "conn_storey_stack_b_01", "type": "storey_stack", "side": "b", "mating": stack},
    ],
    "variation": {"scale": {"y": [0.01, 2.2]}},
    "mirror_safe": False,
    "materials": {"library": ["mat_render_cream_01"], "custom": []},
    "behaviours": [],
    "description": "A square rendered post that turns a facade through a right angle at an outside corner. One storey high and as thick as the wall modules. It is placed scaled in height to each course of a building.",
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
