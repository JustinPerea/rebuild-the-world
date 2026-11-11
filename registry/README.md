# Connector registry

The list of connector types atoms may use (asset spec, "Connectors"), in `connectors.json`. Three trial types are registered for the first building test: `facade_edge`, `storey_stack` and `door_hinge`. A trial type may change without a migration.

Each entry fixes:

| Field | Content |
| --- | --- |
| `type` | The name used in connector node names |
| `sides` | What `a` and `b` each attach to |
| `mating_dimensions` | The sizes both sides must share, such as hub diameter or opening width and height |
| `symmetry` | `none`, a count, or `free` |
| `motion` | `fixed`, `hinge`, `spin`, `ball` or `slide`. This is the default, and a joint in a manifest may state its own (asset spec, "Variation") |
| `axis` | For a moving type, the connector axis the motion uses: `x`, `y` or `z` |
| `frame` | For each side, where the connector sits on its atom and which way its +Z and +Y point |

A connector node in an asset is named `conn_<type>_<side>_<index>` and is valid only if `<type>` is registered here. New types are added by pull request and approved by a maintainer before any asset uses them.

## Candidates for the first types

Filled in at build step 3. The planned first types were wheel hub, door hinge and facade module edge.

The Frontier Colony library has built and checked five mechanical types on one robot (39 joints, every one mating with no gap), plus an `fx` type for effects. They are candidates here, not registered:

| Type | Sides (a / b) | Motion | Used for |
| --- | --- | --- | --- |
| `wheel_hub` | Axle / wheel | Spin, and on one seat spin with a slide (`spin_slide`) | A tire on its hub |
| `pin` | Fork / tongue | Hinge | Elbows, knees, knuckles |
| `ball` | Socket / ball | Ball | Shoulders, hips, neck, waist, wrists, ankles, blade roots |
| `slide` | Sleeve / rod | Slide | A telescoping mast |
| `mount` | Seat on the host / foot of the fitting | Fixed | Eyes, a back pack, jets |

That library turns its hinges and its wheel about the connector's +X and slides along +Z. Since 2026-11-11 each of its connectors carries a size code, such as `d128` for a 128 mm ball, and two connectors fit when type, side and every registered dimension agree within 0.5 mm. `spin_slide` is not one of this contract's motions. Under asset spec v0.4 the tire's slide and the ankles' roll would be written on the joint in the manifest, and the connectors would stay a wheel hub and a pin. Its registry is at `~/Developer/frontier-colony/experiments/fable52-character-20261109/library/registry/connectors.json`.
