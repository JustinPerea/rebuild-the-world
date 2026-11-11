# Rebuild the World: Vision (Draft v0.3)

Nov 11, 2026

The goal is an accurate, playable model of Earth, built in the open by many people's AI tools and specified for the tools of the coming decades, not only today's. Every other spec answers to this page.

## What we are building

- **Accurate.** Real places are modelled as they are: terrain, streets, buildings and landmarks. A whole region is first blocked out as plain shapes from map data, and each place is replaced by an accurate model over time.
- **Playable.** The model ends up as a multiplayer sandbox. Objects work: cars drive, doors open, a skateboard can be ridden.
- **Open.** The community builds a library of atoms, the smallest reusable pieces, plus the rules that place them, and open map data supplies the layout. Contributors use their own AI tools on their own machines.
- **Earth first.** The world model leaves room for other bodies, such as the Moon and Mars, without a redesign.

## Built for future tools

The specs describe what the finished world must be. A separate capability profile says how much of that is asked of contributors today.

- A requirement that is hard for today's tools is not deleted. It moves to a later profile.
- Every asset keeps its recipe and a plain description, so a better tool can rebuild it under the same ID.
- Limits such as triangle counts and texture sizes are expected to rise. IDs, coordinates and connectors are not expected to change.

## Libraries that share the contract

The asset contract is not tied to Earth. Any library that follows it gets the same connectors, manifests and checks, and sets its own look and its own rules on copying the real world (owner, 2026-11-10).

- Earth, Again is the first library: real places, in grounded realism.
- Frontier Colony is the second: an invented world with a cel look. Its robot was the first object rebuilt as atoms under the contract, and the gaps that build found are now in asset spec v0.3.

## What must stay true

These are the durable contract. Changing one breaks the library, so each change needs a major version and a migration.

| Stays fixed | Why |
| --- | --- |
| Asset IDs and versions | Anything built from an asset can be rebuilt predictably |
| Units, axes and real-world coordinates | Atoms and places line up without manual fixing |
| Connector names, sides and mating dimensions | Atoms made years apart still snap together |
| Each asset's description, recipe and sources | Better tools can regenerate it, and attribution survives |
| Open, engine-neutral file formats | The library outlives any one engine |

The contract is strict where two atoms meet. Away from its connectors an atom may vary in size, look and motion within ranges it declares (owner, 2026-11-11; asset spec, "Variation").

## What is expected to change

| Changes over time | Lives in |
| --- | --- |
| Geometry and texture budgets, mesh rules | Capability profiles |
| Which fidelity tier is required | Capability profiles and the art style guide |
| How closely each place matches the real one | Accuracy levels in the world model |
| Claim windows, trust thresholds, review sampling | Claim system spec |
| The game engine | Engine import pipeline |

## How the specs fit together

| Layer | Question it answers | Document |
| --- | --- | --- |
| Vision | What are we building, and for when? | This page |
| World model | How does Earth break down into things people can build? | `world-model.md` |
| Durable contract | What must every asset obey forever? | `asset-spec.md` |
| Capability profile | How much is asked today? | `capability-profiles.md` |
| Look | What should it look like? | `art-style-guide.md` |
| Process | Who builds what, and how is it checked? | `claim-system-spec.md` |
| Contributor service | How does a contributor's agent get work and the current rules? | `contributor-service.md` |
| Accuracy and data | What may be copied from the real world, and from which sources? | `accuracy-and-data.md` |

## Not decided

- [ ] The name on this repository and these documents. The public name is "Earth, Again" (owner, 2026-11-10, recorded by the brand session), and the announcement film was posted under it. The repository still carries the working title "Rebuild the World", and no domain, organisation or trademark is registered.
- [ ] Whether brands and specific product designs can be modelled accurately. This waits on a lawyer (see `accuracy-and-data.md`).
- [ ] How far "playable" goes for the first demo: which objects must work, and which only need to look right.
- [ ] When a second body, such as the Moon, becomes a real task and not a teaser.
