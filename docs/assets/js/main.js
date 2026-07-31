/* ============================================================
 * slam-nav-stack :: mission control (application controller)
 *
 * View routing, study-session orchestration, TTS feedback,
 * sensor-log browsing and system configuration.
 *
 * ── REAL USAGE GUIDE (hidden from the README on purpose) ──────
 * 1. Deploy: push this repo, enable GitHub Pages on branch
 *    main / docs/  →  https://<user>.github.io/slam-nav-stack/
 * 2. Study flow: FIELD MAP → "START MISSION" → flashcard shown
 *    → self-grade with AGAIN/HARD/GOOD/EASY (keys 1-4) → SM-2
 *    schedules the next review (AGAIN re-shows it immediately).
 *    SPACE speaks the word (TTS). ⚙ CONFIG sets the daily
 *    new-word target and the exam deadline.
 * 3. Daily rhythm: new words are drawn from the core deck first
 *    (IELTS core → extended → listening supplement), reviews
 *    due today are prepended automatically.
 * 4. Data lives in localStorage of the browser you study in.
 *    Use ⇩ EXPORT in SENSOR LOG regularly; ⇪ IMPORT restores
 *    (backup JSON or any CSV/JSON word list).
 * 5. Ctrl+Shift+M toggles PLAIN MODE (light, clean theme) for
 *    home / phone use. Nothing else changes.
 * 6. ASSESSMENT SUITE tab = full IELTS practice:
 *    - ACOUSTIC TELEMETRY: Quick Drills (sentence level) and
 *      Full Sections (whole transcripts, TTS playback).
 *    - SENSOR DATA PARSING: 5 academic reading tests, 15
 *      passages, 8 question types (TFNG/YNNG/MC/matching/...).
 *    - MISSION REPORT: writing tasks + band phrase bank +
 *      self-assessment checklist (drafts saved locally).
 *    Content: ielts-ai-dataset (CC BY 4.0, see data headers).
 *    Completed exercises count toward the daily streak and are
 *    stored per module in localStorage.
 * ──────────────────────────────────────────────────────────────
 * ============================================================ */
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const DAY = 86400000;

  const App = {
    view: "map",
    session: null,       // { queue:[{key,ent,card,isNew}], idx, newDone, revDone, failed, startedAt }

    /* ================= init ================= */
    init() {
      Lexicon.load();
      // wire suite module progress reporting
      global.Listening.onProgress = Suite.record.bind(Suite);
      global.ListeningFull.onProgress = Suite.record.bind(Suite);
      global.Reading.onProgress = Suite.record.bind(Suite);
      global.Writing.onProgress = Suite.record.bind(Suite);
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
    },
    switchView(v) {
      this.view = v;
      document.querySelectorAll(".tab[data-view]").forEach((b) =>
        b.classList.toggle("active", b.dataset.view === v));
      document.querySelectorAll(".view").forEach((sec) =>
        sec.classList.toggle("active", sec.id === "view-" + v));
      if (v === "map") { this.renderAll(); Telemetry.drawChart($("chartCanvas")); }
      if (v === "log") this.renderLog();
      if (v === "suite") Suite.render($("suiteContainer"));
      if (v === "console" && !this.session) this.renderIdleConsole();
    },

    /* ================= dashboard ================= */
    renderAll() {
      this.renderStats();
      Telemetry.drawChart($("chartCanvas"));
    },

    renderStats() {
      const st = Lexicon.state();
      const counts = Lexicon.cardCounts();
      const total = Lexicon.size();
      const learned = counts.new + counts.learning + counts.mature;

      // exam countdown
      const exam = new Date(st.settings.examDate + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysLeft = Math.max(0, Math.ceil((exam - today) / DAY));
      $("stExam").textContent = daysLeft + "D";
      $("stExamDate").textContent = "TARGET " + st.settings.examDate;

      // today's new words
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

      // tab badge
      const tab = document.querySelector('.tab[data-view="console"]');
      tab.textContent = counts.due > 0 ? "MISSION CONSOLE (" + counts.due + ")" : "MISSION CONSOLE";
    },

    /* ================= session ================= */
    startSession(reviewOnly) {
      const st = Lexicon.state();
      const due = Lexicon.dueCards();
      const queue = [];
      if (reviewOnly) {
        due.forEach((d) => queue.push({ key: d.key, ent: Lexicon.get(d.key), card: d.card, isNew: false }));
      } else {
        due.forEach((d) => queue.push({ key: d.key, ent: Lexicon.get(d.key), card: d.card, isNew: false }));
        const newWords = Lexicon.newCandidates(st.settings.goal, 0);
        newWords.forEach((n) => queue.push({ key: n.key, ent: n.ent, card: Lexicon.getCard(n.key), isNew: true }));
      }
      this.session = {
        queue, idx: 0, newDone: 0, revDone: 0, failed: 0,
        startedAt: new Date().toISOString()
      };
      this.switchView("console");
      if (queue.length === 0) {
        this.renderIdleConsole("NO WAYPOINTS QUEUED — TARGET REACHED. RETURN TO FIELD MAP.");
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
        'PRESS "START MISSION" FROM THE FIELD MAP TO BEGIN NAVIGATION</div></div>';
      $("gradeBar").style.display = "none";
      $("sessionDone").hidden = true;
    },

    renderCard() {
      const s = this.session;
      if (!s) return;
      const item = s.queue[s.idx];
      // typing drill mode: spelling input instead of self-grading
      if ((Lexicon.state().settings.mode || "card") === "typing") {
        this.renderTypingCard(item);
        return;
      }
      $("gradeBar").style.display = "grid";
      $("sessionDone").hidden = true;
      this._typing = null;

      const total = s.queue.length;
      const pos = s.idx + 1;
      $("mcMode").textContent = item.isNew ? "EXPLORING NEW" : "REVISITING";
      $("mcMeta").textContent = "WAYPOINTS: " + pos + " / " + total +
        " · NEW " + s.newDone + " · REV " + s.revDone;
      $("mcProgress").style.width = ((pos - 1) / total) * 100 + "%";

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

      $("cardStage").innerHTML =
        '<div class="card">' +
        '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + " · " + ent.p + "</span>" +
        '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
        '<div class="card-word">' + this.esc(ent.w) + "</div>" +
        (phonetic ? '<div class="card-phonetic">' + this.esc(phonetic) + "</div>" : "") +
        defHtml.join("") +
        '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ SPEAK</button></div>' +
        '<div class="card-index">' + pos + " / " + total + "</div>" +
        "</div>";
      $("btnSpeak").addEventListener("click", () => this.speak(ent.w));
    },

    /* ---- typing drill mode (spelling input) ----
     * Disguised as manual waypoint entry: definitions + blanked
     * example are shown, the operator types the landmark name.
     * Correct => auto GOOD; wrong/skip => answer revealed, then
     * AGAIN (requeued at the end of the mission). */
    _typing: null,

    renderTypingCard(item) {
      const s = this.session;
      const total = s.queue.length;
      const pos = s.idx + 1;
      $("gradeBar").style.display = "none";
      $("sessionDone").hidden = true;
      this._typing = { item, submitted: false, correct: false, graded: false };

      $("mcMode").textContent = item.isNew ? "MANUAL ENTRY: NEW" : "MANUAL ENTRY: REVIEW";
      $("mcMeta").textContent = "WAYPOINTS: " + pos + " / " + total +
        " · NEW " + s.newDone + " · REV " + s.revDone;
      $("mcProgress").style.width = ((pos - 1) / total) * 100 + "%";

      const ent = item.ent;
      const card = Lexicon.getCard(item.key) || SRS.fresh();
      const st = Lexicon.state().settings;

      // blank the target word inside the example sentence
      let example = ent.e || "";
      if (example) {
        const re = new RegExp("\\b" + this.escapeRegExp(ent.w) + "\\b", "gi");
        example = example.replace(re, "______");
      }

      const defHtml = [];
      if (ent.d) defHtml.push('<div class="card-def">' + this.esc(ent.d) + "</div>");
      if (st.showTrans && ent.t) defHtml.push('<div class="card-def zh">' + this.esc(ent.t) + "</div>");
      if (ent.e && !example.includes("______")) {
        defHtml.push('<div class="card-example">“' + this.esc(ent.e) + '”</div>');
      } else if (example) {
        defHtml.push('<div class="card-example">“' + this.esc(example) + '”</div>');
      }

      const statusCls = card.lvl === 2 ? "mature" : card.lvl === 1 ? "learn" : "new";
      const statusTxt = card.lvl === 2 ? "MATURE" : card.lvl === 1 ? "LEARNING" : "NEW";

      $("cardStage").innerHTML =
        '<div class="card typing-card">' +
        '<span class="card-wp">WP-' + String(pos).padStart(4, "0") + " · " + ent.p + "</span>" +
        '<span class="card-status ' + statusCls + '">' + statusTxt + "</span>" +
        defHtml.join("") +
        '<div class="card-tts"><button class="tts-btn" id="btnSpeak">◉ HEAR PRONUNCIATION</button></div>' +
        '<div class="typing-row">' +
        '<span class="typing-prompt">WAYPOINT &gt;</span>' +
        '<input type="text" id="typingInput" class="typing-input" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="TYPE THE WORD...">' +
        "</div>" +
        '<div class="typing-feedback" id="typingFeedback"></div>' +
        '<div class="card-index">' + pos + " / " + total +
        " · ENTER CONFIRM · ESC SKIP</div>" +
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
      // second ENTER after a wrong answer: requeue the waypoint
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

    escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    },

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
      Lexicon.setCard(item.key, updated);

      if (q === 0) {
        s.failed++;
        // re-queue this waypoint at the end of the current mission
        s.queue.push({ key: item.key, ent: item.ent, card: updated, isNew: false });
      } else {
        if (item.isNew) s.newDone++;
        else s.revDone++;
      }
      s.idx++;

      if (s.idx >= s.queue.length) {
        this.endSession();
      } else {
        this.renderCard();
      }
    },

    endSession() {
      const s = this.session;
      Lexicon.logStudy(s.newDone, s.revDone);
      $("gradeBar").style.display = "none";
      $("mcProgress").style.width = "100%";
      $("mcMode").textContent = "MISSION COMPLETE";
      $("mcMeta").textContent = "NEW " + s.newDone + " · REVIEW " + s.revDone + " · RETRY " + s.failed;
      $("doneTitle").textContent = "MISSION COMPLETE";
      $("doneSub").textContent =
        "NEW WAYPOINTS: " + s.newDone + " · REVIEWS: " + s.revDone + " · RETRIES: " + s.failed;
      $("sessionDone").hidden = false;
      $("cardStage").innerHTML = "";
      this.session = null;
      this.renderStats();
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

    /* ================= sensor log ================= */
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
          if (card.lvl === 2) { state = "MATURE"; cls = "mature"; }
          else if (card.lvl === 1) { state = "LEARNING"; cls = "learn"; }
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
        "<span>NEW <b>" + counts.new + "</b></span>" +
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
            n = Lexicon.importBackup(text); // full backup?
          } catch (e) {
            n = Lexicon.importWords(text);  // word list
          }
          this.renderLog();
          this.renderStats();
          const msg = n ? "IMPORTED " + n + " RECORDS" : "IMPORTED — RECORDS: " + n;
          global.alert(msg);
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
        $("cfgMode").value = s.mode || "card";
        $("cfgTrans").checked = s.showTrans;
        $("cfgVoice").checked = s.voice;
        $("cfgRate").value = s.rate;
        $("settingsModal").hidden = false;
      });
      $("btnCfgSave").addEventListener("click", () => {
        const s = Lexicon.state().settings;
        s.goal = Math.max(1, Math.min(500, parseInt($("cfgGoal").value, 10) || 25));
        s.examDate = $("cfgExam").value || "2026-11-15";
        s.mode = $("cfgMode").value === "typing" ? "typing" : "card";
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
      $("btnDoneReturn").addEventListener("click", () => this.switchView("map"));
      document.querySelectorAll(".grade").forEach((b) =>
        b.addEventListener("click", () => this.grade(parseInt(b.dataset.q, 10))));

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
        if (this.session && this.view === "console") {
          const k = e.key;
          if (k === "1") this.grade(0);
          else if (k === "2") this.grade(1);
          else if (k === "3") this.grade(2);
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
    }
  };

  document.addEventListener("DOMContentLoaded", () => App.init());
  global.App = App;
})(window);
