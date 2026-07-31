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
      $("stToday").textContent = newToday + "/" + goal;
      $("stTodayPct").textContent = Math.min(100, Math.round((newToday / goal) * 100)) + "%";

      $("stDue").textContent = counts.due;
      $("stDueSub").textContent = counts.due ? "QUEUED FOR REVIEW" : "ALL CLEAR";
      $("stStreak").textContent = st.stats.streak;

      const pct = total ? Math.round((learned / total) * 1000) / 10 : 0;
      $("stCoverage").textContent = pct + "%";
      $("stCoverageFill").style.width = Math.min(100, pct) + "%";

      // vocab tab badge
      const tab = document.querySelector('.tab[data-view="vocab"]');
      const deck = Lexicon.unfamiliarList();
      const hot = Object.keys(deck).length;
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
      // 3) regular new words up to the daily target (minus reserved slots)
      const newWords = Lexicon.newCandidates(st.settings.goal, 0, fresh.length);
      newWords.forEach((n) => queue.push({ key: n.key, ent: n.ent, card: Lexicon.getCard(n.key), isNew: true, hot: false }));
      return queue;
    },

    startSession(reviewOnly) {
      const queue = this.buildQueue(reviewOnly);
      this.session = { queue, idx: 0, newDone: 0, revDone: 0, failed: 0, startedAt: new Date().toISOString() };
      this.vsub = "train";
      this.switchView("vocab");
      this.showSub();
      if (queue.length === 0) {
        this.renderIdleConsole("NO WAYPOINTS QUEUED — TARGET REACHED. RETURN TO STATISTICS.");
      } else {
        this.renderCard();
      }
    },

    renderIdleConsole(msg) {
      $("mcMode").textContent = "STANDBY";
      $("mcMeta").textContent = "WAYPOINTS: 0 / 0";
      $("mcProgress").style.width = "0%";
      $("gradeBar").hidden = true;
      $("senseGrade").hidden = true;
      $("cardStage").innerHTML =
        '<div class="card"><div class="card-word" style="font-size:20px">' +
        (msg || "NO ACTIVE MISSION") +
        '</div><div class="card-sub" style="color:var(--fg-dim);font-size:12px">' +
        'PRESS "START DAILY MIX" TO BEGIN</div></div>';
      $("sessionDone").hidden = true;
      $("trainActions").style.display = "";
    },

    /* ---- card rendering by mode ---- */
    renderCard() {
      const s = this.session;
      if (!s) return;
      const item = s.queue[s.idx];
      const mode = Lexicon.state().settings.mode || "sense";
      $("trainActions").style.display = "none";
      $("sessionDone").hidden = true;
      if (mode === "typing") { this.renderTypingCard(item); return; }
      if (mode === "card") { this.renderClassicCard(item); return; }
      this.renderSenseCard(item);
    },

    _meta(item, s) {
      const total = s.queue.length;
      const pos = s.idx + 1;
      $("mcMode").textContent = (item.hot ? "HOT ZONE: " : "") + (item.isNew ? "NEW WAYPOINT" : "REVIEW");
      $("mcMeta").textContent = "WAYPOINTS: " + pos + " / " + total +
        " · NEW " + s.newDone + " · REV " + s.revDone + (item.hot ? " · 🔥 FLAGGED" : "");
      $("mcProgress").style.width = ((pos - 1) / total) * 100 + "%";
    },

    /* ---- SENSE mode: understand -> recall -> spell ---- */
    renderSenseCard(item) {
      const s = this.session;
      const st = Lexicon.state().settings;
      const ent = item.ent;
      const senses = Lexicon.senses(item.key);
      const card = Lexicon.getCard(item.key) || SRS.fresh();
      const statusCls = card.lvl === 2 ? "mature" : card.lvl === 1 ? "learn" : "new";
      const statusTxt = card.lvl === 2 ? "MASTERED" : card.lvl === 1 ? "LEARNING" : "NEW";
      this._sense = { item, step: 0, revealed: false };
      this._meta(item, s);
      $("gradeBar").hidden = true;
      $("senseGrade").hidden = true;

      const phonetic = ent.uk ? ("UK " + ent.uk + "  US " + (ent.us || "—")) : (ent.us ? "US " + ent.us : "");
      const total = s.queue.length;
      const pos = s.idx + 1;

      // step 0: understand — word + all senses
      const senseList = senses.map((sn, i) =>
        '<div class="sense-item">' +
        (sn.pos ? '<span class="sense-pos">' + this.esc(sn.pos) + "</span>" : "") +
        '<span class="sense-text">' + this.esc(sn.text) + "</span>" +
        (sn.ex ? '<div class="sense-ex">“' + this.esc(sn.ex) + '”</div>' : "") +
        "</div>").join("");

      $("cardStage").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + (item.hot ? ' <span class="hot-dot">🔥</span>' : "") + "</span>" +
        '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
        '<div class="card-word">' + this.esc(ent.w) + "</div>" +
        (phonetic ? '<div class="card-phonetic">' + this.esc(phonetic) + "</div>" : "") +
        '<div class="sense-list">' + senseList + "</div>" +
        (st.showTrans && ent.t && !ent.d ? '<div class="card-def zh">' + this.esc(ent.t) + "</div>" : "") +
        '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ SPEAK</button></div>' +
        '<div class="card-index">STEP 1/3 · UNDERSTAND · ' + pos + " / " + total + "</div>" +
        '<div class="step-bar"><button class="btn btn-primary" id="btnSenseNext">CONTINUE ▸</button></div>' +
        "</div>";

      $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
      $("btnSenseNext").addEventListener("click", () => this.senseNext());
    },

    senseNext() {
      const t = this._sense;
      if (!t) return;
      const ent = t.item.ent;
      const st = Lexicon.state().settings;
      const card = Lexicon.getCard(t.item.key) || SRS.fresh();
      const statusCls = card.lvl === 2 ? "mature" : card.lvl === 1 ? "learn" : "new";
      const statusTxt = card.lvl === 2 ? "MASTERED" : card.lvl === 1 ? "LEARNING" : "NEW";
      const s = this.session;
      const total = s.queue.length;
      const pos = s.idx + 1;
      const senses = Lexicon.senses(t.item.key);

      if (t.step === 0) {
        // step 1: context recall — example with the word blanked
        const ex = ent.e;
        if (!ex) { t.step = 1; this.senseNext(); return; }
        t.step = 1;
        const blanked = ex.replace(new RegExp("\\b" + this.escapeRegExp(ent.w) + "\\b", "gi"), "______");
        $("cardStage").innerHTML =
          '<div class="card sense-card">' +
          '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + "</span>" +
          '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
          '<div class="sense-label">RECALL THE WORD FROM CONTEXT</div>' +
          '<div class="card-example big">“' + this.esc(blanked) + '”</div>' +
          '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ SPEAK</button></div>' +
          '<div class="card-index">STEP 2/3 · RECALL · ' + pos + " / " + total + "</div>" +
          '<div class="step-bar"><button class="btn btn-primary" id="btnSenseNext">REVEAL ▸</button></div>' +
          "</div>";
        $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
        $("btnSenseNext").addEventListener("click", () => this.senseNext());
        return;
      }
      if (t.step === 1) {
        // reveal the meaning, then move to spelling
        t.step = 2;
        const senseList = senses.map((sn) =>
          '<div class="sense-item">' +
          (sn.pos ? '<span class="sense-pos">' + this.esc(sn.pos) + "</span>" : "") +
          '<span class="sense-text">' + this.esc(sn.text) + "</span>" +
          (sn.ex ? '<div class="sense-ex">“' + this.esc(sn.ex) + '”</div>' : "") +
          "</div>").join("");
        $("cardStage").innerHTML =
          '<div class="card sense-card">' +
          '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + "</span>" +
          '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
          '<div class="card-word">' + this.esc(ent.w) + "</div>" +
          '<div class="sense-list">' + senseList + "</div>" +
          (st.showTrans && ent.t && !ent.d ? '<div class="card-def zh">' + this.esc(ent.t) + "</div>" : "") +
          '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ SPEAK</button></div>' +
          '<div class="card-index">STEP 2/3 · RECALL · ' + pos + " / " + total + "</div>" +
          '<div class="step-bar"><button class="btn btn-primary" id="btnSenseNext">CONTINUE TO SPELLING ▸</button></div>' +
          "</div>";
        $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
        $("btnSenseNext").addEventListener("click", () => this.senseNext());
        return;
      }
      // step 3: spelling lock — type the word
      t.step = 3;
      const ex2 = ent.e || "";
      let blanked2 = ex2;
      if (ex2) blanked2 = ex2.replace(new RegExp("\\b" + this.escapeRegExp(ent.w) + "\\b", "gi"), "______");
      $("cardStage").innerHTML =
        '<div class="card sense-card typing-card">' +
        '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + "</span>" +
        '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
        '<div class="sense-label">SPELL THE WORD</div>' +
        (ex2 ? '<div class="card-example">“' + this.esc(blanked2) + '”</div>' : "") +
        '<div class="typing-row"><span class="typing-prompt">TYPE &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="TYPE THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        '<div class="card-index">STEP 3/3 · SPELL · ' + pos + " / " + total + " · ENTER CONFIRM</div>" +
        "</div>";
      $("senseGrade").hidden = false;
      const input = $("typingInput");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.senseSpellCheck();
        else if (e.key === "Escape") this.senseSkipSpell();
      });
    },

    senseSpellCheck() {
      const t = this._sense;
      if (!t || t.graded) return;
      const input = $("typingInput");
      const fb = $("typingFeedback");
      const target = t.item.ent.w.toLowerCase();
      if (!t.spellDone) {
        t.spellDone = true;
        const ans = (input.value || "").trim().toLowerCase();
        if (ans === target) {
          t.spellOk = true;
          fb.className = "typing-feedback ok";
          fb.textContent = "✓ SPELLING CORRECT";
          input.readOnly = true;
        } else {
          t.spellOk = false;
          fb.className = "typing-feedback err";
          fb.textContent = "✗ " + t.item.ent.w + " — PRESS ENTER TO CONTINUE";
          input.readOnly = true;
        }
        return;
      }
      // done with spelling — now self-grade
      $("senseGrade").hidden = false;
      $("senseGrade").scrollIntoView({ block: "nearest" });
      fb.textContent = "SELF-GRADE: UNSURE / PARTIAL / UNDERSTOOD";
      fb.className = "typing-feedback";
    },

    senseSkipSpell() {
      const t = this._sense;
      if (!t || t.graded) return;
      const fb = $("typingFeedback");
      if (!t.spellDone) {
        t.spellDone = true;
        t.spellOk = false;
        fb.className = "typing-feedback err";
        fb.textContent = "✗ " + t.item.ent.w + " — PRESS ENTER TO CONTINUE";
        $("typingInput").readOnly = true;
      } else {
        this.grade(0);
      }
    },

    senseGrade(q) {
      const t = this._sense;
      if (!t || t.graded) return;
      t.graded = true;
      // spelling success boosts the grade one notch (UNSURE -> PARTIAL floor)
      if (t.spellOk && q === 0) q = 1;
      this.grade(q);
    },

    /* ---- CLASSIC flashcard mode ---- */
    renderClassicCard(item) {
      const s = this.session;
      const ent = item.ent;
      const card = Lexicon.getCard(item.key) || SRS.fresh();
      const st = Lexicon.state().settings;
      const phonetic = ent.uk ? ("UK " + ent.uk + "  US " + (ent.us || "—")) : (ent.us ? "US " + ent.us : "");
      const defHtml = [];
      if (ent.d) defHtml.push('<div class="card-def">' + this.esc(ent.d) + "</div>");
      if (st.showTrans && ent.t) defHtml.push('<div class="card-def zh">' + this.esc(ent.t) + "</div>");
      if (!ent.d && !ent.t) defHtml.push('<div class="card-def zh">(no definition loaded)</div>');
      if (ent.e) defHtml.push('<div class="card-example">“' + this.esc(ent.e) + '”</div>');
      const statusCls = card.lvl === 2 ? "mature" : card.lvl === 1 ? "learn" : "new";
      const statusTxt = card.lvl === 2 ? "MATURE" : card.lvl === 1 ? "LEARNING" : "NEW";
      const total = s.queue.length;
      const pos = s.idx + 1;

      this._meta(item, s);
      $("gradeBar").hidden = false;
      $("senseGrade").hidden = true;
      $("cardStage").innerHTML =
        '<div class="card">' +
        '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + (item.hot ? ' <span class="hot-dot">🔥</span>' : "") + "</span>" +
        '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
        '<div class="card-word">' + this.esc(ent.w) + "</div>" +
        (phonetic ? '<div class="card-phonetic">' + this.esc(phonetic) + "</div>" : "") +
        defHtml.join("") +
        '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ SPEAK</button></div>' +
        '<div class="card-index">' + pos + " / " + total + "</div>" +
        "</div>";
      $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
    },

    /* ---- TYPING drill mode ---- */
    renderTypingCard(item) {
      const s = this.session;
      const ent = item.ent;
      const card = Lexicon.getCard(item.key) || SRS.fresh();
      const st = Lexicon.state().settings;
      this._typing = { item, submitted: false, correct: false, graded: false };
      const total = s.queue.length;
      const pos = s.idx + 1;

      this._meta(item, s);
      $("gradeBar").hidden = true;
      $("senseGrade").hidden = true;

      let example = ent.e || "";
      if (example) {
        example = example.replace(new RegExp("\\b" + this.escapeRegExp(ent.w) + "\\b", "gi"), "______");
      }
      const defHtml = [];
      if (ent.d) defHtml.push('<div class="card-def">' + this.esc(ent.d) + "</div>");
      if (st.showTrans && ent.t) defHtml.push('<div class="card-def zh">' + this.esc(ent.t) + "</div>");
      if (example) defHtml.push('<div class="card-example">“' + this.esc(example) + '”</div>');

      const statusCls = card.lvl === 2 ? "mature" : card.lvl === 1 ? "learn" : "new";
      const statusTxt = card.lvl === 2 ? "MATURE" : card.lvl === 1 ? "LEARNING" : "NEW";

      $("cardStage").innerHTML =
        '<div class="card typing-card">' +
        '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + (item.hot ? ' <span class="hot-dot">🔥</span>' : "") + "</span>" +
        '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
        defHtml.join("") +
        '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ HEAR PRONUNCIATION</button></div>' +
        '<div class="typing-row"><span class="typing-prompt">WAYPOINT &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="TYPE THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        '<div class="card-index">' + pos + " / " + total + " · ENTER CONFIRM · ESC SKIP</div>" +
        "</div>";

      $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
      const input = $("typingInput");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.submitTyping();
        else if (e.key === "Escape") this.skipTyping();
      });
    },

    submitTyping() {
      const t = this._typing;
      if (!t || t.graded) return;
      const input = $("typingInput");
      const fb = $("typingFeedback");
      const target = t.item.ent.w.toLowerCase();

      if (!t.submitted) {
        t.submitted = true;
        const ans = (input.value || "").trim().toLowerCase();
        if (ans === target) {
          t.correct = true;
          fb.className = "typing-feedback ok";
          fb.textContent = "✓ " + t.item.ent.w + " — CORRECT, ADVANCING";
          input.readOnly = true;
          setTimeout(() => {
            if (this._typing === t && !t.graded) {
              t.graded = true;
              this.grade(2);
            }
          }, 1200);
        } else {
          t.correct = false;
          fb.className = "typing-feedback err";
          fb.textContent = "✗ EXPECTED: " + t.item.ent.w + " — PRESS ENTER TO CONTINUE";
          input.readOnly = true;
        }
        return;
      }
      t.graded = true;
      this.grade(t.correct ? 2 : 0);
    },

    skipTyping() {
      const t = this._typing;
      if (!t || t.graded) return;
      const input = $("typingInput");
      const fb = $("typingFeedback");
      if (!t.submitted) {
        t.submitted = true;
        t.correct = false;
        fb.className = "typing-feedback err";
        fb.textContent = "✗ SKIPPED — EXPECTED: " + t.item.ent.w + " — PRESS ENTER TO CONTINUE";
        input.readOnly = true;
      } else {
        t.graded = true;
        this.grade(0);
      }
    },

    /* ---- grading ---- */
    grade(q) {
      const s = this.session;
      if (!s) return;
      const item = s.queue[s.idx];
      let card = Lexicon.getCard(item.key);
      if (!card) {
        card = SRS.fresh();
        card.added = Date.now();
      }
      const updated = SRS.review(card, q);
      // weak words (failed twice in a row) auto-flag into the hot zone
      if (updated.weak >= 2 && !Lexicon.isUnfamiliar(item.key)) {
        Lexicon.addUnfamiliar(item.key, "weak");
      }
      Lexicon.setCard(item.key, updated);

      if (q === 0) {
        s.failed++;
        s.queue.push({ key: item.key, ent: item.ent, card: updated, isNew: false, hot: Lexicon.isUnfamiliar(item.key) });
      } else {
        if (item.isNew) s.newDone++;
        else s.revDone++;
      }
      s.idx++;
      this._sense = null;
      this._typing = null;

      if (s.idx >= s.queue.length) {
        this.endSession();
      } else {
        this.renderCard();
      }
    },

    endSession() {
      const s = this.session;
      Lexicon.logStudy(s.newDone, s.revDone);
      WordAnnotate.refresh();
      $("gradeBar").hidden = true;
      $("senseGrade").hidden = true;
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
      this.session = { queue, idx: 0, newDone: 0, revDone: 0, failed: 0 };
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
        $("cfgMode").value = s.mode || "sense";
        $("cfgTrans").checked = s.showTrans;
        $("cfgVoice").checked = s.voice;
        $("cfgRate").value = s.rate;
        $("settingsModal").hidden = false;
      });
      $("btnCfgSave").addEventListener("click", () => {
        const s = Lexicon.state().settings;
        s.goal = Math.max(1, Math.min(500, parseInt($("cfgGoal").value, 10) || 25));
        s.examDate = $("cfgExam").value || "2026-11-15";
        s.mode = ["sense", "card", "typing"].includes($("cfgMode").value) ? $("cfgMode").value : "sense";
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
      document.querySelectorAll(".grade[data-q]").forEach((b) =>
        b.addEventListener("click", () => this.grade(parseInt(b.dataset.q, 10))));
      document.querySelectorAll("#senseGrade .grade").forEach((b) =>
        b.addEventListener("click", () => this.senseGrade(parseInt(b.dataset.q, 10))));
      document.querySelectorAll("#dkFilter .deck-f").forEach((b) =>
        b.addEventListener("click", () => {
          this._deckFilter = b.dataset.f;
          this._deckPage = 0;
          document.querySelectorAll("#dkFilter .deck-f").forEach((x) => x.classList.toggle("active", x === b));
          this.renderDeck();
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
        if (e.target && /input|textarea/i.test(e.target.tagName)) return;
        if (this.session && this.view === "vocab" && this.vsub === "train") {
          const k = e.key;
          if (k === "1") { if (this._sense) this.senseGrade(0); else this.grade(0); }
          else if (k === "2") { if (this._sense) this.senseGrade(1); else this.grade(1); }
          else if (k === "3") { if (this._sense) this.senseGrade(2); else this.grade(2); }
          else if (k === "4") this.grade(3);
          else if (k === " ") {
            e.preventDefault();
            const item = this.session.queue[this.session.idx];
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
