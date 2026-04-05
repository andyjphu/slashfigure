# perfect-freehand

- **Full Name:** perfect-freehand
- **URL:** https://github.com/steveruizok/perfect-freehand
- **License:** MIT

## What It Does
Library for drawing pressure-sensitive freehand lines. Two-phase: `getStrokePoints()` processes raw input into spline points with metadata (pressure, vector, distance), then `getStrokeOutlinePoints()` generates polygon outline. Simulates pressure from velocity when real pressure unavailable.

## Key for Our Project
Gold standard algorithm for freehand annotation in our drawing tool. Key options: size (8), thinning (0.5), smoothing (0.5), streamline (0.5), simulatePressure (true).
