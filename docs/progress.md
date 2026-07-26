# Route Planner Enhancements — Progress

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Completed
- [!] Blocked/issue

## Phase 1: Quick Wins

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 1.1 Favicon | [x] | 2026-07-26 | Added `<link rel="icon" href="assets/icon.svg">` to index.html |
| 1.2 Fix "Aggiungi Punto" overflow | [x] | 2026-07-26 | Left panel uses flex column, button moved outside panel-content, CSS fixes |
| 1.3 Hide routing diagnostics by default | [x] | 2026-07-26 | Added showRoutingWarnings to AppState, settings toggle, persisted in localStorage |

## Phase 2: Core Functionality

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 2.1 Fix elevation data (sea level) | [x] | 2026-07-26 | Backend proxy `/api/elevation` with retry, frontend proxy-first fallback, warning toast on zero |
| 2.2 Color route days differently | [x] | 2026-07-26 | DAY_COLORS palette, day-stat colored borders, chart day bands, map day segments |

## Phase 3: Search & Export

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 3.1 Improve place search (20km filter + distance) | [x] | 2026-07-26 | Filter results by 20km from map edge, show distance to last marker |
| 3.2 Export routes by day as ZIP | [x] | 2026-07-26 | JSZip CDN, exportGPXZip function, metadata.json, button in export modal |

## Phase 4: Secret Pages

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 4.1 GPX inspector | [x] | 2026-07-26 | gpx-inspector.js: multi-file/ZIP import, map display, track/waypoint stats |
| 4.2 Secret route list | [x] | 2026-07-26 | secret.js: lists pages, saved routes in localStorage with load/delete |
| 4.3 Path-based URL router | [x] | 2026-07-26 | router.js: path-based routing, dynamic view loading, no server changes needed |

## Phase 5: Advanced Features

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 5.1 Multiple route overlay | [x] | 2026-07-26 | route-overlay.js: GPX overlay panel, distinct colors, toggle visibility, toolbar button |
| 5.2 First-launch tutorial | [x] | 2026-07-26 | tutorial.js: 9-step walkthrough, localStorage flag, skip/prev/next |
| 5.3 Unified tile management UI | [x] | 2026-07-26 | tile-manager.js: tabs for display/Valhalla/DEM tiles, /tile-manager route |
