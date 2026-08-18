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

  // function words — never injected into TRAIN from paraphrase misses
  const STOPWORDS = new Set(("the a an and or but of in on at to for with by from as is are was were be been being " +
    "have has had do does did will would can could shall should may might must this that these those it its they " +
    "them their there here we our you your he his she her i my me not no nor so if then than too very just also " +
    "because when while during about after before between into onto under over out up down off all any each every " +
    "some such what which who whom whose how why where").split(" "));

  const App = {
    view: "stats",
    vsub: "train",       // vocab sub-view: train | deck | lexicon
    session: null,       // { queue:[{key,ent,card,isNew,hot}], idx, newDone, revDone, failed }
    _typing: null,       // typing-mode state
    _sense: null,        // sense-mode state

    /* ================= init ================= */
    init() {
      Lexicon.load();
      // legacy phrase cards (pre-PHRASES module) are dropped — phrases
      // live in the PHRASES quiz now, their words are single cards
      Lexicon.stripPhraseCards();
      CloudSync.init();
      CloudSync.onStatus = (msg) => this.setCloudStatus(msg);
      this.bindTabs();
      this.bindActions();
      this.bindSettings();
      this.bindKeyboard();
      this.applySettings();
      this.renderAll();
      this.startClock();
      Telemetry.initMap($("mapCanvas"));
      Telemetry.drawChart($("chartCanvas"));
      this.cloudInit();
      // partial session accounting: words graded so far count toward
      // today's history even if the page is hidden/closed mid-session
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.partialLog();
      });
    },

    /* ================= cloud sync ================= */
    cloudInit() {
      // A fresh device has no localStorage (no token, no enable flag)
      // yet — but the pull endpoint is a public raw URL, so we can
      // still fetch the cloud copy automatically. Without this a new
      // computer would show a blank deck and never know progress
      // exists elsewhere.
      const hasLocalData = (() => {
        try {
          const raw = localStorage.getItem("sls_cards");
          return !!raw && Object.keys(JSON.parse(raw)).length > 0;
        } catch (e) { return false; }
      })();
      if (!CloudSync.enabled && hasLocalData) {
        this.setCloudStatus("CLOUD SYNC OFF — ENABLE IT IN CONFIG");
        return;
      }
      this.setCloudStatus("PULLING CLOUD COPY…");
      CloudSync.pull().then((r) => {
        if (r.ok) {
          this.renderAll();
          this.renderDeck();
          this.setCloudStatus("SYNCED — CLOUD COPY LOADED (" + (r.at || "").slice(0, 10) + ")" +
            (CloudSync.token ? "" : " · CONFIG TOKEN TO PUSH CHANGES"));
        } else if (r.reason === "HTTP 404") {
          this.setCloudStatus("NO CLOUD COPY YET — SAVE CONFIG WITH AUTO SYNC ON TO SEED IT");
        } else {
          this.setCloudStatus("PULL FAILED (" + r.reason + ") — USING LOCAL DATA");
        }
      });
    },
    setCloudStatus(msg) {
      const el = $("cloudStatus");
      if (el) el.textContent = msg;
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
    },
    switchSub(s) {
      this.vsub = s;
      document.querySelectorAll("#vocabSubNav .tab").forEach((b) =>
        b.classList.toggle("active", b.dataset.sub === s));
      this.showSub();
    },
    showSub() {
      document.querySelectorAll(".sub-view").forEach((sec) => sec.classList.remove("active"));
      const map = { train: "vocabTrain", deck: "vocabDeck", lexicon: "vocabLexicon", speaking: "vocabSpeaking", phrases: "vocabPhrases", paraphrase: "vocabParaphrase" };
      const el = $(map[this.vsub]);
      if (el) el.classList.add("active");
      if (this.vsub === "deck") this.renderDeck();
      if (this.vsub === "lexicon") this.renderLog();
      if (this.vsub === "speaking") this.renderSpeaking();
      if (this.vsub === "phrases") this.renderPhrases();
      if (this.vsub === "paraphrase") this.renderParaphrase();
      if (this.vsub === "train" && !this.session) this.renderIdleConsole();
    },

    /* ================= statistics ================= */
    stView: "all",   // "all" | "today"

    /* DDL-driven metrics: remaining days, core deck size, suggested
     * daily goal so the learner reaches the exam deadline on time. */
    ddlMetrics() {
      const st = Lexicon.state();
      const exam = new Date(st.settings.examDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysLeft = Math.max(0, Math.ceil((exam - today) / DAY));
      let coreTotal = 0;
      Lexicon.load().forEach((ent) => { if (ent.p === 0) coreTotal++; });
      const learned = Object.keys(Lexicon.cards()).length;
      coreTotal = Math.max(coreTotal, learned);
      const remaining = Math.max(0, coreTotal - learned);
      const suggestGoal = daysLeft > 0 ? Math.max(1, Math.ceil(remaining / daysLeft)) : 1;
      return { daysLeft, coreTotal, learned, remaining, suggestGoal };
    },

    /* effective daily goal: auto-follows DDL unless the user pinned it */
    effectiveGoal(st) {
      const s = st || Lexicon.state();
      return s.settings.goalAuto ? this.ddlMetrics().suggestGoal : s.settings.goal;
    },

    renderAll() {
      this.renderStats();
      this.renderStages();
      this.renderThemeArc();
      this.renderDailyFlow();
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

      // words introduced since local midnight — a calendar-day window,
      // NOT a 24h sliding one (last night's words must not count as
      // "today" when the page opens the next morning)
      let newToday = 0;
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayStartMs = dayStart.getTime();
      const cards = Lexicon.cards();
      for (const k in cards) {
        const c = cards[k];
        if (c.added && c.added >= dayStartMs) newToday++;
      }
      // daily target follows the DDL when goalAuto is on — one value
      // everywhere so TODAY and ALL TIME views never drift
      const effGoal = this.effectiveGoal(st);
      // ---- DDL pace: recommended daily goal + ahead/behind estimate ----
      const m = this.ddlMetrics();
      const remaining = m.remaining, suggestGoal = m.suggestGoal;
      let firstDay = null;
      const allCards = Lexicon.cards();
      for (const k in allCards) {
        const a = allCards[k].added;
        if (a && (!firstDay || a < firstDay)) firstDay = a;
      }
      const totalDays = firstDay ? Math.max(1, Math.ceil((exam - firstDay) / DAY)) : Math.max(1, daysLeft);
      const elapsedDays = firstDay ? Math.max(0, totalDays - daysLeft) : 0;
      const expected = elapsedDays * effGoal;
      const diff = learned - expected;
      const paceDays = effGoal ? diff / effGoal : 0;
      $("stPace").textContent = paceDays >= 0
        ? "AHEAD +" + paceDays.toFixed(1) + "D"
        : "BEHIND " + Math.abs(paceDays).toFixed(1) + "D";
      // forecast: completion date if the suggested pace is kept; red when behind
      const eta = new Date(Date.now() + Math.ceil(remaining / Math.max(1, suggestGoal)) * DAY);
      const etaStr = eta.getFullYear() + "-" + String(eta.getMonth() + 1).padStart(2, "0") + "-" + String(eta.getDate()).padStart(2, "0");
      $("stPace").style.color = paceDays < 0 ? "var(--red)" : "";
      $("stPaceSub").textContent = "SUGGESTED " + suggestGoal + "/DAY · " + remaining + " CORE LEFT · ETA " + etaStr;
      const todayKey = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
      const hist = (st.stats.history || {})[todayKey] || { n: 0, r: 0, p: 0 };
      const todayTotal = (hist.n || 0) + (hist.r || 0) + (hist.p || 0);

      if (this.stView === "today") {
        // ---- TODAY view: composite progress across all factors ----
        // new words 70% · reviews 30%; both overachieve visibly —
        // 293/122 must read as 240%, not silently cap at 100%
        const newPct = effGoal ? Math.round((newToday / effGoal) * 100) : 0;
        const newScore = Math.min(newToday / effGoal, 1) * 70;
        const revScore = Math.min((hist.r || 0) / Math.max(1, Math.round(effGoal * 0.5)), 1) * 30;
        const totalPct = Math.round(newScore + revScore);
        $("stLblExam").textContent = "MISSION ETA";
        $("stLblToday").textContent = "TODAY PROGRESS";
        $("stLblDue").textContent = "REVIEWS TODAY";
        $("stLblStreak").textContent = "TOTAL ACTIVITY";
        $("stLblCover").textContent = "DAILY GOAL (NEW WORDS)";
        // big number shows the true new-word completion, uncapped
        $("stToday").textContent = (newPct > 100 ? "▲ " : "") + newPct + "%";
        $("stTodayPct").textContent = "NEW " + newToday + "/" + effGoal + " · REV " + (hist.r || 0);
        $("stDue").textContent = (hist.r || 0) + " / " + counts.due;
        $("stDueSub").textContent = "REVIEWS DONE / QUEUED";
        $("stStreak").textContent = todayTotal;
        $("stStreakSub").textContent = "TOTAL ACTIVITIES";
        const over = newToday > effGoal;
        const goalPct = Math.min(100, newPct);
        $("stCoverage").textContent = over
          ? newPct + "% · GOAL MET ✓"
          : (newToday >= effGoal ? "GOAL MET ✓" : goalPct + "%");
        const fill = $("stCoverageFill");
        fill.style.width = goalPct + "%";
        fill.classList.toggle("over", over);
      } else {
        // ---- ALL TIME view ----
        $("stLblExam").textContent = "MISSION ETA";
        $("stLblToday").textContent = "TODAY PROGRESS";
        $("stLblDue").textContent = "REVIEWS DUE";
        $("stLblStreak").textContent = "STREAK";
        $("stLblCover").textContent = "VOCAB COVERAGE";
        $("stToday").textContent = newToday + "/" + effGoal;
        $("stTodayPct").textContent = Math.min(100, Math.round((newToday / effGoal) * 100)) + "%";
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

      // ---- WRONG BOX stat card: wrong items + pending words queued
      // for TRAIN, from every practice module (syn/tfng/phrases) ----
      const wrongN = Lexicon.ppWrongList().length;
      const pendN = Lexicon.ppPendingList().length;
      $("stWrong").textContent = wrongN + pendN;
      $("stWrongSub").textContent = "错题 " + wrongN + " · 生词 " + pendN + " 待学";

      // hot-zone quick row on the stats panel -> deck filtered to flagged words
      const hotWrap = $("stHotWrap");
      if (hotWrap) {
        hotWrap.hidden = hot === 0;
        $("stHotCount").textContent = hot;
        $("stHotGo").onclick = (e) => {
          e.preventDefault();
          this.openHotDeck();
        };
      }

      // ---- TODAY QUEUE: due reviews + remaining new budget, with progress ----
      // when the new-word goal is already met the NEW segment shows
      // full-width instead of collapsing to zero — overachievement
      // stays visible in the queue bar
      const qDue = counts.due;
      const qNew = Math.max(0, effGoal - (hist.n || 0));
      const qNewOver = (hist.n || 0) > effGoal;
      const qDone = (hist.n || 0) + (hist.r || 0);
      const qTotal = qDue + qNew;
      $("stQueueText").textContent = qDue + " REVIEWS + " +
        (qNewOver ? "NEW ✓ (GOAL MET)" : qNew + " NEW") + " = " + qTotal + " · DONE " + qDone;
      $("stQueueRev").textContent = qDue;
      $("stQueueHot").textContent = hot;
      $("stQueueNew").textContent = qNewOver ? "✓" : qNew;
      $("stQueueDone").textContent = qDone;
      const revW = qTotal ? (Math.min(qDue, hist.r || 0) / qTotal) * 100 : 0;
      // NEW segment: full width once the goal is met (overachieve = 100%);
      // reviews compress so the two segments never overlap
      const newW = qNewOver ? 100 : qTotal ? (Math.min(qNew, hist.n || 0) / qTotal) * 100 : 0;
      const revWFin = qNewOver ? Math.min(revW, 30) : revW;
      $("stQueueFill").innerHTML =
        '<i class="qseg-fill" style="width:' + revWFin + "%;background:var(--amber)\"></i>" +
        '<i class="qseg-fill' + (qNewOver ? " over" : "") + '" style="width:' + newW + "%;background:var(--cyan)\"></i>";
    },

    /* open the vocab deck pre-filtered to the hot zone */
    openHotDeck() {
      this._deckFilter = "hot";
      this._deckPage = 0;
      this.vsub = "deck";
      this.switchView("vocab");
      document.querySelectorAll("#vocabSubNav .tab").forEach((b) =>
        b.classList.toggle("active", b.dataset.sub === "deck"));
      document.querySelectorAll("#dkFilter .deck-f").forEach((x) =>
        x.classList.toggle("active", x.dataset.f === "hot"));
    },

    /* daily flow: today's four-step learning plan with live counts.
     * REVIEW / NEW steps launch the matching sessions; HOT opens the deck. */
    renderDailyFlow() {
      const st = Lexicon.state();
      const counts = Lexicon.cardCounts();
      const hot = Object.keys(Lexicon.unfamiliarList()).length;
      const effGoal = this.effectiveGoal(st);
      const todayKey = new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-" + String(new Date().getDate()).padStart(2, "0");
      const hist = (st.stats.history || {})[todayKey] || { n: 0, r: 0, p: 0 };
      const qNew = Math.max(0, effGoal - (hist.n || 0));
      const curTheme = Lexicon.currentTheme();
      const themeName = curTheme ? curTheme.name.toUpperCase() : "GENERAL";

      const step = (id, num, label, state, act) =>
        '<div class="flow-step flow-' + id + '"' + (act ? ' data-act="' + act + '"' : "") + ">" +
        '<span class="flow-num">' + num + "</span>" +
        '<div class="flow-body"><span class="flow-name">' + label + "</span>" +
        '<span class="flow-state">' + state + "</span></div>" +
        '<span class="flow-arrow">' + (act ? "▸" : "") + "</span></div>";

      const steps = [];
      steps.push(step("rev", "01", "REVIEW DUE",
        counts.due === 0 ? "ALL CLEAR ✓" : (hist.r || 0) + " / " + counts.due + " DONE",
        counts.due > 0 ? "review" : null));
      steps.push(step("hot", "02", "HOT ZONE",
        hot === 0 ? "ALL CLEAR ✓" : hot + " FLAGGED",
        hot > 0 ? "hot" : null));
      steps.push(step("new", "03", "NEW WORDS · " + themeName,
        qNew === 0 ? "GOAL MET ✓" : (hist.n || 0) + " / " + effGoal + " LEARNED",
        qNew > 0 ? "new" : null));
      steps.push(step("scene", "04", "SCENE SESSION",
        "MEANING · RECOGNIZE · SPELL · FILL", null));

      $("stFlow").innerHTML = steps.join("");
      $("stFlow").querySelectorAll(".flow-step[data-act]").forEach((el) => {
        el.addEventListener("click", () => {
          const a = el.dataset.act;
          if (a === "review") this.startSession(true);
          else if (a === "new") this.startSession(false);
          else if (a === "hot") this.openHotDeck();
        });
      });
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

    /* ---- THEME ARC: 22-chapter cognitive arc progress ----
     * chapters light up in learning order; the current chapter
     * (first with unstudied words) is highlighted. */
    renderThemeArc() {
      const el = $("stThemeArc");
      if (!el) return;
      const ts = Lexicon.themeStats();
      const cur = Lexicon.currentTheme();
      const bars = ts.arc.map((t) => {
        const state = t.done ? "done" : (cur && cur.id === t.id ? "now" : "wait");
        const pct = t.total ? Math.round((t.learned / t.total) * 100) : 0;
        return '<div class="arc-row arc-' + state + '" data-t="' + t.id + '">' +
          '<span class="arc-no">' + String(ts.arc.indexOf(t) + 1).padStart(2, "0") + "</span>" +
          '<span class="arc-name">' + t.name + "</span>" +
          '<div class="statbar"><div class="statbar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="arc-count">' + t.learned + "/" + t.total + "</span></div>";
      }).join("");
      const curName = cur ? cur.name : "";
      el.innerHTML = '<div class="arc-head"><span class="arc-cur">CURRENT: ' + curName + "</span>" +
        '<span class="arc-gen">GENERAL POOL ' + ts.general.learned + "/" + ts.general.total + "</span></div>" +
        '<div class="arc-list">' + bars + "</div>";
    },

    /* ================= session / daily mix ================= */
    buildQueue(reviewOnly) {
      const st = Lexicon.state();
      const queue = [];
      // 1) hot-zone words first — every flagged word enters the
      //    daily queue (studied or not), so weak words always get a
      //    chance to clear automatically (a GOOD/EASY answer
      //    removes the flag; wrong answers keep it for tomorrow).
      //    Multi-word phrases are skipped — they are not single
      //    study words, they live in the PHRASES module.
      for (const key in Lexicon.getUnfamiliar()) {
        if (Lexicon.isPhrase(key)) continue;
        const ent = Lexicon.get(key) || { w: key, t: "", us: "", uk: "", p: 2, d: "", e: "" };
        const card = Lexicon.getCard(key);
        queue.push({ key, ent, card, isNew: !card, hot: true });
      }
      // 1.5) pending words from paraphrase mistakes — they enter
      //      today's TRAIN as full new-word cards (capped so they
      //      never flood the session), then leave the box when
      //      studied (applyGrade removes them)
      if (!reviewOnly) {
        for (const key of Lexicon.ppPendingList().slice(0, 10)) {
          if (queue.some((t) => t.key === key)) continue;
          const ent = Lexicon.get(key) || { w: key, t: "", us: "", uk: "", p: 2, d: "", e: "" };
          queue.push({ key, ent, card: null, isNew: true, hot: false, pending: true });
        }
      }
      // 2) due reviews, then by due time
      const due = Lexicon.dueCards();
      due.sort((a, b) => a.card.due - b.card.due);
      due.forEach((d) => {
        if (Lexicon.isPhrase(d.key)) return;
        if (queue.some((t) => t.key === d.key)) return;
        queue.push({ key: d.key, ent: Lexicon.get(d.key), card: d.card, isNew: false, hot: false });
      });
      if (reviewOnly) return queue;
      // 3) regular new words are chosen BY buildGroups from the
      //    sentence bank (句表), capped by the DDL-derived goal
      return queue;
    },

    startSession(reviewOnly, extra) {
      const queue = this.buildQueue(reviewOnly);
      const groups = this.buildGroups(queue, reviewOnly, 4, extra);
      this.session = {
        queue, groups, gi: 0, wi: 0,
        // review-only queues skip the scene-listening stage — the
        // first card starts at recognition (identification first)
        phase: (groups[0] && groups[0].words[0].isNew) ? "meaning" : "recognize",
        spellOrder: null,   // shuffled spell-channel order, set on enterSpell()
        gapWord: null,      // group index of the word being gap-filled
        scores: {}, newDone: 0, revDone: 0, failed: 0,
        _logged: { n: 0, r: 0 },   // stats already banked via partialLog()
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

    /* ---- sentence-based daily mix (句表) ----
     * Step 1: must-study words (due reviews + flagged) are bound to
     * the sentence that carries the most other unused targets.
     * Step 2: the remaining DDL new-word budget is filled BY THE
     * SENTENCES — the scene with the most unstudied words wins, so
     * every group is a real multi-word context instead of random
     * words that never meet in a sentence.
     * Step 3: leftover budget tops up with core-first words that no
     * sentence covers (they study meaning + spelling only). */
    /* ---- sentence scoring (句表打分) ----
     * A scene sentence's value = Σ (word state value × difficulty
     * × weakness factor) × scene coefficient.
     *  · state value (learning curve): hot-zone 10 · due review 7
     *    · new word 5 · learning-not-due 1 · mastered-not-due 0
     *  · difficulty: long word (≥10 chars) ×1.15 · many senses (≥3)
     *    ×1.1 · supplement-tier list (p=2) ×1.05
     *  · weakness: one historical AGAIN ×1.1 (≥2 auto-flags the
     *    word into the hot zone, which already caps the value)
     *  · scene coefficient: sentence 20–140 chars ×1.1 (real
     *    context worth more than a fragment)
     * Practice flags (dbl-click unknown words) raise the state
     * value to 10, so those words pull their sentences to the top
     * of the daily queue. */
    sceneScore(sentence, items) {
      let s = 0;
      for (const it of items) {
        let v = this.targetValue(it.key);
        const ent = it.ent;
        let diff = 1;
        if (ent && ent.w && ent.w.length >= 10) diff *= 1.15;
        if (Lexicon.senses(it.key).length >= 3) diff *= 1.1;
        if (ent && ent.p === 2) diff *= 1.05;
        if (it.card && it.card.weak === 1) diff *= 1.1;
        s += Math.round(v * diff);
      }
      if (sentence && sentence.length >= 20 && sentence.length <= 140) {
        s = Math.round(s * 1.1);
      }
      return s;
    },
    targetValue(key) {
      if (Lexicon.isUnfamiliar(key)) return 10;
      const card = Lexicon.getCard(key);
      if (!card || card.lvl === 0) return 5;
      if (card.due <= Date.now()) return 7;
      return 1;
    },
    buildGroups(queue, reviewOnly, size = 4, extra = false) {
      const bank = Lexicon.buildSentenceBank();
      const targetMap = new Map(queue.map((t) => [t.key, t]));
      const used = new Set();
      const groups = [];
      // 1) bind must-study words in priority order — the sentence
      //    carrying the highest learning-curve VALUE wins
      for (const t of queue) {
        if (used.has(t.key)) continue;
        let best = null, bestHits = 0, bestVal = 0;
        for (const b of bank) {
          if (b.words.indexOf(t.key) === -1) continue;
          let hits = 0, val = 0;
          for (const w of b.words) {
            if (!used.has(w) && targetMap.has(w)) { hits++; val += this.targetValue(w); }
          }
          if (hits >= 2 && (val > bestVal || (val === bestVal && hits > bestHits))) {
            best = b; bestHits = hits; bestVal = val;
          }
        }
        if (best && bestHits >= 2) {
          const pick = [];
          for (const x of queue) {
            if (used.has(x.key) || best.words.indexOf(x.key) === -1) continue;
            used.add(x.key);
            pick.push(x);
            if (pick.length >= size) break;
          }
          groups.push({ scene: best.s, words: pick });
        } else {
          used.add(t.key);
          groups.push({ scene: null, words: [t] });
        }
      }
      // 2) new words — the sentences decide which words today,
      //    with a cognitive-arc bias: sentences carrying words of
      //    the current theme outrank equal-sized alternatives
      if (!reviewOnly) {
        const st = Lexicon.state();
        const freshCount = queue.filter((t) => t.isNew && t.hot).length;
        // extra (continue-learning) batches lift the DDL cap — the
        // caller asked for more new words on top of today's goal
        let budget = extra
          ? Math.max(0, this.effectiveGoal(st) * 2 - freshCount)
          : Math.max(0, this.effectiveGoal(st) - freshCount);
        const cards = Lexicon.cards();
        const curTheme = Lexicon.currentTheme();
        const curId = curTheme ? curTheme.id : null;
        while (budget > 0) {
          let best = null, bestScore = 0, bestCore = 0, bestTheme = -1;
          for (const b of bank) {
            if (b.words.length < 2) continue;
            let score = 0, core = 0, theme = 0;
            for (const w of b.words) {
              if (used.has(w) || cards[w]) continue;
              const ent = Lexicon.get(w);
              if (!ent) continue;
              score++;
              if (ent.p === 0) core++;
              if (curId && Lexicon.themeOf(w) === curId) theme++;
            }
            if (theme > bestTheme || (theme === bestTheme &&
              (score > bestScore || (score === bestScore && core > bestCore)))) {
              best = b; bestScore = score; bestCore = core; bestTheme = theme;
            }
          }
          if (!best || bestScore < 2) break;
          const pick = [];
          for (const w of best.words) {
            if (used.has(w) || cards[w]) continue;
            used.add(w);
            const ent = Lexicon.get(w) || { w, t: "", us: "", uk: "", p: 2, d: "", e: "" };
            pick.push({ key: w, ent, card: null, isNew: true, hot: false });
            // never exceed the DDL budget for today's new words
            if (pick.length >= size || pick.length >= budget) break;
          }
          if (!pick.length) break;
          groups.push({ scene: best.s, words: pick });
          budget -= pick.length;
        }
        // 3) leftover budget: current-theme words first (the arc
        //    drives the order), then core-first top-up
        if (budget > 0 && curId) {
          const pool = Lexicon.themePool(curId)
            .filter((w) => !used.has(w) && !cards[w] && !Lexicon.isPhrase(w))
            .sort((a, b) => ((Lexicon.get(a) || {}).p || 2) - ((Lexicon.get(b) || {}).p || 2));
          for (const w of pool) {
            if (budget <= 0) break;
            used.add(w);
            const ent = Lexicon.get(w) || { w, t: "", us: "", uk: "", p: 2, d: "", e: "" };
            groups.push({ scene: null, words: [{ key: w, ent, card: null, isNew: true, hot: false }] });
            budget--;
          }
        }
        if (budget > 0) {
          const extras = Lexicon.newCandidates(budget, 0, 0, extra);
          for (const n of extras) {
            if (used.has(n.key)) continue;
            used.add(n.key);
            groups.push({ scene: null, words: [{ key: n.key, ent: n.ent, card: null, isNew: true, hot: false }] });
          }
        }
      }
      return groups;
    },

    /* current word depends on the channel:
     *  meaning/recognize -> group order; spell -> shuffled order;
     *  gap -> the word whose sentences are being filled */
    curWord() {
      const s = this.session;
      const group = s.groups[s.gi];
      if (s.phase === "spell") return group.words[s.spellOrder[s.wi]];
      if (s.phase === "gap") return group.words[s.gapWord];
      return group.words[s.wi];
    },

    renderCard() {
      const s = this.session;
      if (!s) return;
      $("trainActions").style.display = "none";
      $("sessionDone").hidden = true;
      this.renderPhase();
    },

    renderPhase() {
      if (this._recKeyHandler) {
        document.removeEventListener("keydown", this._recKeyHandler);
        this._recKeyHandler = null;
      }
      const s = this.session;
      // the result card has no current word (wi is past the group
      // end) — header fields are only valid during card phases
      const isResult = s.phase === "result";
      const item = isResult ? null : this.curWord();
      if (item) {
        const group = s.groups[s.gi];
        const chan = s.phase === "meaning" ? "SCENE" :
          s.phase === "recognize" ? "RECOGNIZE" :
          s.phase === "spell" ? "SPELL" : "FILL";
        const denom = s.phase === "gap" ? (this._gaps ? this._gaps.length : 1) : group.words.length;
        $("mcMode").textContent = (item.hot ? "HOT ZONE: " : "") + (item.isNew ? "NEW WORD" : "REVIEW");
        $("mcMeta").textContent = "SCENE " + (s.gi + 1) + "/" + s.groups.length +
          " · " + chan + " " + (s.wi + 1) + "/" + denom + (item.hot ? " · 🔥 FLAGGED" : "");
        const totalWords = s.groups.reduce((n, g) => n + g.words.length, 0);
        const done = s.groups.slice(0, s.gi).reduce((n, g) => n + g.words.length, 0) + s.wi;
        $("mcProgress").style.width = (totalWords ? (done / totalWords) * 100 : 0) + "%";
      }
      if (s.phase === "meaning") this.renderMeaning();
      else if (s.phase === "recognize") {
        // a word with no gloss at all (no Chinese, no EN def) cannot
        // form a recognition choice — auto-pass recognition and move
        // to the next word of the channel (it will still be spelled)
        if (!this.zhHead(item.key)) {
          s.scores[item.key] = Object.assign({ recOk: 1 }, s.scores[item.key]);
          s.wi++;
          if (s.wi >= s.groups[s.gi].words.length) this.enterSpell();
          this.renderPhase();
          return;
        }
        this.renderRecognize(item);
      }
      else if (s.phase === "spell") this.renderSpell(item);
      else if (s.phase === "gap") this.renderGap(item);
      else if (s.phase === "result") this.renderGroupResult();
    },

    /* recognition channel done -> spelling channel, shuffled so the
     * word just recognized is never the very next word spelled */
    enterSpell() {
      const s = this.session;
      const group = s.groups[s.gi];
      s.spellOrder = this._shuffled(group.words.map((_, i) => i));
      s.phase = "spell";
      s.wi = 0;
    },

    /* Chinese translation line for a scene sentence, when available */
    sceneZhHtml(sentence) {
      const zh = Lexicon.sentenceZh(sentence);
      return zh ? '<div class="scene-zh">' + this.esc(zh) + "</div>" : "";
    },

    /* ---- navigation: previous / next across channels ---- */
    goBack() {
      const s = this.session;
      if (!s) return;
      // inside a channel: step back one word
      if (s.phase === "gap") {
        if (this._gapIdx > 0) { this._gapIdx--; this.renderGap(this.curWord()); return; }
        s.phase = "spell"; // back to the spelling card of this word
        this.renderPhase();
        return;
      }
      if (s.phase === "spell") {
        if (s.wi > 0) { s.wi--; this.renderPhase(); return; }
        s.phase = "recognize";
        s.wi = s.groups[s.gi].words.length - 1;
        this.renderPhase();
        return;
      }
      if (s.phase === "recognize") {
        if (s.wi > 0) { s.wi--; this.renderPhase(); return; }
        s.phase = "meaning";
        this.renderPhase();
        return;
      }
      // meaning / result -> previous group's result
      if (s.gi > 0) {
        s.gi--;
        s.wi = s.groups[s.gi].words.length - 1;
        s.phase = "result";
        this.renderPhase();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    goNext() {
      const s = this.session;
      if (!s) return;
      if (s.phase === "meaning") { s.phase = "recognize"; s.wi = 0; this.renderPhase(); return; }
      if (s.phase === "recognize") {
        s.wi++;
        if (s.wi >= s.groups[s.gi].words.length) this.enterSpell();
        this.renderPhase();
        return;
      }
      if (s.phase === "spell") {
        const item = this.curWord();
        if (item.isNew) { this.advanceToGap(); return; }
        this.finishWord();
        return;
      }
      if (s.phase === "gap") { this.gapNext(); return; }
      if (s.phase === "result") {
        s.gi++;
        s.wi = 0;
        if (s.gi >= s.groups.length) { this.endSession(); return; }
        // review groups skip the scene-listening stage — recognition first
        s.phase = s.groups[s.gi].words[0].isNew ? "meaning" : "recognize";
        this.renderPhase();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    navBar(backId, nextId, nextLabel, backDisabled) {
      return '<div class="step-bar nav-bar">' +
        '<button class="btn" id="' + backId + '"' + (backDisabled ? " disabled" : "") + '>◀ BACK</button>' +
        '<button class="btn btn-primary" id="' + nextId + '">' + nextLabel + " ▸</button></div>";
    },

    /* maskWord (optional): blank the target word out of English
     * definitions during spelling, so self-referential definitions
     * ("A massive thing is very big.") cannot give the answer away */
    senseListHtml(senses, showTrans, maskWord) {
      const maskRe = maskWord ? new RegExp("\\b" + Lexicon.escapeRegExp(Lexicon.stem(maskWord.toLowerCase())) + "[a-z]*\\b", "gi") : null;
      return senses.slice(0, 4).map((s2) => {
        let en = s2.en || "";
        if (maskRe) en = String(en).replace(maskRe, "______");
        return '<div class="sense-item">' +
          (s2.pos ? '<span class="sense-pos">' + s2.pos + "</span>" : "") +
          (en ? '<span class="sense-en">' + this.esc(en) + "</span>" : "") +
          (showTrans && s2.zh ? '<span class="sense-zh">' + this.esc(s2.zh) + "</span>" : "") +
          "</div>";
      }).join("");
    },

    /* ---- phase 1 (group level): one shared scene carries all words ---- */
    renderMeaning() {
      const s = this.session;
      const group = s.groups[s.gi];
      const item = this.curWord();
      const st = Lexicon.state().settings;
      const showTrans = st.showTrans;
      let sceneSents;
      if (group.scene) {
        sceneSents = [group.scene];
        const extra = Lexicon.exampleSentences(item.key, 1);
        if (extra.length && extra[0] !== group.scene) sceneSents.push(extra[0]);
      } else {
        sceneSents = Lexicon.exampleSentences(item.key, 2);
      }
      const sceneHtml = sceneSents.map((s2, i) =>
        '<div class="scene-sentence">' + (sceneSents.length > 1 ? "<span class='scene-no'>" + (i + 1) + "</span>" : "") +
        '<span class="scene-text" id="sceneTxt' + i + '">“' + this.highlightWords(s2, group.words.map((w) => w.ent.w)) + '”</span>' +
        '<button class="tts-btn scene-play" id="btnScenePlay' + i + '">◉ PLAY</button>' +
        this.sceneZhHtml(s2) +
        "</div>"
      ).join("");
      // senses of every word in the scene — the sentence brings them in together;
      // each word carries its own play button (the big bottom audio
      // bar is gone — per-word and per-sentence audio only)
      const wordBlocks = group.words.map((it) => {
        const senses = Lexicon.senses(it.key);
        const inner = this.senseListHtml(senses, showTrans) ||
          '<div class="sense-text">' + this.esc(it.ent.t || "") + "</div>";
        return '<div class="sense-word-block">' +
          '<span class="sense-word">' + this.esc(it.ent.w) + "</span>" +
          '<button class="tts-btn word-play" title="PLAY WORD" data-play="' + this.esc(it.key) + '">◉</button>' +
          this.metaHtml(it) + inner + "</div>";
      }).join("");

      $("cardStage").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">SCENE ' + (s.gi + 1) + "/" + s.groups.length +
        " · " + group.words.length + " WORDS · VALUE " + this.sceneScore(group.scene || "", group.words) +
        (item.hot ? ' <span class="hot-dot">🔥</span>' : "") + "</span>" +
        '<span class="card-status learn">SCENE LISTENING</span>' +
        '<div class="sense-label">STAGE 1 · LISTEN TO THE SCENE — ' +
        group.words.map((w) => this.esc(w.ent.w)).join(" · ") + "</div>" +
        (sceneHtml || '<div class="card-def big">' + this.esc(group.words[0].ent.t || "") + "</div>") +
        '<div class="sense-list">' + wordBlocks + "</div>" +
        this.navBar("btnBack", "btnPhaseNext", "CONTINUE TO RECOGNIZE", s.gi === 0) +
        '<div class="card-index">SCENE AUDIO PLAYS AUTOMATICALLY — EVERY WORD IN CONTEXT</div>' +
        "</div>";
      const sceneAudio = sceneSents[0] || item.ent.w;
      const sceneEl = $("sceneTxt0");
      // every scene sentence gets its own play button (a scene can
      // carry two sentences — both must be hearable)
      sceneSents.forEach((s2, i) => {
        const b = $("btnScenePlay" + i);
        if (b) b.addEventListener("click", () => this.speakScene(s2, $("sceneTxt" + i)));
      });
      // per-word play buttons replace the bottom audio bar
      $("cardStage").querySelectorAll(".word-play").forEach((b) => {
        b.addEventListener("click", () => this.speak(b.dataset.play));
      });
      // auto-play the whole scene sentence with word highlighting
      setTimeout(() => this.speakScene(sceneAudio, sceneEl), 350);
      $("btnPhaseNext").addEventListener("click", () => {
        s.phase = "recognize";
        this.renderPhase();
      });
      const backEl = $("btnBack");
      if (backEl) backEl.addEventListener("click", () => this.goBack());
    },

    /* word meta line: phonetic + root/family, shown under the word
     * in MEANING and RECOGNIZE so "from the root" is always visible */
    metaHtml(item) {
      const ent = item.ent;
      const phone = (ent.uk || ent.us || "").replace(/^\[|\]$/g, "");
      let html = '<div class="word-meta">';
      if (phone) html += '<span class="word-phone">' + this.esc(phone) + "</span>";
      const fam = Lexicon.wordFamily(item.key);
      if (fam.roots.length) {
        html += '<span class="word-root">' + fam.roots.map((r) =>
          "ROOT " + this.esc(r.r) + "- " + this.esc(r.m)).join(" · ") + "</span>";
      } else if (fam.family.length) {
        html += '<span class="word-root">同族: ' + this.esc(fam.family.slice(0, 3).join(", ")) + "</span>";
      }
      // 100-sentence deck note: [中文义, 搭配, 构词联想]
      const note = Lexicon.noteOf(item.key);
      if (note && note[2]) {
        html += '<span class="word-note">' + this.esc(note[2]) + "</span>";
      }
      html += "</div>";
      return html;
    },

    /* recognition-choice distractor pool: words of the same theme
     * first (similar meanings make for harder, more useful choices) */
    /* shuffle a stable iterable so distractors differ every card */
    _shuffled(arr) {
      const a = Array.from(arr);
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },

    _distractors(key, n) {
      const out = [];
      const seen = new Set([key]);
      const cur = Lexicon.currentTheme();
      // random draws from the theme pool — never the same three
      // faces on every card
      const pool = cur ? this._shuffled(Lexicon.themePool(cur.id)) : [];
      const all = this._shuffled(Lexicon.load().keys());
      // strict pass first (clean short Chinese glosses), then a
      // lenient pass so options never come up short
      const addPool = (ws, strict) => {
        for (const w of ws) {
          if (seen.has(w)) continue;
          const zh = this.zhHead(w);
          if (!zh) continue;
          if (strict && (zh.includes("（") || zh.length > 24)) continue;
          if (zh.length > 64) continue;
          seen.add(w);
          out.push(zh);
          if (out.length >= n) return true;
        }
        return false;
      };
      if (addPool(pool, true) || addPool(pool, false)) return out;
      if (addPool(all, true) || addPool(all, false)) return out;
      return out;
    },

    /* first sense of a word: Chinese gloss when available, else the
     * English definition (core-vocab words have no Chinese gloss) —
     * recognition options must never render blank */
    zhHead(key) {
      const senses = Lexicon.senses(key);
      for (const s2 of senses) {
        if (s2.zh) return String(s2.zh).replace(/【[^】]*】/g, " ").split(/[；;]/)[0].trim();
      }
      const ent = Lexicon.get(key);
      const t = ent && ent.t ? String(ent.t) : "";
      const g = Lexicon._cleanGloss ? Lexicon._cleanGloss(t.split(/[；;]/)[0]).replace(/^[a-z]+\.\s*/i, "").trim() :
        t.replace(/【[^】]*】/g, " ").split(/[；;]/)[0].replace(/^[a-z]+\.\s*/i, "").trim();
      if (g) return g;
      // paraphrase-table fallback: head words missing from the lexicon
      // (start/need/easy…) still get their Chinese meaning
      const pzh = global.PARAPHRASE_CORE && global.PARAPHRASE_CORE.zh && global.PARAPHRASE_CORE.zh[key];
      if (pzh) return pzh;
      if (ent && ent.d) {
        // skip self-referential definitions — they give the answer away
        const stem = Lexicon.stem(key);
        if (stem.length >= 4 && new RegExp("\\b" + stem + "[a-z]*\\b", "i").test(ent.d)) return null;
        const d = String(ent.d).split(/[;。]/)[0].trim();
        return d.length > 64 ? d.slice(0, 61) + "…" : d;
      }
      return null;
    },

    /* ---- phase 1.5: recognize the word's meaning (4-choice) ----
     * identification before recall: see the word (with root/family
     * and phonetic), pick its meaning; wrong picks are corrected
     * and cap the final grade at HARD. */
    renderRecognize(item) {
      const s = this.session;
      const ent = item.ent;
      const group = s.groups[s.gi];
      const zh = this.zhHead(item.key) || ent.t || "";
      const opts = [zh].concat(this._distractors(item.key, 3));
      // shuffle while keeping the answer in the list
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = opts[i]; opts[i] = opts[j]; opts[j] = tmp;
      }
      const ansIdx = opts.indexOf(zh);

      $("cardStage").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">SCENE ' + (s.gi + 1) + "/" + s.groups.length +
        " · RECOGNIZE " + (s.wi + 1) + "/" + group.words.length + "</span>" +
        '<span class="card-status learn">RECOGNITION</span>' +
        '<div class="sense-label">' + (item.isNew ? "STAGE 2 · PICK THE MEANING" : "STAGE 1 · PICK THE MEANING") + "</div>" +
        '<div class="recognize-word">' + this.esc(ent.w) + "</div>" +
        this.metaHtml(item) +
        '<div class="recognize-opts" id="recOpts">' +
        opts.map((o, i) => '<button class="rec-opt" data-i="' + i + '"><span class="rec-key">' + (i + 1) + "</span>" +
          this.esc(o) + "</button>").join("") +
        "</div>" +
        '<div class="typing-feedback" id="recFeedback"></div>' +
        '<div class="step-bar nav-bar" id="recNav" style="display:none">' +
        '<button class="btn" id="btnBack2">◀ BACK</button>' +
        '<button class="btn btn-primary" id="btnRecNext">' +
        (s.wi + 1 >= group.words.length ? "FINISH RECOGNITION ▸" : "NEXT WORD ▸") + "</button></div>" +
        '<div class="card-index">KEYS 1-4 TO PICK · ALL WORDS RECOGNIZED FIRST, THEN SPELLING</div>' +
        "</div>";

      const fb = $("recFeedback");
      const nav = $("recNav");
      const optsEl = $("recOpts");
      const lock = () => {
        optsEl.querySelectorAll(".rec-opt").forEach((b) => (b.disabled = true));
        nav.style.display = "flex";
      };
      const pick = (idx) => {
        if (fb.dataset.done) return;
        fb.dataset.done = "1";
        const correct = idx === ansIdx;
        s.scores[item.key] = Object.assign({ recOk: correct ? 1 : 0 }, s.scores[item.key]);
        optsEl.querySelectorAll(".rec-opt").forEach((b, i) => {
          b.classList.add(i === ansIdx ? "rec-correct" : (i === idx ? "rec-wrong" : "rec-dim"));
        });
        fb.className = "typing-feedback " + (correct ? "ok" : "err");
        fb.textContent = correct
          ? "✓ " + zh
          : "✗ " + opts[idx] + " — CORRECT: " + zh;
        lock();
      };
      optsEl.querySelectorAll(".rec-opt").forEach((b) =>
        b.addEventListener("click", () => pick(parseInt(b.dataset.i, 10))));
      const onKey = (e) => {
        if (e.key >= "1" && e.key <= "4") {
          const i = parseInt(e.key, 10) - 1;
          if (i < opts.length) pick(i);
        } else if (e.key === "Enter") {
          if (fb.dataset.done) this.goNext();
        } else if (e.key === " ") {
          e.preventDefault();
          this.speak(ent.w);
        }
      };
      this._recKeyHandler = onKey;
      document.addEventListener("keydown", onKey);
      $("btnRecNext").addEventListener("click", () => this.goNext());
      $("btnBack2").addEventListener("click", () => this.goBack());
    },

    /* ---- phase 2: spell with letter-by-letter hints ---- */
    _hint: 0,

    renderSpell(item) {
      const s = this.session;
      const ent = item.ent;
      const group = s.groups[s.gi];
      this._hint = 0;
      const senses = Lexicon.senses(item.key);
      const showTrans = Lexicon.state().settings.showTrans;
      const sceneTxt = group.scene || Lexicon.exampleSentences(item.key, 1)[0] || ent.w;
      const wordLen = ent.w.length;
      const blankLen = "_".repeat(wordLen);
      $("cardStage").innerHTML =
        '<div class="card sense-card typing-card">' +
        '<span class="card-wp">SCENE ' + (s.gi + 1) + "/" + s.groups.length +
        " · SPELL " + (s.wi + 1) + "/" + group.words.length + "</span>" +
        '<span class="card-status learn">WORD SPELLING</span>' +
        '<div class="sense-label">STAGE 2 · HEAR THE WORD — SPELL WITH HINTS</div>' +
        '<div class="sense-list">' + (this.senseListHtml(senses, showTrans, ent.w) ||
          '<div class="sense-text">' + this.esc(ent.t || "") + "</div>") + "</div>" +
        '<div class="card-tts">' +
        '<button class="tts-btn" id="btnWord2">◉ PLAY WORD</button> ' +
        '<button class="tts-btn" id="btnScene2">◉ PLAY SCENE</button></div>' +
        '<div class="spell-hint" id="spellHint">' + blankLen + "</div>" +
        '<div class="typing-row"><span class="typing-prompt">TYPE &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="TYPE THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        this.navBar("btnBack", "btnSkip", "SKIP") +
        '<div class="card-index">WORD LENGTH SHOWN · ENTER CHECK · SPACE RE-HEAR</div>' +
        "</div>";
      $("btnWord2").addEventListener("click", () => this.speak(ent.w));
      $("btnScene2").addEventListener("click", () => this.speakScene(sceneTxt));
      $("btnBack").addEventListener("click", () => this.goBack());
      $("btnSkip").addEventListener("click", () => this.goNext());
      const input = $("typingInput");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.checkSpell();
        // SPACE replays audio only while the field is empty — once
        // typing (incl. multi-word phrases like "a number of") the
        // space must be insertable, audio stays on the ◉ buttons
        else if (e.key === " " && !input.value) { e.preventDefault(); this.speak(ent.w); }
      });
    },

    checkSpell() {
      const s = this.session;
      const item = this.curWord();
      const target = item.ent.w.toLowerCase();
      const input = $("typingInput");
      const fb = $("typingFeedback");
      const hint = $("spellHint");
      const ans = this.norm(input.value);
      const targetNorm = this.norm(target);

      // strict: the normalized input must equal the target exactly.
      // Revealing all letters never auto-passes — a wrong spelling
      // (submaring) stays wrong even with the full word on screen
      if (ans === targetNorm) {
        const withHints = this._hint > 0;
        const prev = s.scores[item.key] || {};
        s.scores[item.key] = { recOk: prev.recOk == null ? 1 : prev.recOk, spell: withHints ? 0.5 : 1, gapOk: 0, gapTotal: 0 };
        fb.className = "typing-feedback ok";
        fb.textContent = "✓ CORRECT" + (withHints ? " (WITH " + this._hint + " LETTER HINT" + (this._hint > 1 ? "S" : "") + ")" : " — NO HINTS");
        hint.textContent = "";
        input.readOnly = true;
        // phase advance is handled by the global Enter shortcut
        // (read-only inputs still bubble), so pressing Enter once
        // never double-steps across spell/gap
        return;
      }
      // wrong: reveal one more letter (never beyond the word length)
      this._hint = Math.min(this._hint + 1, target.length);
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
      const group = s.groups[s.gi];
      const sents = [];
      // the shared scene sentence first, then a second one for variety
      if (group.scene) sents.push(group.scene);
      for (const x of Lexicon.exampleSentences(item.key, 2)) {
        if (sents.indexOf(x) === -1) sents.push(x);
        if (sents.length >= 2) break;
      }
      if (!sents.length) {
        // no real sentences: skip gap-fill
        this.finishWord();
        return;
      }
      // remember which word the gap channel belongs to (the spell
      // channel walks a shuffled order) and jump to its fill cards
      s.gapWord = s.spellOrder[s.wi];
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
      const group = s.groups[s.gi];
      const sentence = this._gaps[this._gapIdx];
      let blanked = this.blankWord(sentence, ent.w);
      // the other group words stay visible in the scene
      const others = group.words.filter((w) => w.key !== item.key).map((w) => w.ent.w);
      if (others.length) blanked = this.highlightWords(blanked, others);

      $("cardStage").innerHTML =
        '<div class="card sense-card typing-card">' +
        '<span class="card-wp">SCENE ' + (s.gi + 1) + "/" + s.groups.length +
        " · FILL " + (this._gapIdx + 1) + "/" + this._gaps.length + "</span>" +
        '<span class="card-status learn">SCENE SPELLING</span>' +
        '<div class="sense-label">STAGE 3 · LISTEN TO THE SCENE — SPELL IT IN CONTEXT (' + (this._gapIdx + 1) + "/" + this._gaps.length + ")</div>" +
        '<div class="card-example big">“' + blanked + '”</div>' +
        '<div class="typing-row"><span class="typing-prompt">TYPE &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="FILL THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        this.navBar("btnBack", "btnSkip", "SKIP") +
        '<div class="card-index">ENTER CHECK · SPACE RE-HEAR</div>' +
        "</div>";
      const input = $("typingInput");
      const sceneEl = $("cardStage").querySelector(".card-example.big");
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.checkGap();
        // same rule as spelling: empty field = SPACE replays audio,
        // typing (incl. phrases) = space inserts normally
        else if (e.key === " " && !input.value) { e.preventDefault(); this.speakScene(sentence, sceneEl); }
      });
      $("btnBack").addEventListener("click", () => this.goBack());
      $("btnSkip").addEventListener("click", () => this.goNext());
      // hear the whole sentence with word highlighting, then fill the gap
      setTimeout(() => this.speakScene(sentence, sceneEl), 300);
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
      // accept the exact word or a real inflection — never a mere
      // stem collision (bannedd must not pass for banned)
      const ok = this._gapOk(ans, expected);
      const sc = s.scores[item.key];
      sc.gapTotal++;
      if (ok) sc.gapOk++;
      fb.className = "typing-feedback " + (ok ? "ok" : "err");
      fb.textContent = ok ? "✓ FILLED CORRECTLY" : "✗ " + expected;
      if (ok) {
        // correct: lock the field; Enter (global shortcut) advances
        input.readOnly = true;
      } else {
        // wrong: stay locked in — clear the field and require a
        // correct retry before the card can move on
        input.value = "";
        input.focus();
        input.classList.add("shake");
        setTimeout(() => input.classList.remove("shake"), 400);
      }
    },

    /* strict gap-fill acceptance: exact word, the bare root
     * (banned → ban), or a genuine inflection of it.
     *
     * Inflected expected (banned, stem ≠ word): accept the bare
     * root or any same-stem inflection (ban/banning/bans), nothing
     * else — bannedd/bannned never pass.
     *
     * Bare expected (run/study/box/go/watch): apply exact rules —
     *   consonant+y → -ies/-ied/-ying (studies/tried/studying)
     *   s/x/z/ch/sh → -es (boxes/watches); boxs/watchs ✗
     *   closed syllable → doubled -ing/-ed (stopping); stoping ✗
     *   -s 3rd person allowed for closed syllables (runs)
     *   -d past only after -e (liked)
     *   -ly derivations rejected (largely ≠ large) */
    _gapOk(ans, expected) {
      const a = this.norm(ans), e = this.norm(expected);
      if (a === e) return true;
      const base = Lexicon.stem(e);
      if (base !== e) {
        // inflected expected: same-stem inflections only
        const roots = [base];
        if (base.length > 3 && base.endsWith(base[base.length - 1] + base[base.length - 1])) {
          roots.push(base.slice(0, -1));
        }
        const TAILS = ["", "s", "es", "ed", "d", "ing", "ies", "y"];
        for (const r of roots) {
          if (a === r) return true;
          if (a.startsWith(r) && a.length - r.length <= 3) {
            const tail = a.slice(r.length);
            // doubled stem never takes -s (banns ✗; the 3rd person
            // of banned is bans)
            if (TAILS.includes(tail) && !(tail === "s" && r.length > 3 &&
                r.endsWith(r[r.length - 1] + r[r.length - 1]))) return true;
          }
        }
        return false;
      }
      // bare expected: exact inflection rules
      const last = e.slice(-1);
      const penult = e.slice(-2, -1);
      if (last === "y" && penult && !"aeiou".includes(penult)) {
        return a === e.slice(0, -1) + "ies" || a === e.slice(0, -1) + "ied" || a === e + "ing";
      }
      if ("sxz".includes(last) || e.endsWith("ch") || e.endsWith("sh")) {
        return a === e + "es" || a === e + "ed";
      }
      // -o endings pluralise with -es (go → goes); gos ✗, but
      // -ing/-ed stay regular (going/echoed)
      if (last === "o") {
        return a === e + "es" || a === e + "ing" || a === e + "ed";
      }
      // closed syllable (short word only): -ing/-ed must double the
      // consonant; y never doubles (buying); happen never doubles
      if (last !== "y" && e.length <= 4 && penult && "aeiou".includes(penult) &&
          !"aeiou".includes(last) && last !== "e") {
        return a === e + last + "ing" || a === e + last + "ed" || a === e + "s";
      }
      // -el endings may double in BrE (travelling/travelled)
      if (e.endsWith("el") && penult && "aeiou".includes(penult)) {
        if (a === e + "ling" || a === e + "led") return true;
      }
      if (a.startsWith(e) && a.length - e.length <= 3) {
        const tail = a.slice(e.length);
        if (tail === "d") return last === "e";
        return ["s", "es", "ed", "ing", "y"].includes(tail);
      }
      return false;
    },

    gapNext() {
      const s = this.session;
      if (!s || s.phase !== "gap") return;
      this._gapIdx++;
      if (this._gapIdx >= this._gaps.length) {
        // word finished all its fill cards — settle it, then continue
        // the spelling channel with the next shuffled word
        this.finishWord();
      } else {
        this.renderGap(this.curWord());
      }
    },

    blankWord(sentence, word) {
      const re = new RegExp("\\b" + Lexicon.stem(word.toLowerCase()) + "[a-z]*\\b", "gi");
      return String(sentence).replace(re, "______");
    },

    /* highlight every study word present in the sentence */
    highlightWords(sentence, words) {
      const stems = words.map((w) => Lexicon.escapeRegExp(Lexicon.stem(String(w).toLowerCase())));
      const re = new RegExp("\\b(" + stems.join("|") + ")[a-z]*\\b", "gi");
      return this.esc(String(sentence)).replace(re, '<span class="scene-word">$&</span>');
    },

    finishWord() {
      const s = this.session;
      const item = this.curWord();
      const sc = s.scores[item.key] || { recOk: 1, spell: 0, gapOk: 0, gapTotal: 0 };
      const total = 1 + (sc.gapTotal || 0);
      const got = (sc.spell || 0) + (sc.gapOk || 0);
      const rate = got / total;
      let q = rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : rate >= 0.5 ? 1 : 0;
      // recognition failure caps the grade — identification before recall
      if (sc.recOk === 0 && q > 1) q = 1;
      /* tiered grading by word priority (p: 0 core / 1 extended /
       * 2 supplement) — the pass bar reflects how much the word
       * matters: core words must not be misidentified, supplement
       * words (listening deck) pass on recognition alone */
      const p = item.ent && item.ent.p != null ? item.ent.p : 1;
      if (p === 0 && sc.recOk === 0) q = 0;          // core: miss → AGAIN
      if (p === 2 && sc.recOk === 1) q = Math.max(q, 2); // supplement: know it → GOOD
      this.applyGrade(item, q);
      // word done — resume the spelling channel with the next word
      // (gap channel returns to the shuffled spell order)
      if (s.phase === "gap") s.phase = "spell";
      s.wi++;
      if (s.wi >= s.groups[s.gi].words.length) {
        s.phase = "result";
        this.renderPhase();
      } else {
        this.renderPhase();
      }
    },

    renderGroupResult() {
      const s = this.session;
      const group = s.groups[s.gi];
      let rows = "";
      let sum = 0;
      for (const item of group.words) {
        const sc = s.scores[item.key] || { spell: 0, gapOk: 0, gapTotal: 0 };
        const total = 1 + (sc.gapTotal || 0);
        const rate = (sc.spell || 0) + (sc.gapOk || 0);
        const pct = Math.round((rate / total) * 100);
        sum += pct;
        // grade shown must match the applied q: a failed recognition
        // caps the grade at HARD even when typing was perfect; core
        // words (p=0) drop to AGAIN on a recognition miss; supplement
        // words (p=2) pass at GOOD when recognized
        const p = item.ent && item.ent.p != null ? item.ent.p : 1;
        let effPct = pct;
        if (p === 0 && sc.recOk === 0) effPct = Math.min(effPct, 49);
        else if (sc.recOk === 0) effPct = Math.min(effPct, 69);
        else if (p === 2 && sc.recOk === 1) effPct = Math.max(effPct, 70);
        const label = effPct >= 90 ? "EASY" : effPct >= 70 ? "GOOD" : effPct >= 50 ? "HARD" : "AGAIN";
        const cls = effPct >= 70 ? "ok" : effPct >= 50 ? "warn" : "err";
        rows += '<div class="gr-row"><span class="gr-word">' + this.esc(item.ent.w) + "</span>" +
          '<div class="statbar"><div class="statbar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="gr-rate ' + cls + '">' + pct + "% · " + label + (sc.recOk === 0 ? " · REC ✗" : "") + "</span></div>";
      }
      const groupPct = Math.round(sum / group.words.length);
      $("mcMode").textContent = "GROUP COMPLETE";
      $("mcMeta").textContent = "SCENE " + (s.gi + 1) + "/" + s.groups.length +
        " · SUCCESS " + groupPct + "%";
      $("cardStage").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">SCENE ' + (s.gi + 1) + "/" + s.groups.length + "</span>" +
        '<span class="card-status ' + (groupPct >= 70 ? "mature" : groupPct >= 50 ? "learn" : "new") + '">' +
        (groupPct >= 90 ? "EXCELLENT" : groupPct >= 70 ? "GOOD" : groupPct >= 50 ? "REVIEW NEEDED" : "WEAK") + "</span>" +
        '<div class="sense-label">GROUP SUCCESS RATE — WORDS PLACED ON THE MEMORY CURVE</div>' +
        (group.scene ? '<div class="scene-sentence gr-scene">“' +
          this.highlightWords(group.scene, group.words.map((w) => w.ent.w)) + '”</div>' : "") +
        '<div class="gr-list">' + rows + "</div>" +
        '<div class="step-bar nav-bar">' +
        (s.gi > 0 ? '<button class="btn" id="btnBackRes">◀ BACK</button>' : '<span></span>') +
        '<button class="btn btn-primary" id="btnNextGroup">' +
        (s.gi + 1 < s.groups.length ? "NEXT GROUP ▸" : "FINISH SESSION ▸") + "</button></div>" +
        "</div>";
      const backRes = $("btnBackRes");
      if (backRes) backRes.addEventListener("click", () => this.goBack());
      $("btnNextGroup").addEventListener("click", () => {
        s.gi++;
        s.wi = 0;
        if (s.gi >= s.groups.length) { this.endSession(); return; }
        s.phase = s.groups[s.gi].words[0].isNew ? "meaning" : "recognize";
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
      // auto-clear: a hot-zone word answered well leaves the zone —
      // no manual UNFLAG needed; if it is still weak it stays and
      // re-enters tomorrow's queue
      if (q >= 2 && Lexicon.isUnfamiliar(item.key)) {
        Lexicon.removeUnfamiliar(item.key);
      }
      // a pending word from the paraphrase mistakes box that was
      // answered at least HARD (q>=1) is now a real card — leave the
      // pending box (AGAIN keeps it there for the next session)
      if (q >= 1 && item.pending) Lexicon.removePpPending(item.key);
      Lexicon.setCard(item.key, updated);
      if (q === 0) s.failed++;
      else if (item.isNew) s.newDone++;
      else s.revDone++;
    },

    /* partial session accounting: bank the words graded so far into
     * today's history (new/review counts + streak) without requiring
     * the whole session to finish. endSession() logs only the delta. */
    partialLog() {
      const s = this.session;
      if (!s) return;
      const n = s.newDone - s._logged.n;
      const r = s.revDone - s._logged.r;
      if (n <= 0 && r <= 0) return;
      Lexicon.logStudy(n, r);
      s._logged.n = s.newDone;
      s._logged.r = s.revDone;
    },

    endSession() {
      const s = this.session;
      const lg = s._logged || { n: 0, r: 0 };
      Lexicon.logStudy(s.newDone - lg.n, s.revDone - lg.r);
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
    /* pick the best available en-US voice: user choice first, then a
     * quality shortlist, then any en-US voice. Long texts are split
     * into segments so speech engines do not stutter. */
    pickVoice(st) {
      const voices = global.speechSynthesis.getVoices();
      if (st.voiceName) {
        const v = voices.find((x) => x.name === st.voiceName);
        if (v) return v;
      }
      return voices.find((x) => x.lang === "en-US" && /google|natural|samantha|aria|zira|daniel|karen|jenny|libby|susan|hazel/i.test(x.name)) ||
             voices.find((x) => x.lang === "en-US") || null;
    },

    speak(text) {
      const st = Lexicon.state().settings;
      if (!st.voice) return;
      const t = String(text || "").trim();
      if (!t) return;
      // online neural TTS first — runtime-detected, falls back to local
      if (t.length <= 160 && this.tryOnlineTTS(t)) return;
      this.speakLocal(t);
    },

    /* try free high-quality online engines in order; each failure
     * falls through to the next, finally to the local synthesizer.
     * Works wherever the learner's browser can reach them. */
    tryOnlineTTS(text) {
      const engines = [
        "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=" + encodeURIComponent(text),
        "https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=" + encodeURIComponent(text)
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= engines.length) {
          this.speakLocal(text);
          return false;
        }
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
        } catch (e) {
          return tryNext();
        }
      };
      return tryNext();
    },

    speakLocal(text) {
      const st = Lexicon.state().settings;
      try {
        global.speechSynthesis.cancel();
        // split long utterances at sentence/clause boundaries to avoid
        // stutter — but Chrome drops queued utterances after cancel(),
        // so each part must chain on the previous one's onend
        const parts = String(text).length > 140 ? String(text).split(/(?<=[.!?;,])\s+/) : [text];
        const voice = this.pickVoice(st);
        let i = 0;
        const speakNext = () => {
          while (i < parts.length && !String(parts[i]).trim()) i++;
          if (i >= parts.length) return;
          const u = new SpeechSynthesisUtterance(String(parts[i]).trim());
          i++;
          u.lang = "en-US";
          u.rate = st.rate || 0.9;
          if (voice) u.voice = voice;
          u.onend = speakNext;
          u.onerror = speakNext;
          global.speechSynthesis.speak(u);
        };
        speakNext();
      } catch (e) { /* TTS unavailable */ }
    },

    /* ---- karaoke scene playback ----
     * Reads the whole scene sentence aloud in word chunks while the
     * chunk being spoken is highlighted in the scene display. Fixes
     * the "only the first word plays" problem AND shows the learner
     * exactly which word is being read. Falls back to plain
     * playback when no scene element is on screen. */
    speakScene(sentence, sceneEl) {
      const st = Lexicon.state().settings;
      if (!st.voice) return;
      const text = String(sentence || "").trim();
      if (!text) return;
      try {
        global.speechSynthesis.cancel();
        // chunk by clause, then split long clauses into ≤8-word groups
        const chunks = [];
        const clauses = text.split(/(?<=[.!?;,])\s+/);
        for (const c of clauses) {
          const toks = String(c).match(/[A-Za-z][A-Za-z'-]*/g) || [];
          if (toks.length > 8) {
            const words = String(c).split(/\s+/);
            for (let i = 0; i < words.length; i += 8) chunks.push(words.slice(i, i + 8).join(" "));
          } else {
            chunks.push(c);
          }
        }
        const voice = this.pickVoice(st);
        const spans = sceneEl ? Array.from(sceneEl.querySelectorAll(".scene-word")) : [];
        const clearHighlight = () => {
          if (!sceneEl) return;
          sceneEl.querySelectorAll(".scene-word.speaking").forEach((s) => s.classList.remove("speaking"));
        };
        let ci = 0;
        const speakChunk = () => {
          if (ci >= chunks.length) { clearHighlight(); return; }
          const chunk = String(chunks[ci]).trim();
          ci++;
          if (!chunk) { speakChunk(); return; }
          // highlight every scene word present in this chunk
          if (spans.length) {
            clearHighlight();
            const toks = chunk.toLowerCase().match(/[a-z][a-z'-]*/g) || [];
            for (const sp of spans) {
              const w = sp.textContent.toLowerCase().replace(/[^a-z'-]/g, "");
              if (w && toks.indexOf(w) !== -1) sp.classList.add("speaking");
            }
          }
          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = "en-US";
          u.rate = st.rate || 0.9;
          if (voice) u.voice = voice;
          u.onend = speakChunk;
          u.onerror = speakChunk;
          global.speechSynthesis.speak(u);
        };
        speakChunk();
      } catch (e) { this.speakLocal(text); }
    },

    /* ================= memory deck ================= */
    _deckFilter: "all",
    _deckPage: 0,

    renderDeck() {
      const cards = Lexicon.cards();
      const unf = Lexicon.unfamiliarList();
      const now = Date.now();
      const rows = [];
      // hot-zone words first — including flagged words with no card
      // yet (flagged in practice), so they are always visible and
      // manageable from the deck
      for (const key in unf) {
        if (cards[key]) continue; // handled below with its card
        // no card -> stage "new": only reachable via ALL or HOT ZONE
        if (this._deckFilter !== "all" && this._deckFilter !== "hot") continue;
        const ent = Lexicon.get(key) || { w: key, t: "", us: "", uk: "", p: 2, d: "", e: "" };
        rows.push({ key, ent, card: null, stage: "new", hot: true, src: unf[key].src });
      }
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
      // hot zone first, then by due
      rows.sort((a, b) => {
        if (a.hot !== b.hot) return a.hot ? -1 : 1;
        return ((a.card && a.card.due) || 0) - ((b.card && b.card.due) || 0);
      });

      $("dkCount").textContent = rows.length + " WORDS";
      // summary is the whole-deck distribution, independent of the
      // active filter (HOT ZONE already counts the full collection)
      const stageCount = { learning: 0, consolidating: 0, mastered: 0 };
      for (const key in cards) {
        const st = SRS.stage(cards[key]);
        if (stageCount[st] !== undefined) stageCount[st]++;
      }
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
        if (!card || !card.due) return "NEW";
        const d = card.due - now;
        if (d <= 0) return "DUE NOW";
        const h = Math.round(d / 3600000);
        if (h < 48) return "IN " + h + "H";
        return "IN " + Math.round(d / DAY) + "D";
      };

      $("dkList").innerHTML = slice.map((r) =>
        '<div class="dk-row">' +
        '<span class="dk-word">' + this.esc(r.ent.w) +
        (r.ent.p === 0 ? ' <span class="core-star" title="CORE WORD">★</span>' : "") +
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
        b.addEventListener("click", () => { Lexicon.addUnfamiliar(b.dataset.flag, "manual"); this.renderDeck(); this.renderAll(); }));
      $("dkList").querySelectorAll("[data-unflag]").forEach((b) =>
        b.addEventListener("click", () => { Lexicon.removeUnfamiliar(b.dataset.unflag); this.renderDeck(); this.renderAll(); }));
    },

    /* force a single word into an immediate review session */
    forceReview(key) {
      const ent = Lexicon.get(key);
      if (!ent) return;
      const card = Lexicon.getCard(key) || SRS.fresh();
      const due = Lexicon.dueCards().filter((d) => d.key !== key);
      const queue = due.map((d) => ({ key: d.key, ent: Lexicon.get(d.key), card: d.card, isNew: false, hot: Lexicon.isUnfamiliar(d.key) }));
      // a flagged word without a card yet (practice-flagged) is still
      // new — it must walk the full MEANING -> RECOGNIZE -> SPELL chain
      queue.unshift({ key, ent, card, isNew: !card, hot: Lexicon.isUnfamiliar(key) });
      const groups = this.buildGroups(queue, true);
      this.session = {
        queue, groups, gi: 0, wi: 0,
        phase: (groups[0] && groups[0].words[0].isNew) ? "meaning" : "recognize",
        spellOrder: null, gapWord: null,
        scores: {}, newDone: 0, revDone: 0, failed: 0,
        _logged: { n: 0, r: 0 },
        startedAt: new Date().toISOString()
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
        // multi-word phrases live in the PHRASES module — the word
        // library shows single words only (searching a phrase shows
        // its component words instead)
        if (Lexicon.isPhrase(key)) {
          if (!q) return;
          const hit = key.includes(q) || String(ent.t || "").includes(q);
          if (!hit) return;
        }
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
      const wordTotal = total - Lexicon.phraseList().length;
      const counts = Lexicon.cardCounts();
      $("lgCount").textContent = wordTotal.toLocaleString() + " WORDS · " + Lexicon.phraseList().length + " PHRASES";
      $("lgSummary").innerHTML =
        "<span>DECK <b>" + wordTotal.toLocaleString() + "</b></span>" +
        "<span>LEARNING <b>" + counts.learning + "</b></span>" +
        "<span>MATURE <b>" + counts.mature + "</b></span>" +
        "<span>DUE <b>" + counts.due + "</b></span>";

      const PER = 100;
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      if (this._logPage >= pages) this._logPage = pages - 1;
      const page = this._logPage;
      const slice = rows.slice(page * PER, (page + 1) * PER);

      const customSet = new Set(Object.keys(Lexicon.getCustom()));
      $("lgList").innerHTML = slice.map((r) =>
        '<div class="log-row">' +
        '<span class="log-word">' + this.esc(r.ent.w) +
        (r.ent.p === 0 ? ' <span class="core-star" title="CORE WORD">★</span>' : "") +
        (customSet.has(r.key) ?
          ' <span class="log-custom">CUSTOM</span>' : "") + "</span>" +
        '<span class="log-trans">' + this.esc(Lexicon._cleanGloss ? Lexicon._cleanGloss(r.ent.t) : r.ent.t) + "</span>" +
        '<span class="log-state"><span class="' + r.cls + '">' + r.state + "</span>" +
        (customSet.has(r.key) ? '<button class="btn log-del" title="REMOVE CUSTOM WORD" data-del="' + this.esc(r.key) + '">✕</button>' : "") +
        "</span>" +
        "</div>").join("") || '<div class="log-row"><span class="log-word">NO MATCHES</span></div>';
      $("lgList").querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", () => {
          if (confirm("REMOVE CUSTOM WORD: " + b.dataset.del + "?")) {
            Lexicon.removeCustom(b.dataset.del);
            this.renderLog();
            this.renderAll();
          }
        }));

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
              this.renderLog();
          this.renderAll();
          global.alert("IMPORTED — RECORDS: " + n);
        } catch (e) {
          global.alert("IMPORT FAILED: " + e.message);
        }
      };
      reader.readAsText(file);
    },

    /* ---- speaking core (最简口语模块 · 6.0 秘籍) ----
     * 16 words (8 reason + 8 result) + fixed pairs, Part1 秘籍,
     * Part2 万能故事 and Part3 三件套 — every English item carries
     * a ◉ PLAY button wired to the shared TTS chain. */
    renderSpeaking() {
      const S = global.SPEAKING_CORE || {};
      const root = $("spkRoot");
      if (!root || !S.reasons) return;

      const zhOf = (arr, en) => {
        const row = (arr || []).find((r) => r[0] === en);
        return row ? row[1] : "";
      };
      const play = (en) => '<button class="tts-btn spk-play" title="PLAY" data-spk="' + this.esc(en) + '">◉</button>';
      const head = (title, sub) =>
        '<div class="spk-head"><span class="spk-title">' + title + "</span>" +
        (sub ? '<span class="spk-sub">' + sub + "</span>" : "") + "</div>";
      const block = (title, sub, inner) =>
        '<div class="spk-block">' + head(title, sub) + inner + "</div>";

      const wordChip = (en, zh) =>
        '<span class="spk-word">' + this.esc(en) + play(en) +
        '<span class="spk-zh">' + this.esc(zh) + "</span></span>";
      const wordGrid = (title, sub, arr) =>
        block(title, sub, '<div class="spk-grid">' + arr.map((r) => wordChip(r[0], r[1])).join("") + "</div>");

      const pairRows = (S.pairs || []).map((p) =>
        '<div class="spk-pair">' +
        '<span class="spk-pair-a">' + this.esc(p[0]) + "</span>" +
        '<span class="spk-pair-arrow">→</span>' +
        '<span class="spk-pair-b">' + this.esc(p[1]) + "</span>" + play(p[0] + ". So " + p[1]) +
        '<span class="spk-zh">' + this.esc(zhOf(S.results, p[1])) + "</span>" +
        "</div>").join("");

      const tplCard = (label, arr) =>
        block(label, null,
          arr.map((r) =>
            '<div class="spk-tpl">' +
            '<div class="spk-tpl-en">' + this.esc(r[0]) + play(r[0]) + "</div>" +
            '<div class="spk-tpl-zh">' + this.esc(r[1]) + "</div></div>").join(""));

      /* ---- Part1 秘籍：开头 + 固定理由 + 真题 ---- */
      const p1 = S.part1 || {};
      const p1qa = (p1.examples || []).map((x) =>
        '<div class="spk-qa">' +
        '<div class="spk-qa-q"><span class="spk-qa-tag">Q</span>' + this.esc(x.q) + play(x.q) +
        '<span class="spk-zh">' + this.esc(x.qz) + "</span></div>" +
        '<div class="spk-qa-a"><span class="spk-qa-tag">A</span>' + this.esc(x.a) + play(x.a) +
        '<span class="spk-zh">' + this.esc(x.az) + "</span></div></div>").join("");
      const part1Html =
        block("PART 1 · 秘籍", p1.rule + " — " + (p1.ruleZh || ""),
          block("开头 · 选一个", null, '<div class="spk-grid">' +
            (p1.openers || []).map((r) => wordChip(r[0], r[1])).join("") + "</div>") +
          block("固定理由 · 只背 1 句", null, '<div class="spk-grid">' +
            (p1.fixedReasons || []).map((r) => wordChip(r[0], r[1])).join("") + "</div>") +
          block("真题示范", "答 2 句 → 停", p1qa));

      /* ---- Part2 万能故事 ---- */
      const p2 = S.part2 || {};
      const p2struct = (p2.structure || []).map((s) =>
        '<div class="spk-tpl spk-part2">' +
        '<span class="spk-part2-tag">' + this.esc(s.tag) + "</span>" +
        '<span class="spk-tpl-en">' + this.esc(s.en) + play(s.en) + "</span>" +
        '<span class="spk-tpl-zh">' + this.esc(s.zh) + "</span></div>").join("");
      const part2Html =
        block("PART 2 · 万能故事", "一个故事套所有题",
          '<div class="spk-event">' + this.esc(p2.event || "") + "</div>" +
          block("关键词", null, '<div class="spk-grid">' +
            (p2.keywords || []).map((k) => '<span class="spk-word spk-kw">' + this.esc(k) + play(k) + "</span>").join("") + "</div>") +
          block("固定结构", "开头 → 中间 → 结尾", p2struct));

      /* ---- Part3 三件套 ---- */
      const p3 = S.part3kit || {};
      const kitOf = (key, label) => {
        const k = p3[key] || {};
        return block(label,
          '<span class="spk-when">' + this.esc(k.when) + '<span class="spk-zh">' + this.esc(k.whenZh || "") + "</span></span>",
          block("真题例子", null, '<div class="spk-grid">' +
            (k.examples || []).map((e) => '<span class="spk-word">' + this.esc(e) + play(e) + "</span>").join("") + "</div>") +
          block("固定接法", null, (k.formula || []).map((f) =>
            '<div class="spk-tpl"><div class="spk-tpl-en">' + this.esc(f[0]) + play(f[0]) +
            '</div><div class="spk-tpl-zh">' + this.esc(f[1]) + "</div></div>").join("")));
      };
      const part3Html =
        block("PART 3 · 三件套", "先选一个开头",
          block("开头三选一", null, '<div class="spk-grid">' +
            (p3.openers || []).map((r) => wordChip(r[0], r[1])).join("") + "</div>") +
          kitOf("yes", "用 YES 的题") +
          kitOf("notreally", "用 NOT REALLY 的题") +
          kitOf("depends", "用 IT DEPENDS 的题"));

      root.innerHTML =
        wordGrid("REASON WORDS", "8 · 原因词 · WHY", S.reasons || []) +
        wordGrid("RESULT WORDS", "8 · 结果词 · SO", S.results || []) +
        block("FIXED PAIRS", "8 GROUPS · 背死 · 原因 → 结果",
          '<div class="spk-pairs">' + pairRows + "</div>") +
        part1Html + part2Html + part3Html +
        tplCard("10-SECOND ANSWER · PART 1/2", S.quick || []) +
        tplCard("PART 3 · ONE-LINE TEMPLATE", S.part3 || []);

      root.querySelectorAll(".spk-play").forEach((b) =>
        b.addEventListener("click", () => this.speak(b.dataset.spk)));
    },

    /* ---- phrase bank (搭配短语) ----
     * Multi-word collocations ("air pollution", "bar code") get
     * their own 4-choice meaning quiz. Purely practice — no SRS
     * cards are written, phrases never enter the word queue. */
    _phQuiz: null,       // { list: [...], idx, score, done }
    _phPage: 0,
    _phSearch: "",

    renderPhrases() {
      const list = Lexicon.phraseList();
      const cards = Lexicon.cards();
      $("phCount").textContent = list.length + " PHRASES";

      // stats strip: total / learned / core / remaining
      const learned = list.filter((p) => cards[p.key]).length;
      const core = list.filter((p) => p.ent.p === 0).length;
      $("phStats").innerHTML =
        '<span>TOTAL <b>' + list.length + "</b></span>" +
        '<span>LEARNED <b>' + learned + "</b></span>" +
        '<span>CORE TIER <b>' + core + "</b></span>" +
        '<span>REMAINING <b>' + (list.length - learned) + "</b></span>";

      // quiz area: active quiz card or start prompt
      if (this._phQuiz && !this._phQuiz.done) {
        this.renderPhraseCard();
      } else if (this._phQuiz && this._phQuiz.done) {
        this.renderPhraseResult();
      } else {
        $("phQuiz").innerHTML =
          '<div class="card"><div class="card-word" style="font-size:16px">PHRASE QUIZ — PICK THE MEANING</div>' +
          '<div class="card-sub" style="color:var(--fg-dim);font-size:12px">' +
          "PRACTICE ONLY · NO SRS CARDS · CORE PHRASES FIRST · " + (list.length - learned) + " UNLEARNED</div></div>";
      }

      // list with search + pager
      const q = this._phSearch.toLowerCase();
      const rows = list.filter((p) => !q || p.key.includes(q));
      const PER = 100;
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      if (this._phPage >= pages) this._phPage = pages - 1;
      const slice = rows.slice(this._phPage * PER, (this._phPage + 1) * PER);
      $("phList").innerHTML = slice.map((p) => {
        // component words (拆解) — each is a single study word
        const comps = p.key.split(" ").map((w) =>
          '<span class="ph-list-comp">' + this.esc(w) +
          (Lexicon.get(w) ? '<button class="tts-btn spk-play" title="PLAY" data-spk="' + this.esc(w) + '">◉</button>' : "") +
          "</span>").join("+");
        return '<div class="log-row">' +
          '<span class="log-word">' + this.esc(p.key) +
          (p.ent.p === 0 ? ' <span class="core-star" title="CORE">★</span>' : "") + "</span>" +
          '<span class="log-trans">' + this.esc(this.zhHead(p.key) || p.ent.t || p.ent.d || "") +
          '<span class="ph-comps-inline">' + comps + "</span></span>" +
          '<span class="log-state"><span class="' + (cards[p.key] ? "mature" : "new") + '">' +
          (cards[p.key] ? "SEEN" : "NEW") + "</span>" +
          '<button class="btn dk-btn" data-phquiz="' + this.esc(p.key) + '">QUIZ</button></span>' +
          "</div>";
      }).join("") || '<div class="log-row"><span class="log-word">NO MATCHES</span></div>';
      $("phList").querySelectorAll("[data-phquiz]").forEach((b) =>
        b.addEventListener("click", () => this.phraseQuiz([b.dataset.phquiz])));
      // component-word play buttons (组成词发音)
      $("phList").querySelectorAll(".spk-play").forEach((b) =>
        b.addEventListener("click", () => this.speak(b.dataset.spk)));
      $("phPager").innerHTML =
        '<button class="btn" id="phPrev">◂ PREV</button>' +
        "<span>PAGE " + (this._phPage + 1) + " / " + pages + "</span>" +
        '<button class="btn" id="phNext">NEXT ▸</button>';
      $("phPrev").addEventListener("click", () => { if (this._phPage > 0) { this._phPage--; this.renderPhrases(); } });
      $("phNext").addEventListener("click", () => { if (this._phPage < pages - 1) { this._phPage++; this.renderPhrases(); } });
      $("phStart").addEventListener("click", () => this.phraseQuiz(null));
    },

    /* batch quiz: unlearned core phrases first, then the rest */
    phraseQuiz(keys) {
      const all = Lexicon.phraseList();
      const cards = Lexicon.cards();
      const pick = keys
        ? keys.map((k) => ({ key: k, ent: Lexicon.get(k) || {} }))
        : all.filter((p) => !cards[p.key]).concat(all.filter((p) => cards[p.key]));
      if (!pick.length) return;
      this._phQuiz = { list: pick, idx: 0, score: 0, done: false, wrong: [] };
      this._phPage = 0;
      this.renderPhrases();
    },

    renderPhraseCard() {
      const qz = this._phQuiz;
      const item = qz.list[qz.idx];
      const ent = item.ent || Lexicon.get(item.key) || {};
      const zh = this.zhHead(item.key) || ent.t || ent.d || "";
      // component words (拆解): every single word of the phrase is
      // itself a study word — shown with its own gloss and play
      const comps = item.key.split(" ").map((w) => {
        const e = Lexicon.get(w);
        const cz = e && (this.zhHead(w) || e.t || "");
        return '<span class="spk-word ph-comp">' + this.esc(w) +
          (e ? '<button class="tts-btn spk-play" title="PLAY" data-spk="' + this.esc(w) + '">◉</button>' : "") +
          (cz ? '<span class="spk-zh">' + this.esc(cz) + "</span>" : "") + "</span>";
      }).join('<span class="ph-comp-plus">+</span>');
      // distractors: zh heads of other phrases (same tier first)
      const pool = this._shuffled(Lexicon.phraseList().filter((p) => p.key !== item.key));
      const opts = [zh];
      const seen = new Set([zh]);
      for (const p of pool) {
        const z = this.zhHead(p.key) || p.ent.t || "";
        if (!z || seen.has(z)) continue;
        if (z.length > 64) continue;
        seen.add(z);
        opts.push(z);
        if (opts.length >= 4) break;
      }
      // shuffle options while keeping the answer
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
      }
      const ansIdx = opts.indexOf(zh);
      $("phQuiz").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">PHRASE ' + (qz.idx + 1) + "/" + qz.list.length +
        " · SCORE " + qz.score + "</span>" +
        '<span class="card-status learn">PHRASE RECOGNITION</span>' +
        '<div class="recognize-word">' + this.esc(item.key) + "</div>" +
        '<div class="ph-comps">' + comps + "</div>" +
        (ent.d ? '<div class="card-sub" style="color:var(--fg-dim);font-size:12px">' + this.esc(ent.d) + "</div>" : "") +
        '<div class="recognize-opts" id="phOpts">' +
        opts.map((o, i) => '<button class="rec-opt" data-i="' + i + '"><span class="rec-key">' + (i + 1) + "</span>" +
          this.esc(o) + "</button>").join("") +
        "</div>" +
        '<div class="typing-feedback" id="phFeedback"></div>' +
        '<div class="step-bar nav-bar" id="phNav" style="display:none">' +
        '<button class="btn btn-primary" id="phNextQ">NEXT PHRASE ▸</button></div>' +
        "</div>";
      const fb = $("phFeedback");
      const nav = $("phNav");
      const lock = () => {
        $("phOpts").querySelectorAll(".rec-opt").forEach((b) => (b.disabled = true));
        nav.style.display = "flex";
      };
      $("phOpts").querySelectorAll(".rec-opt").forEach((b) =>
        b.addEventListener("click", () => {
          if (fb.dataset.done) return;
          fb.dataset.done = "1";
          const i = parseInt(b.dataset.i, 10);
          const correct = i === ansIdx;
          if (correct) qz.score++;
          else qz.wrong.push(item.key);
          $("phOpts").querySelectorAll(".rec-opt").forEach((x, j) => {
            x.classList.add(j === ansIdx ? "rec-correct" : (j === i ? "rec-wrong" : "rec-dim"));
          });
          fb.className = "typing-feedback " + (correct ? "ok" : "err");
          fb.textContent = correct ? "✓ " + zh : "✗ — CORRECT: " + zh;
          lock();
        }));
      $("phNextQ").addEventListener("click", () => {
        qz.idx++;
        if (qz.idx >= qz.list.length) qz.done = true;
        this.renderPhrases();
      });
      // component-word play buttons (组成词发音)
      $("phQuiz").querySelectorAll(".spk-play").forEach((b) =>
        b.addEventListener("click", () => this.speak(b.dataset.spk)));
    },

    renderPhraseResult() {
      const qz = this._phQuiz;
      const total = qz.list.length;
      const pct = total ? Math.round((qz.score / total) * 100) : 0;
      // phrase misses join the same wrong box (review in REVIEW WRONG,
      // answered correctly twice in a row clears); their component
      // words queue into tomorrow's TRAIN when not yet learned
      let pendingAdded = 0;
      for (const key of qz.wrong) {
        const ent = Lexicon.get(key) || {};
        Lexicon.addPpWrong({ mode: "recognize", w: key, syns: [ent.t || ent.d || key] });
        for (const w of String(key).split(/\s+/)) {
          if (w.length > 2 && !STOPWORDS.has(w) && Lexicon.addPpPending(w)) pendingAdded++;
        }
      }
      $("phQuiz").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">QUIZ COMPLETE</span>' +
        '<span class="card-status ' + (pct >= 70 ? "mature" : pct >= 50 ? "learn" : "new") + '">' +
        (pct >= 90 ? "EXCELLENT" : pct >= 70 ? "GOOD" : pct >= 50 ? "REVIEW NEEDED" : "WEAK") + "</span>" +
        '<div class="sense-label">' + qz.score + " / " + total + " CORRECT (" + pct + "%)</div>" +
        (qz.wrong.length
          ? '<div class="log-summary" style="margin-top:var(--sp-2)">' +
            qz.wrong.map((w) => '<span class="spk-word">' + this.esc(w) + "</span>").join("") +
            '<div class="sense-label" style="margin-top:var(--sp-1)">' +
            (pendingAdded ? pendingAdded + " 个生词已加入明天 TRAIN 学习队列 · " : "") +
            "错题已存入错题库 — REVIEW WRONG 再练</div></div>"
          : '<div class="sense-label">ALL CORRECT — PHRASES LOCKED IN ✓</div>') +
        '<div class="step-bar nav-bar"><button class="btn btn-primary" id="phRestart">↻ QUIZ AGAIN</button>' +
        '<button class="btn" id="phDone">DONE</button></div>' +
        "</div>";
      $("phRestart").addEventListener("click", () => this.phraseQuiz(null));
      $("phDone").addEventListener("click", () => { this._phQuiz = null; this.renderPhrases(); });
    },

    /* ---- paraphrase core (雅思阅读同义替换) ----
     * 口诀卡 + 四类替换表 + 两种练习：同义选择题（看词选同义）
     * 和 T/F/NG 判断题（原文 vs 题干 → 判断）。纯练习，不写卡。 */
    _ppQuiz: null,       // { mode: "syn"|"tfng", list, idx, score, done, wrong }

    renderParaphrase() {
      const P = global.PARAPHRASE_CORE || {};
      const root = $("ppList");
      if (!root || !P.groups) return;

      // count pairs
      const allPairs = P.groups.reduce((a, g) => a.concat(g.pairs), []);
      $("ppCount").textContent = allPairs.length + " PAIRS · " + (P.tfng || []).length + " T/F/NG";

      // tips (口诀)
      $("ppTips").innerHTML =
        '<div class="spk-head"><span class="spk-title">READING 口诀</span>' +
        '<span class="spk-sub">写草稿纸上 · 考前 3 天每天扫一遍</span></div>' +
        '<div class="pp-tips-grid">' + (P.tips || []).map((t) =>
          '<span class="pp-tip">' + this.esc(t) + "</span>").join("") + "</div>";

      // quiz area — rendered FIRST so renderPpResult banks the wrong
      // items before the wrong-answer bar below reads them
      if (this._ppQuiz && !this._ppQuiz.done) {
        this.renderPpCard();
      } else if (this._ppQuiz && this._ppQuiz.done) {
        this.renderPpResult();
      } else {
        $("ppQuiz").innerHTML =
          '<div class="card"><div class="card-word" style="font-size:16px">PARAPHRASE DRILL</div>' +
          '<div class="card-sub" style="color:var(--fg-dim);font-size:12px">' +
          "SYNONYM QUIZ · 看词选同义 — T/F/NG DRILL · 原文 vs 题干定位判断</div></div>";
      }

      // wrong-answer box (纠错机制) — always visible so it is easy
      // to find: an empty-state hint when there is nothing, counts +
      // REVIEW WRONG button once there is; a cloud tag shows the
      // backup state (wrong box + pending words sync to GitHub)
      const wrongList = Lexicon.ppWrongList();
      const pendingN = Lexicon.ppPendingList().length;
      const box = $("ppWrongBox");
      if (box) {
        const cs = global.CloudSync;
        let cloudTag = "";
        if (cs) {
          if (cs.enabled && cs.token) {
            const ls = cs.lastSync();
            const d = new Date(ls);
            if (ls && !isNaN(d)) {
              const pad = (n) => (n < 10 ? "0" + n : "" + n);
              cloudTag = '<span class="pp-wrong-cloud" title="错题库 + 生词队列自动备份到 GitHub，换设备自动恢复">' +
                "☁ 已存云端 · " + (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
                pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</span>";
            } else {
              cloudTag = '<span class="pp-wrong-cloud">☁ 云备份开 · 待首次同步</span>';
            }
          } else {
            cloudTag = '<span class="pp-wrong-cloud pp-wrong-cloud-off" title="在 CONFIG 中启用自动同步并配置 TOKEN 后，错题库会备份到 GitHub">' +
              "☁ 云未开</span>";
          }
        }
        if (!wrongList.length && !pendingN) {
          box.innerHTML =
            '<div class="pp-wrong-bar pp-wrong-empty">' +
            '<span class="pp-wrong-tag">📌 错题库</span>' +
            '<span>空 — 练习中答错的题会存到这里 · 生词进明天 TRAIN</span>' + cloudTag + "</div>";
        } else {
          const ok1 = wrongList.filter((w) => w.okStreak === 1).length;
          let status = '<div class="pp-wrong-bar">' +
            '<span class="pp-wrong-tag">📌 错题库</span>';
          if (wrongList.length) {
            status += '<span><b>' + wrongList.length + "</b> 题待复习" +
              (ok1 ? " · " + ok1 + " 题答对 1 次（再对即清）" : "") + "</span>";
          }
          if (pendingN) {
            status += '<span><b>' + pendingN + "</b> 个生词待学</span>";
          }
          status += cloudTag +
            '<button class="btn btn-primary" id="ppWrongGo">REVIEW WRONG ▸</button></div>';
          box.innerHTML = status;
          const wrongGo = $("ppWrongGo");
          if (wrongGo) wrongGo.addEventListener("click", () => this.ppQuiz("wrong"));
        }
      }

      // grouped synonym tables
      $("ppSummary").innerHTML = P.groups.map((g) =>
        '<div class="spk-block">' +
        '<div class="spk-head"><span class="spk-title">' + this.esc(g.label) + "</span>" +
        '<span class="spk-sub">' + g.pairs.length + " 组</span></div>" +
        '<div class="pp-table">' + g.pairs.map(([w, syns]) =>
          '<div class="pp-row"><span class="pp-word">' + this.esc(w) +
          '<button class="tts-btn spk-play" title="PLAY" data-spk="' + this.esc(w) + '">◉</button></span>' +
          '<span class="pp-arrow">→</span>' +
          '<span class="pp-syns">' + syns.map((s) =>
            '<span class="pp-syn">' + this.esc(s) +
            '<button class="tts-btn spk-play" title="PLAY" data-spk="' + this.esc(s) + '">◉</button></span>').join("") +
          "</span></div>").join("") + "</div></div>").join("");

      // play buttons
      $("ppSummary").querySelectorAll(".spk-play").forEach((b) =>
        b.addEventListener("click", () => this.speak(b.dataset.spk)));

      // quiz buttons
      $("ppSynQuiz").addEventListener("click", () => this.ppQuiz("syn"));
      $("ppTfngQuiz").addEventListener("click", () => this.ppQuiz("tfng"));
    },

    /* build a shuffled drill deck */
    ppQuiz(mode) {
      const P = global.PARAPHRASE_CORE || {};
      if (mode === "syn") {
        const pairs = P.groups.reduce((a, g) => a.concat(g.pairs), []);
        const list = this._shuffled(pairs.map((p, i) => ({ i, w: p[0], syns: p[1] })));
        this._ppQuiz = { mode, list, idx: 0, score: 0, done: false, wrong: [] };
      } else if (mode === "wrong") {
        // review mode: wrong-answer box + pending words merged
        // (either can be non-empty on its own)
        const wrongItems = Lexicon.ppWrongList().map((w) => {
          if (w.mode === "tfng") return { key: w.key, mode: "tfng", src: w.src, q: w.q, ans: w.ans, why: w.why };
          return { key: w.key, mode: w.mode === "recognize" ? "recognize" : "syn", w: w.w, syns: w.syns };
        });
        const pendingItems = Lexicon.ppPendingList().map((word) => {
          const ent = Lexicon.get(word) || { w: word, t: "", us: "", uk: "", p: 2, d: "", e: "" };
          return { key: "pending:" + word, mode: "recognize", w: word, ent: ent };
        });
        const list = this._shuffled(wrongItems.concat(pendingItems));
        this._ppQuiz = { mode, list, idx: 0, score: 0, done: false, wrong: [] };
      } else {
        const list = this._shuffled((P.tfng || []).map((t, i) => Object.assign({ i }, t)));
        this._ppQuiz = { mode, list, idx: 0, score: 0, done: false, wrong: [] };
      }
      this.renderParaphrase();
    },

    renderPpCard() {
      const qz = this._ppQuiz;
      const item = qz.list[qz.idx];
      const P = global.PARAPHRASE_CORE || {};
      const play = (t) => '<button class="tts-btn spk-play" title="PLAY" data-spk="' + this.esc(t) + '">◉</button>';
      // merged REVIEW WRONG quiz carries per-item modes
      // (recognize / syn / tfng); plain quizzes use qz.mode
      const mode = item.mode || qz.mode;

      if (mode === "recognize") {
        // pending-word review: pick the Chinese meaning of the shown
        // word — this is exactly the gap behind a synonym miss
        const zh = this.zhHead(item.w) || item.ent.t || "";
        const opts = [zh];
        const seen = new Set([zh]);
        const pool = this._shuffled(Lexicon.load().keys());
        for (const w of pool) {
          if (w === item.w) continue;
          const z = this.zhHead(w);
          if (!z || seen.has(z)) continue;
          if (z.length > 64) continue;
          seen.add(z);
          opts.push(z);
          if (opts.length >= 4) break;
        }
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
        }
        const ansIdx = opts.indexOf(zh);
        $("ppQuiz").innerHTML =
          '<div class="card sense-card">' +
          '<span class="card-wp">WORD ' + (qz.idx + 1) + "/" + qz.list.length + " · SCORE " + qz.score + "</span>" +
          '<span class="card-status learn">PICK THE MEANING · 生词识别</span>' +
          '<div class="recognize-word">' + this.esc(item.w) + play(item.w) + "</div>" +
          '<div class="recognize-opts" id="ppOpts">' +
          opts.map((o, i) => '<button class="rec-opt" data-i="' + i + '"><span class="rec-key">' + (i + 1) + "</span>" +
            this.esc(o) + "</button>").join("") +
          "</div>" +
          '<div class="typing-feedback" id="ppFeedback"></div>' +
          '<div class="step-bar nav-bar" id="ppNav" style="display:none">' +
          '<button class="btn btn-primary" id="ppNext">NEXT ▸</button></div>' +
          "</div>";
        this._ppAns = ansIdx;
        this._ppCorrect = zh;
      } else if (mode === "syn") {
        // 4-choice: pick the synonym of the shown word. Distractors
        // come from the same POS group (similar words = harder, more
        // useful), never from other groups with the same head word.
        const g = P.groups.find((gr) => gr.pairs.some((p) => p[0] === item.w)) || P.groups[0];
        const groupWords = g.pairs.map((p) => p[0]).filter((w) => w !== item.w);
        const correct = item.syns[0];
        const opts = [correct];
        const seen = new Set([correct]);
        const pool = this._shuffled(groupWords.length >= 3 ? groupWords : P.groups.reduce((a, x) => a.concat(x.pairs.map((p) => p[0])), []).filter((w) => w !== item.w));
        for (const w of pool) {
          if (seen.has(w)) continue;
          seen.add(w);
          opts.push(w);
          if (opts.length >= 4) break;
        }
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = opts[i]; opts[i] = opts[j]; opts[j] = t;
        }
        const ansIdx = opts.indexOf(correct);
        $("ppQuiz").innerHTML =
          '<div class="card sense-card">' +
          '<span class="card-wp">SYNONYM ' + (qz.idx + 1) + "/" + qz.list.length + " · SCORE " + qz.score + "</span>" +
          '<span class="card-status learn">PICK THE SYNONYM</span>' +
          '<div class="recognize-word">' + this.esc(item.w) + play(item.w) + "</div>" +
          '<div class="recognize-opts" id="ppOpts">' +
          opts.map((o, i) => '<button class="rec-opt" data-i="' + i + '"><span class="rec-key">' + (i + 1) + "</span>" +
            this.esc(o) + "</button>").join("") +
          "</div>" +
          '<div class="typing-feedback" id="ppFeedback"></div>' +
          '<div class="step-bar nav-bar" id="ppNav" style="display:none">' +
          '<button class="btn btn-primary" id="ppNext">NEXT ▸</button></div>' +
          "</div>";
        this._ppAns = ansIdx;
        this._ppCorrect = correct;
      } else {
        // T/F/NG: judge the statement against the passage
        $("ppQuiz").innerHTML =
          '<div class="card sense-card">' +
          '<span class="card-wp">T/F/NG ' + (qz.idx + 1) + "/" + qz.list.length + " · SCORE " + qz.score + "</span>" +
          '<span class="card-status learn">JUDGE THE STATEMENT</span>' +
          '<div class="sense-label">PASSAGE</div>' +
          '<div class="pp-passage">' + this.esc(item.src) + play(item.src) + "</div>" +
          '<div class="sense-label">STATEMENT</div>' +
          '<div class="pp-statement">' + this.esc(item.q) + play(item.q) + "</div>" +
          '<div class="recognize-opts" id="ppOpts">' +
          ['<button class="rec-opt" data-i="0"><span class="rec-key">1</span>TRUE</button>',
           '<button class="rec-opt" data-i="1"><span class="rec-key">2</span>FALSE</button>',
           '<button class="rec-opt" data-i="2"><span class="rec-key">3</span>NOT GIVEN</button>'].join("") +
          "</div>" +
          '<div class="typing-feedback" id="ppFeedback"></div>' +
          '<div class="step-bar nav-bar" id="ppNav" style="display:none">' +
          '<button class="btn btn-primary" id="ppNext">NEXT ▸</button></div>' +
          "</div>";
        this._ppAns = { T: 0, F: 1, NG: 2 }[item.ans];
        this._ppCorrect = item.ans;
      }

      const fb = $("ppFeedback");
      const nav = $("ppNav");
      const lock = () => {
        $("ppOpts").querySelectorAll(".rec-opt").forEach((b) => (b.disabled = true));
        nav.style.display = "flex";
      };
      $("ppOpts").querySelectorAll(".rec-opt").forEach((b) =>
        b.addEventListener("click", () => {
          if (fb.dataset.done) return;
          fb.dataset.done = "1";
          const i = parseInt(b.dataset.i, 10);
          const correct = i === this._ppAns;
          if (correct) qz.score++;
          else qz.wrong.push(item);
          // in the wrong-answer review drill a hit counts toward
          // clearing the box (two in a row removes the item); pending
          // words (key "pending:...") are cleared by studying them
          // in TRAIN, not by this drill
          if (qz.mode === "wrong" && item.key.indexOf("pending:") !== 0) {
            if (correct) Lexicon.markPpWrongOk(item.key);
            else Lexicon.markPpWrongFail(item.key);
          }
          $("ppOpts").querySelectorAll(".rec-opt").forEach((x, j) => {
            x.classList.add(j === this._ppAns ? "rec-correct" : (j === i ? "rec-wrong" : "rec-dim"));
          });
          fb.className = "typing-feedback " + (correct ? "ok" : "err");
          if (mode === "recognize") {
            fb.textContent = correct ? "✓ " + item.w + " = " + this._ppCorrect
              : "✗ — 意思是: " + this._ppCorrect;
          } else if (qz.mode === "syn" || qz.mode === "wrong") {
            fb.textContent = correct ? "✓ " + item.w + " = " + this._ppCorrect
              : "✗ — CORRECT: " + item.w + " = " + item.syns.join(" / ");
          } else {
            fb.textContent = (correct ? "✓ " : "✗ — 答案 ") + item.ans + " · " + item.why;
          }
          lock();
        }));
      $("ppNext").addEventListener("click", () => {
        qz.idx++;
        if (qz.idx >= qz.list.length) qz.done = true;
        this.renderParaphrase();
      });
      $("ppQuiz").querySelectorAll(".spk-play").forEach((b) =>
        b.addEventListener("click", () => this.speak(b.dataset.spk)));
    },

    renderPpResult() {
      const qz = this._ppQuiz;
      const total = qz.list.length;
      const pct = total ? Math.round((qz.score / total) * 100) : 0;
      // bank the wrong items into the wrong-answer box (not in the
      // review mode — those already live there). For synonym misses
      // the real gap is often the word itself — queue the word and
      // its synonyms into tomorrow's TRAIN so they get the full
      // MEANING→RECOGNIZE→SPELL→GAP flow. T/F/NG judgement errors
      // usually mean passage/statement vocabulary is unknown, so
      // their key content words are queued the same way (lexicon
      // entries first — they carry Chinese + phonetic; capped so a
      // bad drill never floods the next session).
      let pendingAdded = 0;
      if (qz.mode !== "wrong") {
        for (const it of qz.wrong) {
          if (qz.mode === "syn") {
            Lexicon.addPpWrong({ mode: "syn", w: it.w, syns: it.syns });
            for (const w of [it.w].concat(it.syns)) {
              if (Lexicon.addPpPending(w)) pendingAdded++;
            }
          } else {
            Lexicon.addPpWrong({ mode: "tfng", src: it.src, q: it.q, ans: it.ans, why: it.why });
            const words = (it.src + " " + it.q).toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
            const fresh = [...new Set(words.filter((w) => w.length > 2 && !STOPWORDS.has(w)))];
            // known lexicon words first (full learning data), then unknowns
            fresh.sort((a, b) => (Lexicon.get(b) ? 1 : 0) - (Lexicon.get(a) ? 1 : 0));
            for (const w of fresh) {
              if (Lexicon.addPpPending(w)) {
                pendingAdded++;
                if (pendingAdded >= 10) break;
              }
            }
          }
        }
      }
      $("ppQuiz").innerHTML =
        '<div class="card sense-card">' +
        '<span class="card-wp">DRILL COMPLETE</span>' +
        '<span class="card-status ' + (pct >= 70 ? "mature" : pct >= 50 ? "learn" : "new") + '">' +
        (pct >= 90 ? "EXCELLENT" : pct >= 70 ? "GOOD" : pct >= 50 ? "REVIEW NEEDED" : "WEAK") + "</span>" +
        '<div class="sense-label">' + qz.score + " / " + total + " CORRECT (" + pct + "%)</div>" +
        (qz.wrong.length
          ? '<div class="log-summary" style="margin-top:var(--sp-2)">' +
            qz.wrong.map((w) => '<span class="spk-word">' + this.esc(qz.mode === "syn" ? w.w : w.q) + "</span>").join("") +
            (qz.mode !== "wrong"
              ? '<div class="sense-label" style="margin-top:var(--sp-1)">' +
                (pendingAdded ? pendingAdded + " 个生词已加入明天 TRAIN 学习队列 · " : "") +
                "错题已存入错题库 — REVIEW WRONG 明天再练</div>"
              : '<div class="sense-label" style="margin-top:var(--sp-1)">仍未掌握 — 错题保留，生词等 TRAIN 学习</div>') +
            "</div>"
          : '<div class="sense-label">ALL CORRECT — PARAPHRASES LOCKED IN ✓</div>') +
        '<div class="step-bar nav-bar"><button class="btn btn-primary" id="ppRestart">↻ DRILL AGAIN</button>' +
        '<button class="btn" id="ppDone">DONE</button></div>' +
        "</div>";
      $("ppRestart").addEventListener("click", () => this.ppQuiz(qz.mode));
      $("ppDone").addEventListener("click", () => { this._ppQuiz = null; this.renderParaphrase(); });
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
    fillVoiceSelect(sel, current) {
      const fill = () => {
        const voices = global.speechSynthesis.getVoices();
        const en = voices.filter((v) => /^en/i.test(v.lang));
        const others = voices.filter((v) => !/^en/i.test(v.lang));
        const all = [...en, ...others];
        sel.innerHTML = '<option value="">AUTO (BEST MATCH)</option>' +
          all.map((v) => '<option value="' + this.esc(v.name) + '">' + this.esc(v.name) + " (" + v.lang + ")</option>").join("");
        if (current) sel.value = current;
        if (!sel.value && en.length) sel.selectedIndex = 1; // highlight first en-US
      };
      fill();
      // voices load asynchronously in some browsers
      if (global.speechSynthesis && global.speechSynthesis.onvoiceschanged === undefined) {
        global.speechSynthesis.onvoiceschanged = fill;
      }
    },

    bindSettings() {
      $("btnSettings").addEventListener("click", () => {
        const s = Lexicon.state().settings;
        $("cfgGoal").value = s.goal;
        $("cfgExam").value = s.examDate;
        $("cfgTrans").checked = s.showTrans;
        $("cfgVoice").checked = s.voice;
        $("cfgRate").value = s.rate;
        this.fillVoiceSelect($("cfgVoiceName"), s.voiceName || "");
        $("cfgGoalAuto").checked = !!s.goalAuto;
        $("cfgCloud").checked = CloudSync.enabled;
        $("cfgToken").value = CloudSync.token;
        this.setCloudStatus("LAST SYNC: " + (CloudSync.lastSync() ? CloudSync.lastSync().slice(0, 10) : "NEVER"));
        const m = this.ddlMetrics();
        const hint = $("cfgGoalHint");
        if (hint) {
          hint.textContent = "DDL SUGGESTS " + m.suggestGoal + " NEW WORDS/DAY (" + m.daysLeft + " DAYS LEFT, " + m.remaining + " CORE WORDS REMAINING)";
        }
        const syncGoal = () => {
          const auto = $("cfgGoalAuto").checked;
          $("cfgGoal").disabled = auto;
          if (auto) $("cfgGoal").value = m.suggestGoal;
        };
        $("cfgGoalAuto").onchange = syncGoal;
        syncGoal();
        $("settingsModal").hidden = false;
      });
      $("btnCfgSave").addEventListener("click", () => {
        const s = Lexicon.state().settings;
        s.goalAuto = $("cfgGoalAuto").checked;
        s.goal = Math.max(1, Math.min(500, parseInt($("cfgGoal").value, 10) || 25));
        s.examDate = $("cfgExam").value || "2026-11-15";
        s.showTrans = $("cfgTrans").checked;
        s.voice = $("cfgVoice").checked;
        s.voiceName = $("cfgVoiceName").value || "";
        s.rate = parseFloat($("cfgRate").value) || 0.9;
        Lexicon.saveState();
        // cloud sync settings — enable + seed, or disable
        CloudSync.setEnabled($("cfgCloud").checked);
        CloudSync.saveToken($("cfgToken").value.trim());
        if (CloudSync.enabled && CloudSync.token) {
          this.setCloudStatus("SAVED — PUSHING LOCAL DATA…");
          CloudSync.push().then((r) => {
            this.setCloudStatus(r.ok ? "SYNCED — CLOUD PUSHED (" + (r.at || "").slice(0, 10) + ")" : "PUSH FAILED — " + r.reason);
          });
        } else {
          this.setCloudStatus("CLOUD SYNC OFF — LOCAL ONLY");
        }
        $("settingsModal").hidden = true;
        this.renderAll();
      });
      $("btnCloudSync").addEventListener("click", () => {
        CloudSync.setEnabled($("cfgCloud").checked);
        CloudSync.saveToken($("cfgToken").value.trim());
        if (CloudSync.enabled && CloudSync.token) {
          this.setCloudStatus("PUSHING…");
          CloudSync.push().then((r) => {
            this.setCloudStatus(r.ok ? "PUSHED (" + (r.at || "").slice(0, 10) + ")" : "PUSH FAILED — " + r.reason);
          });
        } else {
          this.setCloudStatus("CLOUD SYNC OFF — CHECK THE TOKEN");
        }
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
      $("btnExtra").addEventListener("click", () => this.startSession(false, true));
      $("btnDoneMore").addEventListener("click", () => this.startSession(false, true));
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
      // ---- MANUAL ADD: 查重后写入 custom，弹窗反馈 ----
      const addWord = () => {
        const word = $("lgAddWord").value.trim();
        if (!word) { $("lgAddWord").focus(); return; }
        const res = Lexicon.addCustom(
          word,
          $("lgAddTrans").value.trim(),
          $("lgAddPhone").value.trim(),
          "",
          $("lgAddExample").value.trim()
        );
        if (res.status === "added") {
          $("unkTag").textContent = "ADDED";
          $("unkWord").textContent = word;
          $("unkPhonetic").textContent = $("lgAddPhone").value.trim() ? "US/UK " + $("lgAddPhone").value.trim() : "PRIORITY: CORE — ENTERS THE DAILY QUEUE";
          $("unkDef").textContent = $("lgAddTrans").value.trim() || "已加入词库（p=0 最高优先），主题/词根自动打标。";
          $("lgAddWord").value = ""; $("lgAddTrans").value = ""; $("lgAddPhone").value = ""; $("lgAddExample").value = "";
        } else {
          $("unkTag").textContent = res.status === "variant" ? "VARIANT" : "EXISTS";
          $("unkWord").textContent = res.word || word;
          $("unkPhonetic").textContent = res.status === "variant"
            ? "词库已有同源词 — 你输入的是它的变形形式"
            : "ALREADY IN LEXICON — NO DUPLICATE ADDED";
          $("unkDef").textContent = "不需要重复添加，直接搜索并学习该词即可。";
        }
        $("unkModal").hidden = false;
        this.renderLog();
        this.renderAll();
      };
      $("btnAddWord").addEventListener("click", addWord);
      $("lgAddWord").addEventListener("keydown", (e) => { if (e.key === "Enter") addWord(); });
      $("btnUnkClose").addEventListener("click", () => { $("unkModal").hidden = true; });
      $("unkModal").addEventListener("click", (e) => { if (e.target === $("unkModal")) $("unkModal").hidden = true; });
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
          if (!((e.key === " " || e.key === "Enter" || e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.readOnly)) return;
        }
        if (this.session && this.view === "vocab" && this.vsub === "train") {
          const k = e.key;
          if (k === "ArrowLeft") { e.preventDefault(); this.goBack(); }
          else if (k === "ArrowRight") { e.preventDefault(); this.goNext(); }
          else if (k === "Enter") {
            e.preventDefault();
            if (this.session.phase === "spell") {
              if (this.curWord().isNew) this.advanceToGap();
              else this.finishWord();
            } else if (this.session.phase === "gap") this.gapNext();
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
