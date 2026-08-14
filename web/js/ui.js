"use strict";
/* Meni, nastavitev igre in povezava dogodkov. */

let ENTRIES = [];
let stratFilter = "vse", nFilter = "vse", selectedFile = null;
let viz = null, game = null;
let setupN = 4, setupMode = "polite";
let setupGraph = "triangle", setupL = 4;  // za paralelogram

// ---- Razširitve (različni grafi + naključni boti) ----
let extShape = "trikotnik";       // "trikotnik" | "paralelogram" | "krog" | "kolobar"
let extTriN = 4;                  // za trikotnik (3..8)
let extPgN  = 4, extPgL = 6;      // za paralelogram (3..8)
let extROut = 4;                  // zunanji polmer za krog/kolobar
let extRIn = 1;                   // notranji polmer (samo kolobar)
let extMode = "polite";
let extBot = "random";            // "random" | "non-stacked" | "toward-contam"
let extGame = null;

const EXT_BOT_LABELS = {
  "random":         "Naključno",
  "non-stacked":    "Brez prekrivanja",
  "toward-contam":  "Proti kontaminaciji",
  "stingy":         "Nagrajevalna",
};

function uniqueStrategies() {
  // samo trikotniške rešitve
  return STRATEGY_ORDER.filter(s => ENTRIES.some(e => e.strategy === s && e.l == null));
}
function uniqueNs() {
  return [...new Set(ENTRIES.filter(e => e.l == null).map(e => e.n))].sort((a, b) => a - b);
}
function chip(label, active, onClick) {
  const b = document.createElement("button");
  b.className = "chip" + (active ? " active" : "");
  b.textContent = label; b.onclick = onClick;
  return b;
}
// Napolni vsebnik s chip-i za dane vrednosti (oznaka = String(item)).
function fillChips(box, items, isActive, onPick) {
  box.innerHTML = "";
  for (const it of items)
    box.appendChild(chip(String(it), isActive(it), () => onPick(it)));
}
// Zaporedje celih števil [lo..hi].
function range(lo, hi) {
  const out = [];
  for (let x = lo; x <= hi; x++) out.push(x);
  return out;
}
function buildMenuChips() {
  const sc = document.getElementById("strategy-chips"); sc.innerHTML = "";
  sc.appendChild(chip("Vse", stratFilter === "vse", () => { stratFilter = "vse"; refreshMenu(); }));
  for (const s of uniqueStrategies())
    sc.appendChild(chip(STRATEGY_LABELS[s], stratFilter === s, () => { stratFilter = s; refreshMenu(); }));
  const nc = document.getElementById("n-chips"); nc.innerHTML = "";
  nc.appendChild(chip("Vse", nFilter === "vse", () => { nFilter = "vse"; refreshMenu(); }));
  for (const n of uniqueNs())
    nc.appendChild(chip(String(n), nFilter === String(n), () => { nFilter = String(n); refreshMenu(); }));
}
function refreshMenu() {
  buildMenuChips();
  const tbody = document.getElementById("sol-rows"); tbody.innerHTML = "";
  const rows = ENTRIES.filter(e =>
    e.l == null &&  // paralelogramske rešitve pripadajo strani "Konstrukcije iz literature"
    (stratFilter === "vse" || e.strategy === stratFilter) &&
    (nFilter === "vse" || String(e.n) === nFilter));
  selectedFile = rows.length ? rows[0].file : null;
  for (const e of rows) {
    const tr = document.createElement("tr");
    if (e.file === selectedFile) tr.className = "selected";
    tr.innerHTML =
      `<td>${STRATEGY_LABELS[e.strategy] || e.strategy}</td>` +
      `<td class="center">${e.n}</td><td class="center">${e.k}</td>` +
      `<td class="center">${e.steps < 0 ? "—" : e.steps}</td>`;
    tr.onclick = () => {
      selectedFile = e.file;
      [...tbody.children].forEach(c => c.classList.remove("selected"));
      tr.classList.add("selected");
    };
    tbody.appendChild(tr);
  }
  document.getElementById("menu-status").textContent = rows.length + " simulacij";
}

let vizReturnTo = "page-menu";  // kam se vrne gumb "Nazaj" v viz-u

