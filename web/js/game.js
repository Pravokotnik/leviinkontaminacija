"use strict";
/* Interaktivna igra (port interactive.InteractiveGame). */

const BOT_MAX_STEPS = 500;

class Game {
  constructor(svg, n, k, mode, graphType, l, botStrategy, graphParams) {
    this.svg = svg; this.n = n;
    // k je namig za UI; zaklene se v start()
    this.k = (k == null) ? null : k;
    this.mode = MODE_LABELS[mode] ? mode : "polite";
    this.graphType = graphType || "triangle";
    this.l = l;
    this.bot = botStrategy || null;
    this.graphParams = graphParams || null;
    const p = graphParams || {};
    this.graph = graphFor({ graphType: this.graphType, n, l, R_out: p.R_out, R_in: p.R_in });
    this.lions = []; this.contam = new Set(); this.pending = [];
    this.selected = null; this.phase = "placing"; this.step = 0;
    this.message = ""; this.history = [];
    this.lastLE = new Set(); this.lastCE = new Set();
    this.onChange = null;
    setupBoard(svg, this.graph);
    svg.addEventListener("click", (e) => this._onClick(e));
    this.render();
  }
  get autoStep() { return this.mode === "polite" || this.mode === "monotone"; }
  _notify() { if (this.onChange) this.onChange(this); }

