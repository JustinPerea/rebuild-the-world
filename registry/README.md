# Connector registry

The list of connector types parts may use (asset spec, "Pivots and connectors"). Each entry fixes the type name, its two sides (`a` and `b`) and the mating dimensions, such as hub diameter or opening width and height.

A connector node in an asset is named `conn_<type>_<side>_<index>` and is valid only if `<type>` is registered here. New types are added by pull request and approved by a maintainer before any asset uses them.

Filled in at build step 3 (first types: wheel hub, door hinge, facade module edge).
