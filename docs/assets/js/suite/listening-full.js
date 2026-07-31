/* ============================================================
 * slam-nav-stack :: acoustic telemetry — full section controller
 *
 * Full-length IELTS listening sections (4 per test): the whole
 * transcript is played via TTS while the operator answers the
 * question groups (gap-fill / multiple-choice). All items are
 * graded together at the end of the section, like the real exam.
 * ============================================================ */
(function (global) {
  "use strict";

  const ListeningFull = {
    state: null,     // { set, section, idx }
    onProgress: null,

    showSets(container, from) {
      const sets = global.LISTENING_FULL || [];
      const prog = global.Suite ? Suite.progress().listeningFull : null;
      let html = "";
      if (from) {
        html += '<div class="suite-head"><button class="btn" id="lfBackMod">◂ MODULE</button></div>';
      }
      html += '<div class="suite-grid">';
      for (const s of sets) {
        const done = prog && prog.sets && prog.sets[s.id];
        html +=
          '<button class="suite-card" data-set="' + s.id + '">' +
          '<span class="suite-card-title">' + this.esc(s.title) + "</span>" +
          '<span class="suite-card-sub">' + s.sections.length + " SECTIONS · DIFFICULTY " + (s.difficulty || "-") + "</span>" +
          (done ? '<span class="suite-card-done">✓ ' + Math.round(done) + "%</span>" : '<span class="suite-card-tag">UNTESTED</span>') +
          "</button>";
      }
      html += "</div>";
      container.innerHTML = html;
      if (from) {
        container.querySelector("#lfBackMod").addEventListener("click", () => Suite.renderModule("listen", container));
      }
      container.querySelectorAll(".suite-card").forEach((b) =>
        b.addEventListener("click", () => this.showSections(b.dataset.set, container)));
    },

    showSections(setId, container) {
      const set = (global.LISTENING_FULL || []).find((s) => s.id === setId);
      if (!set) return;
      let html =
        '<div class="suite-head"><button class="btn" id="lfBack">◂ ALL TESTS</button>' +
        '<div class="suite-title">' + this.esc(set.title) + "</div></div>" +
        '<div class="suite-grid">';
      set.sections.forEach((sec, i) => {
        html +=
          '<button class="suite-card" data-sec="' + i + '">' +
          '<span class="suite-card-title">SECTION ' + (i + 1) + " — " + this.esc(sec.title) + "</span>" +
          '<span class="suite-card-sub">' + sec.groups.reduce((n, g) => n + g.qs.length, 0) + " ITEMS · TRANSCRIPT " + Math.round(sec.transcript.length / 250) + " MIN</span>" +
          "</button>";
      });
      html += "</div>";
      container.innerHTML = html;
      container.querySelector("#lfBack").addEventListener("click", () => this.showSets(container));
      container.querySelectorAll(".suite-card[data-sec]").forEach((b) =>
        b.addEventListener("click", () => this.startSection(set, parseInt(b.dataset.sec, 10), container)));
    },

    startSection(set, secIdx, container) {
      const sec = set.sections[secIdx];
      this.state = { set, section: sec, container };
      this.renderSection();
    },

    renderSection() {
      const st = this.state;
      const sec = st.section;
      const c = st.container;
      const totalItems = sec.groups.reduce((n, g) => n + g.qs.length, 0);

      let groupsHtml = "";
      sec.groups.forEach((g, gi) => {
        groupsHtml += '<div class="qgroup panel">' +
          '<div class="panel-title"><span class="pt-dot"></span>' + this.typeLabel(g.type) +
          '<span class="pt-tag">' + g.qs.length + " ITEMS</span></div>" +
          '<div class="qgroup-instr">' + this.esc(g.instr) + "</div><div class='qgroup-body'>";
        g.qs.forEach((q) => {
          if (g.type === "multiple-choice") {
            groupsHtml +=
              '<div class="q-item" data-q="' + gi + ":" + q.n + '">' +
              '<div class="q-num">' + q.n + "</div>" +
              '<div class="q-text">' + this.esc(q.text) + "</div>" +
              '<div class="option-list">' +
              (g.opts || []).map((o, oi) =>
                '<label class="option-item"><input type="radio" name="lq' + gi + "_" + q.n + '" value="' + oi + '"> <span>' + this.esc(o) + "</span></label>"
              ).join("") +
              "</div></div>";
          } else {
            const lbl = (q.text.match(/[a-z]/i) ? this.esc(q.text) : "") ||
                        "Answer for question " + q.n;
            groupsHtml +=
              '<div class="q-item" data-q="' + gi + ":" + q.n + '">' +
              '<div class="q-num">' + q.n + "</div>" +
              '<div class="q-text">' + lbl + "</div>" +
              '<input type="text" class="typing-input" data-ans="' + gi + "_" + q.n + '" autocomplete="off" spellcheck="false" placeholder="ANSWER">' +
              "</div>";
          }
        });
        groupsHtml += "</div></div>";
      });

      c.innerHTML =
        '<div class="suite-head">' +
        '<button class="btn" id="lfBack2">◂ SECTIONS</button>' +
        '<div class="suite-title">' + this.esc(sec.title) + '<span class="pt-tag">SECTION ' + st.set.sections.indexOf(sec) + 1 + " OF " + st.set.sections.length + "</span></div>" +
        "</div>" +
        '<div class="audio-bar">' +
        '<button class="btn btn-primary" id="lfPlay">◉ PLAY TRANSCRIPT</button>' +
        '<button class="btn" id="lfStop">■ STOP</button>' +
        '<button class="btn" id="lfShow">≣ SHOW TRANSCRIPT</button>' +
        '<span class="audio-rate">RATE <select id="lfRate" class="input"><option value="0.7">SLOW</option><option value="0.85" selected>NORMAL</option><option value="1">FAST</option></select></span>' +
        '<span class="audio-hint">FULL PASSAGE — ANSWER AS YOU LISTEN</span>' +
        "</div>" +
        '<div class="transcript-panel panel" id="lfTrans" hidden>' +
        '<div class="panel-title"><span class="pt-dot"></span>TRANSCRIPT <span class="pt-tag">DBL-CLICK TO FLAG</span></div>' +
        '<div class="transcript-text" id="lfTransText"></div>' +
        '<div class="unk-list" id="lfUnkList"></div></div>' +
        '<div class="qgroups">' + groupsHtml + "</div>" +
        '<div class="check-bar"><button class="btn btn-primary" id="lfCheck">CHECK ALL ANSWERS</button>' +
        '<button class="btn" id="lfNext" hidden>NEXT SECTION ▸</button></div>' +
        '<div class="item-feedback" id="lfFb"></div>';

      c.querySelector("#lfBack2").addEventListener("click", () => this.showSections(st.set.id, c));
      c.querySelector("#lfPlay").addEventListener("click", () => this.speak(sec.transcript));
      c.querySelector("#lfStop").addEventListener("click", () => { try { global.speechSynthesis.cancel(); } catch (e) {} });
      c.querySelector("#lfShow").addEventListener("click", () => {
        const tp = c.querySelector("#lfTrans");
        tp.hidden = !tp.hidden;
        if (!tp.hidden) {
          c.querySelector("#lfTransText").innerHTML = global.WordAnnotate ? WordAnnotate.annotate(sec.transcript) : this.esc(sec.transcript);
          const unk = global.WordAnnotate ? Array.from(WordAnnotate.unknownKeys(sec.transcript)) : [];
          c.querySelector("#lfUnkList").innerHTML = unk.length
            ? "<b>UNSTUDIED WORDS IN THIS TRANSCRIPT:</b> " + unk.slice(0, 40).map((w) =>
                '<button class="unk-chip" data-w="' + w + '">' + w + "</button>").join("")
            : "<b>NO UNSTUDIED WORDS — NICE.</b>";
          c.querySelectorAll(".unk-chip").forEach((b) =>
            b.addEventListener("click", () => WordAnnotate.showPanel(b.dataset.w)));
          if (global.WordAnnotate) WordAnnotate.bind(c.querySelector("#lfTransText"));
        }
      });
      c.querySelector("#lfRate").addEventListener("change", (e) => { this._rate = parseFloat(e.target.value); });
      c.querySelector("#lfCheck").addEventListener("click", () => this.check());
      c.querySelector("#lfNext").addEventListener("click", () => this.nextSection());
    },

    typeLabel(t) {
      return { "sentence-completion": "SENTENCE COMPLETION", "multiple-choice": "MULTIPLE CHOICE" }[t] || t.toUpperCase();
    },

    speak(text) {
      const t = String(text || "").trim();
      if (!t) return;
      // online neural TTS first (runtime-detected), then local
      if (t.length <= 160 && this._tryOnline(t)) return;
      this._speakLocal(t);
    },

    _tryOnline(text) {
      const engines = [
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + encodeURIComponent(text),
        "https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=" + encodeURIComponent(text)
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= engines.length) { this._speakLocal(text); return false; }
        const url = engines[i++];
        try {
          if (this._audio) { this._audio.pause(); this._audio = null; }
          const a = new Audio(url);
          let done = false;
          const fail = () => { if (!done) { done = true; if (this._audio === a) this._audio = null; tryNext(); } };
          const p = a.play();
          if (p && p.catch) p.catch(fail);
          a.addEventListener("error", fail);
          setTimeout(() => { if (this._audio === a && a.paused) fail(); }, 4000);
          this._audio = a;
          return true;
        } catch (e) { return tryNext(); }
      };
      return tryNext();
    },

    _speakLocal(text) {
      try {
        global.speechSynthesis.cancel();
        const st = global.Lexicon ? Lexicon.state().settings : {};
        const parts = String(text).length > 140 ? String(text).split(/(?<=[.!?;,])\s+/) : [text];
        let voice = null;
        const voices = global.speechSynthesis.getVoices();
        if (st.voiceName) voice = voices.find((x) => x.name === st.voiceName) || null;
        if (!voice) voice = voices.find((x) => x.lang === "en-US" && /google|natural|samantha|aria|zira|daniel|karen|jenny|libby/i.test(x.name)) || null;
        if (!voice) voice = voices.find((x) => x.lang === "en-US") || null;
        for (const part of parts) {
          if (!String(part).trim()) continue;
          const u = new SpeechSynthesisUtterance(part.trim());
          u.lang = "en-US";
          u.rate = this._rate || st.rate || 0.85;
          if (voice) u.voice = voice;
          global.speechSynthesis.speak(u);
        }
      } catch (e) { /* TTS unavailable */ }
    },

    norm(s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    },

    check() {
      const st = this.state;
      const c = st.container;
      const fb = c.querySelector("#lfFb");
      let total = 0, correct = 0;

      st.section.groups.forEach((g, gi) => {
        g.qs.forEach((q) => {
          total++;
          let ok = false;
          if (g.type === "multiple-choice") {
            const sel = c.querySelector('input[name="lq' + gi + "_" + q.n + '"]:checked');
            if (sel) {
              const chosen = parseInt(sel.value, 10);
              const ansIdx = this.findOptIndex(g.opts, q.ans);
              ok = ansIdx !== -1 && chosen === ansIdx;
              const item = c.querySelector('[data-q="' + gi + ":" + q.n + '"]');
              if (item) {
                item.classList.add(ok ? "q-ok" : "q-bad");
                const opts = item.querySelectorAll(".option-item");
                if (ansIdx !== -1) opts[ansIdx].classList.add("opt-ok");
                if (sel && !ok) sel.closest(".option-item").classList.add("opt-bad");
              }
            }
          } else {
            const inp = c.querySelector('[data-ans="' + gi + "_" + q.n + '"]');
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
      fb.textContent = "SCORE " + correct + " / " + total + " (" + pct + "%) — WRONG ANSWERS SHOW CORRECT VALUE";
      c.querySelector("#lfCheck").hidden = true;
      const next = c.querySelector("#lfNext");
      next.hidden = false;
      next.textContent = st.set.sections.indexOf(st.section) < st.set.sections.length - 1 ? "NEXT SECTION ▸" : "TEST COMPLETE ▸";

      // aggregate score across the whole test
      if (!this._scores) this._scores = {};
      this._scores[st.set.id] = (this._scores[st.set.id] || 0) + correct;
      this._total[st.set.id] = (this._total[st.set.id] || 0) + total;
      if (this.onProgress) {
        this.onProgress("listeningFull", st.set.id, Math.round((this._scores[st.set.id] / this._total[st.set.id]) * 100));
      }
    },

    nextSection() {
      const st = this.state;
      const idx = st.set.sections.indexOf(st.section);
      if (idx < st.set.sections.length - 1) {
        this.startSection(st.set, idx + 1, st.container);
      } else {
        const c = st.container;
        const pct = Math.round((this._scores[st.set.id] / this._total[st.set.id]) * 100);
        c.innerHTML =
          '<div class="suite-head"><button class="btn" id="lfBack3">◂ ALL TESTS</button>' +
          '<div class="suite-title">' + this.esc(st.set.title) + '<span class="pt-tag">COMPLETE</span></div></div>' +
          '<div class="panel suite-result">' +
          '<div class="done-symbol">' + (pct >= 80 ? "◆" : pct >= 60 ? "◈" : "◇") + "</div>" +
          '<div class="done-title">TEST ACCURACY ' + pct + "%</div>" +
          '<div class="done-sub">' + this._scores[st.set.id] + " / " + this._total[st.set.id] + " ITEMS CORRECT · " +
          (pct >= 80 ? "EXCELLENT SIGNAL" : pct >= 60 ? "ACCEPTABLE — REVIEW" : "RETUNE AND RETRY") + "</div>" +
          '<button class="btn btn-primary" id="lfRetry">↻ RETRY TEST</button></div>';
        c.querySelector("#lfRetry").addEventListener("click", () => this.showSets(c));
        c.querySelector("#lfBack3").addEventListener("click", () => this.showSets(c));
      }
    },

    findOptIndex(opts, ans) {
      // ans is a letter (A/B/C...) or the option text
      const a = this.norm(ans);
      if (/^[a-d]$/.test(a)) return a.charCodeAt(0) - 97;
      for (let i = 0; i < (opts || []).length; i++) {
        if (this.norm(opts[i]) === a) return i;
      }
      return -1;
    },

    _scores: {},
    _total: {},

    esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
  };

  global.ListeningFull = ListeningFull;
})(window);
