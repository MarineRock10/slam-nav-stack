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

  const DEFAULT_STATE = {
    settings: {
      goal: 25,                       // daily new-word target
      examDate: "2026-12-15",         // mission deadline (YYYY-MM-DD)
      showTrans: true,                // show translations on cards
      voice: true,                    // TTS feedback
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
          w: r[0], t: r[1] || "", us: r[2] || "", uk: r[3] || "", p: r[4] || 2,
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
      if (!_state) _state = Object.assign({}, DEFAULT_STATE, readLS(LS_STATE, {}));
      return _state;
    },
    saveState() { writeLS(LS_STATE, this.state()); },

    /* ---- custom entries ---- */
    getCustom() {
      if (!_custom) _custom = readLS(LS_CUSTOM, {});
      return _custom;
    },
    saveCustom() { writeLS(LS_CUSTOM, this.getCustom()); },

    /* ---- study history / streak ---- */
    logStudy(newCount, reviewCount) {
      const st = this.state().stats;
      const today = dayKey();
      if (!st.history[today]) st.history[today] = { n: 0, r: 0 };
      st.history[today].n += newCount;
      st.history[today].r += reviewCount;
      st.totalSeen = Object.keys(this.cards()).length;
      if (st.lastDay !== today) {
        const y = new Date(Date.now() - 86400000);
        const yesterday = dayKey(y);
        st.streak = st.lastDay === yesterday ? st.streak + 1 : 1;
        st.lastDay = today;
      }
      this.saveState();
    },

    /* ---- new-word queue (priority order, excluding known cards) ---- */
    newCandidates(limit, todayAdded) {
      const cards = this.cards();
      const out = [];
      const now = Date.now();
      // fresh words introduced earlier today already count toward the goal
      for (const k in cards) {
        const c = cards[k];
        if (c.added && (now - c.added) < 86400000) todayAdded++;
      }
      const need = Math.max(0, limit - todayAdded);
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
