"use strict";
/* Naključni boti za premikanje levov. */

function _pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// sosedje + opcijsko ostanek
function _candidates(graph, v, includeStay) {
  const out = graph.neighbors[v].slice();
  if (includeStay) out.push(v);
  return out;
}

// enakomerno (uniformno) premešani indeksi 0..n-1 (Fisher–Yates)
function shuffledIndices(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Skupno ogrodje kofeiniranih botov: premešaj indekse leva, nato za vsakega
// izberi cilj prek chooseFn(i, cands, assigned, next) in ga rezerviraj.
function assignNonStacked(lions, graph, chooseFn) {
  const next = lions.slice(), assigned = new Set();
  for (const i of shuffledIndices(lions.length)) {
    const cands = graph.neighbors[lions[i]];
    next[i] = chooseFn(i, cands, assigned, next);
    assigned.add(next[i]);
  }
  return next;
}

// BFS razdalja od start do najbližjega targeta
function _bfsMinDist(graph, start, targets) {
  if (targets.size === 0) return Infinity;
  if (targets.has(start)) return 0;
  const dist = new Map();
  dist.set(start, 0);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const v = queue[head++];
    const d = dist.get(v);
    for (const u of graph.neighbors[v]) {
      if (dist.has(u)) continue;
      dist.set(u, d + 1);
      if (targets.has(u)) return d + 1;
      queue.push(u);
    }
  }
  return Infinity;
}

// ------- L1: čista naključnost -------
function botMovesRandom(graph, lions, contam, mode) {
  const next = lions.slice();
  if (mode === "polite") {
    const i = Math.floor(Math.random() * lions.length);
    const cands = _candidates(graph, lions[i], true);
    next[i] = _pick(cands);
  } else {
    // caffeinated: vsak lev se mora premakniti
    for (let i = 0; i < lions.length; i++) {
      const cands = _candidates(graph, lions[i], false);
      next[i] = cands.length ? _pick(cands) : lions[i];
    }
  }
  return next;
}

// ------- L2: brez prekrivanja (reroll) -------
function botMovesNonStacked(graph, lions, contam, mode, retries) {
  retries = retries || 50;
  const next = lions.slice();
  if (mode === "polite") {
    const i = Math.floor(Math.random() * lions.length);
    const cands = _candidates(graph, lions[i], true);
    // izloči zasedena vozlišča
    const others = new Set(lions);
    others.delete(lions[i]);
    const safe = cands.filter(v => !others.has(v));
    next[i] = safe.length ? _pick(safe) : _pick(cands);
  } else {
    // caffeinated: po vrsti, brez prekrivanja
    return assignNonStacked(lions, graph, (i, cands, assigned) => {
      // naključna izbira izven assigned
      for (let t = 0; t < retries && cands.length; t++) {
        const v = _pick(cands);
        if (!assigned.has(v)) return v;
      }
      const safe = cands.filter(v => !assigned.has(v));
      return safe.length ? _pick(safe) : (cands.length ? _pick(cands) : lions[i]);
    });
  }
  return next;
}

// ------- L3: proti kontaminaciji -------
function botMovesTowardContam(graph, lions, contam, mode) {
  if (contam.size === 0) {
    return botMovesNonStacked(graph, lions, contam, mode);
  }
  const next = lions.slice();
  const others = new Set(lions);

  // izberi kandidat z minimalno razdaljo do contam
  function pickBest(candCells, excludeStaks) {
    let best = Infinity, bestSet = [];
    for (const c of candCells) {
      if (excludeStaks && excludeStaks.has(c)) continue;
      const d = _bfsMinDist(graph, c, contam);
      if (d < best) { best = d; bestSet = [c]; }
      else if (d === best) bestSet.push(c);
    }
    if (!bestSet.length) {
      // fallback: dovoli stakanje
      for (const c of candCells) {
        const d = _bfsMinDist(graph, c, contam);
        if (d < best) { best = d; bestSet = [c]; }
        else if (d === best) bestSet.push(c);
      }
    }
    return bestSet.length ? _pick(bestSet) : null;
  }

  if (mode === "polite") {
    // naključni lev, najbližje contam
    const i = Math.floor(Math.random() * lions.length);
    others.delete(lions[i]);
    const cands = _candidates(graph, lions[i], true);
    const choice = pickBest(cands, others);
    next[i] = choice !== null ? choice : lions[i];
  } else {
    // caffeinated: vsak lev najbližje contam, brez prekrivanja
    return assignNonStacked(lions, graph, (i, cands, assigned) => {
      const choice = pickBest(cands, assigned);
      return choice !== null ? choice : (cands.length ? _pick(cands) : lions[i]);
    });
  }
  return next;
}

