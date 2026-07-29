"use strict";
/* Skupne konstante, gradnja grafa in širjenje kontaminacije. */

const SVGNS = "http://www.w3.org/2000/svg";
const LION_EDGE = "#8B3A1A", CONT_EDGE = "#4A5D3F", DEF_EDGE = "#cccccc";
const SELECT_COLOR = "#8B3A1A", NEEDS_MOVE = "#8B3A1A";
const ICON_LION = "../icons/lion.svg";
const ICON_CONT = "../icons/contamination.svg";
const STRATEGY_LABELS = {
  strip: "Pasovna", monotone: "Monotona",
  polite: "Vljudna", caffeinated: "Kofeinirana",
  strip_parallelogram: "Pasovna",
  wall_parallelogram: "Kofeinirana",
  wall_triangle: "Kofeinirana",
  ext_bot: "Naključni bot",
};
const STRATEGY_ORDER = ["strip", "monotone", "polite", "caffeinated", "strip_parallelogram", "wall_parallelogram", "wall_triangle"];
const MODE_LABELS = { polite: "Vljudna", caffeinated: "Kofeinirana", monotone: "Monotona" };
const H = Math.sqrt(3) / 2;
// Zgornje meje parametrov (ujemajo se z izbirami v ui.js): trikotnik/paralelogram
// n, l ≤ 8; krog/kolobar R_out ≤ 8. Iz njih izpeljemo fiksne okvire risanja.
const NMAX = 8;
const LMAX = 8;
const RMAX = 8;
// 6 smeri trikotniške mreže: (r, c±1) + 4 diagonale
const TRI_DIRS = [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, 0], [1, 1]];

const edgeKey = (a, b) => (a < b ? a + "_" + b : b + "_" + a);
function el(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ---- Skupno ogrodje za gradnjo grafa ----
// cells: [{r, c, id}, ...] v vrstnem redu naštevanja; idOf(r, c) -> id | undefined
function assembleGraph(cells, idOf, extra) {
  const pos = {}, nodes = [], nb = {}, edges = [], seen = new Set();
  for (const { r, c, id } of cells) { nodes.push(id); nb[id] = []; pos[id] = [c - r / 2, -r * H]; }
  for (const { r, c, id } of cells)
    for (const [dr, dc] of TRI_DIRS) {
      const u = idOf(r + dr, c + dc);
      if (u === undefined) continue;
      const key = edgeKey(id, u);
      if (!seen.has(key)) { seen.add(key); edges.push([id, u]); nb[id].push(u); nb[u].push(id); }
    }
  return { nodes, pos, edges, neighbors: nb, ...extra };
}

// ---- Graf (identično visualizer.build_graph) ----
function vertexId(r, c) { return (r * (r + 1)) / 2 + c; }
function buildGraph(n) {
  const cells = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c <= r; c++) cells.push({ r, c, id: vertexId(r, c) });
  const idOf = (r, c) => (r >= 0 && r < n && c >= 0 && c <= r) ? vertexId(r, c) : undefined;
  return assembleGraph(cells, idOf, { n });
}

// ---- Paralelogramska mreža R_{n,l} ----
function pgVertexId(r, c, l) { return r * l + c; }
function buildParallelogramGraph(n, l) {
  const cells = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < l; c++) cells.push({ r, c, id: pgVertexId(r, c, l) });
  const idOf = (r, c) => (r >= 0 && r < n && c >= 0 && c < l) ? pgVertexId(r, c, l) : undefined;
  return assembleGraph(cells, idOf, { n, l, graphType: "parallelogram" });
}

// ---- Trianguliran krog / kolobar ----
function buildDiskGraph(R_out, R_in) {
  const rMax = Math.ceil(R_out / H) + 1;
  const cMax = Math.ceil(R_out) + rMax + 2;
  const inside = (r, c) => {
    const x = c - r / 2, y = r * H;
    const d = Math.sqrt(x * x + y * y);
    return d <= R_out + 1e-9 && d >= R_in - 1e-9;
  };
  const cells = [], byRC = {};
  let nextId = 0;
  for (let r = -rMax; r <= rMax; r++)
    for (let c = -cMax; c <= cMax; c++) {
      if (!inside(r, c)) continue;
      const id = nextId++;
      byRC[`${r}|${c}`] = id;
      cells.push({ r, c, id });
    }
  const idOf = (r, c) => byRC[`${r}|${c}`];
  return assembleGraph(cells, idOf, { n: cells.length, R_out, R_in, graphType: "disk" });
}