  _nearest(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    let best = null, bd = Infinity;
    for (const v of this.graph.nodes) {
      const dx = SX(this.graph, v) - p.x, dy = SY(this.graph, v) - p.y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = v; }
    }
    return bd <= 0.42 * 0.42 ? best : null;
  }
  _onClick(evt) {
    const v = this._nearest(evt);
    if (v == null) return;
    if (this.phase === "placing") {
      const i = this.lions.indexOf(v);
      if (i >= 0) this.lions.splice(i, 1);
      else {
        const maxLions = (this.k != null) ? this.k : this.graph.nodes.length;
        if (this.lions.length < maxLions) this.lions.push(v);
      }
      this.render(); this._notify(); return;
    }
    if (this.phase === "playing") {
      // bot način: klike ignoriramo
      if (this.bot) return;
      const here = [];
      this.pending.forEach((p, i) => { if (p === v) here.push(i); });

      if (this.selected != null) {
        const cur = this.lions[this.selected];
        const allowed = new Set(this.graph.neighbors[cur]); allowed.add(cur);
        if (allowed.has(v)) {
          if (this.autoStep && v !== cur) {
            this.pending = this.lions.slice(); this.pending[this.selected] = v;
            this.selected = null; this.commit(); return;
          }
          this.pending[this.selected] = v;
          this.selected = null;
          this.render(); this._notify();
          return;
        }
      }

      if (here.length) {
        if (here.includes(this.selected)) {
          this.selected = null;
        } else {
          const unmoved = here.find(i => this.pending[i] === this.lions[i]);
          this.selected = unmoved !== undefined ? unmoved : here[0];
        }
      }
      this.render(); this._notify();
    }
  }

  start() {
    if (this.phase !== "placing" || this.lions.length === 0) { this.render(); this._notify(); return; }
    // zakleni k
    this.k = this.lions.length;
    this.phase = "playing"; this.step = 0; this.message = ""; this.history = [];
    this.contam = contamOf(this.graph, this.lions);
    this.pending = this.lions.slice(); this.selected = null;
    this.lastLE = new Set(); this.lastCE = new Set();
    if (this.contam.size === 0) this.phase = "won";
    this.render(); this._notify();
  }
  commit() {
    if (this.phase !== "playing") return;
    const moved = [];
    for (let i = 0; i < this.k; i++) if (this.pending[i] !== this.lions[i]) moved.push(i);
    if (this.mode === "polite" && moved.length > 1) {
      this.message = "Vljudna: na korak se sme premakniti največ en lev."; this.render(); this._notify(); return;
    }
    if (this.mode === "caffeinated" && moved.length < this.k) {
      this.message = "Kofeinirana: vsak lev se mora premakniti."; this.render(); this._notify(); return;
    }
    this.message = "";
    this.history.push({ lions: this.lions.slice(), contam: [...this.contam], step: this.step });
    const r = spreadStep(this.graph, this.lions, this.contam, this.pending);
    this.lions = this.pending.slice(); this.contam = r.newContam;
    this.lastLE = r.lionEdges; this.lastCE = r.contEdges;
    this.pending = this.lions.slice(); this.selected = null; this.step++;
    if (this.mode === "monotone" && Object.keys(r.contSources).length) this.phase = "lost";
    else if (this.contam.size === 0) this.phase = "won";
    this.render(); this._notify();
  }
  resetMove() { if (this.phase === "playing") { this.pending = this.lions.slice(); this.selected = null; this.render(); this._notify(); } }
  canUndo() { return this.history.length > 0; }
  undo() {
    if (!this.history.length) return;
    const s = this.history.pop();
    this.lions = s.lions.slice(); this.contam = new Set(s.contam); this.step = s.step;
    this.phase = "playing"; this.pending = this.lions.slice(); this.selected = null;
    this.message = ""; this.lastLE = new Set(); this.lastCE = new Set();
    this.render(); this._notify();
  }
  reset() {
    this.phase = "placing"; this.lions = []; this.contam = new Set();
    this.pending = []; this.selected = null; this.step = 0; this.message = "";
    this.history = []; this.lastLE = new Set(); this.lastCE = new Set();
    this.render(); this._notify();
  }

  statusText() {
    const m = MODE_LABELS[this.mode];
    if (this.phase === "placing") {
      const cap = (this.k != null) ? `/${this.k}` : ` (poljubno število)`;
      return `[${m}]  Postavljanje levov: ${this.lions.length}${cap} — klikni vozlišča (ponovni klik odstrani). Nato 'Začni igro'.`;
    }
    if (this.phase === "won") return `[${m}]  Zmaga! Graf očiščen v ${this.step} korakih.`;
    if (this.phase === "lost") return `[${m}]  Konec: ponovna kontaminacija v koraku ${this.step} — monotonost kršena.`;
    if (this.message) return this.message;
    if (this.autoStep)
      return `[${m}]  Korak ${this.step} — kontaminiranih: ${this.contam.size}.  Klikni leva, nato sosednje vozlišče (širi se takoj).`;
    const rem = this.pending.filter((p, i) => p === this.lions[i]).length;
    return `[${m}]  Korak ${this.step} — kontaminiranih: ${this.contam.size}.  Za premakniti še ${rem}/${this.k} levov (z obročem), nato 'Korak naprej'.`;
  }

  render() {
    const g = this.graph, svg = this.svg, placing = this.phase === "placing";
    clearBoard(svg);
    drawEdges(svg, g, this.lastLE, this.lastCE);
    if (placing) {
      for (const v of g.nodes) if (!this.lions.includes(v)) icon(svg, ICON_CONT, SX(g, v), SY(g, v), 0.5);
    } else {
      for (const v of this.contam) icon(svg, ICON_CONT, SX(g, v), SY(g, v), 1);
    }
    if (placing) {
      for (const v of this.lions) icon(svg, ICON_LION, SX(g, v), SY(g, v), 1);
    } else {
      for (let i = 0; i < this.pending.length; i++) {
        const cur = this.lions[i], tgt = this.pending[i];
        const xc = SX(g, cur), yc = SY(g, cur), xt = SX(g, tgt), yt = SY(g, tgt);
        if (tgt !== cur) {
          svg.appendChild(el("line", {
            x1: xc, y1: yc, x2: xt, y2: yt, stroke: SELECT_COLOR,
            "stroke-width": 0.04, "marker-end": "url(#arrow)", opacity: 0.75,
          }));
          const sourceStillOccupied = this.pending.some((p, j) => j !== i && p === cur);
          if (!sourceStillOccupied) {
            ring(svg, xc, yc, 0.16, SELECT_COLOR, 0.025);
          }
        }
        if (this.mode === "caffeinated" && this.phase === "playing" && tgt === cur)
          ring(svg, xt, yt, 0.4, NEEDS_MOVE, 0.05);
        if (this.selected === i) ring(svg, xt, yt, 0.4, SELECT_COLOR, 0.04);
        icon(svg, ICON_LION, xt, yt, 1);
      }
    }
  }
}