async function openViz(file) {
  const data = await fetch("../final_solutions/" + file).then(r => r.json());
  openVizFromData(data);
}
function openVizFromData(data) {
  if (viz) viz.destroy();
  const svg = document.getElementById("viz-board");
  svg.innerHTML = "";
  viz = new Visualizer(svg, data, document.getElementById("viz-title"));
  showPage("page-viz");
}

function buildSetup() {
  // Graf (Trikotnik / Paralelogram)
  const gb = document.getElementById("setup-graph"); gb.innerHTML = "";
  gb.appendChild(chip("Trikotnik  P_n", setupGraph === "triangle",
    () => { setupGraph = "triangle"; buildSetup(); }));
  gb.appendChild(chip("Paralelogram  R_{n,l}", setupGraph === "parallelogram",
    () => { setupGraph = "parallelogram"; buildSetup(); }));

  const nb = document.getElementById("setup-n");
  fillChips(nb, range(3, 8), n => n === setupN, n => { setupN = n; buildSetup(); });

  // l chip-i (samo paralelogram)
  const lb = document.getElementById("setup-l"); lb.innerHTML = "";
  if (setupGraph === "parallelogram") {
    lb.parentElement.style.display = "";
    fillChips(lb, range(3, 8), l => l === setupL, l => { setupL = l; buildSetup(); });
  } else {
    lb.parentElement.style.display = "none";
  }

  const mb = document.getElementById("setup-mode"); mb.innerHTML = "";
  for (const key in MODE_LABELS) mb.appendChild(chip(MODE_LABELS[key], key === setupMode, () => { setupMode = key; buildSetup(); }));
  const verts = (setupGraph === "parallelogram")
    ? setupN * setupL
    : setupN * (setupN + 1) / 2;
  const sizeStr = (setupGraph === "parallelogram") ? `R_{${setupN},${setupL}}` : `P_${setupN}`;
  const hints = {
    polite: "Vljudna: premakni enega leva, kontaminacija se razširi takoj.",
    caffeinated: "Kofeinirana: premakni vse leve, nato potrdi korak.",
    monotone: "Monotona: premik leva sproži širjenje; ponovna kontaminacija = konec.",
  };
  document.getElementById("setup-info").textContent =
    `${sizeStr}: |V| = ${verts}. Število levov izbereš pri postavljanju.  ${hints[setupMode]}`;
}

function startGame() {
  const svg = document.getElementById("game-board"); svg.innerHTML = "";
  game = new Game(svg, setupN, null, setupMode, setupGraph, setupL);
  game.onChange = onGameState;
  const sizeStr = (setupGraph === "parallelogram") ? `R_{${setupN},${setupL}}` : `P_${setupN}`;
  document.getElementById("game-title").textContent =
    `Interaktivna igra — ${MODE_LABELS[setupMode]}, ${sizeStr}`;
  onGameState(game);
  showPage("page-game");
}
function ctrlBtn(label, ghost, onClick) {
  const b = document.createElement("button");
  b.className = ghost ? "btn-ghost" : "btn-primary";
  b.innerHTML = label; b.onclick = onClick; return b;
}
function onGameState(g) {
  const c = document.getElementById("game-controls"); c.innerHTML = "";
  if (g.phase === "placing") {
    c.appendChild(ctrlBtn('Počisti', true, () => g.clear()));
    c.appendChild(ctrlBtn('Začni igro&nbsp;<i class="fa-solid fa-play"></i>', false, () => g.start()));
  } else if (g.phase === "playing") {
    if (!g.autoStep) {
      c.appendChild(ctrlBtn('Korak naprej&nbsp;<i class="fa-solid fa-arrow-right"></i>', false, () => g.commit()));
      c.appendChild(ctrlBtn('Ponastavi potezo&nbsp;<i class="fa-solid fa-redo"></i>', true, () => g.resetMove()));
    }
    if (g.canUndo()) c.appendChild(ctrlBtn('<i class="fa-solid fa-arrow-left"></i>&nbsp;Korak nazaj&nbsp;', true, () => g.undo()));
    c.appendChild(ctrlBtn('Nova postavitev&nbsp;', true, () => g.reset()));
  } else {
    c.appendChild(ctrlBtn("Nova postavitev", true, () => g.reset()));
  }
  document.getElementById("game-status").textContent = g.statusText();
}

// ---------------- Razširitve ----------------
function _extEffectiveRIn() {
  // krog: R_in=0, kolobar: R_in >= 1
  if (extShape === "krog") return 0;
  return Math.max(1, Math.min(extROut - 1, extRIn));
}