// ---- Izbira graditelja glede na tip grafa ----
function graphFor({ graphType, n, l, R_out, R_in }) {
  if (graphType === "parallelogram") return buildParallelogramGraph(n, l);
  if (graphType === "disk") return buildDiskGraph(R_out, R_in);
  return buildGraph(n);
}

// ---- Kontaminirana = vsa vozlišča brez levov (O(|V|)) ----
function contamOf(graph, lions) {
  const L = new Set(lions);
  return new Set(graph.nodes.filter(v => !L.has(v)));
}

// ---- Širjenje kontaminacije ----
function spreadStep(graph, lions, contaminated, newPos) {
  const before = new Set(contaminated);
  const lionEdges = new Set();
  for (let i = 0; i < lions.length; i++)
    if (lions[i] !== newPos[i]) lionEdges.add(edgeKey(lions[i], newPos[i]));
  const lionSet = new Set(newPos);
  const newContam = new Set([...contaminated].filter(v => !lionSet.has(v)));
  const contEdges = new Set(), contSources = {};
  for (const v of graph.nodes) {
    if (lionSet.has(v) || before.has(v)) continue;
    for (const u of graph.neighbors[v]) {
      if (before.has(u)) {
        const e = edgeKey(v, u);
        if (!lionEdges.has(e)) {
          newContam.add(v); contEdges.add(e);
          if (!(v in contSources)) contSources[v] = u;
        }
      }
    }
  }
  return { lionEdges, contEdges, contSources, newContam };
}

// ---- Risanje plošče (skupno) ----
const SX = (graph, v) => graph.pos[v][0];
const SY = (graph, v) => -graph.pos[v][1];

function setupBoard(svg, graph) {
  const xs = graph.nodes.map(v => graph.pos[v][0]);
  const ys = graph.nodes.map(v => -graph.pos[v][1]);
  const pad = 0.7;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  // Fiksni okvir glede na tip grafa (neodvisen od n/l/R), centriran na vsebino,
  // da so vozlišča povsod enako velika — enako kot pri trikotni mreži (okvir NMAX).
  let W, Hh;
  if (graph.graphType === "parallelogram") {
    W  = (LMAX - 1) + (NMAX - 1) / 2 + 2 * pad;
    Hh = (NMAX - 1) * H + 2 * pad;
  } else if (graph.graphType === "disk") {
    W  = Hh = 2 * RMAX + 2 * pad;
  } else {
    W  = (NMAX - 1) + 2 * pad;
    Hh = (NMAX - 1) * H + 2 * pad;
  }
  svg.setAttribute("viewBox", `${cx - W / 2} ${cy - Hh / 2} ${W} ${Hh}`);
  const defs = el("defs", {});
  const mk = el("marker", {
    id: "arrow", viewBox: "0 0 10 10", refX: "8", refY: "5",
    markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse",
  });
  mk.appendChild(el("path", { d: "M0,0 L10,5 L0,10 z", fill: SELECT_COLOR }));
  defs.appendChild(mk); svg.appendChild(defs);
}
function clearBoard(svg) {
  [...svg.childNodes].forEach(n => { if (n.nodeName !== "defs") svg.removeChild(n); });
}
function drawEdges(svg, graph, lionEdges, contEdges) {
  for (const [u, v] of graph.edges) {
    const key = edgeKey(u, v);
    let color = DEF_EDGE, w = 0.018;
    if (lionEdges && lionEdges.has(key)) { color = LION_EDGE; w = 0.05; }
    else if (contEdges && contEdges.has(key)) { color = CONT_EDGE; w = 0.04; }
    svg.appendChild(el("line", {
      x1: SX(graph, u), y1: SY(graph, u), x2: SX(graph, v), y2: SY(graph, v),
      stroke: color, "stroke-width": w, "stroke-linecap": "round",
    }));
  }
  for (const v of graph.nodes)
    svg.appendChild(el("circle", {
      cx: SX(graph, v), cy: SY(graph, v), r: 0.05, fill: "#888888",
    }));
}
function icon(svg, href, x, y, opacity) {
  const s = 0.6;
  svg.appendChild(el("image", {
    href, x: x - s / 2, y: y - s / 2, width: s, height: s,
    opacity: opacity == null ? 1 : opacity,
    preserveAspectRatio: "xMidYMid meet",
  }));
}
function ring(svg, x, y, r, color, w) {
  svg.appendChild(el("circle", {
    cx: x, cy: y, r, fill: "none", stroke: color, "stroke-width": w,
  }));
}
