# Changelog

## 0.2.0 · 2026-11-05

- Realistic 3D view, now the default: tractor unit with cab details and fuel tank, curtainsider with the near curtain pulled open and rear doors folded back, rigid truck, panel van, corrugated container on a skeletal chassis, asphalt yard with bay lines, image-based lighting and shadows
- Realistic cargo: EPAL-style pallets (runners, blocks, deck boards), stacked cartons under coloured stretch film, labelled and taped cartons, strapped long bundles
- Everything is generated in code; no models or images are downloaded
- "Diagram" mode keeps the previous clean rendering
- More realistic sample load (automotive parts)

## 0.1.0 · 2026-11-05

First public release.

- Heuristic 3D load planner (extreme points, wall building, three orientation strategies) running in a Web Worker
- Rules: upright only with optional 90° turning, per-item stackability, minimum base support, payload, delivery order (LIFO)
- Vehicles: 13.6 m curtainsider and mega trailers, rigid truck, panel van, 20'/40'/40' HC containers, custom
- 3D view with presets, colour by item or stop, hover details, loading-sequence player
- Loading-metre ruler with centre of gravity, kingpin and axle markers; kingpin/axle load estimate for trailers
- Excel/Google Sheets paste and CSV import (Turkish/English headers, mm/cm/m), CSV export
- Printable driver's sheet, compressed share links, Turkish and English UI, light and dark themes