function _vertCountExt() {
  switch (extShape) {
    case "trikotnik":   return extTriN * (extTriN + 1) / 2;
    case "paralelogram": return extPgN * extPgL;
    case "krog":
    case "kolobar":     return buildDiskGraph(extROut, _extEffectiveRIn()).nodes.length;
    default:            return 0;
  }
}

function _sizeStrExt() {
  switch (extShape) {
    case "trikotnik":    return `P_${extTriN}`;
    case "paralelogram": return `R_{${extPgN},${extPgL}}`;
    case "krog":         return `Krog R=${extROut}`;
    case "kolobar":      return `Kolobar R_out=${extROut}, R_in=${_extEffectiveRIn()}`;
  }
}

function buildExtensions() {
  // Oblika: Trikotnik / Paralelogram / Krog / Kolobar
  const gb = document.getElementById("ext-graph"); gb.innerHTML = "";
  gb.appendChild(chip("Trikotnik P_n", extShape === "trikotnik",
    () => { extShape = "trikotnik"; buildExtensions(); }));
  gb.appendChild(chip("Paralelogram R_{n,l}", extShape === "paralelogram",
    () => { extShape = "paralelogram"; buildExtensions(); }));
  gb.appendChild(chip("Krog", extShape === "krog",
    () => { extShape = "krog"; buildExtensions(); }));
  gb.appendChild(chip("Kolobar", extShape === "kolobar",
    () => {
      extShape = "kolobar";
      if (extRIn < 1) extRIn = 1;
      if (extRIn >= extROut) extRIn = extROut - 1;
      buildExtensions();
    }));

  // prikaži le parametre za trenutno obliko
  const triRow  = document.getElementById("ext-n").parentElement;
  const pgRow   = document.getElementById("ext-disk-N").parentElement;
  const rRow    = document.getElementById("ext-disk-R").parentElement;
  const hRow    = document.getElementById("ext-disk-H").parentElement;
  triRow.style.display = "none";
  pgRow.style.display  = "none";
  rRow.style.display   = "none";
  hRow.style.display   = "none";

  if (extShape === "trikotnik") {
    triRow.style.display = "";
    triRow.querySelector(".section-label").textContent = "Velikost n (trikotnik)";
    fillChips(document.getElementById("ext-n"), range(3, 8),
      n => n === extTriN, n => { extTriN = n; buildExtensions(); });
  } else if (extShape === "paralelogram") {
    triRow.style.display = "";
    triRow.querySelector(".section-label").textContent = "Višina n (paralelogram)";
    fillChips(document.getElementById("ext-n"), range(3, 8),
      n => n === extPgN, n => { extPgN = n; buildExtensions(); });
    pgRow.style.display = "";
    pgRow.querySelector(".section-label").textContent = "Dolžina l (paralelogram)";
    fillChips(document.getElementById("ext-disk-N"), range(3, 8),
      l => l === extPgL, l => { extPgL = l; buildExtensions(); });
  } else {
    // krog / kolobar
    rRow.style.display = "";
    rRow.querySelector(".section-label").textContent = "Zunanji polmer R_out";
    fillChips(document.getElementById("ext-disk-R"), range(2, 8),
      R => R === extROut,
      R => {
        extROut = R;
        if (extShape === "kolobar" && extRIn >= R) extRIn = R - 1;
        buildExtensions();
      });
    if (extShape === "kolobar") {
      hRow.style.display = "";
      hRow.querySelector(".section-label").textContent = "Notranji polmer R_in";
      fillChips(document.getElementById("ext-disk-H"), range(1, extROut - 1),
        r => r === extRIn, r => { extRIn = r; buildExtensions(); });
    }
  }

  // način igre
  const mb = document.getElementById("ext-mode"); mb.innerHTML = "";
  for (const key of ["polite", "caffeinated"])
    mb.appendChild(chip(MODE_LABELS[key], key === extMode,
      () => { extMode = key; buildExtensions(); }));

  // Bot
  const bb = document.getElementById("ext-bot"); bb.innerHTML = "";
  for (const key of ["random", "non-stacked", "toward-contam", "stingy"])
    bb.appendChild(chip(EXT_BOT_LABELS[key], key === extBot,
      () => { extBot = key; buildExtensions(); }));

  const verts = _vertCountExt();
  document.getElementById("ext-info").textContent =
    `${_sizeStrExt()}: |V| = ${verts}, ${MODE_LABELS[extMode]}, bot: ${EXT_BOT_LABELS[extBot]}. Število levov izbereš pri postavljanju.`;
}

