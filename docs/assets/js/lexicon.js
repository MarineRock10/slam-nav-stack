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
      goalAuto: true,                 // auto-follow the DDL suggestion
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
      // offline-completed Chinese glosses + IPA for core-vocab words
      // that ielts-data.js never shipped (识别选项从此不再空白)
      const cz = global.CORE_ZH || {};
      for (const k in cz) {
        const ent = this.get(k);
        if (!ent) continue;
        if (!ent.t && cz[k].t) ent.t = cz[k].t;
        if (!ent.us && cz[k].us) ent.us = cz[k].us;
        if (!ent.uk && cz[k].uk) ent.uk = cz[k].uk;
      }
      // English sense definitions (4000 EEW / WordNet) fill gaps:
      // curated core-vocab definitions above always win.
      const defs = global.IELTS_DEFS || {};
      for (const k in defs) {
        const ent = this.get(k);
        if (!ent) continue;
        if (!ent.d && defs[k].d) ent.d = defs[k].d;
        if (!ent.e && defs[k].e) ent.e = defs[k].e;
      }
      // AI-authored definitions cover every remaining word (full coverage)
      const gen = global.IELTS_DEFS_GEN || {};
      for (const k in gen) {
        const ent = this.get(k);
        if (!ent) continue;
        if (!ent.d && gen[k][0]) ent.d = gen[k][0];
        if (!ent.e && gen[k][1]) ent.e = gen[k][1];
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

    /* rebuild the merged lexicon map after external data changes (cloud sync) */
    refresh() { _lexicon = null; return this.load(); },

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
     * Builds word -> sentence(s) from the English definition and
     * example sentences of the lexicon itself (defs + core-vocab),
     * so gap-fill exercises use short, natural sentences. Indexed
     * by stem. Sentences are kept short (12-160 chars) — long
     * corpus passages no longer feed the study flow. */
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
          if (t.length < 12 || t.length > 160) continue;
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
      // English definition/example sentences (4000 EEW etc.)
      const defs = g.IELTS_DEFS || {};
      for (const k in defs) {
        if (defs[k].e) addSentence(defs[k].e);
        if (defs[k].d) addSentence(defs[k].d);
      }
      // AI-authored example sentences complete the coverage
      const gen = g.IELTS_DEFS_GEN || {};
      for (const k in gen) {
        if (gen[k][1]) addSentence(gen[k][1]);
      }
      // curated example sentences
      const core = g.CORE_VOCAB || {};
      for (const k in core) if (core[k].e) addSentence(core[k].e);
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

    /* ---- cognitive theme arc (认知弧线) ----
     * Each word is tagged to one of the 22 arc themes via
     * THEME_MATCH (Chinese gloss + EN definition + word stem).
     * A word with no hit belongs to the GENERAL pool and is
     * scheduled as filler around the arc themes. Plural rows
     * ("accidents" glossed as "事故的复数") retry with the stem. */
    _themeCache: null,
    themeOf(key) {
      const k = String(key).toLowerCase();
      if (this._themeCache) {
        const c = this._themeCache.get(k);
        return c === undefined ? null : c;
      }
      if (!global.THEME_MATCH) return null;
      this._themeCache = new Map();
      const m = this.load();
      for (const [word, ent] of m) {
        let t = global.THEME_MATCH(word, ent.t, (ent.d || "") + " " + (ent.e || ""));
        if (!t) {
          const st = this.stem(word);
          if (st !== word) {
            const pe = m.get(st);
            if (pe && pe !== ent) {
              t = global.THEME_MATCH(st, pe.t, (pe.d || "") + " " + (pe.e || ""));
            }
          }
        }
        this._themeCache.set(word, t);
      }
      return this._themeCache.get(k) === undefined ? null : this._themeCache.get(k);
    },

    /* theme id -> words of the study lexicon in that theme
     * (arc order preserved when iterating THEME_ARC) */
    themePool(themeId) {
      const out = [];
      for (const key of this.load().keys()) {
        if (this.themeOf(key) === themeId) out.push(key);
      }
      return out;
    },

    /* the first arc theme that still has unstudied words (no card
     * yet) — the theme the daily new-word budget is drawn from */
    currentTheme() {
      const cards = this.cards();
      const arc = global.THEME_ARC || [];
      for (const t of arc) {
        for (const w of this.themePool(t.id)) {
          if (!cards[w]) return t;
        }
      }
      return arc[arc.length - 1] || null;
    },

    /* per-theme progress for the THEME ARC panel */
    themeStats() {
      const cards = this.cards();
      const arc = global.THEME_ARC || [];
      const out = [];
      let general = { learned: 0, total: 0 };
      const pools = {};
      for (const t of arc) pools[t.id] = this.themePool(t.id);
      for (const t of arc) {
        let total = 0, learned = 0;
        for (const w of pools[t.id]) {
          total++;
          if (cards[w]) learned++;
        }
        out.push({ id: t.id, name: t.name, total, learned, done: total > 0 && learned >= total });
      }
      // general pool (untagged words)
      for (const key of this.load().keys()) {
        const t = this.themeOf(key);
        if (!t) {
          general.total++;
          if (cards[key]) general.learned++;
        }
      }
      return { arc: out, general };
    },

    /* ---- word family (词根/词族) ----
     * 1) root hits: word starts with / ends with / follows a known
     *    prefix before a root (con+tempor+ary); EXCLUDE guards
     *    known collisions ("sol" ≠ solve).
     * 2) rule family: strip a derivational suffix and cluster
     *    lexicon words sharing the stem. */
    _PREFIX_LIST: null,
    wordFamily(key) {
      const lower = String(key).toLowerCase();
      if (lower.length < 3) return { roots: [], family: [] };
      const roots = [];
      const ex = global.ROOT_EXCLUDE || {};
      const exclude = (r) => (ex[r] || []).indexOf(lower) >= 0;
      const PREFIXES = global.WORD_PREFIXES || [];
      const stripPrefix = (w) => {
        for (const [p] of PREFIXES) {
          if (w.startsWith(p) && w.length > p.length + 2) return w.slice(p.length);
        }
        return w;
      };
      // roots: [root, meaning, examples]
      for (const row of (global.WORD_ROOTS || [])) {
        const [r, m, exs] = row;
        if (r.length < 3 || exclude(r)) continue;
        let hit = false;
        if (lower.startsWith(r)) hit = true;
        else if (lower.endsWith(r) && lower.length > r.length + 1) hit = true;
        else if (stripPrefix(lower).startsWith(r)) hit = true;
        if (hit) {
          roots.push({ r: r, m: m, ex: String(exs).split(" ").slice(0, 3) });
          if (roots.length >= 2) break;
        }
      }
      // rule family via suffix stripping
      const family = [];
      const SUFFIXES = global.ROOT_SUFFIXES || [];
      for (const suf of SUFFIXES) {
        if (lower.endsWith(suf) && lower.length - suf.length >= 4) {
          const stem = lower.slice(0, -suf.length);
          for (const w of this.load().keys()) {
            if (w === lower) continue;
            if (w.startsWith(stem) || (w.endsWith("s") && w.slice(0, -1) === stem) ||
                (w.endsWith("es") && w.slice(0, -2) === stem) ||
                (w.endsWith("ied") && w.slice(0, -3) + "y" === stem)) {
              if (!family.includes(w)) family.push(w);
            }
            if (family.length >= 5) break;
          }
          break;
        }
      }
      return { roots: roots, family: family };
    },

    /* up to `limit` real sentences containing the word (any inflection).
     * Falls back to the word's curated/EEW example, then its English
     * definition sentence, so every word can be studied in context. */
    exampleSentences(word, limit) {
      const idx = this.buildExampleIndex();
      const key = this.stem(String(word).toLowerCase());
      const out = [];
      const re = new RegExp("\\b" + this.escapeRegExp(key) + "[a-z]*\\b", "i");
      for (const s of (idx[key] || [])) {
        if (re.test(s)) out.push(s);
        if (out.length >= (limit || 2)) break;
      }
      if (!out.length) {
        const ent = this.get(word);
        if (ent && ent.e) out.push(ent.e);
        else if (ent && ent.d) out.push(ent.d);
      }
      return out;
    },

    /* ---- sentence bank (句表) ----
     * Reverse index: every short English definition/example
     * sentence mapped to the study words it contains, so daily
     * groups can be built around one scene that carries several
     * words at once. */
    _bank: null,
    buildSentenceBank() {
      if (this._bank) return this._bank;
      const idx = this.buildExampleIndex();
      const sents = [];
      const seen = new Set();
      for (const k in idx) {
        for (const s of idx[k]) {
          if (!seen.has(s)) { seen.add(s); sents.push(s); }
        }
      }
      // stem -> word keys (only words of the study lexicon)
      const stemMap = {};
      for (const key of this.load().keys()) {
        const st = this.stem(key);
        if (st.length < 3) continue;
        (stemMap[st] = stemMap[st] || []).push(key);
      }
      const bank = [];
      for (const s of sents) {
        const toks = s.match(/[A-Za-z][A-Za-z'-]*/g) || [];
        const keys = new Set();
        const lower = s.toLowerCase();
        for (const t of toks) {
          const ws = stemMap[this.stem(t.toLowerCase())];
          if (!ws) continue;
          for (const w of ws) {
            if (w.length >= 3 && lower.includes(w.toLowerCase())) keys.add(w);
          }
        }
        if (keys.size >= 2) bank.push({ s: s, words: Array.from(keys) });
      }
      bank.sort((a, b) => b.words.length - a.words.length);
      this._bank = bank;
      return bank;
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
     * sense = { pos, zh, en, ex } — Chinese meaning from the list,
     * English gloss paired per-sense when the data allows (curated
     * multi-part definitions, WordNet gloss order), else attached
     * to the first sense and visible as the word-level EN line. */
    _POS_RE: /^(n|v|vt|vi|adj|adv|prep|conj|art|pron|num|aux|int|abbr)\./i,
    senses(word) {
      const ent = this.get(word);
      if (!ent) return [];
      const parts = String(ent.t || "").split(/[；;]/).map((s) => s.trim()).filter(Boolean);
      const posOf = (s) => {
        const m = s.match(this._POS_RE);
        return m ? m[1].toUpperCase() : "";
      };
      const enParts = String(ent.d || "").split(/[；;]/).map((s) => s.trim()).filter(Boolean);
      const out = [];
      if (!parts.length) {
        return [{ pos: "", zh: "", en: enParts[0] || "", ex: ent.e || "" }];
      }
      // POS buckets for fallback alignment when counts differ
      const enByPos = {};
      for (const p of enParts) {
        const pos = posOf(p);
        (enByPos[pos] = enByPos[pos] || []).push(p.replace(this._POS_RE, "").trim() || p);
      }
      let used = 0;
      for (let i = 0; i < parts.length; i++) {
        const pos = posOf(parts[i]);
        const zh = parts[i].replace(this._POS_RE, "").trim();
        let en = "";
        if (enParts.length === parts.length) {
          en = enParts[i].replace(this._POS_RE, "").trim();
        } else if (enParts.length === 1) {
          if (i === 0) en = enParts[0];
        } else if (pos && enByPos[pos] && enByPos[pos].length) {
          en = enByPos[pos].shift();
        } else if (used < enParts.length) {
          en = enParts[used].replace(this._POS_RE, "").trim();
          used++;
        }
        out.push({ pos, zh, en, ex: i === 0 ? (ent.e || "") : "" });
      }
      return out;
    },

    /* ---- sentence-bank Chinese translations ----
     * SENTENCE_ZH = [[en, zh], ...] covering the sentence bank, so
     * scene sentences show a Chinese gloss under the English text. */
    _zhMap: null,
    sentenceZh(sentence) {
      if (!this._zhMap) {
        this._zhMap = new Map();
        const arr = global.SENTENCE_ZH || [];
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] && arr[i][0]) this._zhMap.set(arr[i][0], arr[i][1]);
        }
      }
      return this._zhMap.get(String(sentence || "").trim()) || "";
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
        version: 2,
        exportedAt: new Date().toISOString(),
        cards: this.cards(),
        state: this.state(),
        unfamiliar: this.getUnfamiliar(),
        custom: this.getCustom(),
        suite: global.Suite ? Suite.progress() : null,
        drafts: readLS("sls_drafts", {})
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
      if (data && data.unfamiliar) {
        writeLS(LS_UNFAMILIAR, data.unfamiliar);
      }
      if (data && data.custom) {
        _custom = data.custom;
        this.saveCustom();
      }
      if (data && data.suite && global.Suite) {
        Suite._data = data.suite;
        Suite.save();
      }
      if (data && data.drafts) {
        writeLS("sls_drafts", data.drafts);
      }
      this._lexicon = null;
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