// ------- L4: skopa (stingy) -------
// 1-step lookahead: maksimira čiščenje, minimizira rekontaminacijo in rob.

const _STINGY_W = { CLEAN: 10, RECONTAM: 5, BOUNDARY: 1 };

// simulira en korak in vrne metrike
function _stingySimulate(graph, lions, contam, nextLions) {
  const r = spreadStep(graph, lions, contam, nextLions);
  const newContam = r.newContam;
  const newLionSet = new Set(nextLions);

  let newlyCleaned = 0;
  for (const v of contam) if (!newContam.has(v) && !newLionSet.has(v)) newlyCleaned++;
  // lev na kontaminiranem vozlišču ga očisti
  for (const v of contam) if (newLionSet.has(v)) newlyCleaned++;

  let recontaminated = 0;
  for (const v of newContam) if (!contam.has(v) && !newLionSet.has(v)) recontaminated++;

  // rob: kontaminirana vozlišča s čistim sosedom
  let boundarySize = 0;
  for (const v of newContam) {
    for (const u of graph.neighbors[v]) {
      if (!newContam.has(u) && !newLionSet.has(u)) { boundarySize++; break; }
    }
  }
  return { newlyCleaned, recontaminated, boundarySize };
}

function _stingyScore(sim) {
  return _STINGY_W.CLEAN * sim.newlyCleaned
       - _STINGY_W.RECONTAM * sim.recontaminated
       - _STINGY_W.BOUNDARY * sim.boundarySize;
}

function botMovesStingy(graph, lions, contam, mode) {
  if (contam.size === 0) {
    return botMovesNonStacked(graph, lions, contam, mode);
  }

  if (mode === "polite") {
    // preizkusi vse kombinacije (lev, cilj) in izberi najboljšo
    const next = lions.slice();
    let bestScore = -Infinity, bestSet = [];
    for (let i = 0; i < lions.length; i++) {
      const cands = _candidates(graph, lions[i], true);
      for (const c of cands) {
        if (c !== lions[i] && lions.includes(c)) continue; // skip stack
        const trial = lions.slice();
        trial[i] = c;
        const sim = _stingySimulate(graph, lions, contam, trial);
        const s = _stingyScore(sim);
        if (s > bestScore) { bestScore = s; bestSet = [{ i, c }]; }
        else if (s === bestScore) bestSet.push({ i, c });
      }
    }
    if (bestSet.length) {
      const choice = _pick(bestSet);
      next[choice.i] = choice.c;
    }
    return next;
  }

  // caffeinated: požrešno po vrsti, brez prekrivanja
  return assignNonStacked(lions, graph, (i, cands, assigned, next) => {
    const free = cands.filter(c => !assigned.has(c));
    const pool = free.length ? free : cands;
    if (!pool.length) return lions[i];
    let bestScore = -Infinity, bestSet = [];
    for (const c of pool) {
      const trial = next.slice();
      trial[i] = c;
      const sim = _stingySimulate(graph, lions, contam, trial);
      const s = _stingyScore(sim);
      if (s > bestScore) { bestScore = s; bestSet = [c]; }
      else if (s === bestScore) bestSet.push(c);
    }
    return bestSet.length ? _pick(bestSet) : _pick(pool);
  });
}

// razrešitev bota po imenu
function botPickMoves(strategy, graph, lions, contam, mode) {
  switch (strategy) {
    case "random":            return botMovesRandom(graph, lions, contam, mode);
    case "non-stacked":       return botMovesNonStacked(graph, lions, contam, mode);
    case "toward-contam":     return botMovesTowardContam(graph, lions, contam, mode);
    case "stingy":            return botMovesStingy(graph, lions, contam, mode);
    default:                  return botMovesRandom(graph, lions, contam, mode);
  }
}
