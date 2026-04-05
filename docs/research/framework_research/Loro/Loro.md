# Loro

- **Full Name:** Loro -- Reimagine State Management with CRDTs
- **URL:** https://github.com/loro-dev/loro
- **License:** MIT
- **Language:** Rust (WASM + Swift bindings)

## What It Does
Rust CRDT library with JS bindings via WASM. Integrates Fugue algorithm for minimal interleaving anomalies. Preserves full version history like Git. Optimized for memory, CPU, loading speed.

## Key for Our Project
If building with Rust/WASM (which Figma validates as the performance path), Loro is the natural CRDT choice. JSON-like collaborative data structures directly, not bolted on. More modern than Automerge with better memory characteristics.
