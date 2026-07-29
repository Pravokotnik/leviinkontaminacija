"use strict";
/* Kofeinirana "stena trikotnikov" na R_{n,l} in P_n (Adams §4.2). */

function _vidFor(isTriangle, l) {
  return isTriangle
    ? (r, c) => vertexId(r, c)
    : (r, c) => pgVertexId(r, c, l);
}
function _maxColForRow(isTriangle, l, r) {
  return isTriangle ? r : l - 1;
}

// 3-cikel znotraj trikotnika: base <- base+1 <- base+2 <- base
function rotate3(next, cur, base) {
  next[base]     = cur[base + 1].slice();
  next[base + 1] = cur[base + 2].slice();
  next[base + 2] = cur[base].slice();
}

function _planCaffeinatedWallImpl(n, l, isTriangle) {
  const vid = _vidFor(isTriangle, l);
  const k = Math.floor(3 * n / 2);
  const numTri = Math.floor(n / 2);
  const hasExtra = n % 2 === 1;
  const extraInitCol = hasExtra ? Math.floor((n - 1) / 2) : 0;

  // začetne pozicije [r, c]
  const cur = [];
  for (let i = 0; i < numTri; i++) {
    cur.push([2 * i, i]);
    cur.push([2 * i + 1, i]);
    cur.push([2 * i + 1, i + 1]);
  }
  if (hasExtra) cur.push([n - 1, extraInitCol]);

  const initial = cur.map(([r, c]) => vid(r, c));
  const moves = [];
  const recordCur = () => moves.push(cur.map(([r, c]) => vid(r, c)));

  // identificira top leva in spodnji par (b1 levo, b2 desno)
  function triRoles(i) {
    const base = 3 * i;
    const idxs = [base, base + 1, base + 2].slice()
      .sort((a, b) => cur[a][0] - cur[b][0]);
    const top = idxs[0];
    let b1 = idxs[1], b2 = idxs[2];
    if (cur[b1][1] > cur[b2][1]) { const t = b1; b1 = b2; b2 = t; }
    return { top, b1, b2 };
  }

  function applyShiftHoldStep(triActions, extraAction) {
    const next = cur.map(p => p.slice());
    for (let i = 0; i < numTri; i++) {
      const base = 3 * i;
      const a = triActions[i];
      if (a === "left" || a === "right") {
        const d = (a === "left") ? -1 : +1;
        for (let s = base; s < base + 3; s++) next[s] = [cur[s][0], cur[s][1] + d];
      } else if (a === "corner") {
        // corner: top sweep desno, spodnji par swap
        const { top, b1, b2 } = triRoles(i);
        next[top] = [cur[top][0], cur[top][1] + 1];
        next[b1] = cur[b2].slice();
        next[b2] = cur[b1].slice();
      } else if (a === "hold-extra") {
        // pair-swap z extra (geometrijska identifikacija po vrstici/stolpcu)
        const es = 3 * numTri;
        const ids = [3 * i, 3 * i + 1, 3 * i + 2, es];
        const sortedIds = ids.slice().sort((a, b) => cur[a][0] - cur[b][0]);
        const idTop = sortedIds[0];
        const idBot = sortedIds[3];
        let idMidL = sortedIds[1], idMidR = sortedIds[2];
        if (cur[idMidL][1] > cur[idMidR][1]) {
          const t = idMidL; idMidL = idMidR; idMidR = t;
        }
        next[idTop] = cur[idMidL].slice();
        next[idMidL] = cur[idTop].slice();
        next[idMidR] = cur[idBot].slice();
        next[idBot] = cur[idMidR].slice();
      } else if (a === "corner-extra") {
        // corner z extra: top desno, spodnji + extra 3-cycle
        const { top, b1, b2 } = triRoles(i);
        const es = 3 * numTri;
        next[top] = [cur[top][0], cur[top][1] + 1];
        next[b1] = cur[b2].slice();
        next[b2] = cur[es].slice();
        next[es] = cur[b1].slice();
      } else {
        // 3-cycle znotraj trikotnika
        rotate3(next, cur, base);
      }
    }
    if (hasExtra) {
      const es = 3 * numTri;
      if (extraAction === "left") next[es] = [cur[es][0], cur[es][1] - 1];
      else if (extraAction === "right") next[es] = [cur[es][0], cur[es][1] + 1];
      else if (extraAction === "swap-up" && numTri > 0) {
        const lastRd = 3 * (numTri - 1) + 2;
        next[es] = cur[lastRd].slice();
        next[lastRd] = cur[es].slice();
      }
    }
    for (let i = 0; i < cur.length; i++) cur[i] = next[i];
    recordCur();
  }

  // ---- Phase 1: ripple LEVO ----
  const P = Math.max(numTri - 1, hasExtra ? extraInitCol : 0);
  for (let s = 1; s <= P; s++) {
    const actions = ["hold"];
    for (let i = 1; i < numTri; i++) actions.push((s <= i) ? "left" : "hold");
    let ea = null;
    if (hasExtra) ea = (s <= extraInitCol) ? "left" : "swap-up";
    applyShiftHoldStep(actions, ea);
  }

  // ---- Phase 1.5: REVERSE ----
  for (let s = 1; s <= P; s++) {
    const actions = ["hold"];
    for (let i = 1; i < numTri; i++) actions.push((i + s > P) ? "right" : "hold");
    let ea = null;
    if (hasExtra) ea = (extraInitCol + s > P) ? "right" : "swap-up";
    applyShiftHoldStep(actions, ea);
  }

  // ---- Phase 2+3: sweep desno + eager corner ----

  const cornered = new Array(numTri).fill(false);
  let extraCornered = false;
  const baseCornerCol = l - 2;

  function findLionAt(idxList, r, c) {
    for (const idx of idxList) {
      if (cur[idx][0] === r && cur[idx][1] === c) return idx;
    }
    return -1;
  }

  for (let cs = 0; cs < 4 * l; cs++) {
    const next = cur.map(p => p.slice());

    // hkratni corner za zadnji trikotnik + extra (lihi n)
    let combinedCornerForLast = false;
    if (hasExtra && !extraCornered && numTri > 0 && !cornered[numTri - 1]) {
      const lastBase = 3 * (numTri - 1);
      let lastCanAdv = true;
      for (let s = lastBase; s < lastBase + 3; s++) {
        if (cur[s][1] + 1 > _maxColForRow(isTriangle, l, cur[s][0])) {
          lastCanAdv = false; break;
        }
      }
      const es = 3 * numTri;
      const extraCanAdv = cur[es][1] + 1 <= _maxColForRow(isTriangle, l, cur[es][0]);
      if (!lastCanAdv && !extraCanAdv) combinedCornerForLast = true;
    }

    for (let i = 0; i < numTri; i++) {
      const base = 3 * i;
      const TL = [2 * i, baseCornerCol];
      const TR = [2 * i, baseCornerCol + 1];
      const BR = [2 * i + 1, baseCornerCol + 1];
      const BL = [2 * i + 1, baseCornerCol];
      const idxList = [base, base + 1, base + 2];

      if (cornered[i]) {
        // 3-cycle po indeksih (pozicije vedno tvorijo veljaven trikotnik)
        rotate3(next, cur, base);
        continue;
      }

      // Pre-corner: check canAdv.
      let canAdv = true;
      for (let s = base; s < base + 3; s++) {
        if (cur[s][1] + 1 > _maxColForRow(isTriangle, l, cur[s][0])) {
          canAdv = false; break;
        }
      }
      if (canAdv) {
        for (let s = base; s < base + 3; s++) next[s] = [cur[s][0], cur[s][1] + 1];
      } else {
        const { top, b1, b2 } = triRoles(i);
        const topMaxCol = _maxColForRow(isTriangle, l, cur[top][0]);
        const cornerValid = cur[top][1] + 1 <= topMaxCol;
        if (cornerValid) {
          // eager corner: top desno, b1→b2, b2→top (L-postavitev)
          next[top] = [cur[top][0], cur[top][1] + 1];
          next[b1] = cur[b2].slice();
          next[b2] = cur[top].slice();
          cornered[i] = true;
          if (i === numTri - 1 && combinedCornerForLast) {
            // extra napolni BL
            const es = 3 * numTri;
            next[es] = BL.slice();
            extraCornered = true;
          }
        } else {
          // top na robu: 3-cycle in označi kot dokončan
          rotate3(next, cur, base);
          cornered[i] = true;
        }
      }
    }

    // extra premik (izven hkratnega corner-ja)
    if (hasExtra && !combinedCornerForLast) {
      const es = 3 * numTri;
      if (!extraCornered) {
        if (cur[es][1] + 1 <= _maxColForRow(isTriangle, l, cur[es][0])) {
          next[es] = [cur[es][0], cur[es][1] + 1];
        }
      } else {
        // post-corner extra: vertikalno nihanje
        if (cur[es][0] === n - 2) {
          next[es] = [n - 1, l - 2];
        } else {
          next[es] = [n - 2, l - 2];
        }
      }
    }

    for (let i = 0; i < cur.length; i++) cur[i] = next[i];
    recordCur();
    if (cornered.every(c => c)) break;
  }

  return {
    strategy: isTriangle ? "wall_triangle" : "wall_parallelogram",
    graph_type: isTriangle ? "triangle" : "parallelogram",
    n: n,
    l: l,
    k: k,
    initial_positions: initial,
    moves: moves,
  };
}

// odreže moves po popolnem čiščenju
function _trimAfterClean(plan) {
  const graph = graphFor({ graphType: plan.graph_type, n: plan.n, l: plan.l });
  let lions = plan.initial_positions.slice();
  let contam = contamOf(graph, lions);
  if (contam.size === 0) return { ...plan, moves: [] };
  const trimmed = [];
  for (const move of plan.moves) {
    const r = spreadStep(graph, lions, contam, move);
    trimmed.push(move);
    lions = move.slice();
    contam = r.newContam;
    if (contam.size === 0) break;
  }
  return { ...plan, moves: trimmed };
}

function planCaffeinatedWall(n, l) {
  return _trimAfterClean(_planCaffeinatedWallImpl(n, l, false));
}

function planCaffeinatedWallTriangle(n) {
  return _trimAfterClean(_planCaffeinatedWallImpl(n, n, true));
}