function startExtensionsGame() {
  const svg = document.getElementById("extg-board"); svg.innerHTML = "";
  let graphType, n, l = null, graphParams = null;
  switch (extShape) {
    case "trikotnik":
      graphType = "triangle"; n = extTriN; break;
    case "paralelogram":
      graphType = "parallelogram"; n = extPgN; l = extPgL; break;
    case "krog":
    case "kolobar":
      graphType = "disk"; n = extROut;
      graphParams = { R_out: extROut, R_in: _extEffectiveRIn() }; break;
  }
  extGame = new Game(svg, n, null, extMode, graphType, l, extBot, graphParams);
  extGame.onChange = onExtensionsGameState;
  document.getElementById("extg-title").textContent =
    `Razširitve — ${_sizeStrExt()}, ${MODE_LABELS[extMode]}, bot: ${EXT_BOT_LABELS[extBot]}`;
  onExtensionsGameState(extGame);
  showPage("page-extensions-game");
}

function onExtensionsGameState(g) {
  const c = document.getElementById("extg-controls"); c.innerHTML = "";
  if (g.phase === "placing") {
    c.appendChild(ctrlBtn(
      'Začni simulacijo&nbsp;<i class="fa-solid fa-play"></i>', false,
      () => runExtensionsBotSimulation(g)
    ));
    c.appendChild(ctrlBtn('Počisti', true, () => g.clear()));
  } else {
    // fallback reset gumb
    c.appendChild(ctrlBtn('Nova postavitev', true, () => g.reset()));
  }
  const stat = document.getElementById("extg-status");
  stat.textContent = g.statusText();
}

// Simulira bot do konca in odpre rezultat v Vizualizatorju.
function runExtensionsBotSimulation(g) {
  if (g.phase !== "placing" || g.lions.length === 0) return;
  // zakleni k na dejansko število levov
  g.k = g.lions.length;
  const graph = g.graph;
  const initial_positions = g.lions.slice();
  let lions = initial_positions.slice();
  let contam = contamOf(graph, lions);
  const moves = [];
  for (let step = 0; step < BOT_MAX_STEPS && contam.size > 0; step++) {
    const next = botPickMoves(g.bot, graph, lions, contam, g.mode);
    moves.push(next.slice());
    const r = spreadStep(graph, lions, contam, next);
    lions = next.slice();
    contam = r.newContam;
  }
  const data = {
    strategy: "ext_bot",
    graph_type: g.graphType,
    n: g.n,
    l: g.l,
    k: g.k,
    initial_positions,
    moves,
  };
  if (g.graphType === "disk") {
    data.R_out = graph.R_out;
    data.R_in  = graph.R_in;
  }
  vizReturnTo = "page-extensions";
  openVizFromData(data);
}

// ---- Konstrukcije iz literature ----
let litGraph = "parallelogram";   // "triangle" | "parallelogram"
let litKind  = "strip";            // "strip" | "wall"
let litN = 3;
let litL = 4;

function availableNs() {
  if (litGraph === "triangle" && litKind === "strip")
    return [...new Set(ENTRIES.filter(e => e.strategy === "strip" && e.l == null).map(e => e.n))].sort((a, b) => a - b);
  // ostalo računamo v JS
  return [3, 4, 5, 6, 7, 8];
}
// kofeinirana stena potrebuje dovolj stolpcev za stopničasto formacijo
function minLForWall(n) { return Math.floor(n / 2) + 1; }

function availableLs(n) {
  if (litGraph !== "parallelogram") return [];
  const lo = (litKind === "wall") ? Math.max(3, minLForWall(n)) : 3;
  const ls = [];
  for (let l = lo; l <= 8; l++) ls.push(l);
  return ls;
}

