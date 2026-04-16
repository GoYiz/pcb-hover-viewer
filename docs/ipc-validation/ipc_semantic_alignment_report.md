# IPC Semantic Bucket Alignment Report
## led
- ours trace-level : board_outline=1, copper=32, graphics=3
- ours object-level: board_outline=5, copper=31, graphics=3, zone=1
- ext bucket-level : board_outline=5, copper=27, graphics=3, via=4, zone=1
- object-level delta (ours - ext): board_outline=0, copper=4, graphics=0, via=-4, zone=0
  - Object-level buckets now match the external baseline almost exactly except that we do not split vias into a separate rendered object family in the viewer model.

## switch
- ours trace-level : board_outline=5, copper=254, drill=14, graphics=1072, via=36, zone=41
- ours object-level: board_outline=213, copper=120, drill=198, graphics=753, via=12, zone=71
- ext bucket-level : board_outline=213, copper=120, graphics=729, via=12, zone=71
- object-level delta (ours - ext): board_outline=0, copper=0, drill=198, graphics=24, via=0, zone=0
  - Object-level buckets now align strongly with the external baseline for `board_outline`, `copper`, `via`, and `zone`.
  - Remaining delta is mainly in `graphics` and `drill`, because our importer still folds more drill/mechanical primitives into trace-like output for viewer compatibility.

## Current conclusion
- Component placement and component-net extraction are aligned with external implementations.
- Semantic classification is now much closer to the external C++ baseline when compared at object level rather than raw path count level.
- Remaining work is mostly model-shape cleanup: separating drill/mechanical/graphics into first-class arrays instead of folding them into `traces`.
