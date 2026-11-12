# Opening an area (Draft v0.1)

Nov 12, 2026

This is the guide for someone who wants to start building a part of the world that nobody has opened. You do the research for your area: the map data, the open street photos, and the map page that shows both. The project supplies the tools and this guide. Everything here is Claude's proposal from 2026-11-12, written after the owner asked for it; he has not confirmed the steps. The tools have been run on one cell in Lisbon and one in Tokyo, and on no machine but the one they were written on.

## Words used here

- **Cell**: one square of the world grid, between 177 and 354 m across depending on latitude. An area is one cell. `docs/world-model.md`, "The world grid", says why the cells are fixed.
- **Data pack**: the folder `data/<cell id>/`, holding the area's building outlines and heights.
- **Blockout**: a plain box for every building, made from its outline and height.
- **A0 to A3**: how accurate a building is. A0 is the blockout, A1 (Dressed) has typical windows and doors on the right shape, A2 is the true exterior, A3 is true inside and out. `docs/world-model.md`, "Accuracy levels".
- **Wall reference**: a front-on, true-scale image of one real wall, made from street photos. A builder matches a texture to it.

## Files the steps produce

| Thing | Where | Made by |
| --- | --- | --- |
| The area's cell of the world grid | `data/<cell id>/region.json` | `kit.py open` |
| Where the data came from, and its licence | `data/<cell id>/SOURCES.md` | `kit.py open` |
| Building outlines and heights | `data/<cell id>/places.json`, `buildings.geojson` | `kit.py open` |
| A plain box model of every building (the blockout, A0) | `data/<cell id>/blockout/` | `kit.py open` |
| A list of the open street photos around the area | `data/raw/mapillary/<cell id>/index.json` | `kit.py photos` |
| A map page of the buildings and the photos | `data/<cell id>/map/index.html` | `kit.py map` |

## Software and accounts

- Python 3 and Node 20 or later. The project's checks run Python 3.12 and Node 20 and 22; older Pythons have not been tried. `cell` and `open` need nothing else.
- For `photos` and `map`: numpy, at the version pinned in `tools/refs/requirements.txt`, and your own Mapillary token. A token is free: sign in at mapillary.com/dashboard/developers, register an application, and copy its client token. `map --photos 0` needs no token.
- For wall references (step 5): the other packages in `tools/refs/requirements.txt`.

## Sources you may use

- Building outlines: OpenStreetMap, or a government city model with an open licence, such as Japan's PLATEAU.
- Street photos: Mapillary (CC BY-SA 4.0), or photos you took yourself.
- Never Google Maps, Google Earth or Street View, for anything. That covers a private look to check your work. Google's terms bar making data from them.
- Never a source whose licence you have not read. Write the source and its licence in the area's `SOURCES.md`. `kit.py open` starts that file for you.

## Steps

### 1. Find your cell

```sh
python3 tools/region-kit/kit.py cell --lat 38.7118 --lon -9.13
```

This prints the cell's ID (`c17-62211-50227`), its edges, its size in metres and its neighbours. The number after `c` is the cell's tile level, which follows latitude: 17 up to about 55 degrees north or south, 16 from there to about 73. A cell on the line between two levels has two neighbours on that side. Take the latitude and longitude from OpenStreetMap: right-click the map at openstreetmap.org and choose "Show address", or read them from the end of the page's address (`#map=<zoom>/<latitude>/<longitude>`).

Check that nobody has opened the cell: `data/<cell id>/` must not exist on `main`, and no open pull request may add it. Search the repository's pull requests for the cell ID, or run `gh pr list --search "<cell id>"`.

### 2. Open it

```sh
python3 tools/region-kit/kit.py open --lat 38.7118 --lon -9.13 --name "Alfama, Lisbon"
```

This asks the public Overpass server for OpenStreetMap's buildings, keeps those whose outline centre is in the cell, and builds the blockout. A building that crosses the cell's edge is never cut: it belongs whole to the cell that holds its centre, so your pack can reach a little past the edge and your neighbour's can reach a little into yours.

The command prints how many buildings have a tagged height, how many have a height worked out from a storey count at 3 m a storey, and how many have neither and were given 6 m ("assumed"). Where the assumed count is the largest of the three, the blockout's heights are mostly wrong, and the most useful first job in the area is adding heights to OpenStreetMap itself: the `height` and `building:levels` tags, described at wiki.openstreetmap.org/wiki/Key:height.

If the command fails (the Overpass server is often busy), it leaves nothing behind and can be run again. To cut the pack afresh later, pass `--again`; the name already recorded is kept.

For a city with a PLATEAU model, download the ward's CityGML archive and pass it:

