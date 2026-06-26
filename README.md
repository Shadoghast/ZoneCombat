# Zone Combat

A Foundry VTT **module** (v14+) for relative range-band combat: instead of measured
grid movement, every token tracks its **band** (Close / Near / Medium / Long / Far)
relative to the active token, drawn as schematic concentric shells on the scene.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full design and decision log.

## Status

`v0.1.0` — skeleton. Loads in Foundry v14+, registers settings and the canvas overlay
layer, and renders the concentric shells around the selected/active token. The
propagation engine (§6.4) and layout solver (§7) are stubbed pending implementation.

## Compatibility

Foundry VTT **v14+ only**.
