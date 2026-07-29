"use strict";
/* Vizualizator predvajanja shranjene rešitve. */

function sliderToSeconds(t) { const from = 3.0, to = 0.005; return from * Math.pow(to / from, t); }

class Visualizer {
  constructor(svg, data, titleEl) {
    this.svg = svg; this.titleEl = titleEl;
    this.n = data.n; this.k = data.k; this.strategy = data.strategy;
    this.l = data.l;
    this.graphType = data.graph_type || "triangle";
    this.moves = data.moves.map(m => m.slice());
    this.graph = graphFor({
      graphType: this.graphType, n: this.n, l: this.l,
      R_out: data.R_out, R_in: data.R_in,
    });
    let lions = data.initial_positions.slice();
    let contam = contamOf(this.graph, lions);
    this.frames = [{ lions: lions.slice(), contam: new Set(contam), le: new Set(), ce: new Set(), cs: {} }];
    for (const mv of this.moves) {
      const r = spreadStep(this.graph, lions, contam, mv);
      lions = mv.slice(); contam = r.newContam;
      this.frames.push({ lions: lions.slice(), contam: new Set(contam), le: r.lionEdges, ce: r.contEdges, cs: r.contSources });
    }
    this.tAnchor = 0; this.alpha = 0; this.playing = false; this.playTarget = null;
    this._raf = null; this._last = 0;
    setupBoard(svg, this.graph);
    this.render();
  }
  destroy() { this.stop(); }
  stop() { this.playing = false; this.playTarget = null; if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  speedSeconds() { return sliderToSeconds(parseFloat(document.getElementById("viz-speed").value)); }

  animateTo(target) {
    target = Math.max(0, Math.min(target, this.moves.length));
    if (target <= this.tAnchor && this.alpha === 0) return;
    this.playTarget = target;
    if (this.playing) return;
    this.playing = true; this._last = performance.now();
    const loop = (now) => {
      if (!this.playing) return;
      const dt = (now - this._last) / 1000; this._last = now;
      const sec = this.speedSeconds();
      this.alpha += sec <= 1e-6 ? this.moves.length + 1 : dt / sec;
      while (this.alpha >= 1) {
        this.tAnchor++; this.alpha -= 1;
        if (this.tAnchor >= this.playTarget) { this.alpha = 0; this.render(); this.stop(); return; }
      }
      this.render();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  toggle() { if (this.playing) this.stop(); else this.animateTo(this.moves.length); }
  goto(t) { this.stop(); this.tAnchor = Math.max(0, Math.min(t, this.moves.length)); this.alpha = 0; this.render(); }

  render() {
    const g = this.graph, svg = this.svg, t = this.tAnchor, a = this.alpha;
    const atEnd = t >= this.moves.length;
    const cur = this.frames[t], nxt = atEnd ? cur : this.frames[t + 1];
    clearBoard(svg);
    drawEdges(svg, g, a > 0 ? nxt.le : cur.le, a > 0 ? nxt.ce : cur.ce);
    const both = [...cur.contam].filter(v => nxt.contam.has(v));
    for (const v of both) icon(svg, ICON_CONT, SX(g, v), SY(g, v), 1);
    if (!atEnd) {
      for (const v of cur.contam) if (!nxt.contam.has(v)) icon(svg, ICON_CONT, SX(g, v), SY(g, v), 1 - a);
      for (const v of nxt.contam) if (!cur.contam.has(v)) {
        const src = nxt.cs[v] != null ? nxt.cs[v] : v;
        const x = SX(g, src) + (SX(g, v) - SX(g, src)) * a;
        const y = SY(g, src) + (SY(g, v) - SY(g, src)) * a;
        icon(svg, ICON_CONT, x, y, Math.min(1, a * 2));
      }
    }
    for (let i = 0; i < cur.lions.length; i++) {
      const vo = cur.lions[i], vn = atEnd ? vo : nxt.lions[i];
      const x = SX(g, vo) + (SX(g, vn) - SX(g, vo)) * a;
      const y = SY(g, vo) + (SY(g, vn) - SY(g, vo)) * a;
      icon(svg, ICON_LION, x, y, 1);
    }
    const dispT = a === 0 ? t : Math.min(t + 1, this.moves.length);
    const contCount = a === 0 ? cur.contam.size : nxt.contam.size;
    let sizeStr;
    if (this.graphType === "parallelogram") {
      sizeStr = `n=${this.n}  l=${this.l}  k=${this.k}`;
    } else if (this.graphType === "disk") {
      sizeStr = (this.graph.R_in > 0)
        ? `Kolobar R_out=${this.graph.R_out} R_in=${this.graph.R_in}  k=${this.k}`
        : `Krog R=${this.graph.R_out}  k=${this.k}`;
    } else {
      sizeStr = `n=${this.n}  k=${this.k}`;
    }
    this.titleEl.textContent =
      `${STRATEGY_LABELS[this.strategy] || this.strategy}  ·  ${sizeStr}  ·  korak ${dispT}/${this.moves.length}  ·  kontaminiranih ${contCount}`;
  }
}
