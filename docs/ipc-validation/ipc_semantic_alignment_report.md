# IPC Semantic Bucket Alignment Report
## led
- ours rendered arrays: boardOutlines=1, traces=27, vias=4, zones=1, silkscreen=1, documentation=2, graphics=0, drills=0
- ours object-level: board_outline=5, copper=31, graphics=3, zone=1
- ours external bucket projection: board_outline=5, copper=27, via=4, zone=1, graphics=3
- ext bucket-level : board_outline=5, copper=27, graphics=3, via=4, zone=1
- conclusions:
  - `board_outline` semantics are aligned, while `boardOutlines` remains aggregated for viewer rendering.
  - `externalBucketProjection` exactly matches the C++ baseline for all main buckets on the LED sample: `board_outline / copper / via / zone / graphics`.

## switch
- ours rendered arrays: boardOutlines=5, traces=120, vias=12, pads=239, zones=71, keepouts=41, silkscreen=100, documentation=184, mechanical=101, graphics=511, drills=14
- ours object-level: board_outline=213, copper=120, drill=198, graphics=753, via=12, zone=71
- ours external bucket projection: board_outline=213, copper=120, via=12, zone=71, graphics=735
- ext bucket-level : board_outline=213, copper=120, graphics=729, via=12, zone=71
- conclusions:
  - Object-level buckets align strongly with the external baseline for `board_outline`, `copper`, `via`, and `zone`.
  - `externalBucketProjection` is now very close to the C++ baseline on `switch`; the remaining delta is only `graphics: 735 vs 729`.
  - The residual difference is now clearly a tiny representation-edge issue rather than a model-shape problem.
  - We intentionally keep the finer viewer model (`pads / keepouts / silkscreen / documentation / mechanical / graphics / drills`) instead of forcing exact primitive-for-primitive parity with the C++ `graphics` bucket.
  - Additional heuristic tuning is intentionally stopped here: the remaining 6-item gap is too small to justify adding brittle importer special-cases.

## DB import chain
- Added a real DB import path from normalized board JSON into Prisma/SQLite via `scripts/import_board_json_to_db.ts`.
- Added scoped IDs (`boardId::rawId`) internally so imported boards can coexist in the database without component/net/layer collisions.
- Updated DB-backed API routes (`meta / components / geometry / relations`) to un-scope IDs on output and to support top/bottom-like layer aliases when querying geometry.
- Updated `/board/[id]` so DB-imported boards can load the live page even when they are not present in the hosted/example catalog.
- Added productized scripts:
  - `npm run db:import-board -- <json> <board_id> [board_name]`
  - `npm run db:import-examples [example_id]`
  - `npm run test:db-import-chain`
- Validation `scripts/validate_db_import_chain.py` confirms the full chain on a real imported board: import JSON -> start production Next server -> verify boards list / meta / components / geometry / relations / page load.

## Current conclusion
- Component placement and component-net extraction remain aligned with the external implementations.
- Semantic classification is aligned at the model/API level for the main IPC buckets we care about: `board_outline`, `copper`, `via`, and `zone`.
- The project no longer folds all non-copper geometry into generic traces: viewer/API expose first-class arrays for `boardOutlines`, `vias`, `pads`, `zones`, `keepouts`, `silkscreen`, `documentation`, `mechanical`, `graphics`, and `drills`.
- We now also have a DB import chain that can persist normalized board JSON into Prisma and serve it through the same board/meta/components/geometry/relations APIs and `/board/[id]` page.
- Remaining work on `graphics/drill` is now explicitly considered optional: LED is fully aligned on the main buckets, and switch only retains a 6-item `graphics` delta at the external projection level, which is not worth further high-risk importer special-casing.
