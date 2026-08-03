/* ============================================================
 * slam-nav-stack :: unknown-word annotator
 *
 * Cross-module vocabulary linkage: practice texts (reading
 * passages, listening transcripts, writing prompts) are scanned
 * against the learner's card deck. Words the learner has never
 * studied are visually flagged, and double-clicking any word
 * opens a panel to push it into the memory deck hot zone.
 * ============================================================ */
(function (global) {
  "use strict";

  const STOP = new Set((
    "a an the and or but so if then than that this these those it its is are was were be been being " +
    "am do does did done have has had having will would shall should can could may might must " +
    "of to in on at by for with from into onto over under through during before after between " +
    "as about against among within without across along beyond near off out up down " +
    "i you he she we they me him her us them my your his their our its " +
    "what which who whom whose where when why how not no nor too very also just only even " +
    "there here some any all both each every few more most other another such same own " +
    "because while although though unless whether despite since until once " +
    "per via etc e g ie vs ok yes " +
    "would could should must need used use using uses used make makes made making " +
    "take takes took taken taking get gets got gotten getting see sees saw seen seeing " +
    "come comes came coming go goes went gone going know knows knew known knowing " +
    "say says said saying think thinks thought thinking find finds found finding " +
    "give gives gave given giving tell tells told telling work works worked working " +
    "call calls called calling try tries tried trying ask asks asked asking " +
    "need needs needed needing seem seems seemed seeming help helps helped helping " +
    "show shows showed shown showing " +
    "become becomes became becoming begin begins began begun beginning " +
    "bring brings brought bringing build builds built building buy buys bought buying " +
    "catch catches caught catching choose chooses chose chosen choosing " +
    "feel feels felt feeling keep keeps kept keeping leave leaves left leaving " +
    "let lets let letting put puts put putting run runs ran running set sets set setting " +
    "stand stands stood standing start starts started starting stay stays stayed staying " +
    "turn turns turned turning walk walks walked walking want wants wanted wanting " +
    "word words thing things way ways year years day days time times life lives " +
    "new old good bad big small high low long short great little large " +
    "one two three four five six seven eight nine ten " +
    "many much most more less least few several hundred thousand million billion " +
    "ago ever never always often sometimes usually rarely well also here there " +
    "already still yet soon later early today tomorrow yesterday now then"
  ).split(/\s+/));

  const WordAnnotate = {
    /* stemmer: reuse the lexicon service's suffix stripping (single source) */
    stem(w) {
      return global.Lexicon ? Lexicon.stem(w) : String(w);
    },

    _cards: null,
    cards() {
      if (!this._cards) this._cards = global.Lexicon ? Lexicon.cards() : {};
      return this._cards;
    },
    refresh() { this._cards = null; },

    isKnown(key) {
      const cards = this.cards();
      if (cards[key]) return true;
      const s = this.stem(key);
      return s !== key && !!cards[s];
    },

    /* words in the text the learner has never studied (excluding stop words) */
    unknownKeys(text) {
      const out = new Set();
      const re = /[a-z][a-z'-]*/g;
      let m;
      while ((m = re.exec(String(text).toLowerCase()))) {
        const k = m[0];
        if (k.includes("'")) continue;
        if (STOP.has(k)) continue;
        if (!this.isKnown(k)) out.add(k);
      }
      return out;
    },

    /* wrap unknown words in flagged spans */
    annotate(text) {
      const unknown = this.unknownKeys(text);
      if (!unknown.size) return this.esc(text);
      return String(text).replace(/\b([A-Za-z][A-Za-z'-]*)\b/g, (m, w) => {
        const k = w.toLowerCase();
        if (unknown.has(k)) return '<span class="unk-word" data-w="' + k + '">' + m + "</span>";
        return m;
      });
    },

    /* delegated double-click handling for any practice container */
    bind(container) {
      container.addEventListener("dblclick", (e) => {
        const t = e.target;
        let word = null;
        if (t && t.classList && t.classList.contains("unk-word") && t.dataset.w) {
          word = t.dataset.w;
        } else {
          const sel = "";
          try { sel = global.getSelection ? global.getSelection().toString() : ""; } catch (err) {}
          const m = String(sel).trim().match(/[a-z][a-z'-]+/i);
          if (m) word = m[0].toLowerCase();
        }
        if (word && this.isKnown(word)) {
          // still allow flagging known words (reinforcement)
        }
        if (word) this.showPanel(word);
      });
    },

    /* ---- unknown-word panel ---- */
    _current: null,

    showPanel(word) {
      const ent = global.Lexicon ? Lexicon.get(word) : null;
      const modal = document.getElementById("unkModal");
      if (!modal) return;
      document.getElementById("unkWord").textContent = ent ? ent.w : word;
      const phon = [];
      if (ent && ent.uk) phon.push("UK " + ent.uk);
      if (ent && ent.us) phon.push("US " + ent.us);
      document.getElementById("unkPhonetic").textContent = phon.join("  ");
      document.getElementById("unkDef").innerHTML =
        (ent && ent.d ? '<div class="card-def">' + this.esc(ent.d) + "</div>" : "") +
        (ent && ent.t ? '<div class="card-def zh">' + this.esc(ent.t) + "</div>" : "") +
        (!ent ? '<div class="card-def zh">(not in lexicon — added as-is)</div>' : "");
      const isUnf = global.Lexicon && Lexicon.isUnfamiliar(word);
      const addBtn = document.getElementById("btnUnkAdd");
      addBtn.textContent = isUnf ? "✓ ALREADY IN DECK" : "⇪ ADD TO MEMORY DECK";
      addBtn.disabled = isUnf;
      this._current = word;
      modal.hidden = false;
    },

    closePanel() {
      const modal = document.getElementById("unkModal");
      if (modal) modal.hidden = true;
      this._current = null;
    },

    addCurrent() {
      if (!this._current) return;
      if (global.Lexicon) {
        Lexicon.addUnfamiliar(this._current, "practice");
        if (global.App && App.renderStats) App.renderStats();
      }
      const addBtn = document.getElementById("btnUnkAdd");
      addBtn.textContent = "✓ ADDED TO MEMORY DECK";
      addBtn.disabled = true;
      const fb = document.getElementById("unkTag");
      if (fb) fb.textContent = "FLAGGED ✓";
    },

    esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
  };

  global.WordAnnotate = WordAnnotate;
})(window);
