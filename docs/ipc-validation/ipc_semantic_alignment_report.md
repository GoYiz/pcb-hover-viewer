# IPC Semantic Bucket Alignment Report
## led
- ours rendered arrays: boardOutlines=1, traces=27, vias=4, zones=1, silkscreen=1, documentation=2, graphics=0, drills=0
- ours object-level: board_outline=5, copper=31, graphics=3, zone=1
- ext bucket-level : board_outline=5, copper=27, graphics=3, via=4, zone=1
- object-level delta (ours - ext): board_outline=0, copper=4, graphics=0, via=-4, zone=0
  - `board_outline` semantics are now aligned with the external C++ baseline.
  - The viewer model now exposes `boardOutlines` as a first-class array, but it intentionally keeps outline paths aggregated for rendering, so rendered-array count (`1`) is not expected to equal external primitive count (`5`).

## switch
- ours rendered arrays: boardOutlines=5, traces=120, vias=12, pads=239, zones=71, keepouts=41, silkscreen=100, documentation=184, mechanical=101, graphics=511, drills=14
- ours object-level: board_outline=213, copper=120, drill=198, graphics=753, via=12, zone=71
- ext bucket-level : board_outline=213, copper=120, graphics=729, via=12, zone=71
- object-level delta (ours - ext): board_outline=0, copper=0, drill=198, graphics=24, via=0, zone=0
  - Object-level buckets align strongly with the external baseline for `board_outline`, `copper`, `via`, and `zone`.
  - Remaining delta is mainly in `graphics` and `drill`, because our importer intentionally preserves finer viewer-facing buckets (`pads/keepouts/silkscreen/documentation/mechanical/graphics/drills`) instead of collapsing them into the C++ tool's single broad `graphics` family.

## Current conclusion
- Component placement and component-net extraction remain aligned with the external implementations.
- Semantic classification is now aligned at the model/API level for the main IPC buckets we care about: `board_outline`, `copper`, `via`, and `zone`.
- The project no longer folds all non-copper geometry into generic traces: viewer/API now expose first-class arrays for `boardOutlines`, `vias`, `pads`, `zones`, `keepouts`, `silkscreen`, `documentation`, `mechanical`, `graphics`, and `drills`.
- Remaining work is optional refinement, not missing structure: if needed later, we can further tighten `graphics/drill` object counting against the C++ baseline without changing the current long-term viewer model.
