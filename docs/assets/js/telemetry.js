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
    _robot: { x: 0.5, y: 0.5, ang: 0, trail: [] },

    /* ---------------- map ---------------- */
    initMap(canvas) {
      this._mapCtx = canvas.getContext("2d");
      this._mapCanvas = canvas;
      const draw = () => {
        this.drawMap();
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

    drawMap() {
      const ctx = this._mapCtx;
      if (!ctx || !this._mapCanvas) return;
      const S = this._setupCanvas(ctx, this._mapCanvas);
      if (!S) return;

      const COLS = 34, ROWS = 16;
      const cw = S.w / COLS, ch = S.h / ROWS;
      const counts = Lexicon.cardCounts();
      const total = Lexicon.size();
      const learned = counts.new + counts.learning + counts.mature;
      const frac = total ? learned / total : 0;

      // bg
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-panel2").trim() || "#111a26";
      ctx.fillRect(0, 0, S.w, S.h);

      const cellAt = (i) => {
        const rx = i % COLS, ry = Math.floor(i / COLS);
        return { x: rx * cw, y: ry * ch, cx: rx * cw + cw / 2, cy: ry * ch + ch / 2 };
      };

      const exploredCount = Math.floor(frac * COLS * ROWS);
      const t = Date.now() / 1000;

      for (let i = 0; i < COLS * ROWS; i++) {
        const c = cellAt(i);
        if (i < exploredCount) {
          // explored: subtle pulse on the frontier edge
          const edge = i >= exploredCount - COLS;
          ctx.fillStyle = edge ? "#173a4f" : "#155e3a";
          ctx.fillRect(c.x + 0.5, c.y + 0.5, cw - 1, ch - 1);
          if (edge && Math.sin(t * 2 + i) > 0.6) {
            ctx.strokeStyle = "rgba(53,200,232,0.5)";
            ctx.strokeRect(c.x + 0.5, c.y + 0.5, cw - 1, ch - 1);
          }
        } else {
          // unseen obstacle
          ctx.fillStyle = "#141d29";
          ctx.fillRect(c.x + 0.5, c.y + 0.5, cw - 1, ch - 1);
          ctx.strokeStyle = "#202e42";
          ctx.strokeRect(c.x + 0.5, c.y + 0.5, cw - 1, ch - 1);
        }
      }

      // waypoints: due reviews + recently learned, placed pseudo-randomly but stably
      const seedRand = (k) => {
        const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      const wps = counts.due + Math.min(8, counts.learning);
      for (let k = 0; k < wps; k++) {
        const cell = Math.floor(seedRand(k * 7 + 3) * exploredCount);
        const c = cellAt(cell);
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + k * 1.7);
        ctx.beginPath();
        ctx.arc(c.cx, c.cy, 2.5 + pulse * 2, 0, Math.PI * 2);
        ctx.fillStyle = k < counts.due ? "#ff4d5e" : "#33ff99";
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // robot with trail
      const rb = this._robot;
      rb.ang += 0.015;
      rb.x += Math.cos(rb.ang) * 0.0035;
      rb.y += Math.sin(rb.ang) * 0.0035;
      if (rb.x < 0.04) rb.x = 0.04; if (rb.x > 0.96) rb.x = 0.96;
      if (rb.y < 0.04) rb.y = 0.04; if (rb.y > 0.96) rb.y = 0.96;
      rb.trail.push({ x: rb.x * S.w, y: rb.y * S.h });
      if (rb.trail.length > 40) rb.trail.shift();
      ctx.strokeStyle = "rgba(51,255,153,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < rb.trail.length; i++) {
        const p = rb.trail[i];
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      const rx = rb.x * S.w, ry = rb.y * S.h;
      ctx.fillStyle = "#33ff99";
      ctx.beginPath(); ctx.arc(rx, ry, 3.5, 0, Math.PI * 2); ctx.fill();
      // heading line
      ctx.strokeStyle = "#e8f1fa";
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(rb.ang) * 12, ry + Math.sin(rb.ang) * 12);
      ctx.stroke();

      // sensor sweep
      ctx.strokeStyle = "rgba(53,200,232,0.25)";
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(t * 1.2) * S.w * 0.9, ry + Math.sin(t * 1.2) * S.h * 0.9);
      ctx.stroke();

      // HUD overlay text
      ctx.fillStyle = "#5f7187";
      ctx.font = "10px monospace";
      ctx.fillText("MAP::SEMI-GLOBAL · CELLS " + exploredCount + "/" + COLS * ROWS, 8, 14);
      ctx.fillText("POSE x=" + rb.x.toFixed(3) + " y=" + rb.y.toFixed(3) + " θ=" + rb.ang.toFixed(2), 8, S.h - 8);
    },

    /* ---------------- 14-day telemetry chart ---------------- */
    drawChart(canvas) {
      const ctx = this._chartCtx = canvas.getContext("2d");
      const S = this._setupCanvas(ctx, canvas);
      if (!S) return;
      const { w, h } = S;

      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg-panel2").trim() || "#111a26";
      ctx.fillRect(0, 0, w, h);

      const st = Lexicon.state().stats;
      const history = st.history || {};
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        const h = history[key] || {};
        days.push({ key, n: h.n || 0, r: h.r || 0 });
      }
      const maxN = Math.max(1, ...days.map((d) => d.n + d.r));
      // top padding reserves room for the legend so bars never overlap it
      const padL = 28, padB = 18, padT = 30;
      const plotW = w - padL - 8, plotH = h - padB - padT;
      const bw = plotW / 14;

      // grid
      ctx.strokeStyle = "#1c2a3a";
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gy = padT + plotH - (plotH * g) / 4;
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
      ctx.fillText("WAYPOINT TELEMETRY", 13, 14);
      ctx.fillText("NEW / REVIEW", 13, 25);

      // stacked bars: new words below, reviews stacked on top
      for (let i = 0; i < 14; i++) {
        const d = days[i];
        const isToday = i === 13;
        const bn = (d.n / maxN) * plotH;
        const br = (d.r / maxN) * plotH;
        const bx = padL + i * bw + bw * 0.22;
        ctx.fillStyle = d.n + d.r > 0 ? (isToday ? "#33ff99" : "#1d8f5c") : "#1a2533";
        ctx.fillRect(bx, padT + plotH - bn, bw * 0.56, bn);
        if (br > 0) {
          ctx.fillStyle = isToday ? "#ffd166" : "#ffb733";
          ctx.fillRect(bx, padT + plotH - bn - br, bw * 0.56, br);
        }
        ctx.fillStyle = "#5f7187";
        ctx.font = "8px monospace";
        if (i % 2 === 0) ctx.fillText(d.key.slice(5), bx, h - 6);
      }

      // current-day marker
      ctx.strokeStyle = "#ffb733";
      ctx.beginPath();
      ctx.moveTo(padL + 13 * bw, padT);
      ctx.lineTo(padL + 13 * bw, padT + plotH);
      ctx.stroke();
    }
  };

  global.Telemetry = Telemetry;
})(window);
