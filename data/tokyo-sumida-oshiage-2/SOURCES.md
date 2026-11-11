# Sources for this data pack

| File | Made from | Licence and duties |
| --- | --- | --- |
| `places.json`, `buildings.geojson`, `roof-shapes.json`, `blockout/` | 3D City Model (Project PLATEAU), Sumida ward, fiscal 2023, CityGML v3, building tiles 53394654 and 53394655 | Public Data License 1.0, which PLATEAU's site policy says is compatible with CC BY 4.0. Name the source, and say that the data was edited |

Source: Ministry of Land, Infrastructure, Transport and Tourism, Project PLATEAU, "3D都市モデル（Project PLATEAU）墨田区（2023年度）", https://www.geospatial.jp/ckan/dataset/plateau-13107-sumida-ku-2023. Copyright in the city model belongs to the local government. Site policy: https://www.mlit.go.jp/plateau/site-policy/ (read 2026-11-11).

Edited by this project: buildings inside a 300 m square were cut out, coordinates were converted to local metres, and plain box models were generated from outlines and heights. Nothing here was made or checked by the Ministry or by Sumida ward.

## What the data is

- 350 buildings whose outline centre lies within 150 m east-west and north-south of 35.71216 N, 139.81199 E.
- `height_m` is the source's measured height for 302 buildings. For the other 48 it is the height of the source's roof-shape model, and `height_from` says which.
- `ground_m` is the lowest point of the roof-shape model, in metres above sea level. Six buildings have no roof-shape model and no ground level.
- `usage` is not recorded for about half the buildings.
- The source is drawn at map scale 1:2,500 from aerial survey. Its geometry carries no windows, doors or signs. The archive also holds aerial photo textures for the roofs and walls of 344 of these buildings, at about 6 pixels per metre on a typical wall (median crop 42 by 35 pixels). This pack does not include them: they are too coarse to show a facade's openings on most houses.

## Rebuilding it

```sh
python3 -I tools/data-pack/plateau_block.py --zip <the CityGML archive> --region data/tokyo-sumida-oshiage-2/region.json
node tools/blockout/build.mjs data/tokyo-sumida-oshiage-2
```

The archive is `13107_sumida-ku_city_2023_citygml_1_op.zip` (337,329,283 bytes), downloaded from the dataset page above. It is not stored in this repository.
