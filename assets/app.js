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

  /* ---------- 상담 신청 (전송 없음 · 화면과 입력 확인까지) ---------- */
  var form = $("applyForm");
  var done = $("applyDone");
  var today = new Date();
  var iso = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  $("f-d1").min = iso;
  $("f-d2").min = iso;
  $("previewFlag").hidden = !!CONFIG.formEndpoint;

  function setErr(inputId, errId, bad) {
    $(errId).hidden = !bad;
    $(inputId).setAttribute("aria-invalid", bad ? "true" : "false");
    return bad;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("f-name").value.trim();
    var tel = $("f-tel").value.trim();
    var digits = tel.replace(/\D/g, "");
    var bad = [
      setErr("f-name", "e-name", !name) && "f-name",
      setErr("f-tel", "e-tel", !/^01\d{8,9}$/.test(digits)) && "f-tel",
      setErr("f-agree", "e-agree", !$("f-agree").checked) && "f-agree"
    ].filter(Boolean);
    if (bad.length) { $(bad[0]).focus(); return; }

    var topics = Array.prototype.map.call(
      form.querySelectorAll('input[name="topic"]:checked'), function (i) { return i.value; });
    var dates = [$("f-d1").value, $("f-d2").value].filter(Boolean);
    var rows = [
      ["이름", name], ["연락처", tel],
      ["편한 날짜", dates.join(" · ") || "적지 않음"],
      ["관심 주제", topics.join(" · ") || "고르지 않음"],
      ["자가 점검", checked.length ? checked.length + "가지 해당" : "하지 않음"],
      ["만난 경로", $("f-ch").value || "고르지 않음"]
    ];

    // 전송 방식이 정해지면 여기에서 CONFIG.formEndpoint 로 보낸다. 지금은 화면에만 보여 준다.
    $("doneTitle").textContent = "여기까지가 미리보기입니다";
    $("doneText").textContent = "전송 기능을 연결하지 않아 아래 내용은 어디에도 저장 · 전송되지 않았습니다. 연결한 뒤에는 이 자리에 접수 안내와 연락 시점이 나옵니다.";
    var dl = $("doneList");
    dl.textContent = "";
    rows.forEach(function (r) {
      dl.appendChild(el("dt", null, r[0]));
      dl.appendChild(el("dd", null, r[1]));
    });
    form.hidden = true;
    done.hidden = false;
    done.focus();
  });

  $("doneBack").addEventListener("click", function () {
    done.hidden = true;
    form.hidden = false;
    $("f-name").focus();
  });
})();
