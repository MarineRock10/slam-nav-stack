/* ============================================================
 * slam-nav-stack :: waypoint scheduler (spaced repetition core)
 *
 * SM-2-style scheduling adapted to a 4-point self-graded scale:
 *   0 = AGAIN (fail)   1 = HARD   2 = GOOD   3 = EASY
 *
 * Card state (per word):
 *   reps  : successful repetitions in a row
 *   ef    : ease factor (>= 1.3)
 *   ivl   : current interval in days
 *   due   : epoch-ms timestamp when the waypoint is due again
 *   lvl   : 0 new / 1 learning / 2 mature (derived, stored)
 *   added : epoch-ms when first introduced
 *   seen  : epoch-ms of last review
 * ============================================================ */
(function (global) {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;

  const SRS = {
    // initial ease factor for a new card
    INITIAL_EF: 2.5,

    // create the default state for a newly introduced word
    fresh() {
      return { reps: 0, ef: 2.5, ivl: 0, due: 0, lvl: 0, added: 0, seen: 0 };
    },

    // given a card state and a grade (0..3), return the updated state
    review(card, q) {
      const c = { ...card };
      c.seen = Date.now();

      if (q === 0) { // AGAIN: reset progress, redue immediately
        c.reps = 0;
        c.ivl = 1;
        c.ef = Math.max(1.3, c.ef - 0.2);
        c.due = Date.now() + 10 * 60 * 1000; // re-show within the session
        c.lvl = 1; // still inside the learning loop, never back to "new"
        return c;
      }

      if (q === 1) { // HARD: nudge forward, no ease penalty
        c.reps += 1;
        c.ivl = Math.max(1, Math.round((c.ivl || 1) * 0.8));
        c.due = Date.now() + c.ivl * DAY;
        c.lvl = c.ivl >= 21 ? 2 : 1;
        return c;
      }

      // GOOD / EASY: classic SM-2 steps
      c.reps += 1;
      if (c.reps === 1) {
        c.ivl = 1;
      } else if (c.reps === 2) {
        c.ivl = 6;
      } else {
        c.ivl = Math.round(c.ivl * c.ef);
      }
      if (q === 3) { // EASY: extra boost
        c.ef += 0.15;
        if (c.reps > 1) c.ivl = Math.round(c.ivl * 1.3);
      } else { // GOOD
        c.ef = c.ef + (0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02)); // standard q=4 step
      }
      c.ef = Math.max(1.3, Math.min(3.2, c.ef));
      c.ivl = Math.max(1, c.ivl);
      c.due = Date.now() + c.ivl * DAY;
      c.lvl = c.ivl >= 21 ? 2 : 1;
      return c;
    },

    // level label helpers
    isDue(card, now) {
      return !!card && card.due > 0 && card.due <= now;
    },
    lvlLabel(lvl) {
      return lvl === 0 ? "NEW" : lvl === 1 ? "LEARNING" : "MATURE";
    }
  };

  global.SRS = SRS;
})(window);
