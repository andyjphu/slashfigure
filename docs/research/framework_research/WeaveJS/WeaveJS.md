# Weave.js

- **Full Name:** Weave.js (by Inditex)
- **URL:** https://github.com/InditexTech/weavejs
- **Blog:** https://medium.com/@InditexTech/meet-weave-js
- **License:** Check repo

## What It Does
Open-source collaborative canvas framework. Three-layer architecture:
1. **Canvas rendering** -- Konva.js + custom React Reconciler
2. **Real-time sync** -- Yjs CRDT + SyncedStore
3. **User interaction** -- Actions + Plugins

## Key for Our Project
Complete reference architecture for building a collaborative canvas app. Shows how to wire Yjs into a canvas rendering pipeline. Custom React Reconciler detects and transmits only minimal state changes.

## Key Insight
The three-layer separation (render / sync / interaction) is a clean architecture worth emulating.