function buildLiterature() {
  // 1. Strategija (Pasovna / Kofeinirana)
  const kb = document.getElementById("lit-kind"); kb.innerHTML = "";
  kb.appendChild(chip("Pasovna", litKind === "strip",
    () => { litKind = "strip"; ensureValidLit(); buildLiterature(); }));
  kb.appendChild(chip("Kofeinirana", litKind === "wall",
    () => { litKind = "wall"; ensureValidLit(); buildLiterature(); }));

  // 2. Graf (Trikotnik / Paralelogram)
  const gb = document.getElementById("lit-graph"); gb.innerHTML = "";
  gb.appendChild(chip("Trikotnik  P_n", litGraph === "triangle",
    () => { litGraph = "triangle"; ensureValidLit(); buildLiterature(); }));
  gb.appendChild(chip("Paralelogram  R_{n,l}", litGraph === "parallelogram",
    () => { litGraph = "parallelogram"; ensureValidLit(); buildLiterature(); }));

  // n chip-i
  const ns = availableNs();
  if (!ns.includes(litN)) litN = ns[0] || 3;
  fillChips(document.getElementById("lit-n"), ns, n => n === litN,
    n => { litN = n; ensureValidLit(); buildLiterature(); });

  // l chip-i (samo paralelogram)
  const lb = document.getElementById("lit-l"); lb.innerHTML = "";
  if (litGraph === "parallelogram") {
    lb.parentElement.style.display = "";
    const ls = availableLs(litN);
    if (!ls.includes(litL)) litL = ls[0] || litN;
    fillChips(lb, ls, l => l === litL, l => { litL = l; buildLiterature(); });
  } else {
    lb.parentElement.style.display = "none";
  }

  // info tekst
  let desc = "";
  if (litGraph === "triangle" && litKind === "strip") {
    desc = `Strip sweep na trikotniku P_${litN} (Adams §4.1, prilagoditev za triangulariran trikotnik): k = n = ${litN} levov, en lev/korak. Začetna postavitev: spodnja vrstica.`;
  } else if (litGraph === "triangle" && litKind === "wall") {
    const k = Math.floor(3 * litN / 2);
    desc = `Stena trikotnikov na P_${litN} (po vzoru Adams §4.2): k = ⌊3n/2⌋ = ${k} kofeiniranih levov v stopničasti formaciji vzdolž leve diagonale. Algoritem: ripple levo (top trikotnik 3-cycle, spodnji se prelivajo levo), reverse v staircase, sweep desno (omejen s trikotno obliko).`;
  } else if (litGraph === "parallelogram" && litKind === "strip") {
    desc = `Strip sweep na R_{${litN},${litL}} (Adams §4.1, Theorem 4.1): k = n = ${litN} levov, en lev/korak. Začetna postavitev: leva diagonalna kolona. ${litN * (litL - 1)} korakov, popolnoma očisti.`;
  } else {
    const k = Math.floor(3 * litN / 2);
    desc = `Stena trikotnikov na R_{${litN},${litL}} (Adams §4.2): k = ⌊3n/2⌋ = ${k} kofeiniranih levov v stopničasti formaciji (1, 2, 1, 2, …). Algoritem: ripple levo (top trikotnik 3-cycle, spodnje plasti se prelivajo proti levemu robu), reverse v staircase, uniform sweep desno do desnega roba.`;
  }
  document.getElementById("lit-info").textContent = desc;
}

function ensureValidLit() {
  const ns = availableNs();
  if (!ns.includes(litN)) litN = ns[0] || 3;
  if (litGraph === "parallelogram") {
    const ls = availableLs(litN);
    if (!ls.includes(litL)) litL = ls[0] || litN;
  }
}

function findEntry(strategy, n, l) {
  return ENTRIES.find(e => e.strategy === strategy && e.n === n && (e.l ?? null) === (l ?? null));
}

async function runLiterature() {
  vizReturnTo = "page-literature";
  if (litGraph === "parallelogram" && litKind === "strip") {
    openVizFromData(planStripParallelogram(litN, litL));
    return;
  }
  if (litGraph === "parallelogram" && litKind === "wall") {
    if (litL < minLForWall(litN)) {
      document.getElementById("lit-info").textContent =
        `Kofeinirana stena na R_{${litN},${litL}} ni izvedljiva: potrebuje vsaj l = ${minLForWall(litN)} stolpcev za stopničasto formacijo.`;
      return;
    }
    openVizFromData(planCaffeinatedWall(litN, litL));
    return;
  }
  if (litGraph === "triangle" && litKind === "wall") {
    openVizFromData(planCaffeinatedWallTriangle(litN));
    return;
  }
  // Trikotnik strip: naloži iz obstoječih JSON-ov.
  const entry = findEntry("strip", litN, null);
  if (!entry) {
    document.getElementById("lit-info").textContent =
      `Datoteka za strip n=${litN} ni najdena.`;
    return;
  }
  await openViz(entry.file);
}

