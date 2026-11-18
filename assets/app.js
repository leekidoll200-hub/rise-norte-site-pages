(function () {
  "use strict";
  var CONFIG = window.RN_CONFIG || {};
  var CASES = window.RN_CASES || [];

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- 메뉴: 누른 메뉴의 화면만 보여 준다 ----------
     주소 뒤의 #이름으로 화면을 고른다(뒤로 가기가 되고, 그 화면의 주소를 그대로 보낼 수 있다).
     자바스크립트가 꺼져 있으면 모든 구역이 한 페이지로 이어져 보인다. */
  var VIEW_OF = { home: "home", quick: "home", check: "check", how: "how", why: "how", cases: "cases", faq: "faq", apply: "apply", privacy: "privacy" };
  var TITLES = { home: "재무설계 상담", check: "30초 자가 점검", how: "진행 방식", cases: "상담 사례", faq: "자주 묻는 질문", apply: "상담 신청", privacy: "개인정보 처리방침" };
  var views = document.querySelectorAll("[data-view]");
  function route(first) {
    var id = (location.hash || "#home").slice(1);
    var view = VIEW_OF[id] || "home";
    Array.prototype.forEach.call(views, function (sec) {
      var v = sec.getAttribute("data-view");
      sec.hidden = !(v === view || (v === "not-apply" && view !== "apply"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = "라이즈노르테 · " + TITLES[view];
    document.body.setAttribute("data-view", view);   // 신청 화면에서는 오른쪽 아래 신청 버튼을 숨긴다(style.css)
    var target = id !== view ? document.getElementById(id) : null;      // #why 처럼 화면 안의 자리
    if (target && !first) target.scrollIntoView(); else window.scrollTo(0, 0);
    var cur = document.querySelector('.nav [aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }
  window.addEventListener("hashchange", function () { route(false); });
  route(true);

  /* ---------- 30초 자가 점검 ---------- */
  var checkForm = $("checkForm");
  var checked = [];

  function updateCheck() {
    checked = Array.prototype.filter.call(
      checkForm.querySelectorAll("input"), function (i) { return i.checked; }
    ).map(function (i) { return i.value; });

    var n = checked.length;
    var box = $("checkResult");
    box.classList.toggle("on", n > 0);
    $("checkApply").hidden = n === 0;
    $("checkText").textContent = n === 0
      ? "해당되는 항목을 누르면 결과가 바로 나옵니다."
      : "네 가지 중 " + n + "가지 해당 · 점검이 필요합니다. 문제는 상품이 아니라, 전체를 한 번에 보는 설계가 없다는 것입니다.";

    var note = $("fromCheck");
    note.hidden = n === 0;
    note.textContent = n === 0 ? "" : "자가 점검에서 고른 것: " + checked.join(" / ");
  }
  checkForm.addEventListener("change", updateCheck);
  checkForm.addEventListener("submit", function (e) { e.preventDefault(); });

  /* ---------- 사례 ---------- */
  var FILTERS = [
    { key: "age", label: "나이대", get: function (c) { return [(c.age || "").split(" ")[0]]; } },
    { key: "household", label: "가구", get: function (c) { return [c.household]; } },
    { key: "life_stage", label: "생애 단계", get: function (c) { return [c.life_stage]; } },
    { key: "goals", label: "목표", get: function (c) { return c.goals || []; } }
  ];
  var META = [
    ["age", ""], ["gender", ""], ["household", "가구 "], ["life_stage", ""], ["job", ""],
    ["income_month_net", "월 세후 소득(만 원) "], ["net_worth", "순자산 "],
    ["income_quintile", "가구 소득 분위 "], ["channel", "만난 경로 "]
  ];
  var visible = CASES.filter(function (c) { return CONFIG.showExamples || !c.example; });
  var picked = {};

  function tagRow(title, items, cls) {
    var row = el("div", "tagrow");
    row.appendChild(el("p", "tagrow-t", title));
    var ul = el("ul", "tags " + (cls || ""));
    items.forEach(function (t) { ul.appendChild(el("li", null, t)); });
    row.appendChild(ul);
    return row;
  }

  function renderCase(c) {
    var card = el("article", "case");
    var head = el("div", "case-head");
    if (c.example) head.appendChild(el("span", "badge", "예시"));
    head.appendChild(el("h3", null, c.title));
    card.appendChild(head);

    var meta = el("ul", "meta");
    META.forEach(function (m) {
      if (c[m[0]]) meta.appendChild(el("li", null, m[1] + c[m[0]]));
    });
    if (c.sessions) meta.appendChild(el("li", null, "상담 " + c.sessions + "회"));
    card.appendChild(meta);

    var body = el("div", "case-body");
    (c.sections || []).forEach(function (s) {
      var p = el("p");
      if (s.label) p.appendChild(el("b", null, s.label));
      p.appendChild(document.createTextNode(s.text));
      body.appendChild(p);
    });
    card.appendChild(body);

    if (c.before_after && c.before_after.length) {
      var ba = el("dl", "ba");
      c.before_after.forEach(function (r) {
        var parts = r.text.split("→");
        var item = el("div");
        item.appendChild(el("dt", null, r.label));
        var dd = el("dd");
        if (parts.length === 2) {
          dd.appendChild(el("span", "before", parts[0].trim()));
          dd.appendChild(el("span", "arrow", "→"));
          dd.appendChild(el("span", "after", parts[1].trim()));
        } else {
          dd.textContent = r.text;
        }
        item.appendChild(dd);
        ba.appendChild(item);
      });
      card.appendChild(ba);
    }

    if (c.diagnosis && c.diagnosis.length) card.appendChild(tagRow("진단", c.diagnosis));
    if (c.solution && c.solution.length) card.appendChild(tagRow("해결", c.solution, "tags-solid"));

    if (c.review) {
      var q = el("blockquote", "review");
      q.appendChild(el("p", null, c.review));
      q.appendChild(el("p", "src", "게시 동의를 받은 후기 · 원문 그대로"));
      card.appendChild(q);
    }
    if (c.example) {
      card.appendChild(el("p", "src", "게시 동의를 확인하기 전이라 예시로 표시합니다. 누군지 알아볼 수 없게 넓힌 정보만 실었습니다."));
    }
    return card;
  }

  function matches(c) {
    return FILTERS.every(function (f) {
      return !picked[f.key] || f.get(c).indexOf(picked[f.key]) !== -1;
    });
  }

  function renderCases() {
    var list = $("caseList");
    list.textContent = "";
    var shown = visible.filter(matches);
    if (!visible.length) {
      $("caseCount").textContent = "";
      list.appendChild(el("p", "empty", "게시 동의를 받은 사례를 준비하고 있습니다. 상담이 쌓이는 대로 이곳에 올립니다."));
      return;
    }
    $("caseCount").textContent = "사례 " + shown.length + "건";
    if (!shown.length) {
      list.appendChild(el("p", "empty", "고른 조건에 맞는 사례가 아직 없습니다."));
      return;
    }
    shown.forEach(function (c) { list.appendChild(renderCase(c)); });
  }

  function renderFilters() {
    var box = $("caseFilters");
    if (!visible.length) return;
    FILTERS.forEach(function (f) {
      var values = [];
      visible.forEach(function (c) {
        f.get(c).forEach(function (v) { if (v && values.indexOf(v) === -1) values.push(v); });
      });
      if (!values.length) return;
      var wrap = el("label", "filter");
      wrap.appendChild(el("span", null, f.label));
      var sel = el("select");
      var all = el("option", null, "전체");
      all.value = "";
      sel.appendChild(all);
      values.sort().forEach(function (v) { sel.appendChild(el("option", null, v)); });
      sel.addEventListener("change", function () { picked[f.key] = sel.value; renderCases(); });
      wrap.appendChild(sel);
      box.appendChild(wrap);
    });
    box.hidden = false;
  }
  renderFilters();
  renderCases();

  /* ---------- 상담 예약: 달력에서 열린 시간을 골라 신청 ----------
     열린 시간은 담당자가 로그인 뒤 화면(예약 관리)에서 연다. 방문자는 열린 시간만 볼 수 있고,
     신청은 데이터베이스의 book_consult 함수로만 들어간다(이름 · 연락처는 방문자가 다시 읽을 수 없다). */
  var form = $("applyForm");
  var done = $("applyDone");
  var SB = CONFIG.supabaseUrl, SBK = CONFIG.supabaseKey;
  var CONSENT_VERSION = "2026-11-18";
  var cal = $("cal");
  var byDay = {}, dayKeys = [], month = null, pickedDay = null, pickedSlot = null, wishMode = false;
  var wishInput = el("input"); wishInput.type = "text"; wishInput.maxLength = 100; wishInput.placeholder = "예) 다음 주 평일 저녁 7시 이후";
  wishInput.setAttribute("aria-label", "원하는 날짜와 시간대");

  var fmtKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });
  var fmtTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
  var fmtDay = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
  function sb(path, opts) {
    opts = opts || {};
    opts.headers = { apikey: SBK, Authorization: "Bearer " + SBK, "Content-Type": "application/json" };
    return fetch(SB + "/rest/v1/" + path, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* 본문 없음 */ }
        if (!r.ok) { var err = new Error((j && j.message) || "ERR"); err.code = (j && j.message) || "ERR"; throw err; }
        return j;
      });
    });
  }
  function loadSlots() {
    cal.textContent = ""; cal.appendChild(el("p", "src", "열린 시간을 불러오는 중입니다."));
    return sb("slots?select=id,starts_at,minutes&order=starts_at").then(function (rows) {
      byDay = {}; dayKeys = [];
      rows.forEach(function (r) {
        var d = new Date(r.starts_at), k = fmtKey.format(d);
        if (!byDay[k]) { byDay[k] = []; dayKeys.push(k); }
        byDay[k].push({ id: r.id, at: d, minutes: r.minutes });
      });
      if (pickedSlot && !rows.some(function (r) { return r.id === pickedSlot.id; })) pickedSlot = null;
      if (pickedDay && !byDay[pickedDay]) pickedDay = null;
      if (!month || !dayKeys.some(function (k) { return k.slice(0, 7) === month; })) month = dayKeys.length ? dayKeys[0].slice(0, 7) : fmtKey.format(new Date()).slice(0, 7);
      drawCal();
    }, function () {
      wishMode = true; byDay = {}; dayKeys = []; drawCal("열린 시간을 불러오지 못했습니다. 원하는 날짜와 시간대를 적어 주세요.");
    });
  }
  function shiftMonth(n) {
    var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + n;
    var d = new Date(Date.UTC(y, m, 1));
    month = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
    drawCal();
  }
  function drawCal(note) {
    cal.textContent = "";
    if (note) cal.appendChild(el("p", "cal-note", note));
    {
      var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
      var months = dayKeys.map(function (k) { return k.slice(0, 7); });
      if (!months.length) months = [month];
      var head = el("div", "cal-head");
      var prev = el("button", "cal-nav", "‹"); prev.type = "button"; prev.setAttribute("aria-label", "이전 달"); prev.disabled = month <= months[0];
      var next = el("button", "cal-nav", "›"); next.type = "button"; next.setAttribute("aria-label", "다음 달"); next.disabled = month >= months[months.length - 1];
      prev.addEventListener("click", function () { shiftMonth(-1); }); next.addEventListener("click", function () { shiftMonth(1); });
      head.appendChild(prev); head.appendChild(el("p", "cal-title", y + "년 " + m + "월")); head.appendChild(next);
      cal.appendChild(head);
      var grid = el("div", "cal-grid");
      ["일", "월", "화", "수", "목", "금", "토"].forEach(function (w) { grid.appendChild(el("span", "cal-w", w)); });
      var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      for (var i = 0; i < first; i++) grid.appendChild(el("span", "cal-x"));
      for (var d = 1; d <= last; d++) {
        (function (d) {
          var key = month + "-" + String(d).padStart(2, "0");
          var b = el("button", "cal-d", String(d)); b.type = "button";
          if (byDay[key]) {
            b.classList.add("open");
            b.setAttribute("aria-label", m + "월 " + d + "일 · 열린 시간 " + byDay[key].length + "개");
            if (key === pickedDay) b.setAttribute("aria-pressed", "true");
            b.addEventListener("click", function () { pickedDay = key; pickedSlot = null; wishMode = false; drawCal(); });
          } else { b.disabled = true; }
          grid.appendChild(b);
        })(d);
      }
      cal.appendChild(grid);
      cal.appendChild(el("p", dayKeys.length ? "cal-legend" : "cal-note", dayKeys.length
        ? "골드 점이 있는 날에 열린 시간이 있습니다. 날짜를 누르면 시간이 나옵니다."
        : "아직 열린 시간이 없습니다. 시간이 열리면 날짜에 골드 점이 생기고, 눌러서 예약할 수 있습니다."));
      if (pickedDay && byDay[pickedDay]) {
        var box = el("div", "cal-times");
        box.appendChild(el("p", "cal-day", fmtDay.format(byDay[pickedDay][0].at)));
        var list = el("div", "cal-slots");
        byDay[pickedDay].forEach(function (sl) {
          var t = el("button", "cal-t", fmtTime.format(sl.at)); t.type = "button";
          if (pickedSlot && pickedSlot.id === sl.id) t.setAttribute("aria-pressed", "true");
          t.addEventListener("click", function () { pickedSlot = sl; drawCal(); $("e-when").hidden = true; });
          list.appendChild(t);
        });
        box.appendChild(list);
        cal.appendChild(box);
      }
      if (pickedSlot) cal.appendChild(el("p", "cal-picked", "고른 시간: " + fmtDay.format(pickedSlot.at) + " " + fmtTime.format(pickedSlot.at) + " (약 " + pickedSlot.minutes + "분)"));
      var alt = el("button", "link", wishMode ? "달력에서 고르기" : "맞는 시간이 없으면 원하는 때를 적어 주세요");
      alt.type = "button";
      alt.addEventListener("click", function () { wishMode = !wishMode; if (wishMode) pickedSlot = null; drawCal(); });
      cal.appendChild(alt);
    }
    if (wishMode) {
      var w = el("div", "cal-wish");
      w.appendChild(el("p", "sub", "원하는 날짜와 시간대"));
      w.appendChild(wishInput);
      cal.appendChild(w);
    }
  }

  function setErr(inputId, errId, bad) {
    $(errId).hidden = !bad;
    if (inputId) $(inputId).setAttribute("aria-invalid", bad ? "true" : "false");
    return bad;
  }
  var MESSAGES = {
    NAME: "이름을 확인해 주세요.", PHONE: "휴대폰 번호를 확인해 주세요.", CONSENT: "동의가 필요합니다.", WHEN: "날짜와 시간을 골라 주세요.",
    TAKEN: "방금 다른 분이 그 시간을 먼저 예약했습니다. 다른 시간을 골라 주세요.",
    LIMIT_PHONE: "같은 번호로는 하루에 세 번까지 신청할 수 있습니다.", LIMIT_ALL: "신청이 몰리고 있습니다. 잠시 뒤 다시 시도해 주세요."
  };
  var sending = false;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var name = $("f-name").value.trim();
    var tel = $("f-tel").value.trim();
    var digits = tel.replace(/\D/g, "");
    var wish = wishMode ? wishInput.value.trim() : "";
    var bad = [
      setErr("f-name", "e-name", !name) && "f-name",
      setErr("f-tel", "e-tel", !/^01\d{8,9}$/.test(digits)) && "f-tel",
      setErr(null, "e-when", !pickedSlot && !wish) && "cal",
      setErr("f-agree", "e-agree", !$("f-agree").checked) && "f-agree"
    ].filter(Boolean);
    $("e-send").hidden = true;
    if (bad.length) { var t = $(bad[0]); if (t.focus) t.focus(); t.scrollIntoView({ block: "center" }); return; }

    var topics = Array.prototype.map.call(form.querySelectorAll('input[name="topic"]:checked'), function (i) { return i.value; });
    var btn = form.querySelector('button[type="submit"]');
    sending = true; btn.disabled = true; btn.textContent = "보내는 중…";
    var slot = pickedSlot;
    sb("rpc/book_consult", { method: "POST", body: JSON.stringify({
      p_slot: slot ? slot.id : null, p_name: name, p_phone: digits, p_topics: topics, p_channel: $("f-ch").value || null,
      p_check: checked.length ? checked.join(" / ") : null, p_wish: wish || null, p_consent: CONSENT_VERSION
    }) }).then(function () {
      $("doneTitle").textContent = slot ? "예약이 접수됐습니다" : "신청이 접수됐습니다";
      $("doneText").textContent = slot
        ? fmtDay.format(slot.at) + " " + fmtTime.format(slot.at) + "에 잡아 두었습니다. 장소와 준비할 것은 남겨 주신 번호로 확인 연락을 드립니다."
        : "적어 주신 시간대를 보고 남겨 주신 번호로 연락드려 일정을 정합니다.";
      form.hidden = true; done.hidden = false; done.focus();
      form.reset(); pickedSlot = null; pickedDay = null; wishInput.value = "";
    }, function (err) {
      var box = $("e-send"); box.textContent = MESSAGES[err.code] || "보내지 못했습니다. 잠시 뒤 다시 시도해 주세요."; box.hidden = false;
      if (err.code === "TAKEN") { pickedSlot = null; loadSlots(); }
    }).then(function () { sending = false; btn.disabled = false; btn.textContent = "상담 신청하기"; });
  });

  $("doneBack").addEventListener("click", function () {
    done.hidden = true; form.hidden = false; loadSlots();
  });
  if (SB && SBK) loadSlots(); else { wishMode = true; drawCal("예약 설정이 빠져 있습니다."); }
})();
