/* ============================================================
 * slam-nav-stack :: sensor data parsing controller (IELTS reading)
 *
 * Renders full reading passages with question groups covering
 * eight IELTS question types. Graded on CHECK with correct
 * answers marked; completion is reported to the suite registry.
 * ============================================================ */
(function (global) {
  "use strict";

  const TYPE_LABEL = {
    "true-false-not-given": "TRUE / FALSE / NOT GIVEN",
    "yes-no-not-given": "YES / NO / NOT GIVEN",
    "multiple-choice": "MULTIPLE CHOICE",
    "matching-headings": "MATCHING HEADINGS",
    "matching-information": "MATCHING INFORMATION",
    "matching-sentence-endings": "SENTENCE ENDINGS",
    "short-answer": "SHORT ANSWER",
    "summary": "SUMMARY COMPLETION"
  };

  const Reading = {
    state: null,      // { test, passage, container }
    onProgress: null,

    showTests(container, from) {
      const tests = global.READING_TESTS || [];
      const prog = global.Suite ? Suite.progress().reading : null;
      let html = "";
      if (from) {
        html += '<div class="suite-head"><button class="btn" id="rdBackMod">◂ MODULE</button></div>';
      }
      html += '<div class="suite-grid">';
      for (const t of tests) {
        const done = prog && prog.tests && prog.tests[t.id];
        html +=
          '<button class="suite-card" data-test="' + t.id + '">' +
          '<span class="suite-card-title">' + this.esc(t.title) + "</span>" +
          '<span class="suite-card-sub">' + t.passages.length + " PASSAGES · DIFFICULTY " + (t.difficulty || "-") + "</span>" +
          (done ? '<span class="suite-card-done">✓ ' + Math.round(done) + "%</span>" : '<span class="suite-card-tag">UNTESTED</span>') +
          "</button>";
      }
      html += "</div>";
      container.innerHTML = html;
      if (from) {
        container.querySelector("#rdBackMod").addEventListener("click", () => Suite.renderModule("read", container));
      }
      container.querySelectorAll(".suite-card").forEach((b) =>
        b.addEventListener("click", () => this.showPassages(b.dataset.test, container)));
    },

    showPassages(testId, container) {
      const test = (global.READING_TESTS || []).find((t) => t.id === testId);
      if (!test) return;
      let html =
        '<div class="suite-head"><button class="btn" id="rdBack">◂ ALL TESTS</button>' +
        '<div class="suite-title">' + this.esc(test.title) + "</div></div>" +
        '<div class="suite-grid">';
      test.passages.forEach((p, i) => {
        const n = p.groups.reduce((s, g) => s + g.qs.length, 0);
        html +=
          '<button class="suite-card" data-pg="' + i + '">' +
          '<span class="suite-card-title">PASSAGE ' + (i + 1) + " — " + this.esc(p.title) + "</span>" +
          '<span class="suite-card-sub">' + p.paras.length + " SEGMENTS · " + n + " ITEMS</span>" +
          "</button>";
      });
      html += "</div>";
      container.innerHTML = html;
      container.querySelector("#rdBack").addEventListener("click", () => this.showTests(container));
      container.querySelectorAll(".suite-card[data-pg]").forEach((b) =>
        b.addEventListener("click", () => this.startPassage(test, parseInt(b.dataset.pg, 10), container)));
    },

    startPassage(test, pgIdx, container) {
      this.state = { test, passage: test.passages[pgIdx], container };
      this.renderPassage();
    },

    renderPassage() {
      const st = this.state;
      const p = st.passage;
      const c = st.container;
      const test = st.test;
      const annotate = global.WordAnnotate ? WordAnnotate.annotate.bind(WordAnnotate) : (t) => this.esc(t);

      const parasHtml = p.paras.map((pa) =>
        '<div class="rd-para"><span class="rd-para-key">' + pa.k + "</span><span class='rd-para-text'>" +
        annotate(pa.text) + "</span></div>").join("");

      // unstudied-word summary for this passage
      let unkHtml = "";
      if (global.WordAnnotate) {
        const unkSet = new Set();
        p.paras.forEach((pa) => WordAnnotate.unknownKeys(pa.text).forEach((w) => unkSet.add(w)));
        const unk = Array.from(unkSet);
        unkHtml = '<div class="unk-list" id="rdUnkList">' +
          (unk.length
            ? "<b>UNSTUDIED WORDS IN THIS PASSAGE — DBL-CLICK ANY TO FLAG:</b> " +
              unk.slice(0, 60).map((w) => '<button class="unk-chip" data-w="' + w + '">' + w + "</button>").join("")
            : "<b>NO UNSTUDIED WORDS — NICE.</b>") +
          "</div>";
      }

      let groupsHtml = "";
      p.groups.forEach((g, gi) => {
        groupsHtml += '<div class="qgroup panel">' +
          '<div class="panel-title"><span class="pt-dot"></span>' + (TYPE_LABEL[g.type] || g.type.toUpperCase()) +
          '<span class="pt-tag">' + g.qs.length + " ITEMS</span></div>" +
          (g.instr ? '<div class="qgroup-instr">' + this.esc(g.instr) + "</div>" : "") +
          '<div class="qgroup-body">' + this.renderGroup(g, gi) + "</div></div>";
      });

      c.innerHTML =
        '<div class="suite-head">' +
        '<button class="btn" id="rdBack2">◂ PASSAGES</button>' +
        '<div class="suite-title">PASSAGE ' + (test.passages.indexOf(p) + 1) +
        ' — ' + this.esc(p.title) + "</div>" +
        "</div>" +
        '<div class="rd-layout">' +
        '<div class="rd-article panel"><div class="panel-title"><span class="pt-dot"></span>FIELD REPORT · TRANSMISSION ' +
        (test.passages.indexOf(p) + 1) + "</div>" + parasHtml + unkHtml + "</div>" +
        '<div class="rd-questions">' + groupsHtml +
        '<div class="check-bar"><button class="btn btn-primary" id="rdCheck">CHECK ALL ANSWERS</button>' +
        '<button class="btn" id="rdNext" hidden>NEXT PASSAGE ▸</button></div>' +
        '<div class="item-feedback" id="rdFb"></div></div>' +
        "</div>";

      c.querySelector("#rdBack2").addEventListener("click", () => this.showPassages(test.id, c));
      c.querySelector("#rdCheck").addEventListener("click", () => this.check());
      c.querySelector("#rdNext").addEventListener("click", () => this.nextPassage());
      if (global.WordAnnotate) {
        WordAnnotate.bind(c.querySelector(".rd-article"));
        c.querySelectorAll(".unk-chip").forEach((b) =>
          b.addEventListener("click", () => WordAnnotate.showPanel(b.dataset.w)));
      }
    },

    renderGroup(g, gi) {
      if (g.type === "summary") {
        const q = g.qs[0];
        const parts = q.text.split("__GAP__");
        let html = '<div class="q-item summary-q" data-g="' + gi + '">';
        parts.forEach((part, i) => {
          html += '<span class="q-text">' + this.esc(part) + "</span>";
          if (i < parts.length - 1) {
            html += '<input type="text" class="typing-input sm-gap" data-gap="' + i + '" autocomplete="off" spellcheck="false" placeholder="' + (i + 1) + '">';
          }
        });
        html += "</div>";
        return html;
      }
      return g.qs.map((q) => {
        let control = "";
        if (g.type === "true-false-not-given" || g.type === "yes-no-not-given") {
          const opts = g.type === "true-false-not-given" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"];
          control = '<div class="trio">' + opts.map((o) =>
            '<label class="trio-item"><input type="radio" name="rg' + gi + "_" + q.n + '" value="' + o + '"> ' + o + "</label>"
          ).join("") + "</div>";
        } else if (g.type === "multiple-choice") {
          control = '<div class="option-list">' + (g.opts || []).map((o, oi) =>
            '<label class="option-item"><input type="radio" name="rg' + gi + "_" + q.n + '" value="' + oi + '"> <span>' + this.esc(o) + "</span></label>"
          ).join("") + "</div>";
        } else if (g.type === "matching-headings") {
          control = '<select class="input rd-select" data-m="' + gi + "_" + q.n + '"><option value="">SELECT…</option>' +
            (g.bank || []).map((o, oi) => '<option value="' + oi + '">' + this.esc(o) + "</option>").join("") + "</select>";
        } else if (g.type === "matching-information") {
          control = '<select class="input rd-select" data-m="' + gi + "_" + q.n + '"><option value="">SELECT…</option>' +
            (g.bank || []).map((o) => '<option value="' + o + '">' + o + "</option>").join("") + "</select>";
        } else if (g.type === "matching-sentence-endings") {
          control = '<div class="option-list">' + (g.opts || []).map((o, oi) =>
            '<label class="option-item"><input type="radio" name="rg' + gi + "_" + q.n + '" value="' + oi + '"> <span>' + this.esc(o) + "</span></label>"
          ).join("") + "</div>";
        } else { // short-answer
          control = '<input type="text" class="typing-input" data-in="' + gi + "_" + q.n + '" autocomplete="off" spellcheck="false" placeholder="ANSWER">';
        }
        return '<div class="q-item" data-q="' + gi + ":" + q.n + '"><div class="q-num">' + q.n + '</div>' +
          '<div class="q-text">' + this.esc(q.text) + "</div>" + control + "</div>";
      }).join("");
    },

    /* ---- grading ---- */
    norm(s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    },

    check() {
      const st = this.state;
      const p = st.passage;
      const c = st.container;
      const fb = c.querySelector("#rdFb");
      let total = 0, correct = 0;

      p.groups.forEach((g, gi) => {
        if (g.type === "summary") {
          const q = g.qs[0];
          const inputs = c.querySelectorAll('[data-g="' + gi + '"] .sm-gap');
          total += q.ans.length;
          q.ans.forEach((a, i) => {
            const inp = inputs[i];
            if (!inp) return;
            const ok = this.norm(inp.value) === this.norm(a);
            inp.classList.add(ok ? "q-ok" : "q-bad");
            if (!ok) inp.value = a;
            if (ok) correct++;
          });
          return;
        }
        g.qs.forEach((q) => {
          total++;
          let ok = false;
          if (g.type === "true-false-not-given" || g.type === "yes-no-not-given") {
            const sel = c.querySelector('input[name="rg' + gi + "_" + q.n + '"]:checked');
            if (sel) {
              ok = this.norm(sel.value) === this.norm(q.ans);
              const item = c.querySelector('[data-q="' + gi + ":" + q.n + '"]');
              if (item) {
                item.classList.add(ok ? "q-ok" : "q-bad");
                const trio = item.querySelectorAll(".trio-item");
                const ansTxt = String(q.ans).toUpperCase();
                trio.forEach((t) => {
                  const lbl = t.textContent.trim().toUpperCase();
                  if (lbl === ansTxt) t.classList.add("opt-ok");
                  else if (!ok && sel && sel.value.toUpperCase() === lbl) t.classList.add("opt-bad");
                });
              }
            }
          } else if (g.type === "multiple-choice" || g.type === "matching-sentence-endings") {
            const sel = c.querySelector('input[name="rg' + gi + "_" + q.n + '"]:checked');
            const ansIdx = this.findAnsIdx(g, q.ans);
            if (sel) ok = parseInt(sel.value, 10) === ansIdx;
            const item = c.querySelector('[data-q="' + gi + ":" + q.n + '"]');
            if (item && ansIdx !== -1) {
              item.classList.add(ok ? "q-ok" : "q-bad");
              const opts = item.querySelectorAll(".option-item");
              if (opts[ansIdx]) opts[ansIdx].classList.add("opt-ok");
            }
          } else if (g.type === "matching-headings" || g.type === "matching-information") {
            const sel = c.querySelector('[data-m="' + gi + "_" + q.n + '"]');
            if (sel && sel.value !== "") {
              const ansIdx = this.findAnsIdx(g, q.ans);
              ok = parseInt(sel.value, 10) === ansIdx;
              sel.classList.add(ok ? "q-ok" : "q-bad");
              if (!ok) sel.value = String(ansIdx);
            }
          } else { // short-answer / fill
            const inp = c.querySelector('[data-in="' + gi + "_" + q.n + '"]');
            if (inp && inp.value.trim()) {
              ok = this.norm(inp.value) === this.norm(q.ans);
              inp.classList.add(ok ? "q-ok" : "q-bad");
              if (!ok) inp.value = q.ans;
            }
          }
          if (ok) correct++;
        });
      });

      const pct = Math.round((correct / Math.max(1, total)) * 100);
      fb.className = "item-feedback " + (pct >= 60 ? "ok" : "err");
      fb.textContent = "SCORE " + correct + " / " + total + " (" + pct + "%) — CORRECT ANSWERS MARKED";
      c.querySelector("#rdCheck").hidden = true;
      const next = c.querySelector("#rdNext");
      next.hidden = false;
      next.textContent = st.test.passages.indexOf(p) < st.test.passages.length - 1 ? "NEXT PASSAGE ▸" : "TEST COMPLETE ▸";

      // aggregate across the test
      if (!this._scores) this._scores = {};
      if (!this._total) this._total = {};
      const tid = st.test.id;
      this._scores[tid] = (this._scores[tid] || 0) + correct;
      this._total[tid] = (this._total[tid] || 0) + total;
      if (this.onProgress) {
        this.onProgress("reading", tid, Math.round((this._scores[tid] / this._total[tid]) * 100));
      }
    },

    // answer letter/index -> option index within the group
    findAnsIdx(g, ans) {
      const a = this.norm(ans);
      if (g.type === "matching-headings") {
        // roman numerals: v, vii, ix...
        const bank = g.bank || [];
        const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11 };
        if (a in roman) return roman[a] - 1;
        return bank.findIndex((o) => this.norm(o) === a);
      }
      if (g.type === "matching-information") {
        const bank = g.bank || [];
        return bank.findIndex((o) => this.norm(o) === a);
      }
      // multiple-choice / sentence-endings: letter A/B/C...
      if (/^[a-z]$/.test(a)) return a.charCodeAt(0) - 97;
      return (g.opts || []).findIndex((o) => this.norm(o) === a);
    },

    nextPassage() {
      const st = this.state;
      const idx = st.test.passages.indexOf(st.passage);
      if (idx < st.test.passages.length - 1) {
        this.startPassage(st.test, idx + 1, st.container);
      } else {
        const c = st.container;
        const tid = st.test.id;
        const pct = Math.round((this._scores[tid] / this._total[tid]) * 100);
        c.innerHTML =
          '<div class="suite-head"><button class="btn" id="rdBack3">◂ ALL TESTS</button>' +
          '<div class="suite-title">' + this.esc(st.test.title) + '<span class="pt-tag">COMPLETE</span></div></div>' +
          '<div class="panel suite-result">' +
          '<div class="done-symbol">' + (pct >= 80 ? "◆" : pct >= 60 ? "◈" : "◇") + "</div>" +
          '<div class="done-title">TEST ACCURACY ' + pct + "%</div>" +
          '<div class="done-sub">' + this._scores[tid] + " / " + this._total[tid] + " ITEMS CORRECT · " +
          (pct >= 80 ? "EXCELLENT SIGNAL" : pct >= 60 ? "ACCEPTABLE — REVIEW" : "RETUNE AND RETRY") + "</div>" +
          '<button class="btn btn-primary" id="rdRetry">↻ RETRY TEST</button></div>';
        c.querySelector("#rdRetry").addEventListener("click", () => this.showTests(c));
        c.querySelector("#rdBack3").addEventListener("click", () => this.showTests(c));
      }
    },

    _scores: {},
    _total: {},

    esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
  };

  global.Reading = Reading;
})(window);