// ---- Navigacija ----
document.getElementById("go-intro").onclick = () => showPage("page-intro");
document.getElementById("intro-back").onclick = () => showPage("page-landing");
document.getElementById("go-results").onclick = () => { vizReturnTo = "page-menu"; showPage("page-menu"); };
document.getElementById("go-game").onclick = () => { buildSetup(); showPage("page-setup"); };
document.getElementById("go-future").onclick = () => { buildLiterature(); showPage("page-literature"); };
document.getElementById("menu-back").onclick = () => showPage("page-landing");
document.getElementById("lit-back").onclick = () => showPage("page-landing");
document.getElementById("lit-run").onclick = runLiterature;
document.getElementById("open-viz").onclick = () => { if (selectedFile) { vizReturnTo = "page-menu"; openViz(selectedFile); } };
document.getElementById("viz-back").onclick = () => { if (viz) viz.stop(); showPage(vizReturnTo); };
document.getElementById("setup-back").onclick = () => showPage("page-landing");
document.getElementById("setup-go").onclick = startGame;
document.getElementById("game-back").onclick = () => showPage("page-setup");
document.getElementById("go-extensions").onclick = () => { buildExtensions(); showPage("page-extensions"); };
document.getElementById("ext-back").onclick = () => showPage("page-landing");
document.getElementById("ext-go").onclick = startExtensionsGame;
document.getElementById("extg-back").onclick = () => showPage("page-extensions");

document.addEventListener("keydown", (e) => {
  const vizActive = document.getElementById("page-viz").classList.contains("active");
  const gameActive = document.getElementById("page-game").classList.contains("active");
  if (vizActive && viz) {
    if (e.key === " ") { e.preventDefault(); viz.toggle(); }
    else if (e.key === "ArrowRight") viz.animateTo(viz.tAnchor + 1);
    else if (e.key === "ArrowLeft") viz.goto(viz.alpha > 0 ? viz.tAnchor : viz.tAnchor - 1);
    else if (e.key === "r") viz.goto(0);
  } else if (gameActive && game) {
    if (e.key === " " && !game.autoStep) { e.preventDefault(); game.commit(); }
    else if (e.key === "ArrowLeft" || e.key === "z") game.undo();
    else if (e.key === "r") game.resetMove();
    else if (e.key === "Escape") { game.selected = null; game.render(); }
  }
});

async function listSolutionFiles() {
  try {
    const r = await fetch("../final_solutions/");
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    const out = [];
    doc.querySelectorAll("a").forEach(a => {
      let h = (a.getAttribute("href") || "").split("/").pop();
      h = decodeURIComponent(h);
      if (h.endsWith(".json")) out.push(h);
    });
    return out.length ? out : null;
  } catch (e) { return null; }
}

async function entriesFromFilenames(names) {
  // razčleni ime datoteke v metapodatke
  const RE = /^([a-zA-Z_]+?)_n(\d+)(?:_l(\d+))?_k(\d+)_([\d_]+)\.json$/;
  const by = {};
  for (const nm of names) {
    const m = RE.exec(nm);
    if (!m) continue;
    const e = {
      file: nm,
      strategy: m[1],
      n: +m[2],
      l: m[3] ? +m[3] : null,
      k: +m[4],
      ts: m[5],
    };
    const key = e.strategy + "_" + e.n + "_" + (e.l ?? "") + "_" + e.k;
    if (!by[key] || by[key].ts < e.ts) by[key] = e;
  }
  const uniq = Object.values(by);
  await Promise.all(uniq.map(async e => {
    try { e.steps = (await fetch("../final_solutions/" + e.file).then(r => r.json())).moves.length; }
    catch (_) { e.steps = -1; }
  }));
  uniq.sort((a, b) =>
    (STRATEGY_ORDER.indexOf(a.strategy) - STRATEGY_ORDER.indexOf(b.strategy)) ||
    (a.n - b.n) || (a.k - b.k));
  return uniq;
}

(async function init() {
  const names = await listSolutionFiles();
  if (names) {
    ENTRIES = await entriesFromFilenames(names);
  } else {
    document.getElementById("menu-status").textContent =
      "Ni mogoče prebrati rešitev — poženi prek lokalnega strežnika (glej README).";
    ENTRIES = [];
  }
  refreshMenu();
})();
