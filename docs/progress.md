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
| 3.1 Improve place search (20km filter + distance) | [ ] | | |
| 3.2 Export routes by day as ZIP | [ ] | | |

## Phase 4: Secret Pages

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 4.1 GPX inspector | [ ] | | |
| 4.2 Secret route list | [ ] | | |
| 4.3 Path-based URL router | [ ] | | |

## Phase 5: Advanced Features

| Task | Status | Date | Notes |
|------|--------|------|-------|
| 5.1 Multiple route overlay | [ ] | | |
| 5.2 First-launch tutorial | [ ] | | |
| 5.3 Unified tile management UI | [ ] | | |
