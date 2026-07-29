"use strict";
/* Strip sweep na paralelogramu R_{n,l} (Adams §4.1). */

function planStripParallelogram(n, l) {
  const vid = (r, c) => pgVertexId(r, c, l);
  const initial = [];
  for (let r = 0; r < n; r++) initial.push(vid(r, 0));
  const positions = initial.slice();
  const moves = [];
  for (let c = 1; c < l; c++) {
    // od dna navzgor: r = n-1, n-2, ..., 0
    for (let r = n - 1; r >= 0; r--) {
      positions[r] = vid(r, c);
      moves.push(positions.slice());
    }
  }
  return {
    strategy: "strip_parallelogram",
    graph_type: "parallelogram",
    n: n,
    l: l,
    k: n,
    initial_positions: initial,
    moves: moves,
  };
}
