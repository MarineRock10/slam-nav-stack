/* ============================================================
 * slam-nav-stack :: mission report generator (IELTS writing)
 *
 * Writing task bank (Task 1 / Task 2) with an on-page editor,
 * live word count, band-oriented phrase banks and a four-axis
 * self-assessment checklist. Writing is stored locally per task.
 * ============================================================ */
(function (global) {
  "use strict";

  const PHRASE_BANK = {
    task1: {
      "Openings": [
        "The chart illustrates the changes in … over the period from … to …",
        "The graph provides a breakdown of … between … and …",
        "The table compares the figures for … across …",
        "The process diagram shows the stages involved in …"
      ],
      "Trends": [
        "There was a steady/gradual/sharp rise in …",
        "… experienced a significant decline over the period.",
        "The figure for … remained relatively stable at around …",
        "… fluctuated considerably, peaking at … in …",
        "… saw a twofold increase between … and …"
      ],
      "Comparison": [
        "By contrast, … was significantly lower than …",
        "… outstripped … throughout the period.",
        "While … increased, … fell correspondingly.",
        "The gap between … and … narrowed/widened over time."
      ],
      "Closing": [
        "Overall, the most striking feature is …",
        "To sum up, … followed broadly similar patterns.",
        "In conclusion, … remained the dominant category throughout."
      ]
    },
    task2: {
      "Opinions": [
        "It is often argued that …",
        "While some people believe …, others contend that …",
        "There is a growing consensus that …",
        "I strongly agree that …, although … deserves consideration."
      ],
      "Concession": [
        "Admittedly, … does carry certain benefits.",
        "It must be acknowledged that …",
        "Despite these advantages, the drawbacks are considerable."
      ],
      "Causation": [
        "This can be attributed to …",
        "A key factor driving this trend is …",
        "The root cause lies in …",
        "As a result, … has far-reaching implications for …"
      ],
      "Examples": [
        "For instance, …",
        "A case in point is …",
        "This is particularly evident in …",
        "Take … as an example."
      ],
      "Conclusion": [
        "In conclusion, while … is not without merit, the benefits clearly outweigh the drawbacks.",
        "To conclude, a balanced approach is essential if … is to be achieved.",
        "Ultimately, the decision rests on striking a compromise between … and …"
      ]
    }
  };

  const CHECKLIST = [
    { k: "task", label: "TASK RESPONSE — all parts of the question addressed", ok: "all parts answered; position clear" },
    { k: "structure", label: "COHERENCE — clear intro / body / conclusion with logical flow", ok: "clear paragraphing; ideas sequenced" },
    { k: "cohesion", label: "COHESION — linking words used naturally", ok: "varied connectives, not overused" },
    { k: "vocab", label: "LEXICAL RESOURCE — precise, varied vocabulary", ok: "topic-specific words; no repetition" },
    { k: "grammar", label: "GRAMMATICAL RANGE — complex sentences, accurate", ok: "mix of simple/complex; few errors" },
    { k: "words", label: "WORD COUNT — meets the minimum", ok: "Task 1 ≥ 150 · Task 2 ≥ 250" }
  ];

  const Writing = {
    state: null,      // { task, container }
    onProgress: null,

    showTasks(container, from) {
      const tasks = global.WRITING_TASKS || [];
      let html = "";
      if (from) {
        html += '<div class="suite-head"><button class="btn" id="wrBackMod">◂ MODULE</button></div>';
      }
      html += '<div class="suite-grid">';
      for (const t of tasks) {
        html +=
          '<button class="suite-card" data-task="' + t.id + '">' +
          '<span class="suite-card-title">' + (t.type === "task1" ? "TASK 1" : "TASK 2") +
          ' — ' + this.esc(t.title) + "</span>" +
          '<span class="suite-card-sub">' + (t.time || "-") + " · MIN " + (t.min || "-") + " WORDS</span>" +
          "</button>";
      }
      html += "</div>";
      html +=
        '<div class="panel suite-result">' +
        '<div class="panel-title"><span class="pt-dot"></span>BAND PHRASE BANK <span class="pt-tag">REFERENCE</span></div>' +
        '<div class="ph-bank">' + this.renderPhrases() + "</div></div>";
      container.innerHTML = html;
      if (from) {
        container.querySelector("#wrBackMod").addEventListener("click", () => Suite.renderModule("write", container));
      }
      container.querySelectorAll(".suite-card").forEach((b) =>
        b.addEventListener("click", () => this.openTask(b.dataset.task, container)));
    },

    renderPhrases() {
      let html = "";
      for (const part of ["task1", "task2"]) {
        html += '<div class="ph-part"><div class="ph-part-title">' + (part === "task1" ? "TASK 1" : "TASK 2") + "</div>";
        for (const cat in PHRASE_BANK[part]) {
          html += '<div class="ph-cat">' + cat + "</div><ul class='ph-list'>" +
            PHRASE_BANK[part][cat].map((p) => "<li>" + this.esc(p) + "</li>").join("") + "</ul>";
        }
        html += "</div>";
      }
      return html;
    },

    openTask(taskId, container) {
      const task = (global.WRITING_TASKS || []).find((t) => t.id === taskId);
      if (!task) return;
      this.state = { task, container };
      this.renderTask();
    },

    renderTask() {
      const st = this.state;
      const t = st.task;
      const c = st.container;
      const saved = this.getSaved(t.id);

      c.innerHTML =
        '<div class="suite-head"><button class="btn" id="wrBack">◂ ALL TASKS</button>' +
        '<div class="suite-title">' + (t.type === "task1" ? "TASK 1" : "TASK 2") +
        '<span class="pt-tag">' + (t.time || "") + "</span></div></div>" +
        '<div class="wr-layout">' +
        '<div class="panel"><div class="panel-title"><span class="pt-dot"></span>MISSION BRIEF</div>' +
        '<div class="wr-prompt" id="wrPrompt">' + (global.WordAnnotate ? WordAnnotate.annotate(t.prompt) : this.esc(t.prompt)) + "</div>" +
        '<div class="wr-meta">MIN WORDS ' + (t.min || "-") + (t.max ? " · MAX " + t.max : "") + "</div>" +
        '<div class="panel-title"><span class="pt-dot"></span>PHRASE BANK</div>' +
        '<div class="ph-bank ph-inline">' + this.renderPhrasesFor(t.type) + "</div></div>" +
        '<div class="panel"><div class="panel-title"><span class="pt-dot"></span>REPORT DRAFT</div>' +
        '<textarea id="wrText" class="wr-textarea" placeholder="WRITE YOUR REPORT HERE...">' + this.esc(saved || "") + "</textarea>" +
        '<div class="wr-count" id="wrCount">0 WORDS</div>' +
        '<button class="btn" id="wrSave">⇩ SAVE DRAFT (LOCAL)</button>' +
        '<div class="panel-title"><span class="pt-dot"></span>SELF-ASSESSMENT</div>' +
        '<div class="chk-list">' +
        CHECKLIST.map((c2, i) =>
          '<label class="chk"><input type="checkbox" data-chk="' + i + '"> <span>' + c2.label + "</span></label>"
        ).join("") +
        "</div>" +
        '<div class="check-bar"><button class="btn btn-primary" id="wrDone">✓ MARK AS COMPLETE</button></div>' +
        '<div class="item-feedback" id="wrFb"></div></div>' +
        "</div>";

      c.querySelector("#wrBack").addEventListener("click", () => this.showTasks(c));
      if (global.WordAnnotate) WordAnnotate.bind(c.querySelector("#wrPrompt"));
      const ta = c.querySelector("#wrText");
      const count = () => {
        const n = (ta.value.trim().match(/\S+/g) || []).length;
        c.querySelector("#wrCount").textContent = n + " WORDS" + (t.min && n < parseInt(t.min, 10) ? " — BELOW MINIMUM" : "");
      };
      ta.addEventListener("input", count);
      count();
      c.querySelector("#wrSave").addEventListener("click", () => {
        this.saveDraft(t.id, ta.value);
        const fb = c.querySelector("#wrFb");
        fb.className = "item-feedback ok";
        fb.textContent = "DRAFT SAVED LOCALLY";
      });
      c.querySelector("#wrDone").addEventListener("click", () => {
        const n = (ta.value.trim().match(/\S+/g) || []).length;
        const min = parseInt(t.min || (t.type === "task2" ? "250" : "150"), 10);
        const checks = c.querySelectorAll('[data-chk]');
        const done = Array.from(checks).filter((x) => x.checked).length;
        const fb = c.querySelector("#wrFb");
        if (n < min) { fb.className = "item-feedback err"; fb.textContent = "BELOW MINIMUM WORD COUNT (" + min + ")"; return; }
        if (done < CHECKLIST.length) { fb.className = "item-feedback err"; fb.textContent = "COMPLETE ALL SELF-ASSESSMENT ITEMS (" + done + "/" + CHECKLIST.length + ")"; return; }
        this.saveDraft(t.id, ta.value);
        if (this.onProgress) this.onProgress("writing", t.id, 100);
        fb.className = "item-feedback ok";
        fb.textContent = "TASK MARKED COMPLETE — LOGGED IN PROGRESS";
      });
    },

    renderPhrasesFor(type) {
      let html = "";
      for (const cat in PHRASE_BANK[type]) {
        html += '<div class="ph-cat">' + cat + "</div><ul class='ph-list'>" +
          PHRASE_BANK[type][cat].map((p) => "<li>" + this.esc(p) + "</li>").join("") + "</ul>";
      }
      return html;
    },

    /* ---- local draft storage ---- */
    getSaved(id) {
      try {
        const d = JSON.parse(localStorage.getItem("sls_drafts") || "{}");
        return d[id] || "";
      } catch (e) { return ""; }
    },
    saveDraft(id, text) {
      try {
        const d = JSON.parse(localStorage.getItem("sls_drafts") || "{}");
        d[id] = text;
        localStorage.setItem("sls_drafts", JSON.stringify(d));
      } catch (e) { /* quota */ }
    },

    esc(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }
  };

  global.Writing = Writing;
})(window);
