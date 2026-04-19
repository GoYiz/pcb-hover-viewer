# ODB++ Import Status Summary (2026-04-19)

## Overview

This document summarizes the current status of ODB++ support in `pcb-hover-viewer`, including what is already implemented, what has been validated end-to-end, what semantic coverage currently exists, and which areas remain intentionally conservative.

Date: `2026-04-19`
Project: `pcb-hover-viewer`
Status: **Phase 1 completed and validated**

---

## Scope Completed

The ODB++ workstream has already moved beyond a minimal importer stub and now supports the project’s current viewer/data model in a meaningful way.

Completed areas:

1. ODB++ importer aligned to the current viewer geometry model
2. ODB++ board JSON can be imported into Prisma/SQLite through the shared DB import chain
3. ODB++ boards can be served through the same board/meta/components/geometry/relations APIs and `/board/[id]` page path
4. ODB++ electrical net inference has been added for a meaningful subset of copper geometry
5. Current semantic coverage boundaries have been explicitly codified instead of over-claiming unsupported non-copper semantic splitting

---

## Delivered Capabilities

### 1. Geometry model alignment

The ODB++ importer no longer emits only a coarse `traces` bucket. It now outputs the same viewer-facing geometry arrays used by the current project model:

- `traces`
- `zones`
- `vias`
- `pads`
- `silkscreen`
- `boardOutlines`
- `drills`

For the current `switch_board_odb` sample, the imported geometry counts are:

- `traces = 120`
- `zones = 173`
- `vias = 14`
- `pads = 239`
- `silkscreen = 183`
- `boardOutlines = 348`
- `drills = 14`
- `keepouts = 0`
- `documentation = 0`
- `mechanical = 0`
- `graphics = 0`

This means ODB++ data is now structurally aligned with the viewer/API geometry model instead of being folded into a single generic copper bucket.

---

### 2. DB import chain validated

The shared DB import path (`scripts/import_board_json_to_db.ts`) already works with normalized ODB++ board JSON.

A dedicated validation flow now confirms that an imported ODB++ board can successfully pass through:

- `/api/boards`
- `/api/boards/{id}/meta`
- `/api/boards/{id}/components`
- `/api/boards/{id}/geometry?layer=TOP`
- `/api/boards/{id}/geometry?layer=BOTTOM`
- `/api/boards/{id}/relations/component/{id}`
- `/board/{id}`

Current validation result:
- `validate_odb_db_import_chain: OK`

---

### 3. Electrical net inference added

The first meaningful ODB++ electrical semantic upgrade is already implemented.

#### What is inferred now
- signal-layer pad flashes can receive real net IDs
- plated drill / via flashes can receive real net IDs
- a subset of signal traces can receive real net IDs when exact netlist-point matching is available
- zone contours attempt single-net assignment when a stable unique match exists

#### Why this is valid
Probe analysis on the current sample showed:
- signal-layer `P` flashes match netlist points exactly
- plated drill `P` flashes match netlist points exactly
- a stable subset of signal traces can be assigned from exact endpoint matches without observed net conflicts in the sample

#### Practical effect
Before inference, ODB++ electrical geometry was mostly `$NONE$` / placeholder-like.
After inference, the sample now contains meaningful electrical net labels across traces / vias / pads.

Examples after enhancement:
- traces now include nets such as `+5V`, `PA3_BTN4`, `PA2_BTN3`, `PA0_BTN1`, `NetR8_2`, `DISPLAY_TXD2_P302`
- vias now include nets such as `+5V`, `PA0_BTN1`, `PA3_BTN4`, `PGND`, `NetJ2_1`
- pads now include nets such as `PGND`, `+5V`, `PA0_BTN1`, `PA3_BTN4`, `DISPLAY_RXD2_P301`

This directly improves relation fanout quality instead of only improving raw JSON appearance.

---

### 4. Relations now show real electrical value

After electrical net inference, ODB++ is no longer limited to shallow component-only relation behavior.

Representative probe results on DB-imported ODB++ data show that components can now produce meaningful electrical relation outputs including real trace/overlay fanout.

Example:
- `J1`
  - relation nets include: `+5V`, `PA1_BTN2`, `PA2_BTN3`, `PA3_BTN4`, `PA4_BUZZER`, `DISPLAY_RXD2_P301`, `DISPLAY_TXD2_P302`, `NetJ2_1`, `NetR5_2`, `NetR7_2`, `NetR8_2`, `NetR9_2`, `PA0_BTN1`
  - `trace_count = 45`
  - `overlay_count = 81`

This confirms that ODB++ relations are no longer a hollow compatibility layer.

---

## Current Semantic Coverage Boundaries

### What is currently supported with confidence
- copper traces
- signal-derived pads
- plated vias
- drill geometry
- board outline / rout geometry
- overlay-like content that is safely classified as silkscreen in the current sample

### What is intentionally still conservative
The current sample does **not** justify generalized ODB++ splitting into:
- `documentation`
- `mechanical`
- `graphics`
- `keepouts`

The reason is empirical rather than missing effort:
- the current `Top Overlay` sample content is overwhelmingly component-local
- most overlay objects are close to component bounding boxes
- there is not yet enough stable evidence to separate board-level documentation/graphics/mechanical semantics without high risk of false classification

Therefore the importer currently keeps ODB++ non-copper semantic splitting conservative instead of pretending to match IPC-level semantic richness.

This boundary is now explicitly encoded in `importMetadata.warnings` and validated by a dedicated script.

---

## Validation Coverage

The current ODB++ implementation is covered by these checks:

### Hosted/example compatibility
- `python3 scripts/validate_hosted_api_fallback.py`

### DB import chain
- `python3 scripts/validate_odb_db_import_chain.py`
- package script: `test:odb-db-import-chain`

### Import semantic coverage bounds
- `python3 scripts/validate_odb_import_semantics.py`
- package script: `test:odb-import-semantics`

### Build stability
- `npm run build`

All of the above have passed in the current phase.

---

## Current Conclusion

ODB++ support in `pcb-hover-viewer` has completed its first meaningful delivery phase.

### What is now true
- ODB++ is structurally aligned with the viewer geometry model
- ODB++ boards can be imported into DB and served through the same shared APIs/pages
- ODB++ now has meaningful electrical net inference
- ODB++ relations now return real electrical fanout value on the sample
- unsupported non-copper semantic richness is not hidden; it is explicitly declared and tested as a current boundary

### What is not yet true
- ODB++ does not yet have IPC-grade generalized non-copper semantic splitting
- current evidence is not strong enough to safely generalize `documentation / mechanical / graphics / keepouts` from this sample alone

## Status

**ODB++ phase 1 is complete. Further semantic expansion should be based on broader sample evidence rather than aggressive heuristics on a single sample.**

---

## Recommended Next Steps

1. Add at least one more ODB++ sample to verify whether the current electrical inference generalizes
2. Re-check whether non-copper overlay splitting patterns become stable across multiple ODB++ datasets
3. Only after cross-sample evidence exists, consider generalized `documentation / mechanical / graphics / keepouts` splitting rules

---

## Key Commits

- `d043460 feat: align odbpp import with viewer geometry model`
- `9f50d12 test: add odb db import chain validation`
- `ce236b3 feat: add odb electrical net inference`
- `906e5f3 test: codify odb semantic coverage bounds`
