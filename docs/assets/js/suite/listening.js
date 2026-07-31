/* ============================================================
 * slam-nav-stack :: acoustic telemetry controller (IELTS listening)
 *
 * Sentence-level TTS playback with four item types. One item at
 * a time (like the real exam — no going back). Completion is
 * reported to the suite registry for progress tracking.
 * ============================================================ */
(function (global) {
  "use strict";

  const Listening = {
    state: null,     // { set, idx, results, score }

    /* ---- suite registry hooks (set by suite.js) ---- */
    onProgress: null,

    /* ============ navigation ============ */
    showSets(container, from) {
      const sets = global.LISTENING_SETS || [];
      const prog = global.Suite ? Suite.progress().listening : null;
      let html = "";
      if (from) {
        html += '<div class="suite-head"><button class="btn" id="lsnBackMod">◂ MODULE</button></div>';
      }
      html += '<div class="suite-grid">';
      for (const s of sets) {
        const done = prog && prog.sets && prog.sets[s.id];
        html +=
          '<button class="suite-card" data-set="' + s.id + '">' +
          '<span class="suite-card-title">' + s.title + "</span>" +
          '<span class="suite-card-sub">' + s.topic + " · " + s.items.length + " ITEMS</span>" +
          (done ? '<span class="suite-card-done">✓ ' + Math.round(done) + "%</span>" : '<span class="suite-card-tag">UNTESTED</span>') +
          "</button>";
      }
      html += "</div>";
      container.innerHTML = html;
      if (from) {
        container.querySelector("#lsnBackMod").addEventListener("click", () => Suite.renderModule("listen", container));
      }
      container.querySelectorAll(".suite-card").forEach((b) =>
        b.addEventListener("click", () => this.startSet(b.dataset.set, container)));
    },

    startSet(setId, container) {
      const set = (global.LISTENING_SETS || []).find((s) => s.id === setId);
      if (!set) return;
      this.state = { set, idx: 0, results: [], score: 0 };
      this._container = container;
      this.renderItem();
    },

    renderItem() {
      const st = this.state;
      const item = st.set.items[st.idx];
      const total = st.set.items.length;
      const c = this._container;

      let body = "";
      if (item.type === "dictation" || item.type === "number") {
        body =
          '<div class="item-text">' + this.esc(item.prompt || item.q) + "</div>" +
          '<div class="answer-row"><input type="text" id="lsnInput" class="typing-input" autocomplete="off" spellcheck="false" placeholder="TYPE ANSWER..."></div>';
      } else if (item.type === "choice") {
        body =
          '<div class="item-text">' + this.esc(item.q) + "</div>" +
          '<div class="option-list">' +
          item.options.map((o, i) =>
            '<label class="option-item"><input type="radio" name="lsnOpt" value="' + i + '"> <span>' + this.esc(o) + "</span></label>"
          ).join("") +
          "</div>";
      } else if (item.type === "gapfill") {
        body =
          '<div class="item-text">' + this.esc(item.q) + "</div>" +
          '<div class="answer-row multi">' +
          item.blanks.map((_, i) =>
            '<input type="text" class="typing-input gap-input" data-gap="' + i + '" autocomplete="off" spellcheck="false" placeholder="' + (i + 1) + '">'
          ).join("") +
          "</div>";
      }

      c.innerHTML =
        '<div class="suite-head">' +
        '<button class="btn" id="lsnBack">◂ ALL SETS</button>' +
        '<div class="suite-title">' + st.set.title + '<span class="pt-tag">' + st.set.topic + "</span></div>" +
        '<div class="suite-score" id="lsnScore">' + st.score + " / " + st.idx + "</div>" +
        "</div>" +
        '<div class="audio-bar">' +
        '<button class="btn btn-primary" id="lsnPlay">◉ PLAY</button>' +
        '<button class="btn" id="lsnReplay">↻ REPLAY</button>' +
        '<span class="audio-rate">RATE <select id="lsnRate" class="input"><option value="0.7">SLOW</option><option value="0.85" selected>NORMAL</option><option value="1">FAST</option></select></span>' +
        '<span class="audio-hint">ITEM ' + (st.idx + 1) + " / " + total + "</span>" +
        "</div>" +
        '<div class="item-body">' +
        '<div class="panel"><div class="panel-title"><span class="pt-dot"></span>' + this.typeLabel(item.type) + "</div>" + body +
        '<div class="check-bar"><button class="btn btn-primary" id="lsnCheck">CHECK</button>' +
        '<button class="btn" id="lsnNext" hidden>NEXT ▸</button></div>' +
        '<div class="item-feedback" id="lsnFb"></div></div></div>';

      c.querySelector("#lsnBack").addEventListener("click", () => {
        this.state = null;
        this.showSets(c);
      });
      c.querySelector("#lsnPlay").addEventListener("click", () => this.speak(st.set, item.audio));
      c.querySelector("#lsnReplay").addEventListener("click", () => this.speak(st.set, item.audio));
      c.querySelector("#lsnRate").addEventListener("change", (e) => { st.rate = parseFloat(e.target.value); });
      c.querySelector("#lsnCheck").addEventListener("click", () => this.check());
      c.querySelector("#lsnNext").addEventListener("click", () => this.next());
      const inp = c.querySelector("#lsnInput");
      if (inp) {
        inp.focus();
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this.check();
        });
      }
      // auto-play once for convenience
      this.speak(st.set, item.audio);
    },

    typeLabel(t) {
      return { dictation: "GAP DICTATION", choice: "MULTIPLE CHOICE", number: "NUMERIC EXTRACT", gapfill: "PASSAGE GAP-FILL" }[t] || "ITEM";
    },

    /* ---- TTS ---- */
    speak(set, text) {
      try {
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        u.rate = this.state && this.state.rate ? this.state.rate : (set.rate || 0.85);
        const voices = global.speechSynthesis.getVoices();
        const v = voices.find((x) => x.lang === "en-US" && /google|natural|samantha|aria/i.test(x.name)) ||
                  voices.find((x) => x.lang === "en-US") || null;
        if (v) u.voice = v;
        global.speechSynthesis.speak(u);
      } catch (e) { /* TTS unavailable */ }
    },

    /* ---- grading ---- */
    norm(s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    },
    match(input, answers) {
      const list = Array.isArray(answers) ? answers : [answers];
      const ni = this.norm(input);
      return list.some((a) => this.norm(a) === ni);
    },

    check() {
      const st = this.state;
      if (!st) return;
      const item = st.set.items[st.idx];
      const c = this._container;
      let correct = false;
      const fb = c.querySelector("#lsnFb");

      if (item.type === "choice") {
        const sel = c.querySelector('input[name="lsnOpt"]:checked');
        if (!sel) { fb.className = "item-feedback err"; fb.textContent = "SELECT AN OPTION FIRST"; return; }
        correct = parseInt(sel.value, 10) === item.answer;
        c.querySelectorAll(".option-item").forEach((el, i) => {
          el.classList.remove("opt-ok", "opt-bad");
          if (i === item.answer) el.classList.add("opt-ok");
          if (i === parseInt(sel.value, 10) && !correct) el.classList.add("opt-bad");
        });
      } else if (item.type === "gapfill") {
        const inputs = c.querySelectorAll(".gap-input");
        const vals = [];
        let allFilled = true;
        inputs.forEach((inp) => { if (!inp.value.trim()) allFilled = false; vals.push(inp.value); });
        if (!allFilled) { fb.className = "item-feedback err"; fb.textContent = "FILL ALL GAPS FIRST"; return; }
        correct = item.blanks.every((a, i) => this.match(vals[i], a));
      } else {
        const inp = c.querySelector("#lsnInput");
        if (!inp.value.trim()) { fb.className = "item-feedback err"; fb.textContent = "TYPE AN ANSWER FIRST"; return; }
        correct = this.match(inp.value, item.answer);
      }

      st.results.push(correct);
      if (correct) st.score++;
      st.idx++;
      fb.className = "item-feedback " + (correct ? "ok" : "err");
      fb.innerHTML = (correct ? "✓ CORRECT" : "✗ INCORRECT") +
        (item.explain ? " — <span class='fb-explain'>" + this.esc(item.explain) + "</span>" : "");
      const checkBtn = c.querySelector("#lsnCheck");
      checkBtn.hidden = true;
      const nextBtn = c.querySelector("#lsnNext");
      nextBtn.hidden = false;
      if (st.idx >= st.set.items.length) {
        nextBtn.textContent = "FINISH ▸";
      } else {
        nextBtn.textContent = "NEXT ▸";
      }
      c.querySelector("#lsnScore").textContent = st.score + " / " + st.idx;
    },

    next() {
      const st = this.state;
      if (st.idx >= st.set.items.length) { this.finish(); return; }
      this.renderItem();
    },

    finish() {
      const st = this.state;
      const pct = Math.round((st.score / st.set.items.length) * 100);
      const c = this._container;
      c.innerHTML =
        '<div class="suite-head"><button class="btn" id="lsnBack2">◂ ALL SETS</button>' +
        '<div class="suite-title">' + st.set.title + '<span class="pt-tag">COMPLETE</span></div></div>' +
        '<div class="panel suite-result">' +
        '<div class="done-symbol">' + (pct >= 80 ? "◆" : pct >= 60 ? "◈" : "◇") + "</div>" +
        '<div class="done-title">SCORE ' + st.score + " / " + st.set.items.length + "</div>" +
        '<div class="done-sub">ACCURACY ' + pct + "% · " + (pct >= 80 ? "EXCELLENT SIGNAL" : pct >= 60 ? "ACCEPTABLE — REVIEW WEAK ITEMS" : "RETUNE AND RETRY") + "</div>" +
        '<button class="btn btn-primary" id="lsnRetry">↻ RETRY SET</button>' +
        "</div>";
      c.querySelector("#lsnRetry").addEventListener("click", () => this.startSet(st.set.id, c));
      c.querySelector("#lsnBack2").addEventListener("click", () => { this.state = null; this.showSets(c); });
      if (this.onProgress) this.onProgress("listening", st.set.id, pct);
    },

    esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
  };

  global.Listening = Listening;
})(window);
