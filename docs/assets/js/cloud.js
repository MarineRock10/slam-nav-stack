/* ============================================================
 * slam-nav-stack :: cloud sync service
 *
 * Persists all learning data (cards, state, unfamiliar deck,
 * suite progress, drafts, settings) to the GitHub repository as
 * data/progress.json via the Contents API. On page load the app
 * pulls the cloud copy (cloud wins); after any data change the
 * app pushes back with a short debounce. Requires a GitHub
 * fine-grained token with Contents read+write on this repo —
 * stored in browser localStorage (plain text, revoke anytime).
 * ============================================================ */
(function (global) {
  "use strict";

  const LS_TOKEN = "sls_cloud_token";
  const LS_ENABLED = "sls_cloud_enabled";
  const LS_LAST = "sls_cloud_last";
  const PATCH_KEYS = ["sls_cards", "sls_state", "sls_custom", "sls_unfamiliar"];

  let _applying = false;   // suppress echo pushes while applying a pull
  let _hooked = false;
  let _pushTimer = null;
  let _pushBusy = false;
  let _pendingPush = false;
  let _lastSig = "";       // signature of last successfully pushed snapshot

  const CloudSync = {
    onStatus: null,        // (msg) -> void, wired by the app to update the CONFIG modal

    get token() { try { return localStorage.getItem(LS_TOKEN) || ""; } catch (e) { return ""; } },
    get enabled() { try { return localStorage.getItem(LS_ENABLED) === "1"; } catch (e) { return false; } },

    owner() {
      // marinerock10.github.io -> marinerock10
      const h = global.location && global.location.hostname || "";
      const m = h.match(/^([a-z0-9-]+)\.github\.io$/i);
      return m ? m[1] : "MarineRock10";
    },
    repo() { return "slam-nav-stack"; },
    dataPath() { return "data/progress.json"; },
    apiUrl() {
      return "https://api.github.com/repos/" + this.owner() + "/" + this.repo() + "/contents/" + this.dataPath();
    },
    rawUrl() {
      return "https://raw.githubusercontent.com/" + this.owner() + "/" + this.repo() + "/main/" + this.dataPath();
    },

    /* ---- lifecycle: install the mutation hook once ---- */
    init() {
      if (_hooked) return;
      _hooked = true;
      const orig = Storage.prototype.setItem;
      const self = this;
      Storage.prototype.setItem = function (k, v) {
        orig.call(this, k, v);
        // any study/settings write schedules a cloud push
        if (!_applying && PATCH_KEYS.indexOf(k) !== -1) self.schedulePush();
      };
      if (global.document) {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") self.flushPush();
        });
      }
    },

    /* ---- snapshot of all learning data (same shape as backup v2) ---- */
    snapshot() {
      return {
        app: "slam-nav-stack",
        version: 3,
        updatedAt: new Date().toISOString(),
        cards: global.Lexicon ? Lexicon.cards() : {},
        state: global.Lexicon ? Lexicon.state() : null,
        unfamiliar: global.Lexicon ? Lexicon.getUnfamiliar() : {},
        custom: global.Lexicon ? Lexicon.getCustom() : {}
      };
    },

    /* ---- content signature (excludes updatedAt so unchanged data is skipped) ---- */
    _signature(data) {
      return JSON.stringify({
        cards: data.cards, state: data.state, unfamiliar: data.unfamiliar,
        custom: data.custom
      });
    },

    /* ---- pull: cloud wins, apply locally ---- */
    async pull() {
      try {
        const res = await fetch(this.rawUrl(), { cache: "no-store" });
        if (!res.ok) return { ok: false, reason: "HTTP " + res.status };
        const data = await res.json();
        if (!data || !data.cards) return { ok: false, reason: "bad payload" };
        _applying = true;
        try { this.apply(data); } finally { _applying = false; }
        _lastSig = this._signature(data);
        return { ok: true, at: data.updatedAt };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    apply(data) {
      const L = global.Lexicon;
      if (!L) return;
      // cards
      L._cards = data.cards || {};
      L.saveCards();
      // state (deep-merge settings so unknown fields keep defaults)
      L._state = Object.assign({}, L.state(), data.state || {});
      L._state.settings = Object.assign({}, L._state.settings, (data.state || {}).settings || {});
      L.saveState();
      // unfamiliar deck
      if (data.unfamiliar) {
        try { localStorage.setItem("sls_unfamiliar", JSON.stringify(data.unfamiliar)); } catch (e) {}
      }
      // custom lexicon entries
      if (data.custom) { L._custom = data.custom; L.saveCustom(); }
      L.refresh();
      try { localStorage.setItem(LS_LAST, data.updatedAt || ""); } catch (e) {}
    },

    /* ---- push: local wins, write to repo ---- */
    async push() {
      if (!this.token) return { ok: false, reason: "no token" };
      const snap = this.snapshot();
      const sig = this._signature(snap);
      if (sig === _lastSig) return { ok: true, at: null, skipped: true }; // nothing changed
      const json = JSON.stringify(snap);
      const content = this._b64(json);
      try {
        // fetch current file sha (404 => create new file)
        const head = await fetch(this.apiUrl(), {
          headers: { Authorization: "Bearer " + this.token, Accept: "application/vnd.github+json" }
        });
        const sha = head.ok ? (await head.json()).sha : null;
        const body = {
          message: "sync progress " + new Date().toISOString().slice(0, 10),
          content: content,
          sha: sha || undefined
        };
        const res = await fetch(this.apiUrl(), {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + this.token,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { ok: false, reason: err.message || "HTTP " + res.status };
        }
        _lastSig = sig;
        try { localStorage.setItem(LS_LAST, snap.updatedAt); } catch (e) {}
        return { ok: true, at: snap.updatedAt };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    },

    /* ---- debounced auto push after any data change ---- */
    schedulePush() {
      if (!this.enabled || !this.token) return;
      if (_pushTimer) clearTimeout(_pushTimer);
      _pushTimer = setTimeout(() => this.flushPush(), 4000);
    },
    async flushPush() {
      if (_pushBusy) { _pendingPush = true; return; }
      _pushBusy = true;
      do {
        _pendingPush = false;
        const r = await this.push();
        if (r.ok) {
          if (!r.skipped) this._status("CLOUD PUSHED " + new Date().toLocaleTimeString() + (r.at ? " (" + r.at.slice(0, 10) + ")" : ""));
        } else {
          this._status("CLOUD PUSH FAILED — " + r.reason + " (RETRIES ON NEXT CHANGE)");
        }
      } while (_pendingPush);
      _pushBusy = false;
    },

    _status(msg) { if (this.onStatus) this.onStatus(msg); },

    _b64(str) {
      // UTF-8 safe base64
      const bytes = new TextEncoder().encode(str);
      let bin = "";
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin);
    },

    saveToken(tok) { try { localStorage.setItem(LS_TOKEN, tok); } catch (e) {} },
    setEnabled(on) { try { localStorage.setItem(LS_ENABLED, on ? "1" : "0"); } catch (e) {} },
    lastSync() { try { return localStorage.getItem(LS_LAST) || ""; } catch (e) { return ""; } }
  };

  global.CloudSync = CloudSync;
})(window);
