/* ============================================================
 * slam-nav-stack :: lexicon service
 *
 * Loads and merges the aggregated vocabulary dataset
 * (ielts-data.js) with the curated core registry (core-vocab.js)
 * and any user-imported custom entries. Owns all localStorage
 * persistence (cards + settings + study history).
 *
 * Storage keys (prefix "sls_" = slam-nav-stack):
 *   sls_cards  : { word: {reps, ef, ivl, due, lvl, added, seen} }
 *   sls_state  : { settings, stats }
 *   sls_custom : { word: [trans, us, uk] }
 * ============================================================ */
(function (global) {
  "use strict";

  const LS_CARDS = "sls_cards";
  const LS_STATE = "sls_state";
  const LS_CUSTOM = "sls_custom";
  const LS_UNFAMILIAR = "sls_unfamiliar";

  const DEFAULT_STATE = {
    settings: {
      goal: 25,                       // daily new-word target
      examDate: "2026-11-15",         // target exam date (YYYY-MM-DD), user-adjustable
      showTrans: true,                // show translations on cards
      voice: true,                    // TTS feedback
      voiceName: "",                  // preferred TTS voice (empty = auto)
      rate: 0.9                       // speech rate
    },
    stats: {
      totalSeen: 0,                   // words ever introduced
      lastDay: "",                    // last active day YYYY-MM-DD
      streak: 0,                      // consecutive active days
      history: {}                     // { 'YYYY-MM-DD': {n, r} }
    }
  };

  let _lexicon = null;      // Map: word -> entry
  let _state = null;
  let _cards = null;
  let _custom = null;

  /* ---------------- date helpers ---------------- */
  function dayKey(d) {
    const x = d || new Date();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return x.getFullYear() + "-" + m + "-" + dd;
  }

  /* ---------------- persistence ---------------- */
  function readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  const Lexicon = {
    /* ---- build the merged lexicon map ---- */
    load() {
      if (_lexicon) return _lexicon;
      _lexicon = new Map();
      const bulk = global.IELTS_WORDS || [];
      for (let i = 0; i < bulk.length; i++) {
        const r = bulk[i];
        _lexicon.set(r[0].toLowerCase(), {
          w: r[0], t: r[1] || "", us: r[2] || "", uk: r[3] || "", p: r[4] == null ? 2 : r[4],
          d: "", e: ""
        });
      }
      const core = global.CORE_VOCAB || {};
      for (const k in core) {
        const key = k.toLowerCase();
        let ent = _lexicon.get(key);
        if (!ent) {
          ent = { w: k, t: "", us: "", uk: "", p: 0, d: "", e: "" };
          _lexicon.set(key, ent);
        }
        ent.d = core[k].d || "";
        ent.e = core[k].e || "";
        if (ent.p > 0) ent.p = 0;
      }
      // custom user entries override everything
      const custom = this.getCustom();
      for (const k in custom) {
        const key = k.toLowerCase();
        const c = custom[k];
        const ent = _lexicon.get(key) || { w: k, t: "", us: "", uk: "", p: 2, d: "", e: "" };
        if (c[0]) ent.t = c[0];
        if (c[1]) ent.us = c[1];
        if (c[2]) ent.uk = c[2];
        _lexicon.set(key, ent);
      }
      return _lexicon;
    },

    size() { return this.load().size; },

    get(word) { return this.load().get(String(word).toLowerCase()) || null; },

    /* ---- card state ---- */
    cards() {
      if (!_cards) _cards = readLS(LS_CARDS, {});
      return _cards;
    },
    getCard(word) { return this.cards()[String(word).toLowerCase()] || null; },
    setCard(word, state) {
      const k = String(word).toLowerCase();
      this.cards()[k] = state;
      this.saveCards();
    },
    saveCards() { writeLS(LS_CARDS, this.cards()); },
    cardCounts() {
      const cards = this.cards();
      let newC = 0, learn = 0, mature = 0, due = 0;
      const now = Date.now();
      for (const k in cards) {
        const c = cards[k];
        if (c.lvl === 0) newC++;
        else if (c.lvl === 1) { learn++; if (c.due <= now) due++; }
        else { mature++; if (c.due <= now) due++; }
      }
      return { new: newC, learning: learn, mature: mature, due };
    },

    /* ---- global state ---- */
    state() {
      if (!_state) {
        _state = Object.assign({}, DEFAULT_STATE, readLS(LS_STATE, {}));
        // deep-merge nested settings so newly added fields always exist
        _state.settings = Object.assign({}, DEFAULT_STATE.settings, _state.settings);
        // migrate legacy default (was the score-submission date, not the exam date)
        if (_state.settings.examDate === "2026-12-15") {
          _state.settings.examDate = DEFAULT_STATE.settings.examDate;
          this.saveState();
        }
      }
      return _state;
    },
    saveState() { writeLS(LS_STATE, this.state()); },

    /* ---- real-context example index ----
     * Builds word -> sentence(s) from the practice corpus (reading
     * passages, listening transcripts, writing prompts, quick
     * drills) so gap-fill exercises use authentic IELTS-style
     * sentences instead of memorised lists. Indexed by stem. */
    _exampleIndex: null,
    _exampleIndexBuilt: false,

    buildExampleIndex() {
      if (this._exampleIndexBuilt) return this._exampleIndex;
      this._exampleIndexBuilt = true;
      this._exampleIndex = {};
      const idx = this._exampleIndex;
      const addSentence = (text) => {
        const sents = String(text || "").split(/(?<=[.!?])\s+/);
        for (const s of sents) {
          const t = s.trim();
          if (t.length < 20 || t.length > 400) continue;
          const words = t.match(/[A-Za-z][A-Za-z'-]*/g) || [];
          const keys = new Set(words.map((w) => this.stem(w.toLowerCase())));
          for (const k of keys) {
            if (k.length < 4) continue;
            if (!idx[k]) idx[k] = [];
            if (idx[k].length < 3 && !idx[k].includes(t)) idx[k].push(t);
          }
        }
      };
      const g = global;
      ((g.READING_TESTS || [])).forEach((t) =>
        t.passages.forEach((p) => p.paras.forEach((pa) => addSentence(pa.text))));
      ((g.LISTENING_FULL || [])).forEach((s) =>
        s.sections.forEach((sec) => addSentence(sec.transcript)));
      ((g.LISTENING_SETS || [])).forEach((s) =>
        s.items.forEach((i) => addSentence(i.audio || i.q || "")));
      ((g.WRITING_TASKS || [])).forEach((t) => addSentence(t.prompt));
      return idx;
    },

    stem(w) {
      let s = w;
      if (s.length <= 4) return s;
      if (s.endsWith("ies")) return s.slice(0, -3) + "y";
      if (s.endsWith("es")) return s.slice(0, -2);
      if (s.endsWith("ed")) return s.slice(0, -2);
      if (s.endsWith("ing")) return s.slice(0, -3);
      if (s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
      if (s.endsWith("ly")) return s.slice(0, -2);
      return s;
    },

    /* up to `limit` real sentences containing the word (any inflection) */
    exampleSentences(word, limit) {
      const idx = this.buildExampleIndex();
      const key = this.stem(String(word).toLowerCase());
      const out = [];
      const re = new RegExp("\\b" + this.escapeRegExp(key) + "[a-z]*\\b", "i");
      for (const s of (idx[key] || [])) {
        if (re.test(s)) out.push(s);
        if (out.length >= (limit || 2)) break;
      }
      return out;
    },

    escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    },

    /* ---- custom entries ---- */
    getCustom() {
      if (!_custom) _custom = readLS(LS_CUSTOM, {});
      return _custom;
    },
    saveCustom() { writeLS(LS_CUSTOM, this.getCustom()); },

    /* ---- sense decomposition ----
     * Splits a word's translation into structured senses so the
     * learner studies meaning in context rather than rote lists.
     * sense = { pos: part-of-speech tag, text: meaning, ex: example }
     * Curated core words contribute an English definition + example. */
    _POS_RE: /^(n|v|vt|vi|adj|adv|prep|conj|art|pron|num|aux|int|abbr)\./i,
    senses(word) {
      const ent = this.get(word);
      if (!ent) return [];
      const out = [];
      const parts = String(ent.t || "").split(/[；;]/).map((s) => s.trim()).filter(Boolean);
      const posOf = (s) => {
        const m = s.match(this._POS_RE);
        return m ? m[1].toUpperCase() : "";
      };
      if (ent.d) {
        out.push({ pos: parts.length ? posOf(parts[0]) : "", text: ent.d, ex: ent.e || "" });
        // remaining senses from the Chinese translation (skip the part already covered by d)
        for (let i = 1; i < parts.length; i++) {
          const t = parts[i].replace(this._POS_RE, "").trim();
          if (t) out.push({ pos: posOf(parts[i]), text: t, ex: "" });
        }
      } else {
        for (const part of parts) {
          const t = part.replace(this._POS_RE, "").trim();
          if (t) out.push({ pos: posOf(part), text: t, ex: "" });
        }
      }
      return out;
    },

    /* ---- unfamiliar collection (memory deck hot zone) ----
     * Words flagged in practice (dbl-click) or auto-flagged after
     * repeated failures. src: "practice" | "weak" | "manual" */
    getUnfamiliar() {
      return readLS(LS_UNFAMILIAR, {});
    },
    saveUnfamiliar(d) { writeLS(LS_UNFAMILIAR, d); },
    isUnfamiliar(word) {
      return !!this.getUnfamiliar()[String(word).toLowerCase()];
    },
    addUnfamiliar(word, src) {
      const d = this.getUnfamiliar();
      const key = String(word).toLowerCase();
      d[key] = { src: src || "manual", added: Date.now() };
      this.saveUnfamiliar(d);
    },
    removeUnfamiliar(word) {
      const d = this.getUnfamiliar();
      delete d[String(word).toLowerCase()];
      this.saveUnfamiliar(d);
    },
    unfamiliarList() {
      return this.getUnfamiliar();
    },
    /* unfamiliar words with no card yet -> high-priority new items.
     * Words outside the lexicon get a placeholder entry so they can
     * still be studied (spelling/audio) once flagged in practice. */
    unfamiliarFresh() {
      const cards = this.cards();
      const out = [];
      for (const key in this.getUnfamiliar()) {
        if (!cards[key]) {
          const ent = this.get(key) || { w: key, t: "", us: "", uk: "", p: 2, d: "", e: "" };
          out.push({ key, ent });
        }
      }
      return out;
    },

    /* ---- study history / streak ---- */
    logStudy(newCount, reviewCount, practiceCount) {
      const st = this.state().stats;
      const today = dayKey();
      if (!st.history[today]) st.history[today] = { n: 0, r: 0, p: 0 };
      st.history[today].n += newCount;
      st.history[today].r += reviewCount;
      st.history[today].p += practiceCount || 0;
      st.totalSeen = Object.keys(this.cards()).length;
      if (st.lastDay !== today) {
        const y = new Date(Date.now() - 86400000);
        const yesterday = dayKey(y);
        st.streak = st.lastDay === yesterday ? st.streak + 1 : 1;
        st.lastDay = today;
      }
      this.saveState();
    },

    /* ---- new-word queue (priority order, excluding known cards) ----
     * limit: daily new-word target; todayAdded: cards introduced
     * today; reserved: slots already taken by flagged words. */
    newCandidates(limit, todayAdded, reserved) {
      const cards = this.cards();
      const out = [];
      const now = Date.now();
      // fresh words introduced earlier today already count toward the goal
      for (const k in cards) {
        const c = cards[k];
        if (c.added && (now - c.added) < 86400000) todayAdded++;
      }
      const need = Math.max(0, limit - todayAdded - (reserved || 0));
      if (need === 0) return out;
      // iterate priority tiers: core(0) -> extended(1) -> supplement(2)
      const seen = {};
      for (let tier = 0; tier <= 2; tier++) {
        for (const [key, ent] of this.load()) {
          if (ent.p !== tier) continue;
          if (cards[key]) continue;
          if (seen[key]) continue;
          seen[key] = true;
          out.push({ key, ent });
          if (out.length >= need) return out;
        }
      }
      return out;
    },

    /* ---- review queue: due cards, oldest first ---- */
    dueCards() {
      const cards = this.cards();
      const now = Date.now();
      const out = [];
      for (const k in cards) {
        const c = cards[k];
        if (c.due > 0 && c.due <= now) out.push({ key: k, card: c });
      }
      out.sort((a, b) => a.card.due - b.card.due);
      return out;
    },

    /* ---- export / import ---- */
    exportBackup() {
      return JSON.stringify({
        app: "slam-nav-stack",
        version: 1,
        exportedAt: new Date().toISOString(),
        cards: this.cards(),
        state: this.state()
      }, null, 2);
    },

    importBackup(text) {
      const data = JSON.parse(text);
      if (data && data.cards) {
        _cards = data.cards;
        this.saveCards();
      }
      if (data && data.state) {
        _state = Object.assign({}, DEFAULT_STATE, data.state);
        this.saveState();
      }
      return data.cards ? Object.keys(data.cards).length : 0;
    },

    // CSV / JSON word-list import: adds entries as custom words
    importWords(text) {
      const custom = this.getCustom();
      let count = 0;
      const addOne = (word, trans, us, uk) => {
        const w = String(word || "").trim();
        if (!w) return;
        const key = w.toLowerCase();
        custom[key] = [String(trans || "").trim(), String(us || "").trim(), String(uk || "").trim()];
        count++;
      };
      const trimmed = text.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        const arr = JSON.parse(trimmed);
        const list = Array.isArray(arr) ? arr : (arr.words || []);
        for (const item of list) {
          if (Array.isArray(item)) addOne(item[0], item[1], item[2], item[3]);
          else addOne(item.word || item.name, item.trans || item.translation || "", item.usphone || item.us, item.ukphone || item.uk);
        }
      } else {
        const lines = trimmed.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cells = line.split(/[,，\t]/).map((s) => s.trim());
          // skip header
          if (cells[0].toLowerCase() === "word" || cells[0].toLowerCase() === "name") continue;
          addOne(cells[0], cells[1], cells[2], cells[3]);
        }
      }
      if (count > 0) {
        this.saveCustom();
        _lexicon = null; // force rebuild
      }
      return count;
    },

    /* ---- reset everything ---- */
    resetAll() {
      localStorage.removeItem(LS_CARDS);
      localStorage.removeItem(LS_STATE);
      localStorage.removeItem(LS_CUSTOM);
      _cards = null; _state = null; _custom = null; _lexicon = null;
    }
  };

  global.Lexicon = Lexicon;
})(window);
