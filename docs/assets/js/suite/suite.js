/* ============================================================
 * slam-nav-stack :: assessment suite registry
 *
 * Routes the four practice modules inside the ASSESSMENT SUITE
 * view and persists per-module progress in localStorage
 * (sls_suite). Every completed exercise also counts toward the
 * daily activity log (streak).
 * ============================================================ */
(function (global) {
  "use strict";

  const LS_SUITE = "sls_suite";

  const Suite = {
    _data: null,

    progress() {
      if (!this._data) {
        try {
          this._data = JSON.parse(localStorage.getItem(LS_SUITE) || "null") || {
            listening: { sets: {} },
            listeningFull: { sets: {} },
            reading: { tests: {} },
            writing: { tasks: {} }
          };
        } catch (e) {
          this._data = { listening: { sets: {} }, listeningFull: { sets: {} }, reading: { tests: {} }, writing: { tasks: {} } };
        }
      }
      return this._data;
    },

    save() {
      try { localStorage.setItem(LS_SUITE, JSON.stringify(this._data)); } catch (e) { /* quota */ }
    },

    /* called by each module controller after a completed exercise */
    record(category, id, pct) {
      const p = this.progress();
      const map = {
        listening: p.listening.sets,
        listeningFull: p.listeningFull.sets,
        reading: p.reading.tests,
        writing: p.writing.tasks
      }[category];
      if (!map) return;
      map[id] = pct;
      this.save();
      // count as daily activity (practice slot) for the streak
      if (global.Lexicon) {
        Lexicon.logStudy(0, 0, 1);
        if (global.App && App.renderStats) App.renderStats();
      }
    },

    /* ---- main entry: render the suite landing page ---- */
    render(container) {
      const p = this.progress();
      const mods = [
        {
          key: "listen", cls: "lsn",
          title: "ACOUSTIC TELEMETRY",
          sub: "LISTENING · 50 QUICK DRILLS + 8 FULL SECTIONS",
          tag: this.modTag(p.listening.sets, p.listeningFull.sets)
        },
        {
          key: "read", cls: "rd",
          title: "SENSOR DATA PARSING",
          sub: "ACADEMIC READING · " + (global.READING_TESTS || []).length + " TESTS / " +
               (global.READING_TESTS || []).reduce((n, t) => n + t.passages.length, 0) + " PASSAGES",
          tag: this.modTag(p.reading.tests)
        },
        {
          key: "write", cls: "wr",
          title: "MISSION REPORT GENERATOR",
          sub: "WRITING · " + (global.WRITING_TASKS || []).length + " TASKS + BAND PHRASE BANK",
          tag: this.modTag(p.writing.tasks)
        }
      ];
      const done = Object.keys(p.reading.tests).length + Object.keys(p.listening.sets).length +
                   Object.keys(p.listeningFull.sets).length + Object.keys(p.writing.tasks).length;

      container.innerHTML =
        '<div class="suite-head"><div class="suite-title">ASSESSMENT SUITE' +
        '<span class="pt-tag">' + done + " COMPLETED</span></div>" +
        '<span class="suite-sub">SIMULATED MISSION EXERCISES — LISTEN / PARSE / REPORT</span></div>' +
        '<div class="suite-grid">' +
        mods.map((m) =>
          '<button class="suite-card ' + m.cls + '" data-mod="' + m.key + '">' +
          '<span class="suite-card-title">' + m.title + "</span>" +
          '<span class="suite-card-sub">' + m.sub + "</span>" +
          m.tag +
          "</button>"
        ).join("") +
        "</div>";

      container.querySelectorAll(".suite-card").forEach((b) =>
        b.addEventListener("click", () => this.renderModule(b.dataset.mod, container)));
    },

    /* ---- direct module entry (used by the 3 practice tabs) ---- */
    renderModule(mod, container) {
      const p = this.progress();
      if (mod === "listen") {
        const cards = [
          {
            key: "quick",
            title: "QUICK DRILLS",
            sub: "SENTENCE-LEVEL · " + ((global.LISTENING_SETS || []).reduce((n, s) => n + s.items.length, 0)) + " ITEMS",
            tag: this.modTag(p.listening.sets)
          },
          {
            key: "full",
            title: "FULL SECTIONS",
            sub: "FULL-LENGTH · " + (global.LISTENING_FULL || []).length + " TESTS / " +
                 (global.LISTENING_FULL || []).reduce((n, s) => n + s.sections.length, 0) + " SECTIONS",
            tag: this.modTag(p.listeningFull.sets)
          }
        ];
        container.innerHTML =
          '<div class="suite-head"><div class="suite-title">ACOUSTIC TELEMETRY' +
          '<span class="pt-tag">TTS</span></div>' +
          '<span class="suite-sub">DBL-CLICK ANY WORD IN TRANSCRIPTS TO FLAG IT</span></div>' +
          '<div class="suite-grid">' +
          cards.map((m) =>
            '<button class="suite-card lsn" data-lk="' + m.key + '">' +
            '<span class="suite-card-title">' + m.title + "</span>" +
            '<span class="suite-card-sub">' + m.sub + "</span>" + m.tag +
            "</button>"
          ).join("") +
          "</div>";
        container.querySelectorAll(".suite-card").forEach((b) =>
          b.addEventListener("click", () => {
            if (b.dataset.lk === "quick") Listening.showSets(container, "listen");
            else ListeningFull.showSets(container, "listen");
          }));
        return;
      }
      if (mod === "read") { Reading.showTests(container, "read"); return; }
      if (mod === "write") { Writing.showTasks(container, "write"); return; }
      this.render(container);
    },

    modTag(map, map2) {
      const maps = map2 ? [map, map2] : [map];
      const keys = [];
      for (const m of maps) Object.keys(m).forEach((k) => keys.push(k));
      if (!keys.length) return '<span class="suite-card-tag">UNTESTED</span>';
      const avg = keys.reduce((s, k) => {
        for (const m of maps) if (m[k] !== undefined) return s + m[k];
        return s;
      }, 0) / keys.length;
      return '<span class="suite-card-done">✓ ' + keys.length + " · " + Math.round(avg) + "%</span>";
    }
  };

  global.Suite = Suite;
})(window);
