/* ============================================================
 * slam-nav-stack :: telemetry renderer
 *
 * Canvas drawing for the field-map (vocabulary coverage as an
 * explored grid) and the 14-day study telemetry chart.
 * Pure presentation; reads data via the Lexicon service.
 * ============================================================ */
(function (global) {
  "use strict";

  const Telemetry = {
    _mapCtx: null,
    _chartCtx: null,
    _mapRAF: 0,
    _mapW: 0, _mapH: 0,

    /* ---------------- map ---------------- */
    initMap(canvas) {
      this._mapCtx = canvas.getContext("2d");
      this._mapCanvas = canvas;
      const draw = () => {
        this.drawCurve();
        this._mapRAF = requestAnimationFrame(draw);
      };
      this._mapRAF = requestAnimationFrame(draw);
    },
    stopMap() { cancelAnimationFrame(this._mapRAF); },

    _setupCanvas(ctx, canvas) {
      const dpr = global.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return null;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    },

    /* ---------------- memory curve (composite) ----------------
     * 记忆曲线复合图：对数间隔轴 × 记忆保持率。
     * 理论遗忘曲线（中位 EF）+ 阶段色带 + 词库分布泡 +
     * 今日到期标记 + 巡游光标（延续 HUD 风格）。 */
    drawCurve() {
      const ctx = this._mapCtx;
      if (!ctx || !this._mapCanvas) return;
      const S = this._setupCanvas(ctx, this._mapCanvas);
      if (!S) return;
      const { w, h } = S;

      const padL = 34, padR = 12, padT = 30, padB = 22;
      const plotW = w - padL - padR, plotH = h - padT - padB;
      const LMIN = 0.5, LMAX = 64;
      const lx = (ivl) => padL + ((Math.log2(Math.max(LMIN, ivl)) - Math.log2(LMIN)) /
        (Math.log2(LMAX) - Math.log2(LMIN))) * plotW;
      const ly = (ret) => padT + plotH - (ret / 100) * plotH;
      const retention = (ivl, ef) => 100 * Math.exp(-ivl / (Math.max(1.3, ef) * 6));

      // bg
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-panel2").trim() || "#111a26";
      ctx.fillRect(0, 0, w, h);

      // title (top-left) — axis meaning is stated here, no separate
      // axis labels to avoid overlap
      ctx.fillStyle = "rgba(53,200,232,0.85)";
      ctx.font = "bold 10px monospace";
      ctx.fillText("MEMORY CURVE :: RETENTION vs INTERVAL", padL, 14);

      // stage bands: LEARNING <3d / CONSOLIDATING 3-21d / MASTERED >21d
      const bands = [
        { from: 0.5, to: 3, color: "rgba(255,183,51,0.055)" },
        { from: 3, to: 21, color: "rgba(53,200,232,0.055)" },
        { from: 21, to: 64, color: "rgba(51,255,153,0.055)" }
      ];
      for (const b of bands) {
        ctx.fillStyle = b.color;
        ctx.fillRect(lx(b.from), padT, lx(b.to) - lx(b.from), plotH);
        ctx.strokeStyle = "rgba(44,64,88,0.6)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(lx(b.to), padT); ctx.lineTo(lx(b.to), padT + plotH); ctx.stroke();
        ctx.setLineDash([]);
      }

      // y grid 0..100%
      ctx.fillStyle = "#5f7187";
      ctx.font = "9px monospace";
      for (let g = 0; g <= 4; g++) {
        const gy = ly(g * 25);
        ctx.strokeStyle = "#1c2a3a";
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - padR, gy); ctx.stroke();
        ctx.fillText(g * 25 + "%", 4, gy + 3);
      }
      ctx.fillText("RETENTION", 4, padT - 6);

      // x ticks (log spaced)
      ctx.fillStyle = "#5f7187";
      ctx.font = "9px monospace";
      for (const t of [0.5, 1, 3, 6, 10, 21, 45]) {
        ctx.fillText(t + "d", lx(t) - 6, h - 7);
        ctx.strokeStyle = "#1c2a3a";
        ctx.beginPath(); ctx.moveTo(lx(t), padT + plotH); ctx.lineTo(lx(t), padT + plotH + 4); ctx.stroke();
      }
      ctx.fillText("INTERVAL (DAYS)", padL, h - 7);

      // theoretical forgetting curve (median EF)
      const medEF = 2.5;
      ctx.strokeStyle = "rgba(51,255,153,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const ivl = LMIN * Math.pow(LMAX / LMIN, i / 60);
        const x = lx(ivl), y = ly(retention(ivl, medEF));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // word-distribution bubbles: one per interval bucket, size = count
      const cards = Lexicon.cards();
      const buckets = new Map();
      for (const k in cards) {
        const c = cards[k];
        const ivl = c.ivl > 0 ? c.ivl : 0.5;
        const b = ivl >= 21 ? 21 : ivl >= 6 ? 6 : ivl >= 3 ? 3 : ivl >= 1 ? 1 : 0.5;
        if (!buckets.has(b)) buckets.set(b, { n: 0, efSum: 0 });
        const bk = buckets.get(b);
        bk.n++; bk.efSum += c.ef || 2.5;
      }
      for (const [b, bk] of buckets) {
        const ef = bk.efSum / bk.n;
        const x = lx(b), y = ly(retention(b, ef));
        const r = 2 + Math.min(5, Math.sqrt(bk.n) * 1.6);
        const stage = b < 3 ? "#ffb733" : b <= 21 ? "#35c8e8" : "#33ff99";
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = stage;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(232,241,250,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#5f7187";
        ctx.font = "8px monospace";
        ctx.fillText(String(bk.n), x + r + 2, y + 3);
      }

      // today marker at ivl = 1 day
      ctx.strokeStyle = "#ffb733";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(lx(1), padT); ctx.lineTo(lx(1), padT + plotH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ffb733";
      ctx.font = "bold 9px monospace";
      ctx.fillText("TODAY", lx(1) + 3, padT + 10);

      // roaming probe along the curve (HUD flavour)
      const t = Date.now() / 4000;
      const pv = LMIN * Math.pow(LMAX / LMIN, (0.5 + 0.5 * Math.sin(t)) * 0.9);
      const px = lx(pv), py = ly(retention(pv, medEF));
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(53,200,232,0.5)";
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 8, py - 8); ctx.stroke();

      // stage legend (top-right)
      const leg = [["#ffb733", "LEARNING"], ["#35c8e8", "CONSOLIDATING"], ["#33ff99", "MASTERED"]];
      let lxr = w - padR;
      ctx.font = "8px monospace";
      for (let i = leg.length - 1; i >= 0; i--) {
        const [c, label] = leg[i];
        lxr -= label.length * 6 + 13;
        ctx.fillStyle = c;
        ctx.fillRect(lxr, padT - 16, 6, 6);
        ctx.fillStyle = "#5f7187";
        ctx.fillText(label, lxr + 8, padT - 11);
      }

      // HUD footer
      let stageC = { learning: 0, consolidating: 0, mastered: 0 };
      for (const k in cards) {
        const s = SRS.stage(cards[k]);
        if (s !== "new") stageC[s]++;
      }
      const learned = Object.keys(cards).length;
      ctx.fillStyle = "#5f7187";
      ctx.font = "10px monospace";
      ctx.fillText("CURVE :: " + learned + " WORDS · L " + stageC.learning +
        " · C " + stageC.consolidating + " · M " + stageC.mastered, padL, h - 4);
    },

    /* ---------------- 14-day telemetry chart ----------------
     * Upper half: 14-day history (new + review stacked bars).
     * Lower half: FORECAST 14D — review load ahead, bucketed by
     * due timestamps, with a dashed baseline = daily new-word goal
     * arriving due the next day. */
    drawChart(canvas) {
      const ctx = this._chartCtx = canvas.getContext("2d");
      const S = this._setupCanvas(ctx, canvas);
      if (!S) return;
      const { w, h } = S;

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-panel2").trim() || "#111a26";
      ctx.fillRect(0, 0, w, h);

      const DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();
      const st = Lexicon.state().stats;
      const history = st.history || {};
      const goal = Lexicon.state().settings && Lexicon.state().settings.goalAuto
        ? (global.App && App.effectiveGoal ? App.effectiveGoal() : (Lexicon.state().settings.goal || 25))
        : (Lexicon.state().settings.goal || 25);

      /* ---------- upper: 14-day history ---------- */
      const padL = 28, padT = 30;
      const midY = padT + (h - padT - 20) * 0.52;
      const histPlotH = midY - padT - 8;
      const plotW = w - padL - 8;
      const bw = plotW / 14;

      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * DAY);
        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        const h = history[key] || {};
        days.push({ key, n: h.n || 0, r: h.r || 0 });
      }
      const maxN = Math.max(1, ...days.map((d) => d.n + d.r));

      // grid
      ctx.strokeStyle = "#1c2a3a";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gy = padT + histPlotH - (histPlotH * g) / 4;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - 4, gy); ctx.stroke();
        ctx.fillStyle = "#5f7187";
        ctx.font = "9px monospace";
        ctx.fillText(Math.round((maxN * g) / 4), 4, gy + 3);
      }

      // legend (two short lines, left-aligned)
      ctx.fillStyle = "#1d8f5c";
      ctx.fillRect(4, 8, 6, 6);
      ctx.fillStyle = "#ffb733";
      ctx.fillRect(4, 19, 6, 6);
      ctx.fillStyle = "#5f7187";
      ctx.font = "8px monospace";
      ctx.fillText("HIST 14D", 13, 14);
      ctx.fillText("NEW / REVIEW", 13, 25);

      // stacked bars: new words below, reviews stacked on top
      for (let i = 0; i < 14; i++) {
        const d = days[i];
        const isToday = i === 13;
        const bn = (d.n / maxN) * histPlotH;
        const br = (d.r / maxN) * histPlotH;
        const bx = padL + i * bw + bw * 0.22;
        ctx.fillStyle = d.n + d.r > 0 ? (isToday ? "#33ff99" : "#1d8f5c") : "#1a2533";
        ctx.fillRect(bx, padT + histPlotH - bn, bw * 0.56, bn);
        if (br > 0) {
          ctx.fillStyle = isToday ? "#ffd166" : "#ffb733";
          ctx.fillRect(bx, padT + histPlotH - bn - br, bw * 0.56, br);
        }
        ctx.fillStyle = "#5f7187";
        ctx.font = "8px monospace";
        if (i % 2 === 0) ctx.fillText(d.key.slice(5), bx, midY - 2);
      }

      // current-day marker
      ctx.strokeStyle = "#ffb733";
      ctx.beginPath();
      ctx.moveTo(padL + 13 * bw, padT);
      ctx.lineTo(padL + 13 * bw, midY);
      ctx.stroke();

      /* ---------- lower: forecast 14d review load ---------- */
      const foreTop = midY + 8;
      const forePlotH = h - foreTop - 22;

      // bucket future due cards by day
      const cards = Lexicon.cards();
      const f = new Array(14).fill(0);
      const dayStart = (k) => {
        const d = new Date(now + k * DAY);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      };
      for (const k in cards) {
        const c = cards[k];
        if (!c.due || c.due <= now) continue;
        for (let i = 0; i < 14; i++) {
          const s = dayStart(i), e = s + DAY;
          if (c.due >= s && c.due < e) { f[i]++; break; }
        }
      }
      const maxF = Math.max(1, ...f, Math.round(goal));

      // grid + y labels
      ctx.strokeStyle = "#1c2a3a";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gy = foreTop + forePlotH - (forePlotH * g) / 4;
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(w - 4, gy); ctx.stroke();
        ctx.fillStyle = "#5f7187";
        ctx.font = "8px monospace";
        ctx.fillText(Math.round((maxF * g) / 4), 4, gy + 3);
      }

      // dashed baseline: daily new-word goal arriving due the next day
      ctx.strokeStyle = "rgba(255,183,51,0.55)";
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      const by = foreTop + forePlotH - (goal / maxF) * forePlotH;
      ctx.moveTo(padL, by); ctx.lineTo(w - 4, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,183,51,0.8)";
      ctx.font = "8px monospace";
      ctx.fillText("GOAL " + goal + "/D", w - 4 - 62, by - 3);

      // area + line
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const x = padL + i * bw + bw * 0.5;
        const y = foreTop + forePlotH - (f[i] / maxF) * forePlotH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(53,200,232,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // fill under the line
      ctx.lineTo(padL + 13 * bw + bw * 0.5, foreTop + forePlotH);
      ctx.lineTo(padL + bw * 0.5, foreTop + forePlotH);
      ctx.closePath();
      ctx.fillStyle = "rgba(53,200,232,0.12)";
      ctx.fill();

      // points + x labels (future dates)
      ctx.fillStyle = "#5f7187";
      ctx.font = "8px monospace";
      for (let i = 0; i < 14; i++) {
        const x = padL + i * bw + bw * 0.5;
        const y = foreTop + forePlotH - (f[i] / maxF) * forePlotH;
        ctx.fillStyle = f[i] > 0 ? "#35c8e8" : "#2a3b52";
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        if (i % 2 === 0) {
          const d = new Date(now + i * DAY);
          const mk = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
          ctx.fillStyle = "#5f7187";
          ctx.fillText(mk, x - 10, h - 7);
        }
      }

      ctx.fillStyle = "rgba(53,200,232,0.85)";
      ctx.font = "bold 9px monospace";
      ctx.fillText("FORECAST 14D :: REVIEW LOAD", padL, foreTop + 8);
    }
  };

  global.Telemetry = Telemetry;
})(window);