```sh
python3 tools/region-kit/kit.py open --cell c17-116439-51599 --name "Oshiage 2, Sumida, Tokyo" --plateau-zip path/to/archive.zip
```

That line shows the form. Oshiage 2 is already in the repository as `data/tokyo-sumida-oshiage-2/`, a pack cut by hand before the grid existed, so do not submit this cell.

### 3. Index the photos

```sh
export MAPILLARY_TOKEN='MLY|...'          # PowerShell: $env:MAPILLARY_TOKEN = 'MLY|...'
python3 tools/region-kit/kit.py photos c17-62211-50227
```

This lists every Mapillary photo in the cell and up to 40 m beyond its edges, with its position and heading. Only the list is fetched. It then reports how many buildings some photo shows. A photo shows a building when it stands within 40 m of one of its walls, faces it, and has no other building in between; that is worked out from positions and headings, so it is a guess until someone looks. In the Lisbon test cell, 5,559 photos were listed and 128 of 150 buildings were shown by at least one.

### 4. Build the map

```sh
python3 tools/region-kit/kit.py map c17-62211-50227
```

Open `data/<cell id>/map/index.html` in a browser. Tap a dot to see where a photo was taken and which way it faced; tap a building to see which photos show it. The page stores up to 400 photos at 1,024 pixels, shared out between the buildings, and links to Mapillary for the rest. `--photos 0` stores none.

### 5. Make wall references (optional)

`tools/refs/README.md` covers this. A building needs a wall reference before it can be claimed as a true exterior (A2), so run this when someone wants to take a building that far; an area can be opened and dressed (A1) without it. The tool has only been run in Tokyo. Expect most walls to fail: in the first run there, 9 of 48 photographed walls gave a usable image.

### 6. Take photos where there are none

A building that no photo shows cannot go past Dressed (A1). You can fix that yourself: walk the street, photograph each wall front-on from across the road, and upload the photos to Mapillary. Run steps 3 and 4 again and they appear like anyone else's. Whether step 5 can use them is untested outside Tokyo.

- Stay on public ground.
- Mapillary blurs faces and number plates when it processes an upload. Do not send photos to the project any other way.
- A photo's recorded position is easy to fake. The project does not treat it as proof of where a photo was taken.

### 7. Submit the area

Fork the repository, commit on a branch, and open a pull request to `main` titled `Open <cell id>: <name>`.

Until the project's licence is chosen, that pull request carries two files: `data/<cell id>/region.json` and `data/<cell id>/SOURCES.md`. Leave the rest of the folder out of the commit. That interim rule is Claude's and the owner has not confirmed it. The reason: a data pack made from OpenStreetMap is a derived database and must stay under the Open Database License, and a page of Mapillary photos must stay under CC BY-SA 4.0, and nobody has decided yet how those sit beside the project's own licence. Anyone can rebuild the pack from those two files:

```sh
python3 tools/region-kit/kit.py open --cell <cell id> --again
```

A PLATEAU area also needs the same archive, passed with `--plateau-zip`.

Git already ignores `data/raw/`, `data/*/refs/` and `data/*/map/`. Do not force them in.

The claim spec proposes one home block per contributor. Nothing enforces that yet, and the owner has not confirmed it.

## After the area is open: drafting its buildings

An open area is a set of plain boxes. Each building then needs a blueprint before anyone can build it from atoms: a list of the wall pieces it needs and how they join. `skill/blueprint-skill.md` is the guide for drafting one building. The contributor writes a plan of each wall, from a wall reference where one exists and as a typical facade where none does, and `tools/blueprint/blueprint.mjs` turns the plan into the blueprint, the layout and the tasks. The guide and the tool are proposals, rehearsed on four buildings of Oshiage 2. The tool drafts walls only, for outlines whose corners are square.

## Parts that do not exist yet

- Claiming. Opening an area does not reserve it. The claim spec's "Home blocks" section proposes one home block per contributor; the service that would record it does not exist.
- Terrain. Every building from OpenStreetMap stands at height 0.
- Roof shapes, outside PLATEAU cities.
- A check that an OpenStreetMap outline sits where the real wall does. Nobody has measured it.
- A hosted copy of the map. The page is a local file.

## Open questions

- [ ] Does a pull request that opens an area carry only `region.json` and `SOURCES.md`, or the whole pack, once the licence is chosen?
- [ ] Who checks that a new area's sources are allowed: a maintainer, or an automated check on `SOURCES.md`?
- [ ] Is Overture Maps a better default than OpenStreetMap for outlines and heights? It has not been tried.
- [ ] Should the project keep one shared Mapillary token for contributors, or does everyone bring their own?
- [ ] Does the wall-reference tool work outside Tokyo? It has not been run anywhere else.
