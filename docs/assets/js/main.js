/* ============================================================
 * slam-nav-stack :: mission control (application controller)
 *
 * View routing (STATISTICS / VOCABULARY / LISTENING / READING /
 * WRITING), sense-based vocabulary training, memory deck,
 * daily mix queue and system configuration.
 *
 * ── REAL USAGE GUIDE (hidden from the README on purpose) ──────
 * 1. Deploy: push this repo; GitHub Actions publishes docs/ to
 *    https://<user>.github.io/slam-nav-stack/ automatically.
 * 2. Daily mix: VOCABULARY → "START DAILY MIX". Queue = due
 *    reviews (hot zone first) + flagged words + new words up to
 *    the daily target. Sense mode runs three steps per card:
 *    UNDERSTAND (senses) → RECALL (example) → SPELL (typing).
 *    Self-grade UNSURE/PARTIAL/UNDERSTOOD (keys 1-3), SPACE
 *    speaks, ENTER confirms spelling.
 * 3. Flag words anywhere: double-click any word in reading
 *    passages / listening transcripts / writing prompts → ADD
 *    TO MEMORY DECK. Words failing twice in a row are auto-
 *    flagged into the hot zone. All live in the MEMORY DECK tab
 *    (stage filters, force review, manual add/remove).
 * 4. Data lives in localStorage; use ⇩ EXPORT in LEXICON
 *    regularly, ⇪ IMPORT restores (backup JSON or word lists).
 * 5. Ctrl+Shift+M toggles PLAIN MODE (light theme).
 * 6. Practice modules: LISTENING (quick drills + full sections),
 *    READING (5 academic tests), WRITING (tasks + phrase bank).
 *    Content: ielts-ai-dataset (CC BY 4.0, see data headers).
 * ──────────────────────────────────────────────────────────────
 * ============================================================ */
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;

  const App = {
    view: "stats",
    vsub: "train",       // vocab sub-view: train | deck | lexicon
    session: null,       // { queue:[{key,ent,card,isNew,hot}], idx, newDone, revDone, failed }
    _typing: null,       // typing-mode state
    _sense: null,        // sense-mode state

    /* ================= init ================= */
    init() {
      Lexicon.load();
      // wire suite module progress reporting
      global.Listening.onProgress = Suite.record.bind(Suite);
      global.ListeningFull.onProgress = Suite.record.bind(Suite);
      global.Reading.onProgress = Suite.record.bind(Suite);
      global.Writing.onProgress = Suite.record.bind(Suite);
      // unknown-word panel buttons
      $("btnUnkAdd").addEventListener("click", () => WordAnnotate.addCurrent());
      $("btnUnkClose").addEventListener("click", () => WordAnnotate.closePanel());
      this.bindTabs();
      this.bindActions();
      this.bindSettings();
      this.bindKeyboard();
      this.applySettings();
      this.renderAll();
      this.startClock();
      Telemetry.initMap($("mapCanvas"));
      Telemetry.drawChart($("chartCanvas"));
    },

    /* ================= tabs ================= */
    bindTabs() {
      document.querySelectorAll(".tab[data-view]").forEach((btn) => {
        btn.addEventListener("click", () => this.switchView(btn.dataset.view));
      });
      document.querySelectorAll("#vocabSubNav .tab[data-sub]").forEach((btn) => {
        btn.addEventListener("click", () => this.switchSub(btn.dataset.sub));
      });
    },
    switchView(v) {
      this.view = v;
      document.querySelectorAll(".tab[data-view]").forEach((b) =>
        b.classList.toggle("active", b.dataset.view === v));
      document.querySelectorAll(".view").forEach((sec) =>
        sec.classList.toggle("active", sec.id === "view-" + v));
      if (v === "stats") { this.renderAll(); Telemetry.drawChart($("chartCanvas")); }
      if (v === "vocab") this.showSub();
      if (v === "listen") Suite.renderModule("listen", $("listenContainer"));
      if (v === "read") Suite.renderModule("read", $("readContainer"));
      if (v === "write") Suite.renderModule("write", $("writeContainer"));
    },
    switchSub(s) {
      this.vsub = s;
      document.querySelectorAll("#vocabSubNav .tab").forEach((b) =>
        b.classList.toggle("active", b.dataset.sub === s));
      this.showSub();
    },
    showSub() {
      document.querySelectorAll(".sub-view").forEach((sec) => sec.classList.remove("active"));
      const map = { train: "vocabTrain", deck: "vocabDeck", lexicon: "vocabLexicon" };
      const el = $(map[this.vsub]);
      if (el) el.classList.add("active");
      if (this.vsub === "deck") this.renderDeck();
      if (this.vsub === "lexicon") this.renderLog();
      if (this.vsub === "train" && !this.session) this.renderIdleConsole();
    },

    /* ================= statistics ================= */
    stView: "all",   // "all" | "today"

    renderAll() {
      this.renderStats();
      this.renderStages();
      this.renderModStats();
      Telemetry.drawChart($("chartCanvas"));
    },

    renderStats() {
      const st = Lexicon.state();
      const counts = Lexicon.cardCounts();
      const total = Lexicon.size();
      const learned = counts.new + counts.learning + counts.mature;

      const exam = new Date(st.settings.examDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysLeft = Math.max(0, Math.ceil((exam - today) / DAY));
      $("stExam").textContent = daysLeft + "D";
      $("stExamDate").textContent = "TARGET " + st.settings.examDate;

      let newToday = 0;
      const now = Date.now();
      const cards = Lexicon.cards();
      for (const k in cards) {
        const c = cards[k];
        if (c.added && now - c.added < DAY) newToday++;
      }
      const goal = st.settings.goal;
      const todayKey = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
      const hist = (st.stats.history || {})[todayKey] || { n: 0, r: 0 };
      const todayTotal = (hist.n || 0) + (hist.r || 0);

      if (this.stView === "today") {
        // ---- TODAY view: focus on the daily mission ----
        $("stLblExam").textContent = "MISSION ETA";
        $("stLblToday").textContent = "NEW WORDS TODAY";
        $("stLblDue").textContent = "REVIEWS TODAY";
        $("stLblStreak").textContent = "TOTAL ACTIVITY";
        $("stLblCover").textContent = "DAILY GOAL";
        $("stToday").textContent = newToday + "/" + goal;
        $("stTodayPct").textContent = Math.min(100, Math.round((newToday / goal) * 100)) + "%";
        $("stDue").textContent = hist.r || 0;
        $("stDueSub").textContent = "REVIEWS DONE";
        $("stStreak").textContent = todayTotal;
        $("stStreakSub").textContent = "CARDS TODAY";
        const goalPct = Math.min(100, Math.round((newToday / goal) * 100));
        $("stCoverage").textContent = newToday >= goal ? "GOAL MET ✓" : goalPct + "%";
        $("stCoverageFill").style.width = goalPct + "%";
      } else {
        // ---- ALL TIME view ----
        $("stLblExam").textContent = "MISSION ETA";
        $("stLblToday").textContent = "TODAY PROGRESS";
        $("stLblDue").textContent = "REVIEWS DUE";
        $("stLblStreak").textContent = "STREAK";
        $("stLblCover").textContent = "VOCAB COVERAGE";
        $("stToday").textContent = newToday + "/" + goal;
        $("stTodayPct").textContent = Math.min(100, Math.round((newToday / goal) * 100)) + "%";
        $("stDue").textContent = counts.due;
        $("stDueSub").textContent = counts.due ? "QUEUED FOR REVIEW" : "ALL CLEAR";
        $("stStreak").textContent = st.stats.streak;
        $("stStreakSub").textContent = "CONSECUTIVE DAYS";
        const pct = total ? Math.round((learned / total) * 1000) / 10 : 0;
        $("stCoverage").textContent = pct + "%";
        $("stCoverageFill").style.width = Math.min(100, pct) + "%";
      }

      // vocab tab badge
      const tab = document.querySelector('.tab[data-view="vocab"]');
      const hot = Object.keys(Lexicon.unfamiliarList()).length;
      tab.textContent = hot > 0 ? "VOCABULARY (" + hot + ")" : "VOCABULARY";
    },

    renderStages() {
      const cards = Lexicon.cards();
      const stageCount = { new: 0, learning: 0, consolidating: 0, mastered: 0 };
      for (const k in cards) {
        const s = SRS.stage(cards[k]);
        stageCount[s]++;
      }
      const total = Object.keys(cards).length;
      $("stDeckTag").textContent = total + " WORDS";
      const colors = { new: "#35c8e8", learning: "#ffb733", consolidating: "#1d8f5c", mastered: "#33ff99" };
      const labels = { new: "NEW", learning: "LEARNING", consolidating: "CONSOLIDATING", mastered: "MASTERED" };
      $("stStageBars").innerHTML = Object.keys(labels).map((s) => {
        const n = stageCount[s];
        const w = total ? (n / total) * 100 : 0;
        return '<div class="stage-row"><span class="stage-label">' + labels[s] + "</span>" +
          '<div class="statbar"><div class="statbar-fill" style="width:' + w + "%;background:" + colors[s] + '"></div></div>' +
          '<span class="stage-count">' + n + "</span></div>";
      }).join("");
    },

    renderModStats() {
      const p = Suite.progress();
      const rows = [
        ["LISTENING · QUICK", Object.keys(p.listening.sets).length, (global.LISTENING_SETS || []).length],
        ["LISTENING · FULL", Object.keys(p.listeningFull.sets).length, (global.LISTENING_FULL || []).length],
        ["READING", Object.keys(p.reading.tests).length, (global.READING_TESTS || []).length],
        ["WRITING", Object.keys(p.writing.tasks).length, (global.WRITING_TASKS || []).length]
      ];
      $("stModStats").innerHTML = rows.map((r) =>
        '<div class="mod-stat"><span>' + r[0] + '</span><div class="statbar"><div class="statbar-fill" style="width:' +
        (r[2] ? (r[1] / r[2]) * 100 : 0) + '%"></div></div><span>' + r[1] + " / " + r[2] + "</span></div>"
      ).join("");
    },

    /* ================= session / daily mix ================= */
    buildQueue(reviewOnly) {
      const st = Lexicon.state();
      const queue = [];
      // 1) due reviews — hot zone (flagged) first, then by due time
      const due = Lexicon.dueCards();
      due.sort((a, b) => {
        const au = Lexicon.isUnfamiliar(a.key) ? 0 : 1;
        const bu = Lexicon.isUnfamiliar(b.key) ? 0 : 1;
        return (au - bu) || (a.card.due - b.card.due);
      });
      due.forEach((d) => queue.push({ key: d.key, ent: Lexicon.get(d.key), card: d.card, isNew: false, hot: Lexicon.isUnfamiliar(d.key) }));
      if (reviewOnly) return queue;
      // 2) flagged words never studied yet — priority new items
      const fresh = Lexicon.unfamiliarFresh();
      fresh.forEach((n) => queue.push({ key: n.key, ent: n.ent, card: null, isNew: true, hot: true }));
      // 3) regular new words up to the daily target (minus reserved slots),
      //    shuffled so the study order is not alphabetical
      const newWords = Lexicon.newCandidates(st.settings.goal, 0, fresh.length);
      for (let i = newWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = newWords[i];
        newWords[i] = newWords[j];
        newWords[j] = tmp;
      }
      newWords.forEach((n) => queue.push({ key: n.key, ent: n.ent, card: Lexicon.getCard(n.key), isNew: true, hot: false }));
      return queue;
    },

    startSession(reviewOnly) {
      const queue = this.buildQueue(reviewOnly);
      const groups = this.groupQueue(queue);
      this.session = {
        queue, groups, gi: 0, wi: 0, phase: "meaning",
        scores: {}, newDone: 0, revDone: 0, failed: 0,
        startedAt: new Date().toISOString()
      };
      this.vsub = "train";
      this.switchView("vocab");
      this.showSub();
      if (groups.length === 0) {
        this.renderIdleConsole("NO WAYPOINTS QUEUED — TARGET REACHED. RETURN TO STATISTICS.");
      } else {
        this.renderCard();
      }
    },

    renderIdleConsole(msg) {
      $("mcMode").textContent = "STANDBY";
      $("mcMeta").textContent = "WAYPOINTS: 0 / 0";
      $("mcProgress").style.width = "0%";
      $("cardStage").innerHTML =
        '<div class="card"><div class="card-word" style="font-size:20px">' +
        (msg || "NO ACTIVE MISSION") +
        '</div><div class="card-sub" style="color:var(--fg-dim);font-size:12px">' +
        'PRESS "START DAILY MIX" TO BEGIN</div></div>';
      $("sessionDone").hidden = true;
      $("trainActions").style.display = "";
    },

    /* ---- group-based learning flow ----
     * Words are grouped (different first letters per group) and each
     * word runs: LISTEN & MEANING -> SPELL (letter-by-letter hints
     * until written) -> GAP-FILL in real sentences. The word's
     * overall success rate decides which memory-curve stage it
     * enters (no manual self-grading). */
    groupQueue(queue, size = 4) {
      const groups = [];
      const q = queue.slice();
      while (q.length) {
        const g = [];
        const used = new Set();
        for (let i = 0; i < q.length && g.length < size; i++) {
          const it = q[i];
          const f = String(it.key)[0];
          if (!used.has(f)) { used.add(f); g.push(it); q.splice(i, 1); i--; }
        }
        if (g.length < size && q.length) g.push(q.shift());
        groups.push(g);
      }
      return groups;
    },

    curWord() {
      const s = this.session;
      return s.groups[s.gi][s.wi];
    },

    renderCard() {
      const s = this.session;
      if (!s) return;
      $("trainActions").style.display = "none";
      $("sessionDone").hidden = true;
      this.renderPhase();
    },

    renderPhase() {
      const s = this.session;
      const item = this.curWord();
      const totalWords = s.groups.reduce((n, g) => n + g.length, 0);
      const pos = s.groups.slice(0, s.gi).reduce((n, g) => n + g.length, 0) + s.wi + 1;
      $("mcMode").textContent = (item.hot ? "HOT ZONE: " : "") + (item.isNew ? "NEW WORD" : "REVIEW");
      $("mcMeta").textContent = "GROUP " + (s.gi + 1) + "/" + s.groups.length +
        " · WORD " + pos + "/" + totalWords + (item.hot ? " · 🔥 FLAGGED" : "");
      $("mcProgress").style.width = ((pos - 1) / totalWords) * 100 + "%";
      if (s.phase === "meaning") this.renderMeaning(item);
      else if (s.phase === "spell") this.renderSpell(item);
      else if (s.phase === "gap") this.renderGap(item);
      else if (s.phase === "result") this.renderGroupResult();
    },

    /* ---- phase 1: listen + meaning (word hidden) ---- */
    renderMeaning(item) {
      const s = this.session;
      const ent = item.ent;
      const senses = Lexicon.senses(item.key);
      const st = Lexicon.state().settings;
      const mainDef = (senses[0] && senses[0].text) || ent.d || ent.t || "";
      const zhDef = st.showTrans && ent.t ? ent.t : "";
      const sents = Lexicon.exampleSentences(item.key, 2);
      const groupLen = s.groups[s.gi].length;

      $("cardStage").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">GROUP ' + (s.gi + 1) + "/" + s.groups.length +
        " · WORD " + (s.wi + 1) + "/" + groupLen + (item.hot ? ' <span class="hot-dot">🔥</span>' : "") + "</span>" +
        '<span class="card-status learn">LISTEN & MEANING</span>' +
        '<div class="sense-label">HEAR THE WORD — MEANING BELOW (WORD HIDDEN)</div>' +
        '<div class="card-def big">' + this.esc(mainDef) + "</div>" +
        (zhDef ? '<div class="card-def zh">' + this.esc(zhDef) + "</div>" : "") +
        (sents.length ? '<div class="card-example">“' + this.esc(this.blankWord(sents[0], ent.w)) + '”</div>' : "") +
        '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ PLAY WORD AUDIO</button></div>' +
        '<div class="step-bar"><button class="btn btn-primary" id="btnPhaseNext">CONTINUE TO SPELL ▸</button></div>' +
        '<div class="card-index">AUDIO PLAYS AUTOMATICALLY — LISTEN AND REMEMBER</div>' +
        "</div>";
      $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
      $("btnPhaseNext").addEventListener("click", () => {
        s.phase = "spell";
        this.renderPhase();
      });
      setTimeout(() => this.speak(ent.w), 350);
    },

    /* ---- phase 2: spell with letter-by-letter hints ---- */
    _hint: 0,

    renderSpell(item) {
      const s = this.session;
      const ent = item.ent;
      const groupLen = s.groups[s.gi].length;
      this._hint = 0;
      $("cardStage").innerHTML =
        '<div class="card sense-card typing-card">' +
        '<span class="card-wp">GROUP ' + (s.gi + 1) + "/" + s.groups.length +
        " · WORD " + (s.wi + 1) + "/" + groupLen + "</span>" +
        '<span class="card-status learn">SPELL</span>' +
        '<div class="sense-label">TYPE THE WORD — FROM AUDIO & MEANING</div>' +
        '<div class="typing-row"><span class="typing-prompt">TYPE &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="TYPE THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        '<div class="spell-hint" id="spellHint"></div>' +
        '<div class="card-index">ENTER CHECK · SPACE RE-HEAR · WRONG SPELLING REVEALS LETTERS</div>' +
        "</div>";
      const input = $("typingInput");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.checkSpell();
        else if (e.key === " ") { e.preventDefault(); this.speak(ent.w); }
      });
    },

    checkSpell() {
      const s = this.session;
      const item = this.curWord();
      const target = item.ent.w.toLowerCase();
      const input = $("typingInput");
      const fb = $("typingFeedback");
      const hint = $("spellHint");
      const ans = (input.value || "").trim().toLowerCase();

      if (ans === target) {
        const withHints = this._hint > 0;
        s.scores[item.key] = { spell: withHints ? 0.5 : 1, gapOk: 0, gapTotal: 0 };
        fb.className = "typing-feedback ok";
        fb.textContent = "✓ CORRECT" + (withHints ? " (WITH " + this._hint + " LETTER HINT" + (this._hint > 1 ? "S" : "") + ")" : " — NO HINTS");
        hint.textContent = "";
        input.readOnly = true;
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this.advanceToGap();
        });
        return;
      }
      // wrong: reveal one more letter
      this._hint++;
      const shown = target.slice(0, this._hint);
      const rest = "_".repeat(Math.max(0, target.length - this._hint));
      fb.className = "typing-feedback err";
      fb.textContent = "✗ NOT QUITE — HINT " + this._hint + " OF " + target.length + ":";
      hint.textContent = shown + rest;
      input.value = "";
      input.focus();
    },

    advanceToGap() {
      const s = this.session;
      if (!s || s.phase !== "spell") return;
      const item = this.curWord();
      const sents = Lexicon.exampleSentences(item.key, 2);
      if (!sents.length) {
        // no real sentences: skip gap-fill
        this.finishWord();
        return;
      }
      this._gaps = sents;
      this._gapIdx = 0;
      s.phase = "gap";
      this.renderPhase();
    },

    /* ---- phase 3: gap-fill in real sentences ---- */
    _gaps: [],
    _gapIdx: 0,

    renderGap(item) {
      const s = this.session;
      const ent = item.ent;
      const groupLen = s.groups[s.gi].length;
      const sentence = this._gaps[this._gapIdx];
      const blanked = this.blankWord(sentence, ent.w);

      $("cardStage").innerHTML =
        '<div class="card sense-card typing-card">' +
        '<span class="card-wp">GROUP ' + (s.gi + 1) + "/" + s.groups.length +
        " · WORD " + (s.wi + 1) + "/" + groupLen + "</span>" +
        '<span class="card-status learn">GAP-FILL</span>' +
        '<div class="sense-label">SECOND PASS — FILL THE GAP (' + (this._gapIdx + 1) + "/" + this._gaps.length + ")</div>" +
        '<div class="card-example big">“' + this.esc(blanked) + '”</div>' +
        '<div class="typing-row"><span class="typing-prompt">TYPE &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="FILL THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        '<div class="card-index">ENTER CHECK · SPACE RE-HEAR</div>' +
        "</div>";
      const input = $("typingInput");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.checkGap();
        else if (e.key === " ") { e.preventDefault(); this.speak(ent.w); }
      });
      setTimeout(() => this.speak(ent.w), 300);
    },

    checkGap() {
      const s = this.session;
      const item = this.curWord();
      const input = $("typingInput");
      const fb = $("typingFeedback");
      const sentence = this._gaps[this._gapIdx];
      // compare against any word in the sentence matching the target stem
      const re = new RegExp("\\b" + Lexicon.stem(item.ent.w.toLowerCase()) + "[a-z]*\\b", "i");
      const expected = (sentence.match(re) || [item.ent.w])[0];
      const ans = (input.value || "").trim().toLowerCase();
      // accept the base word or any inflection (storm ~ stormwater)
      const ok = this.norm(ans) === this.norm(expected) ||
        Lexicon.stem(this.norm(ans)) === Lexicon.stem(this.norm(expected));
      const sc = s.scores[item.key];
      sc.gapTotal++;
      if (ok) sc.gapOk++;
      fb.className = "typing-feedback " + (ok ? "ok" : "err");
      fb.textContent = ok ? "✓ FILLED CORRECTLY" : "✗ " + expected;
      input.readOnly = true;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.gapNext();
      });
    },

    gapNext() {
      const s = this.session;
      if (!s || s.phase !== "gap") return;
      const item = this.curWord();
      this._gapIdx++;
      if (this._gapIdx >= this._gaps.length) this.finishWord();
      else this.renderGap(item);
    },

    blankWord(sentence, word) {
      const re = new RegExp("\\b" + Lexicon.stem(word.toLowerCase()) + "[a-z]*\\b", "gi");
      return String(sentence).replace(re, "______");
    },

    finishWord() {
      const s = this.session;
      const item = this.curWord();
      const sc = s.scores[item.key] || { spell: 0, gapOk: 0, gapTotal: 0 };
      const total = 1 + (sc.gapTotal || 0);
      const got = (sc.spell || 0) + (sc.gapOk || 0);
      const rate = got / total;
      const q = rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : rate >= 0.5 ? 1 : 0;
      this.applyGrade(item, q);
      s.wi++;
      if (s.wi >= s.groups[s.gi].length) {
        s.phase = "result";
        this.renderPhase();
      } else {
        s.phase = "meaning";
        this.renderPhase();
      }
    },

    renderGroupResult() {
      const s = this.session;
      const group = s.groups[s.gi];
      let rows = "";
      let sum = 0;
      for (const item of group) {
        const sc = s.scores[item.key] || { spell: 0, gapOk: 0, gapTotal: 0 };
        const total = 1 + (sc.gapTotal || 0);
        const rate = (sc.spell || 0) + (sc.gapOk || 0);
        const pct = Math.round((rate / total) * 100);
        sum += pct;
        const label = pct >= 90 ? "EASY" : pct >= 70 ? "GOOD" : pct >= 50 ? "HARD" : "AGAIN";
        const cls = pct >= 70 ? "ok" : pct >= 50 ? "warn" : "err";
        rows += '<div class="gr-row"><span class="gr-word">' + this.esc(item.ent.w) + "</span>" +
          '<div class="statbar"><div class="statbar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="gr-rate ' + cls + '">' + pct + "% · " + label + "</span></div>";
      }
      const groupPct = Math.round(sum / group.length);
      $("mcMode").textContent = "GROUP COMPLETE";
      $("mcMeta").textContent = "GROUP " + (s.gi + 1) + "/" + s.groups.length +
        " · SUCCESS " + groupPct + "%";
      $("cardStage").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">GROUP ' + (s.gi + 1) + "/" + s.groups.length + "</span>" +
        '<span class="card-status ' + (groupPct >= 70 ? "mature" : groupPct >= 50 ? "learn" : "new") + '">' +
        (groupPct >= 90 ? "EXCELLENT" : groupPct >= 70 ? "GOOD" : groupPct >= 50 ? "REVIEW NEEDED" : "WEAK") + "</span>" +
        '<div class="sense-label">GROUP SUCCESS RATE — WORDS PLACED ON THE MEMORY CURVE</div>' +
        '<div class="gr-list">' + rows + "</div>" +
        '<div class="step-bar"><button class="btn btn-primary" id="btnNextGroup">' +
        (s.gi + 1 < s.groups.length ? "NEXT GROUP ▸" : "FINISH SESSION ▸") + "</button></div>" +
        "</div>";
      $("btnNextGroup").addEventListener("click", () => {
        s.gi++;
        s.wi = 0;
        if (s.gi >= s.groups.length) { this.endSession(); return; }
        s.phase = "meaning";
        this.renderPhase();
      });
    },

    /* auto-grading: SRS update + counters (no requeue — failed words
     * come back through the normal due schedule) */
    applyGrade(item, q) {
      const s = this.session;
      let card = Lexicon.getCard(item.key);
      if (!card) {
        card = SRS.fresh();
        card.added = Date.now();
      }
      const updated = SRS.review(card, q);
      if (updated.weak >= 2 && !Lexicon.isUnfamiliar(item.key)) {
        Lexicon.addUnfamiliar(item.key, "weak");
      }
      Lexicon.setCard(item.key, updated);
      if (q === 0) s.failed++;
      else if (item.isNew) s.newDone++;
      else s.revDone++;
    },

    endSession() {
      const s = this.session;
      Lexicon.logStudy(s.newDone, s.revDone);
      WordAnnotate.refresh();
      $("mcProgress").style.width = "100%";
      $("mcMode").textContent = "MISSION COMPLETE";
      $("mcMeta").textContent = "NEW " + s.newDone + " · REVIEW " + s.revDone + " · RETRY " + s.failed;
      $("doneTitle").textContent = "MISSION COMPLETE";
      $("doneSub").textContent =
        "NEW WAYPOINTS: " + s.newDone + " · REVIEWS: " + s.revDone + " · RETRIES: " + s.failed;
      $("sessionDone").hidden = false;
      $("cardStage").innerHTML = "";
      $("trainActions").style.display = "none";
      this.session = null;
      this.renderAll();
    },

    /* ================= TTS ================= */
    speak(word) {
      const st = Lexicon.state().settings;
      if (!st.voice) return;
      try {
        global.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(word);
        u.lang = "en-US";
        u.rate = st.rate || 0.9;
        const voices = global.speechSynthesis.getVoices();
        const v = voices.find((x) => x.lang === "en-US" && /google|natural|samantha|aria/i.test(x.name)) ||
                  voices.find((x) => x.lang === "en-US") || null;
        if (v) u.voice = v;
        global.speechSynthesis.speak(u);
      } catch (e) { /* TTS unavailable */ }
    },

    /* ================= memory deck ================= */
    _deckFilter: "all",
    _deckPage: 0,

    renderDeck() {
      const cards = Lexicon.cards();
      const unf = Lexicon.unfamiliarList();
      const now = Date.now();
      const rows = [];
      for (const key in cards) {
        const card = cards[key];
        const stage = SRS.stage(card);
        if (this._deckFilter !== "all") {
          if (this._deckFilter === "hot" && !unf[key]) continue;
          if (this._deckFilter !== "hot" && stage !== this._deckFilter) continue;
        }
        const ent = Lexicon.get(key) || { w: key, t: "" };
        rows.push({ key, ent, card, stage, hot: !!unf[key], src: unf[key] ? unf[key].src : null });
      }
      // hot zone first, then by stage / due
      rows.sort((a, b) => {
        if (a.hot !== b.hot) return a.hot ? -1 : 1;
        return (a.card.due || 0) - (b.card.due || 0);
      });

      $("dkCount").textContent = rows.length + " WORDS";
      const stageCount = { learning: 0, consolidating: 0, mastered: 0 };
      for (const r of rows) stageCount[r.stage]++;
      $("dkSummary").innerHTML =
        "<span>HOT ZONE <b>" + Object.keys(unf).length + "</b></span>" +
        "<span>LEARNING <b>" + stageCount.learning + "</b></span>" +
        "<span>CONSOLIDATING <b>" + stageCount.consolidating + "</b></span>" +
        "<span>MASTERED <b>" + stageCount.mastered + "</b></span>";

      const PER = 100;
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      if (this._deckPage >= pages) this._deckPage = pages - 1;
      const slice = rows.slice(this._deckPage * PER, (this._deckPage + 1) * PER);
      const dueLabel = (card) => {
        if (!card.due) return "NEW";
        const d = card.due - now;
        if (d <= 0) return "DUE NOW";
        const h = Math.round(d / 3600000);
        if (h < 48) return "IN " + h + "H";
        return "IN " + Math.round(d / DAY) + "D";
      };

      $("dkList").innerHTML = slice.map((r) =>
        '<div class="dk-row">' +
        '<span class="dk-word">' + this.esc(r.ent.w) +
        (r.hot ? ' <span class="hot-badge" title="src: ' + this.esc(r.src || "") + '">🔥</span>' : "") + "</span>" +
        '<span class="dk-def">' + this.esc(r.ent.t || r.ent.d || "") + "</span>" +
        '<span class="dk-stage ' + r.stage + '">' + r.stage.toUpperCase() + "</span>" +
        '<span class="dk-due">' + dueLabel(r.card) + "</span>" +
        '<span class="dk-actions">' +
        '<button class="btn dk-btn" data-review="' + this.esc(r.key) + '">REVIEW</button>' +
        (r.hot
          ? '<button class="btn dk-btn" data-unflag="' + this.esc(r.key) + '">UNFLAG</button>'
          : '<button class="btn dk-btn" data-flag="' + this.esc(r.key) + '">FLAG</button>') +
        "</span>" +
        "</div>").join("") || '<div class="log-row"><span class="log-word">NO WORDS IN THIS FILTER</span></div>';

      $("dkPager").innerHTML =
        '<button class="btn" id="dkPrev">◂ PREV</button>' +
        "<span>PAGE " + (this._deckPage + 1) + " / " + pages + "</span>" +
        '<button class="btn" id="dkNext">NEXT ▸</button>';
      $("dkPrev").addEventListener("click", () => { if (this._deckPage > 0) { this._deckPage--; this.renderDeck(); } });
      $("dkNext").addEventListener("click", () => { if (this._deckPage < pages - 1) { this._deckPage++; this.renderDeck(); } });
      $("dkList").querySelectorAll("[data-review]").forEach((b) =>
        b.addEventListener("click", () => this.forceReview(b.dataset.review)));
      $("dkList").querySelectorAll("[data-flag]").forEach((b) =>
        b.addEventListener("click", () => { Lexicon.addUnfamiliar(b.dataset.flag, "manual"); WordAnnotate.refresh(); this.renderDeck(); this.renderAll(); }));
      $("dkList").querySelectorAll("[data-unflag]").forEach((b) =>
        b.addEventListener("click", () => { Lexicon.removeUnfamiliar(b.dataset.unflag); WordAnnotate.refresh(); this.renderDeck(); this.renderAll(); }));
    },

    /* force a single word into an immediate review session */
    forceReview(key) {
      const ent = Lexicon.get(key);
      if (!ent) return;
      const card = Lexicon.getCard(key) || SRS.fresh();
      const due = Lexicon.dueCards().filter((d) => d.key !== key);
      const queue = due.map((d) => ({ key: d.key, ent: Lexicon.get(d.key), card: d.card, isNew: false, hot: Lexicon.isUnfamiliar(d.key) }));
      queue.unshift({ key, ent, card, isNew: false, hot: Lexicon.isUnfamiliar(key) });
      const groups = this.groupQueue(queue);
      this.session = {
        queue, groups, gi: 0, wi: 0, phase: "meaning",
        scores: {}, newDone: 0, revDone: 0, failed: 0
      };
      this.vsub = "train";
      this.switchView("vocab");
      this.showSub();
      this.renderCard();
    },

    /* ================= lexicon library ================= */
    _logPage: 0,
    _logRows: [],
    _logSearch: "",

    renderLog() {
      const cards = Lexicon.cards();
      const now = Date.now();
      const q = this._logSearch.toLowerCase();
      const rows = [];
      Lexicon.load().forEach((ent, key) => {
        if (q) {
          if (!ent.w.toLowerCase().includes(q) && !ent.t.toLowerCase().includes(q)) return;
        }
        const card = cards[key];
        let state = "NEW", cls = "new";
        if (card) {
          const stage = SRS.stage(card);
          if (stage === "mastered") { state = "MASTERED"; cls = "mature"; }
          else if (stage === "consolidating") { state = "CONSOLIDATING"; cls = "learn"; }
          else if (stage === "learning") { state = "LEARNING"; cls = "learn"; }
          if (card.due > 0 && card.due <= now) { state = "DUE"; cls = "due"; }
        }
        rows.push({ key, ent, state, cls });
      });
      this._logRows = rows;

      const total = Lexicon.size();
      const counts = Lexicon.cardCounts();
      $("lgCount").textContent = total.toLocaleString() + " ENTRIES";
      $("lgSummary").innerHTML =
        "<span>DECK <b>" + total.toLocaleString() + "</b></span>" +
        "<span>LEARNING <b>" + counts.learning + "</b></span>" +
        "<span>MATURE <b>" + counts.mature + "</b></span>" +
        "<span>DUE <b>" + counts.due + "</b></span>";

      const PER = 100;
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      if (this._logPage >= pages) this._logPage = pages - 1;
      const page = this._logPage;
      const slice = rows.slice(page * PER, (page + 1) * PER);

      $("lgList").innerHTML = slice.map((r) =>
        '<div class="log-row">' +
        '<span class="log-word">' + this.esc(r.ent.w) + "</span>" +
        '<span class="log-trans">' + this.esc(r.ent.t) + "</span>" +
        '<span class="log-state"><span class="' + r.cls + '">' + r.state + "</span></span>" +
        "</div>").join("") || '<div class="log-row"><span class="log-word">NO MATCHES</span></div>';

      $("lgPager").innerHTML =
        '<button class="btn" id="pgPrev">◂ PREV</button>' +
        "<span>PAGE " + (page + 1) + " / " + pages + " · " + rows.length.toLocaleString() + " MATCHES</span>" +
        '<button class="btn" id="pgNext">NEXT ▸</button>';
      $("pgPrev").addEventListener("click", () => { if (this._logPage > 0) { this._logPage--; this.renderLog(); } });
      $("pgNext").addEventListener("click", () => { if (this._logPage < pages - 1) { this._logPage++; this.renderLog(); } });
    },

    doImport(file) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        try {
          let n = 0;
          try {
            n = Lexicon.importBackup(text);
          } catch (e) {
            n = Lexicon.importWords(text);
          }
          WordAnnotate.refresh();
          this.renderLog();
          this.renderAll();
          global.alert("IMPORTED — RECORDS: " + n);
        } catch (e) {
          global.alert("IMPORT FAILED: " + e.message);
        }
      };
      reader.readAsText(file);
    },

    doExport() {
      const blob = new Blob([Lexicon.exportBackup()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "slam-nav-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    },

    /* ================= settings ================= */
    bindSettings() {
      $("btnSettings").addEventListener("click", () => {
        const s = Lexicon.state().settings;
        $("cfgGoal").value = s.goal;
        $("cfgExam").value = s.examDate;
        $("cfgTrans").checked = s.showTrans;
        $("cfgVoice").checked = s.voice;
        $("cfgRate").value = s.rate;
        $("settingsModal").hidden = false;
      });
      $("btnCfgSave").addEventListener("click", () => {
        const s = Lexicon.state().settings;
        s.goal = Math.max(1, Math.min(500, parseInt($("cfgGoal").value, 10) || 25));
        s.examDate = $("cfgExam").value || "2026-11-15";
        s.showTrans = $("cfgTrans").checked;
        s.voice = $("cfgVoice").checked;
        s.rate = parseFloat($("cfgRate").value) || 0.9;
        Lexicon.saveState();
        $("settingsModal").hidden = true;
        this.renderAll();
      });
      $("btnCfgCancel").addEventListener("click", () => { $("settingsModal").hidden = true; });
      $("btnCfgReset").addEventListener("click", () => {
        if (global.confirm("RESET ALL PROGRESS AND SETTINGS? THIS CANNOT BE UNDONE.")) {
          Lexicon.resetAll();
          $("settingsModal").hidden = true;
          global.location.reload();
        }
      });
    },

    applySettings() {
      const s = Lexicon.state().settings;
      if (s.plain) document.body.classList.add("plain");
    },

    togglePlain() {
      document.body.classList.toggle("plain");
      Lexicon.state().settings.plain = document.body.classList.contains("plain");
      Lexicon.saveState();
    },

    /* ================= actions & keys ================= */
    bindActions() {
      $("btnStart").addEventListener("click", () => this.startSession(false));
      $("btnReview").addEventListener("click", () => this.startSession(true));
      $("btnDoneReturn").addEventListener("click", () => this.switchView("stats"));
      document.querySelectorAll("#dkFilter .deck-f").forEach((b) =>
        b.addEventListener("click", () => {
          this._deckFilter = b.dataset.f;
          this._deckPage = 0;
          document.querySelectorAll("#dkFilter .deck-f").forEach((x) => x.classList.toggle("active", x === b));
          this.renderDeck();
        }));
      document.querySelectorAll("#stToggle .view-t").forEach((b) =>
        b.addEventListener("click", () => {
          this.stView = b.dataset.v;
          document.querySelectorAll("#stToggle .view-t").forEach((x) => x.classList.toggle("active", x === b));
          this.renderAll();
        }));

      $("lgSearch").addEventListener("input", (e) => {
        this._logSearch = e.target.value;
        this._logPage = 0;
        this.renderLog();
      });
      $("btnImport").addEventListener("click", () => $("fileImport").click());
      $("fileImport").addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) this.doImport(e.target.files[0]);
        e.target.value = "";
      });
      $("btnExport").addEventListener("click", () => this.doExport());
    },

    bindKeyboard() {
      document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "M" || e.key === "m")) {
          e.preventDefault();
          this.togglePlain();
          return;
        }
        // typing in an editable field must not trigger shortcuts — but a
        // read-only input still lets SPACE replay audio and ENTER advance
        // the phase (fallback when the input loses focus)
        if (e.target && /input|textarea/i.test(e.target.tagName)) {
          if (!((e.key === " " || e.key === "Enter") && e.target.readOnly)) return;
        }
        if (this.session && this.view === "vocab" && this.vsub === "train") {
          const k = e.key;
          if (k === "Enter") {
            e.preventDefault();
            if (this.session.phase === "spell") this.advanceToGap();
            else if (this.session.phase === "gap") this.gapNext();
          } else if (k === " ") {
            e.preventDefault();
            const item = this.curWord();
            if (item) this.speak(item.ent.w);
          }
        }
      });
    },

    /* ================= clock ================= */
    startClock() {
      const tick = () => {
        const d = new Date();
        $("sbClock").textContent = d.toTimeString().slice(0, 8);
      };
      tick();
      setInterval(tick, 1000);
    },

    /* ================= utils ================= */
    norm(s) {
      return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    },
    esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[c]);
    },
    escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  };

  document.addEventListener("DOMContentLoaded", () => App.init());
  global.App = App;
})(window);
