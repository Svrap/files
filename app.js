/* ============================================================
   ARIS site logic
   - Parses the survey CSV export
   - Calculates every number shown on the page
   - Renders those numbers into the DOM
   - Handles scroll reveals, count-up animation, and the
     pinned architecture build
   ============================================================ */

(function () {
  "use strict";

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     0. Fallback numbers.
     Used the moment the page opens, before any CSV is loaded,
     and again any time a CSV can't be read. These are the
     numbers from the last CSV actually processed (n=21).
  --------------------------------------------------------- */
  var DEFAULT_STATS = {
    n: 21,
    roles: [
      { label: "Engineer / Developer", count: 8 },
      { label: "New Joiner", count: 5 },
      { label: "Analyst", count: 3 },
      { label: "Senior Engineer", count: 3 },
      { label: "Technical Lead", count: 2 }
    ],
    painPoints: [
      { label: "Finding project documentation or decisions", pct: 76 },
      { label: "Understanding columns and business definitions", pct: 62 },
      { label: "Identifying the right SME or owner", pct: 48 },
      { label: "Troubleshooting data or process issues", pct: 48 }
    ],
    fixesWanted: [
      { label: "Improved documentation standards", pct: 67 },
      { label: "A single searchable home for project knowledge", pct: 62 },
      { label: "More consistent metadata and definitions", pct: 57 },
      { label: "Clear ownership and SME information", pct: 52 }
    ],
    aiValue: {
      atLeastModerate: 95,
      veryOrExtremely: 76,
      extremely: 8,
      very: 8,
      moderately: 4,
      not: 1
    },
    timeCost: { lostPerWeek: 1.5, recoverablePerWeek: 1.7, annualProjected: 1700 }
  };

  /* ---------------------------------------------------------
     1. CSV parsing
     A real character-by-character parser, not a naive
     comma-split — the export has quoted fields containing
     commas, newlines, and embedded quotes.
  --------------------------------------------------------- */
  function parseCSV(text) {
    var rows = [],
      row = [],
      field = "",
      inQuotes = false,
      i = 0,
      len = text.length;

    while (i < len) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(field);
        field = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += c;
      i++;
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function findCol(headers, needle) {
    needle = needle.toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toLowerCase().indexOf(needle) !== -1) return i;
    }
    return -1;
  }

  /* Known survey option set -> hours, for the two time-range questions */
  function hoursFromRange(raw) {
    if (!raw) return null;
    var s = String(raw).toLowerCase();
    if (s.indexOf("less than 30") !== -1) return 0.25;
    if (s.indexOf("more than 4") !== -1) return 5;
    if (s.indexOf("30 minutes") !== -1) return 0.75;
    if (s.indexOf("2") !== -1 && s.indexOf("4") !== -1) return 3;
    if (s.indexOf("1") !== -1 && s.indexOf("2") !== -1) return 1.5;
    return null;
  }

  /* ---------------------------------------------------------
     2. Turn parsed rows into the exact numbers the page shows
  --------------------------------------------------------- */
  function computeStats(rows) {
    if (!rows.length) throw new Error("empty file");
    var headers = rows[0];
    var data = rows
      .slice(1)
      .filter(function (r) {
        return r.length > 1 && r.join("").trim() !== "";
      });
    var n = data.length;
    if (!n) throw new Error("no responses found");

    var roleCol = findCol(headers, "role best describes");
    var challengeCol = findCol(headers, "greatest productivity challenges");
    var improveCol = findCol(headers, "greatest positive impact");
    var aiCol = findCol(headers, "ai-powered project knowledge assistant");
    var spentCol = findCol(headers, "estimate you spend each week");
    var savedCol = findCol(headers, "estimate could be saved");

    if (roleCol === -1 || challengeCol === -1 || improveCol === -1 || aiCol === -1) {
      throw new Error("expected survey columns not found");
    }

    /* roles */
    var roleCounts = {};
    data.forEach(function (r) {
      var role = (r[roleCol] || "").trim();
      if (!role) return;
      roleCounts[role] = (roleCounts[role] || 0) + 1;
    });
    var roles = Object.keys(roleCounts)
      .map(function (k) {
        return { label: k, count: roleCounts[k] };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });

    /* multi-select questions: semicolon-separated within one field */
    function tallyMulti(col) {
      var counts = {};
      data.forEach(function (r) {
        var raw = r[col] || "";
        raw
          .split(";")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean)
          .forEach(function (item) {
            counts[item] = (counts[item] || 0) + 1;
          });
      });
      return Object.keys(counts)
        .map(function (k) {
          return { label: k, count: counts[k], pct: Math.round((counts[k] / n) * 100) };
        })
        .filter(function (c) {
          return c.label.toLowerCase() !== "other";
        })
        .sort(function (a, b) {
          return b.count - a.count;
        });
    }
    var painPoints = tallyMulti(challengeCol).slice(0, 4);
    var fixesWanted = tallyMulti(improveCol).slice(0, 4);

    /* AI assistant value (single choice, but exported with a trailing ";") */
    var aiCounts = { extremely: 0, very: 0, moderately: 0, not: 0 };
    data.forEach(function (r) {
      var v = (r[aiCol] || "").toLowerCase();
      if (v.indexOf("extremely") !== -1) aiCounts.extremely++;
      else if (v.indexOf("very") !== -1) aiCounts.very++;
      else if (v.indexOf("moderately") !== -1) aiCounts.moderately++;
      else if (v.indexOf("not") !== -1) aiCounts.not++;
    });
    var atLeastModerate = Math.round(
      ((aiCounts.extremely + aiCounts.very + aiCounts.moderately) / n) * 100
    );
    var veryOrExtremely = Math.round(((aiCounts.extremely + aiCounts.very) / n) * 100);

    /* time cost */
    var avg = function (arr) {
      return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0;
    };
    var spentVals = spentCol === -1 ? [] : data.map(function (r) { return hoursFromRange(r[spentCol]); }).filter(function (v) { return v != null; });
    var savedVals = savedCol === -1 ? [] : data.map(function (r) { return hoursFromRange(r[savedCol]); }).filter(function (v) { return v != null; });
    var lostPerWeek = Math.round(avg(spentVals) * 10) / 10;
    var recoverablePerWeek = Math.round(avg(savedVals) * 10) / 10;
    var annualProjected = Math.round(
      savedVals.reduce(function (a, b) { return a + b; }, 0) * 48
    );

    return {
      n: n,
      roles: roles,
      painPoints: painPoints.map(function (c) { return { label: c.label, pct: c.pct }; }),
      fixesWanted: fixesWanted.map(function (c) { return { label: c.label, pct: c.pct }; }),
      aiValue: {
        atLeastModerate: atLeastModerate,
        veryOrExtremely: veryOrExtremely,
        extremely: aiCounts.extremely,
        very: aiCounts.very,
        moderately: aiCounts.moderately,
        not: aiCounts.not
      },
      timeCost: {
        lostPerWeek: lostPerWeek,
        recoverablePerWeek: recoverablePerWeek,
        annualProjected: annualProjected
      }
    };
  }

  /* ---------------------------------------------------------
     3. Rendering — takes a stats object, fills every dynamic
     spot on the page
  --------------------------------------------------------- */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderRoleGrid(stats) {
    var html =
      '<div class="stat"><div class="stat-num" data-count="' +
      stats.n +
      '">0</div><div class="stat-label">responses</div></div>';
    stats.roles.forEach(function (r) {
      html +=
        '<div class="stat"><div class="stat-num" data-count="' +
        r.count +
        '">0</div><div class="stat-label">' +
        esc(r.label) +
        "</div></div>";
    });
    document.getElementById("roleStatsGrid").innerHTML = html;
  }

  function renderStatList(containerId, items) {
    document.getElementById(containerId).innerHTML = items
      .map(function (it) {
        return (
          '<div class="stat"><div class="stat-num" data-count="' +
          it.pct +
          '" data-suffix="%">0%</div><div class="stat-label">' +
          esc(it.label) +
          "</div></div>"
        );
      })
      .join("");
  }

  function renderAiValue(stats) {
    var big = document.getElementById("aiValueBig");
    big.setAttribute("data-count", stats.aiValue.atLeastModerate);
    big.setAttribute("data-suffix", "%");
    big.textContent = "0%";
    var second = document.getElementById("aiValueSecond");
    second.setAttribute("data-count", stats.aiValue.veryOrExtremely);
    second.setAttribute("data-suffix", "%");
    second.textContent = "0%";
    var n = stats.n,
      seg = stats.aiValue;
    document.getElementById("propBar").innerHTML =
      '<span style="width:' + (seg.extremely / n) * 100 + '%; background:#1d1d1f"></span>' +
      '<span style="width:' + (seg.very / n) * 100 + '%; background:rgba(29,29,31,0.62)"></span>' +
      '<span style="width:' + (seg.moderately / n) * 100 + '%; background:rgba(29,29,31,0.32)"></span>' +
      '<span style="width:' + (seg.not / n) * 100 + '%; background:rgba(29,29,31,0.14)"></span>';
    document.getElementById("propLegend").innerHTML =
      "<span>Extremely — " + seg.extremely + "</span>" +
      "<span>Very — " + seg.very + "</span>" +
      "<span>Moderately — " + seg.moderately + "</span>" +
      "<span>Not valuable — " + seg.not + "</span>";
  }

  function renderTimeCost(stats) {
    var tc = stats.timeCost;
    document.getElementById("timeCostGrid").innerHTML =
      '<div class="stat"><div class="stat-num" data-count="' + tc.lostPerWeek + '" data-decimals="1" data-suffix=" hrs">0 hrs</div><div class="stat-label">lost per person, per week, searching for information</div></div>' +
      '<div class="stat"><div class="stat-num" data-count="' + tc.recoverablePerWeek + '" data-decimals="1" data-suffix=" hrs">0 hrs</div><div class="stat-label">estimated recoverable per person, per week</div></div>' +
      '<div class="stat"><div class="stat-num" data-count="' + tc.annualProjected + '" data-prefix="~" data-suffix=" hrs">0 hrs</div><div class="stat-label">projected per year across this ' + stats.n + '-person sample</div></div>';
  }

  function renderAll(stats) {
    renderRoleGrid(stats);
    renderStatList("painPointsGrid", stats.painPoints);
    renderStatList("fixesGrid", stats.fixesWanted);
    renderAiValue(stats);
    renderTimeCost(stats);

    var painN = document.getElementById("painN");
    if (painN) painN.textContent = stats.n;
    var fnCount = document.getElementById("fnCount");
    if (fnCount) fnCount.textContent = stats.n;

    var hlHead = document.getElementById("hlPainHeadline");
    if (hlHead && stats.painPoints[0]) {
      var top = stats.painPoints[0];
      hlHead.textContent =
        top.pct + "% say " + top.label.charAt(0).toLowerCase() + top.label.slice(1) + " is their #1 challenge";
    }
    initCounters();
  }

  /* ---------------------------------------------------------
     4. Count-up animation — re-scans the DOM each time it's
     called, since renderAll() replaces the number elements
  --------------------------------------------------------- */
  var countObserver = null;
  function initCounters() {
    if (countObserver) countObserver.disconnect();

    function animateCount(el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      var prefix = el.getAttribute("data-prefix") || "";
      var suffix = el.getAttribute("data-suffix") || "";
      if (reduce || isNaN(target)) {
        el.textContent = isNaN(target)
          ? el.textContent
          : prefix + target.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        return;
      }
      var dur = 1200,
        start = null;
      function tick(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent =
          prefix + (target * eased).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    var counters = document.querySelectorAll("[data-count]");
    if ("IntersectionObserver" in window) {
      countObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              animateCount(entry.target);
              countObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.6 }
      );
      counters.forEach(function (c) { countObserver.observe(c); });
    } else {
      counters.forEach(animateCount);
    }
  }

  /* ---------------------------------------------------------
     5. Section fade-up reveal (once, on load) — independent
     of the data, runs once for the page's static structure
  --------------------------------------------------------- */
  function initReveals() {
    var heroReveal = document.getElementById("heroReveal");
    if (heroReveal) setTimeout(function () { heroReveal.classList.add("is-visible"); }, 150);

    var reveals = document.querySelectorAll(".reveal:not(#heroReveal)");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15 }
      );
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add("is-visible"); });
    }
  }

  /* ---------------------------------------------------------
     6. Architecture: pinned scroll-fraction build
  --------------------------------------------------------- */
  function initArchitecturePin() {
    var archSection = document.getElementById("archPin");
    var stages = document.querySelectorAll("#archPin .arch-stage");
    if (!archSection || !stages.length) return;

    var byStage = {};
    stages.forEach(function (el) {
      var s = el.getAttribute("data-stage");
      byStage[s] = byStage[s] || [];
      byStage[s].push(el);
    });
    var keys = Object.keys(byStage).sort(function (a, b) { return a - b; });
    var rafPending = false;

    function update() {
      var rect = archSection.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var frac = total > 0 ? Math.max(0, Math.min(1, -rect.top / total)) : rect.top < 0 ? 1 : 0;
      keys.forEach(function (k, i) {
        var thresh = 0.05 + 0.85 * (i / Math.max(1, keys.length - 1));
        var on = reduce || frac >= thresh;
        byStage[k].forEach(function (el) { el.classList.toggle("lit", on); });
      });
    }
    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () { update(); rafPending = false; });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("load", update);
    setTimeout(update, 300);
  }

  /* ---------------------------------------------------------
     7. Load the survey data
     logs/survey-data.js (loaded via a plain <script> tag, before
     this file) sets window.SURVEY_CSV to the raw CSV text.
     Script tags aren't blocked on file:// the way fetch() is,
     so this works from a plain double-click — no server needed.
     Regenerate that file after editing logs/survey.csv by running:
       python3 convert.py
  --------------------------------------------------------- */
  function setStatus(msg) {
    var el = document.getElementById("dataStatus");
    if (el) el.textContent = msg;
  }

  function loadData() {
    var csvText = window.SURVEY_CSV;
    if (typeof csvText !== "string" || !csvText.trim()) {
      renderAll(DEFAULT_STATS);
      setStatus(
        "logs/survey-data.js wasn't found — showing the built-in numbers (n=" + DEFAULT_STATS.n +
        "). Run: python3 convert.py, then reload the page."
      );
      return;
    }
    try {
      var rows = parseCSV(csvText);
      var stats = computeStats(rows);
      renderAll(stats);
      setStatus("Loaded " + stats.n + " responses from logs/survey.csv.");
    } catch (err) {
      renderAll(DEFAULT_STATS);
      setStatus(
        "Could not read logs/survey.csv (" + err.message + ") — showing the built-in numbers (n=" +
        DEFAULT_STATS.n + ")."
      );
    }
  }

  function initReload() {
    var btn = document.getElementById("reloadData");
    if (btn) btn.addEventListener("click", function () { location.reload(); });
  }

  /* ---------------------------------------------------------
     Boot
  --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    initReveals();
    initArchitecturePin();
    initReload();
    loadData();
  });
})();
