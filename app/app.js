/* 로그인 뒤 화면: 카카오 로그인 · 첫 동의 · 사전 작성지(고객) · 고객 목록과 작성지 보기(담당자)
   - 라이브러리 없이 Supabase 의 로그인 · 데이터 주소를 직접 부른다(외부 스크립트를 싣지 않으려고).
   - 누가 무엇을 볼 수 있는지는 데이터베이스 권한(RLS)이 막는다. 화면의 가림은 편의일 뿐이다.
   - 화면에 글을 넣을 때 innerHTML 을 쓰지 않는다. */
(function () {
  "use strict";
  var CFG = window.RN_CONFIG || {};
  var SPEC = window.RN_SPEC;
  var URL_ = CFG.supabaseUrl, KEY = CFG.supabaseKey;
  var STORE = "rn_session";
  var CONSENT_VERSION = "2026-11-18-draft";
  var app = document.getElementById("app");

  /* ---------- 작은 도구 ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (k === "value") n.value = v;
      else if (k === "checked") n.checked = !!v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function show() { app.textContent = ""; Array.prototype.forEach.call(arguments, function (n) { if (n) app.appendChild(n); }); }
  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
  function fmt(v, unit) {
    if (v == null || !isFinite(v)) return "—";
    return (Math.round(v * 10) / 10).toLocaleString("ko-KR") + (unit || "");
  }
  function stamp(iso) { if (!iso) return "—"; var d = new Date(iso); return d.toLocaleDateString("ko-KR") + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }); }

  /* ---------- 로그인 ---------- */
  var session = null;
  function loadSession() { try { session = JSON.parse(localStorage.getItem(STORE)); } catch (e) { session = null; } }
  function saveSession(s) { session = s; try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch (e) { /* 저장 못 해도 이번 화면은 동작 */ } }
  function takeHash() {
    if (location.hash.indexOf("access_token=") === -1 && location.hash.indexOf("error") === -1) return null;
    var p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);   // 주소창에서 로그인 정보 지우기
    if (p.get("error")) return { error: p.get("error_description") || p.get("error") };
    return { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Number(p.get("expires_at")) };
  }
  function uid() {
    try {
      var b = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(b)))).sub;
    } catch (e) { return null; }
  }
  function login() {
    location.href = URL_ + "/auth/v1/authorize?provider=kakao&redirect_to=" + encodeURIComponent(location.origin + location.pathname);
  }
  function token() {
    if (!session) return Promise.reject(new Error("로그인이 필요합니다."));
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session.access_token);
    return fetch(URL_ + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
      if (!x.ok || !x.j.access_token) { saveSession(null); throw new Error("로그인이 만료됐습니다. 다시 로그인해 주세요."); }
      saveSession({ access_token: x.j.access_token, refresh_token: x.j.refresh_token, expires_at: x.j.expires_at || Math.floor(Date.now() / 1000) + (x.j.expires_in || 3600) });
      return session.access_token;
    });
  }
  function logout() {
    var t = session && session.access_token;
    saveSession(null);
    var done = function () { location.href = location.pathname; };
    if (!t) return done();
    fetch(URL_ + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + t } }).then(done, done);
  }

  /* 확인 상자: 브라우저의 확인 창(confirm · alert)은 앱 안 브라우저 등에서 막힐 수 있어서 화면 안에 직접 띄운다.
     ask(글, 확인 단추 글) → 예 true / 아니오 false.  tell(글) → 알림만. */
  function ask(message, okText, single) {
    return new Promise(function (resolve) {
      var back = document.createElement("div"); back.className = "ask-back";
      var box = document.createElement("div"); box.className = "ask"; box.setAttribute("role", "alertdialog"); box.setAttribute("aria-modal", "true");
      String(message).split("\n").forEach(function (line) { var p = document.createElement("p"); p.textContent = line; box.appendChild(p); });
      var row = document.createElement("div"); row.className = "ask-row";
      var yes = document.createElement("button"); yes.type = "button"; yes.className = "btn btn-main"; yes.textContent = okText || "예";
      function done(v) { document.removeEventListener("keydown", onKey); back.remove(); resolve(v); }
      function onKey(e) { if (e.key === "Escape") done(false); }
      if (!single) {
        var no = document.createElement("button"); no.type = "button"; no.className = "btn btn-line-dark"; no.textContent = "아니오";
        no.addEventListener("click", function () { done(false); });
        row.appendChild(no);
      }
      yes.addEventListener("click", function () { done(true); });
      row.appendChild(yes); box.appendChild(row); back.appendChild(box);
      back.addEventListener("click", function (e) { if (e.target === back) done(false); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(back);
      yes.focus();
    });
  }
  function tell(message) { return ask(message, "확인", true); }

  /* ---------- 데이터 ---------- */
  function rest(method, path, body, prefer) {
    return token().then(function (t) {
      var h = { apikey: KEY, Authorization: "Bearer " + t };
      if (body !== undefined) h["Content-Type"] = "application/json";
      if (prefer) h.Prefer = prefer;
      return fetch(URL_ + "/rest/v1/" + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { /* 본문이 없는 응답 */ }
        if (!r.ok) throw new Error((j && (j.message || j.msg)) || ("요청이 거절됐습니다 (" + r.status + ")"));
        return j;
      });
    });
  }

  /* ---------- 계산 (도구함 spec.py · AFPK 기준) ---------- */
  function calc(d) {
    var cash = d.cash || {}, ref = d.cashRef || {}, assets = d.assets || {}, debts = d.debts || {};
    var jeonse = SPEC.JEONSE;
    var debt = { int: 0, prin: 0, total: 0, pay: { "소비": 0, "주거": 0, "기타": 0 }, bal: { "소비": 0, "주거": 0, "기타": 0 } };
    SPEC.DEBTS.forEach(function (row) {
      var x = debts[row[0]] || {}; var bal = num(x.bal); if (!bal && !num(x.pay)) return;
      var interest = x.int !== "" && x.int != null ? num(x.int) : bal * num(x.rate) / 100 / 12;
      var pay = num(x.pay);
      debt.int += interest; debt.prin += Math.max(pay - interest, 0); debt.total += bal;
      debt.bal[row[2]] += bal;
      debt.pay[row[2]] += jeonse.indexOf(row[0]) !== -1 ? bal / 48 + interest : (pay || interest);
    });
    var sec = {};
    SPEC.CASH.forEach(function (s) {
      sec[s[0]] = s[3].reduce(function (a, r) {
        var auto = SPEC.AUTO_ROWS[r[0]];
        return a + (auto ? (auto === "int" ? debt.int : debt.prin) : num(cash[r[0]]));
      }, 0);
    });
    var out = sec.fix + sec["var"] + sec.yr / 12;
    var a = {}; var totalA = 0;
    SPEC.ASSETS.forEach(function (s) { a[s[0]] = s[3].reduce(function (x, r) { return x + num(assets[r[0]]); }, 0); totalA += a[s[0]]; });
    var gross = num(ref.gross) || (num(ref.grossY) ? num(ref.grossY) / 12 : 0);
    var payAll = debt.pay["소비"] + debt.pay["주거"] + debt.pay["기타"];
    function div(x, y) { return y > 0 ? x / y : null; }
    return {
      sec: sec, out: out, room: sec.inc - out, extra: sec.inc - out - sec.sav, assets: a, totalA: totalA, debt: debt, net: totalA - debt.total, gross: gross,
      ratio: {
        hh: [div(out, sec.inc) == null ? null : div(out, sec.inc) * 100, "%"],
        em: [div(a.cash, out), "개월"],
        cd: [div(debt.pay["소비"], sec.inc) == null ? null : div(debt.pay["소비"], sec.inc) * 100, "%"],
        hp: [div(debt.pay["주거"], gross) == null ? null : div(debt.pay["주거"], gross) * 100, "%"],
        tp: [div(payAll, gross) == null ? null : div(payAll, gross) * 100, "%"],
        hb: [div(debt.bal["주거"], totalA) == null ? null : div(debt.bal["주거"], totalA) * 100, "%"],
        tb: [div(debt.total, totalA) == null ? null : div(debt.total, totalA) * 100, "%"]
      }
    };
  }
  function riskStage(answers, group) {
    var qs = SPEC.RISK.filter(function (q) { return q[0] === group; });
    var sum = 0, n = 0;
    qs.forEach(function (q) { var i = answers[q[1]]; if (i != null && q[3][i]) { sum += q[3][i][1]; n++; } });
    if (n < qs.length) return null;
    var scaled = qs.length === 4 ? sum : Math.round(sum * 4 / qs.length);   // 기준은 4문항 합(4~20)
    var stage = 1; SPEC.STAGE_CUTS.forEach(function (c) { if (scaled > c) stage++; });
    return stage;
  }

  /* ---------- 화면: 로그인 전 · 동의 · 대기 ---------- */
  function viewSignedOut(msg) {
    show(el("section", { class: "panel" }, [
      el("h1", { text: "상담 고객 화면" }),
      el("p", { class: "muted", text: "상담 고객 전용 화면입니다. 카카오로 로그인하면 상담 동의와 후기 작성, 사전 작성지를 쓸 수 있고 내 자료만 볼 수 있습니다." }),
      msg ? el("p", { class: "msg bad", text: msg }) : null,
      el("button", { class: "btn btn-kakao btn-wide", type: "button", onclick: login, text: "카카오로 로그인" }),
      el("p", { class: "src", text: "로그인할 때 카카오가 닉네임 · 프로필 사진 · 이메일 제공 동의를 묻습니다. 계정을 확인하는 데만 쓰고 다른 곳에 주지 않습니다." })
    ]));
  }
  function viewConsent(next) {
    var box = el("input", { type: "checkbox", id: "agree" });
    var err = el("p", { class: "err", hidden: true, text: "동의해야 이용할 수 있습니다." });
    show(el("section", { class: "panel" }, [
      el("h1", { text: "개인정보 수집 · 이용 안내" }),
      el("dl", { class: "kv" }, [
        el("dt", { text: "수집하는 곳" }), el("dd", { text: "라이즈 노르테 (대표 이승준)" }),
        el("dt", { text: "수집 항목" }), el("dd", { text: "카카오 회원 식별값 · 닉네임 · 프로필 사진 주소 · 이메일, 직접 적는 이름 · 연락처 · 출생 연월 · 가구, 사전 작성지에 적는 소득 · 지출 · 자산 · 부채 · 목표 · 투자성향" }),
        el("dt", { text: "목적" }), el("dd", { text: "상담과 이후 자산관리, 서비스 개선과 통계" }),
        el("dt", { text: "보유 기간" }), el("dd", { text: "자산관리를 그만둘 때까지. 그만두겠다고 알리면 지웁니다." }),
        el("dt", { text: "거부할 권리" }), el("dd", { text: "동의하지 않을 수 있으며, 그 경우 이 화면을 이용할 수 없습니다. 상담은 종이와 엑셀로도 진행할 수 있습니다." })
      ]),
      el("p", { class: "src" }, ["주민등록번호 · 계좌번호 · 건강 정보는 받지 않습니다. 적지 말아 주세요. 자세한 내용은 ", el("a", { href: "../index.html#privacy", target: "_blank", rel: "noopener", text: "개인정보 처리방침" }), "에 있습니다."]),
      el("label", { class: "agree" }, [box, el("span", { text: "위 내용을 읽었고 개인정보 수집 · 이용에 동의합니다" })]),
      err,
      el("button", {
        class: "btn btn-main btn-wide", type: "button", text: "동의하고 시작하기", onclick: function () {
          if (!box.checked) { err.hidden = false; return; }
          rest("POST", "consents", { client_id: uid(), kind: "collect", agreed: true, text_version: CONSENT_VERSION }).then(next, fail);
        }
      })
    ]));
  }
  function viewWaiting(profile) {
    show(el("section", { class: "panel" }, [
      el("h1", { text: "로그인됐습니다" }),
      el("p", { text: "담당 자산관리사가 확인하면 이 화면이 열립니다. 열린 뒤에 화면을 새로 고쳐 주세요." }),
      el("button", { class: "btn btn-main", type: "button", text: "새로 고침", onclick: function () { location.reload(); } }),
      el("p", { class: "src", text: "지금 상태: " + ({ lead: "신청", lecture: "강의 참석", ended: "관리 종료" }[profile.status] || profile.status) })
    ]));
  }
  function fail(e) { show(el("p", { class: "msg bad", text: (e && e.message) || "문제가 생겼습니다. 다시 시도해 주세요." })); }

  /* ---------- 화면: 사전 작성지 ---------- */
  var STEPS = [["values", "목표와 가치관"], ["cash", "현금흐름표"], ["assets", "재무현황표"], ["risk", "투자성향"], ["evidence", "보낼 자료"]];

  function viewWorksheet(ws, profile, opts) {
    opts = opts || {};
    var d = ws.data || {}; ["basic", "values", "cash", "cashRef", "assets", "debts", "notes", "risk", "evidence"].forEach(function (k) { d[k] = d[k] || {}; });
    d.interests = d.interests || []; d.goals = d.goals || [];
    var done = ws.steps_done || {};
    var step = 0, dirty = false, readOnly = !!opts.readOnly;
    var state = el("p", { class: "state" });
    var body = el("div");
    var nav = el("div", { class: "steps-nav", role: "tablist" });

    function mark() { dirty = true; state.className = "state dirty"; state.textContent = "저장하지 않은 변경이 있습니다"; refreshSums(); }
    var sumNodes = [];
    function refreshSums() { var c = calc(d); sumNodes.forEach(function (f) { f(c); }); }
    function field(obj, key, type, extra) {
      var a = { type: type || "text", value: obj[key] == null ? "" : obj[key], disabled: readOnly };
      if (type === "number") { a.inputmode = "decimal"; a.step = "any"; a.min = "0"; }
      Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
      a.oninput = function (e) { obj[key] = type === "number" ? (e.target.value === "" ? "" : num(e.target.value)) : e.target.value; mark(); };
      return el("input", a);
    }
    function select(obj, key, options) {
      var s = el("select", { disabled: readOnly, onchange: function (e) { obj[key] = e.target.value; mark(); } }, [el("option", { value: "", text: "고르기" })]
        .concat(options.map(function (o) { return el("option", { value: o, text: o }); })));
      s.value = obj[key] || ""; return s;
    }
    function formRow(obj, def) {       // [키, 이름, 종류, (안내 | 보기)]
      var input = def[2] === "list" ? select(obj, def[0], def[3]) : field(obj, def[0], "text", { placeholder: typeof def[3] === "string" ? def[3] : "" });
      return el("div", { class: "wide" }, [el("label", { text: def[1] }), input]);
    }
    function moneyRow(obj, key, label, hint, cls, autoFn) {
      var input = autoFn ? el("input", { type: "text", disabled: true, "aria-label": label }) : field(obj, key, "number", { "aria-label": label });
      if (autoFn) sumNodes.push(function (c) { input.value = fmt(autoFn(c)); });
      return el("div", { class: "row " + (cls || "") }, [el("label", {}, [label, hint ? el("small", { text: hint }) : null]), input]);
    }
    function box(title, note, rows, sumFn, unit, open) {
      var sum = el("span", { class: "sum" });
      if (sumFn) sumNodes.push(function (c) { sum.textContent = fmt(sumFn(c), unit || "만 원"); });
      return el("details", { class: "sec-box", open: open }, [el("summary", {}, [el("span", { text: title }), sum]), note ? el("p", { class: "sec-note", text: note }) : null, el("div", { class: "rows" }, rows)]);
    }
    function totals(lines) {
      return el("div", { class: "totals" }, lines.map(function (l) {
        var b = el("b"); sumNodes.push(function (c) { b.textContent = fmt(l[1](c), l[2] || "만 원"); });
        return el("div", { class: l[3] ? "big" : "" }, [el("span", { text: l[0] }), b]);
      }));
    }

    var render = {
      values: function () {
        var chips = el("div", { class: "q" }, [el("p", { text: "관심 있는 것을 모두 골라 주세요" }), el("div", { class: "opts" }, SPEC.GOAL_CATS.map(function (g) {
          return el("label", {}, [el("input", { type: "checkbox", disabled: readOnly, checked: d.interests.indexOf(g[0]) !== -1, onchange: function (e) {
            var i = d.interests.indexOf(g[0]); if (e.target.checked && i === -1) d.interests.push(g[0]); if (!e.target.checked && i !== -1) d.interests.splice(i, 1); mark();
          } }), el("span", { text: g[1] })]);
        }))]);
        var goalsBox = el("div");
        function drawGoals() {
          goalsBox.textContent = "";
          d.goals.forEach(function (g, i) {
            goalsBox.appendChild(el("div", { class: "goal" }, [el("div", { class: "cols" }, [
              el("label", {}, ["목표", field(g, "what", "text", { placeholder: "예) 결혼 자금" })]),
              el("label", {}, ["언제", field(g, "when", "text", { placeholder: "예) 3년 뒤" })]),
              el("label", {}, ["얼마 (만 원 · 오늘 돈)", field(g, "amount", "number")]),
              el("label", {}, ["꼭 / 되면 좋음", select(g, "must", ["꼭", "되면 좋음"])])
            ]), readOnly ? null : el("button", { class: "link-btn", type: "button", text: "이 목표 지우기", onclick: function () { d.goals.splice(i, 1); mark(); drawGoals(); } })]));
          });
          if (!readOnly && d.goals.length < 4) goalsBox.appendChild(el("div", { class: "goal" }, [el("button", { class: "link-btn", type: "button", text: "+ 목표 추가 (최대 4개)", onclick: function () { d.goals.push({}); mark(); drawGoals(); } })]));
        }
        drawGoals();
        return [
          box("나에 대해", "대부분 고르기입니다. 이름은 별칭도 괜찮습니다.", SPEC.BASIC.filter(function (b) { return b[0] !== "date"; }).map(function (b) { return formRow(d.basic, b); })
            .concat([el("div", { class: "wide" }, [el("label", { text: "연락처" }), field(d.basic, "phone", "tel", { inputmode: "tel", placeholder: "010-0000-0000" })])]), null, null, true),
          box("이루고 싶은 것", "‘언제’와 ‘얼마’가 있어야 계획이 됩니다. 대략이어도 괜찮습니다.", [chips, goalsBox], null, null, true),
          box("돈에 대한 생각", "", SPEC.VALUES_Q.map(function (q) { return formRow(d.values, q); }), null, null, true)
        ];
      },
      cash: function () {
        var out = [el("p", { class: "msg", text: "단위는 만 원입니다. 매달 나가는 돈과 1년에 몇 번 나가는 돈을 나눠 적습니다. 대략이어도 괜찮습니다." })];
        SPEC.CASH.forEach(function (s, i) {
          var yearly = s[0] === "yr" || s[0] === "irr";
          var rows = s[3].map(function (r) {
            var auto = SPEC.AUTO_ROWS[r[0]];
            return moneyRow(d.cash, r[0], r[1], r[2], auto ? "auto" : "", auto ? function (c) { return auto === "int" ? c.debt.int : c.debt.prin; } : null);
          });
          SPEC.CASH_REF.filter(function (r) { return r[1] === s[0]; }).forEach(function (r) { rows.push(moneyRow(d.cashRef, r[0], r[2], r[3] + (r[4] === "y" ? " · 1년 합계" : ""), "ref")); });
          out.push(box(s[1] + (yearly ? " (1년 합계)" : ""), s[2], rows, function (c) { return yearly ? c.sec[s[0]] / 12 : c.sec[s[0]]; }, yearly ? "만 원/월" : "만 원", i === 0));
        });
        out.push(totals([
          ["월 순수입", function (c) { return c.sec.inc; }],
          ["월 총지출 (고정 + 변동 + 비정기 월 평균)", function (c) { return c.out; }],
          ["저축 여력 (순수입 − 총지출)", function (c) { return c.room; }, null, true],
          ["지금 저축 · 투자", function (c) { return c.sec.sav; }],
          ["추가 저축 여력", function (c) { return c.extra; }, null, true]
        ]));
        out.push(el("div", { class: "sec-box" }, [moneyRow(d, "think", "내가 생각하는 ‘매달 모을 수 있는 돈’", "계산값과 다르면 2차 상담에서 같이 맞춰 봅니다")]));
        return out;
      },
      assets: function () {
        var out = [el("p", { class: "msg", text: "오늘 기준 금액을 만 원 단위로 적습니다. 계좌번호는 적지 않습니다." })];
        SPEC.ASSETS.forEach(function (s, i) {
          out.push(box(s[1], s[2], s[3].map(function (r) { return moneyRow(d.assets, r[0], r[1]); }), function (c) { return c.assets[s[0]]; }, null, i === 0));
        });
        out.push(box("부채 · 빚", "오늘 남은 돈을 적습니다. 이자를 모르면 금리만 적어도 계산됩니다.", SPEC.DEBTS.map(function (r) {
          var x = d.debts[r[0]] = d.debts[r[0]] || {};
          return el("div", { class: "row debt" }, [el("label", {}, [r[1], el("small", { text: SPEC.DEBT_KIND[r[2]] })]), el("div", { class: "cols" }, [
            el("label", {}, [el("span", { text: "남은 돈" }), field(x, "bal", "number")]),
            el("label", {}, [el("span", { text: "금리 (%)" }), field(x, "rate", "number")]),
            el("label", {}, [el("span", { text: "매달 갚는 돈" }), field(x, "pay", "number")]),
            el("label", {}, [el("span", { text: "그중 이자" }), field(x, "int", "number")])
          ])]);
        }), function (c) { return c.debt.total; }));
        out.push(box("따로 적어 두는 것", "표에는 넣지 않고 노후 계산 등에 씁니다.", SPEC.NOTE_ITEMS.map(function (r) { return moneyRow(d.notes, r[0], r[1], r[2]); })));
        out.push(totals([
          ["총자산", function (c) { return c.totalA; }],
          ["총부채", function (c) { return c.debt.total; }],
          ["순자산", function (c) { return c.net; }, null, true]
        ]));
        var ratios = SPEC.RATIOS.map(function (r) {
          var b = el("b"); sumNodes.push(function (c) { var v = c.ratio[r[0]]; b.textContent = fmt(v[0], v[1]); });
          return el("div", { class: "ratio" }, [el("span", { text: r[1] }), b, el("small", { text: r[2] + " · 참고 기준 " + r[3] })]);
        });
        ratios.push(el("p", { class: "sec-note", text: SPEC.RATIO_SRC + " 세전 월급을 적지 않으면 일부 비율은 계산되지 않습니다." }));
        out.push(box("재무비율 (참고)", "", ratios, null, null, true));
        return out;
      },
      risk: function () {
        var out = [el("p", { class: "msg", text: "정답이 없습니다. 지금 생각에 가까운 것을 골라 주세요. 결과는 2차 상담에서 숫자와 함께 확인합니다." })];
        SPEC.RISK_GROUPS.forEach(function (g) {
          out.push(el("div", { class: "sec-box" }, [el("p", { class: "sec-note", text: g[1] })].concat(SPEC.RISK.filter(function (q) { return q[0] === g[0]; }).map(function (q) {
            return el("div", { class: "q" }, [el("p", { text: q[1] + ". " + q[2] }), el("div", { class: "opts" }, q[3].map(function (o, i) {
              return el("label", {}, [el("input", { type: "radio", name: "risk" + q[1], disabled: readOnly, checked: d.risk[q[1]] === i, onchange: function () { d.risk[q[1]] = i; mark(); } }), el("span", { text: o[0] })]);
            }))]);
          }))));
        });
        if (opts.advisor) {
          var info = el("p", { class: "msg" });
          sumNodes.push(function () {
            var a = riskStage(d.risk, "att"), c = riskStage(d.risk, "cap");
            info.textContent = "담당자 참고 · 마음(태도) " + (a ? a + "단계 " + SPEC.TYPES[a - 1] : "미완성") + " / 여력 문항 " + (c ? c + "단계" : "미완성") + ". 최종 판정은 2차 숫자로 본 여력과 태도 중 낮은 쪽으로, 상담에서 확인합니다.";
          });
          out.push(info);
        }
        return out;
      },
      evidence: function () {
        var out = [el("ul", { class: "msg" }, SPEC.EV_RULES.map(function (r) { return el("li", { text: r }); }))];
        out.push(el("div", { class: "sec-box" }, SPEC.EVIDENCE.map(function (e) {
          return el("div", { class: "ev" }, [
            el("details", {}, [el("summary", {}, [el("span", { class: "tag", text: e[3] === "꼭" ? "꼭" : "있는 분만" }), e[1] + " · 약 " + e[4] + "분"]),
              el("p", { class: "tip", text: e[2] }), el("ol", {}, e[5].map(function (s) { return el("li", { text: s }); })), el("p", { class: "tip", text: e[6] })]),
            el("div", { class: "q opts" }, [el("div", { class: "opts" }, SPEC.EV_STATUS.map(function (st) {
              return el("label", {}, [el("input", { type: "radio", name: "ev" + e[0], disabled: readOnly, checked: d.evidence[e[0]] === st, onchange: function () { d.evidence[e[0]] = st; mark(); } }), el("span", { text: st })]);
            }))])
          ]);
        })));
        out.push(el("p", { class: "src", text: "자료는 이 화면에 올리지 않습니다. 주민등록번호 · 계좌번호를 가리고 카카오톡으로 보내 주세요." }));
        return out;
      }
    };

    function draw() {
      sumNodes = []; body.textContent = ""; nav.textContent = "";
      STEPS.forEach(function (s, i) {
        nav.appendChild(el("button", { type: "button", class: done[s[0]] ? "done" : "", "aria-current": i === step ? "step" : null, text: (i + 1) + " " + s[1], onclick: function () { step = i; draw(); window.scrollTo(0, 0); } }));
      });
      body.appendChild(el("div", { class: "step-head" }, [el("h2", { text: STEPS[step][1] }), el("p", { text: "숙제 " + (step + 1) + "/" + STEPS.length + " · 약 5분" })]));
      render[STEPS[step][0]]().forEach(function (n) { body.appendChild(n); });
      refreshSums();
    }
    function save(markDone) {
      if (markDone) done[STEPS[step][0]] = true;
      state.className = "state"; state.textContent = "저장하는 중…";
      var patch = { data: d, steps_done: done, revision: ws.revision, spec_version: SPEC.version };
      if (STEPS.every(function (s) { return done[s[0]]; }) && !ws.submitted_at) patch.submitted_at = new Date().toISOString();
      return rest("PATCH", "worksheets?id=eq." + ws.id + "&revision=eq." + ws.revision, patch, "return=representation").then(function (rows) {
        if (!rows || !rows.length) throw new Error("다른 곳에서 먼저 고쳤습니다. 이 화면을 새로 고친 뒤 다시 적어 주세요. (지금 적은 내용은 저장되지 않았습니다)");
        ws = rows[0]; dirty = false; state.textContent = "저장됨 · " + stamp(ws.updated_at);
        var own = ws.client_id === uid() && (d.basic.name || d.basic.phone);
        if (own) return rest("PATCH", "profiles?id=eq." + ws.client_id, { display_name: d.basic.name || null, phone: d.basic.phone || null });
      }).then(function () { if (markDone && step < STEPS.length - 1) { step++; } draw(); window.scrollTo(0, 0); }, function (e) {
        state.className = "state dirty"; state.textContent = e.message;
      });
    }
    window.onbeforeunload = function () { return dirty ? "저장하지 않은 변경이 있습니다." : undefined; };
    state.textContent = ws.updated_at ? "저장됨 · " + stamp(ws.updated_at) : "";
    draw();
    var bar = readOnly ? null : el("div", { class: "savebar" }, [state,
      el("button", { class: "btn btn-line-dark", type: "button", text: "저장", onclick: function () { save(false); } }),
      el("button", { class: "btn btn-main", type: "button", text: "저장하고 다음", onclick: function () { save(true); } })]);
    return el("section", {}, [opts.title ? el("h1", { text: opts.title, style: "margin-bottom:16px" }) : null, nav, body, bar]);
  }

  function openOwnWorksheet(profile, opts) {
    return rest("GET", "worksheets?client_id=eq." + profile.id + "&order=created_at.desc&limit=1").then(function (rows) {
      if (rows.length) return rows[0];
      return rest("POST", "worksheets", { client_id: profile.id, spec_version: SPEC.version }, "return=representation").then(function (r) { return r[0]; });
    }).then(function (ws) { return viewWorksheet(ws, profile, opts); });
  }

  /* ---------- 화면: 상담 확인 · 동의 (계약 고객 · 문구 기준은 도구함 양식 14) ---------- */
  var AGREE_VERSION = "contract-2026-11-19";
  function agreementText() {
    return [
      el("h2", { text: "1 상담 범위" }),
      el("p", { text: "재무설계 상담은 다섯 번의 만남(고민과 목표 듣기 → 진단과 합의 → 제안 → 실행 → 정리와 관리 약속)으로 진행하고, 이후 정기 점검으로 이어집니다. 다루는 것은 현금흐름 · 자산과 빚 · 목적자금 · 보장 · 연금과 절세 · 운용 방식입니다. 세금 신고 대리 · 법률 자문 · 돈을 대신 굴리는 일은 하지 않습니다." }),
      el("h2", { text: "2 수당 안내" }),
      el("p", { text: "담당 자산관리사가 제안하는 금융회사와 서비스 회사는 제휴 업체이며, 고객님이 계약하시면 담당자는 해당 회사로부터 소정의 수당을 받습니다." }),
      el("p", { text: "보험 · 투자 · 운용 · 구독 서비스 등 담당자가 제안하는 모든 금융상품과 서비스에 적용되며, 지금까지 계약하신 것과 앞으로 계약하시는 것 모두 같습니다." }),
      el("p", { text: "가입은 고객님 선택입니다. 다른 곳에서 가입하시거나 가입하지 않으셔도 상담과 점검은 그대로 진행합니다." })
    ];
  }
  function privacyText() {
    return [
      el("h2", { text: "3 개인정보 수집 · 이용 동의" }),
      el("dl", { class: "kv" }, [
        el("dt", { text: "처리하는 곳" }), el("dd", { text: "라이즈 노르테 · 대표 이승준" }),
        el("dt", { text: "목적" }), el("dd", { text: "재무설계 상담, 이후 자산관리(정기 점검 · 자산관리에 필요한 금융상품과 서비스 제안), 서비스 개선과 통계" }),
        el("dt", { text: "항목" }), el("dd", { text: "이름 · 연락처 · 주소 · 이메일 · 생년월일 · 직업 · 가족 상황 · 소득 · 지출 · 자산 · 부채 · 보험 가입 내역 · 투자성향 · 보내 주신 자료(급여명세서 · 원천징수영수증 · 종합소득세 신고서 · 연말정산 서류 · 국민연금 예상액 등)" }),
        el("dt", { text: "보관 기간" }), el("dd", { text: "자산관리를 그만두겠다고 하실 때까지 보관하고, 그때 바로 지웁니다" }),
        el("dt", { text: "거부할 권리" }), el("dd", { text: "동의하지 않으실 수 있습니다. 다만 이 경우 재무설계 상담과 정기 점검은 진행하기 어렵습니다" })
      ]),
      el("p", { class: "src" }, ["상담을 시작한 날부터 받은 정보 전체에 적용됩니다. 주민등록번호 · 계좌번호는 보관하지 않으며, 받은 자료에 있으면 가리거나 지웁니다. 건강 정보는 보관하지 않습니다. 누구인지 알 수 없게 바꾼 통계와 사례는 상담 품질을 높이고 소개 자료를 만드는 데 씁니다. 자세한 내용은 ", el("a", { href: "../index.html#privacy", target: "_blank", rel: "noopener", text: "개인정보 처리방침" }), "에 있습니다."])
    ];
  }
  function loadAgreement(me) {
    return rest("GET", "consents?client_id=eq." + me.id + "&text_version=eq." + AGREE_VERSION + "&kind=in.(scope,commission,collect)&order=decided_at.desc").then(function (rows) {
      var got = {};
      rows.forEach(function (r) { if (!got[r.kind]) got[r.kind] = r; });
      var ok = ["scope", "commission", "collect"].every(function (k) { return got[k] && got[k].agreed; });
      return ok ? got.commission : null;
    });
  }
  function viewAgreement(me, onDone) {
    return loadAgreement(me).then(function (done) {
      if (done) {
        return el("section", { class: "panel" }, [
          el("h1", { text: "재무설계 상담 확인 · 동의서" }),
          el("p", { class: "msg", text: stamp(done.decided_at) + "에 " + (done.signer_name ? done.signer_name + " 님이 " : "") + "확인하고 동의하셨습니다." }),
          el("details", {}, [el("summary", { class: "link-btn", text: "동의한 내용 다시 보기" })].concat(agreementText(), privacyText()))
        ]);
      }
      var c2 = el("input", { type: "checkbox" }), c3 = el("input", { type: "checkbox" });
      var name = el("input", { type: "text", maxlength: "20", autocomplete: "name", "aria-label": "이름" });
      var err = el("p", { class: "msg bad", hidden: true });
      var btn = el("button", {
        class: "btn btn-main btn-wide", type: "button", text: "동의하고 저장", onclick: function () {
          var n = name.value.trim();
          if (!c2.checked || !c3.checked) { err.textContent = "두 곳 모두 표시해 주세요."; err.hidden = false; return; }
          if (!n) { err.textContent = "이름을 적어 주세요."; err.hidden = false; name.focus(); return; }
          btn.disabled = true; err.hidden = true;
          rest("POST", "consents", ["scope", "commission", "collect"].map(function (k) {
            return { client_id: me.id, kind: k, agreed: true, text_version: AGREE_VERSION, signer_name: n };
          })).then(onDone, function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
        }
      });
      return el("section", { class: "panel" }, [el("h1", { text: "재무설계 상담 확인 · 동의서" }), el("p", { class: "muted", text: "라이즈노르테 대표 자산관리사 이승준" })]
        .concat(agreementText(), [el("label", { class: "agree" }, [c2, el("span", { text: "수당 안내를 들었고 이해했습니다" })])],
          privacyText(), [
            el("label", { class: "agree" }, [c3, el("span", { text: "개인정보 수집 · 이용에 동의합니다" })]),
            el("div", { class: "wide" }, [el("label", { text: "이름" }), name]),
            el("p", { class: "src", text: "카카오로 로그인한 본인이 동의한 것으로 기록합니다. 동의한 문서 판 · 일시 · 이름이 남습니다." }),
            err, btn
          ]));
    });
  }

  /* ---------- 화면: 후기 작성 (계약 고객 · 항목 기준은 도구함 양식 13) ---------- */
  var HELPED = ["돈마다 자리가 정해진 것", "지출 · 저축 구조를 알게 된 것", "목표(결혼 · 집 · 노후)가 숫자로 보인 것", "보장을 정리한 것", "연금 · 절세를 챙긴 것", "실행까지 같이 한 것"];
  var REVIEW_Q = [["before_worry", "상담을 받기 전에 가장 큰 고민은 무엇이었나요"], ["changed", "상담을 받고 나서 달라진 것이 있다면"], ["wishes", "아쉬웠던 점이나 바라는 점"], ["message", "비슷한 고민을 하는 분께 한마디 (선택)"]];
  function viewReview(me, reload) {
    return rest("GET", "reviews?client_id=eq." + me.id + "&order=created_at.desc&limit=1").then(function (rows) {
      var rv = rows[0] || null;
      var areas = {};
      REVIEW_Q.forEach(function (q) { var t = el("textarea", { maxlength: "1000", rows: "3", "aria-label": q[1] }); t.value = (rv && rv[q[0]]) || ""; areas[q[0]] = t; });
      var helped = {}; ((rv && rv.helped) || []).forEach(function (h) { helped[h] = true; });
      var scope = rv ? rv.scope : null;
      var label = el("input", { type: "text", maxlength: "40", placeholder: "예) 30대 직장인", "aria-label": "실을 때 표기" });
      label.value = (rv && rv.label) || "";
      var err = el("p", { class: "msg bad", hidden: true });
      function radio(val, text) {
        return el("label", {}, [el("input", { type: "radio", name: "rv-scope", checked: scope === val, onchange: function () { scope = val; } }), el("span", { text: text })]);
      }
      var btn = el("button", {
        class: "btn btn-main btn-wide", type: "button", text: rv ? "고친 내용 저장" : "후기 저장", onclick: function () {
          if (!scope) { err.textContent = "이 후기를 어떻게 써도 되는지 골라 주세요."; err.hidden = false; return; }
          var body = { helped: HELPED.filter(function (h) { return helped[h]; }), scope: scope, label: label.value.trim() || null };
          REVIEW_Q.forEach(function (q) { body[q[0]] = areas[q[0]].value.trim() || null; });
          if (!body.before_worry && !body.changed && !body.wishes && !body.message && !body.helped.length) { err.textContent = "한 칸 이상 적거나 골라 주세요."; err.hidden = false; return; }
          btn.disabled = true; err.hidden = true;
          var p = rv ? rest("PATCH", "reviews?id=eq." + rv.id, body) : rest("POST", "reviews", Object.assign({ client_id: me.id }, body));
          p.then(function () { reload("저장했습니다. 고맙습니다."); }, function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
        }
      });
      var kids = [
        el("h1", { text: "상담 후기" }),
        el("p", { class: "muted", text: "편하게 적어 주세요. 짧아도 좋고, 비워 두셔도 됩니다." }),
        rv ? el("p", { class: "msg", text: stamp(rv.updated_at) + "에 저장한 후기입니다. 고쳐서 다시 저장할 수 있습니다." + (rv.published_at ? " 지금 실려 있는 후기라서, 고치면 내려가고 담당자가 다시 확인한 뒤 실립니다." : "") }) : null
      ];
      REVIEW_Q.slice(0, 2).forEach(function (q) { kids.push(el("div", { class: "wide" }, [el("label", { text: q[1] }), areas[q[0]]])); });
      kids.push(el("div", { class: "q" }, [el("p", { text: "가장 도움이 된 것 (여러 개 골라도 됩니다)" }), el("div", { class: "opts" }, HELPED.map(function (h) {
        return el("label", {}, [el("input", { type: "checkbox", checked: !!helped[h], onchange: function (e) { helped[h] = e.target.checked; } }), el("span", { text: h })]);
      }))]));
      REVIEW_Q.slice(2).forEach(function (q) { kids.push(el("div", { class: "wide" }, [el("label", { text: q[1] }), areas[q[0]]])); });
      kids.push(el("div", { class: "q" }, [el("p", { text: "이 후기를 어떻게 써도 될까요" }), el("div", { class: "opts" }, [radio("public", "이름 없이 홈페이지 · 소개 자료에 실어도 됩니다"), radio("private", "담당자만 참고해 주세요")])]));
      kids.push(el("div", { class: "wide" }, [el("label", { text: "실을 때 표기 (비워 두면 나이대와 직업만 적습니다)" }), label]));
      kids.push(el("p", { class: "src", text: "이름 · 연락처 · 직장 이름은 싣지 않습니다. ‘아쉬웠던 점’은 싣지 않고 담당자만 봅니다. 실은 뒤에도 내려 달라고 하시면 바로 내립니다." }));
      kids.push(err); kids.push(btn);
      if (rv) kids.push(el("button", {
        class: "link-btn", type: "button", text: "이 후기 지우기", onclick: function () {
          ask("적어 주신 후기를 지웁니다. 되돌릴 수 없습니다. 지울까요?", "지우기").then(function (ok) { if (ok) rest("DELETE", "reviews?id=eq." + rv.id).then(function () { reload("후기를 지웠습니다."); }, function (e) { err.textContent = e.message; err.hidden = false; }); });
        }
      }));
      return el("section", { class: "panel" }, kids);
    });
  }

  /* ---------- 화면: 계약 고객의 첫 화면 (상담 동의 · 후기 · 사전 작성지) ---------- */
  function viewClientHome(me, opts) {
    var tab = null, holder = el("div"), tabs = el("div", { class: "tabs" }), note = el("p", { class: "msg", hidden: true });
    function drawTabs() {
      tabs.textContent = "";
      [["agree", "상담 동의"], ["review", "후기 작성"], ["sheet", "사전 작성지"]].forEach(function (t) {
        tabs.appendChild(el("button", { type: "button", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { note.hidden = true; go(t[0]); } }));
      });
    }
    function go(t, message) {
      tab = t; drawTabs();
      if (message) { note.textContent = message; note.hidden = false; }
      holder.textContent = ""; holder.appendChild(el("p", { class: "muted", text: "불러오는 중입니다." }));
      var p = t === "agree" ? viewAgreement(me, function () { go("review", "동의를 저장했습니다. 이어서 후기를 적어 주실 수 있습니다."); })
        : t === "review" ? viewReview(me, function (m) { go("review", m); })
        : openOwnWorksheet(me, opts);
      p.then(function (n) { holder.textContent = ""; holder.appendChild(n); window.scrollTo(0, 0); },
        function (e) { holder.textContent = ""; holder.appendChild(el("p", { class: "msg bad", text: e.message })); });
    }
    return loadAgreement(me).then(function (done) {
      go(done ? "review" : "agree");
      return el("div", {}, [tabs, note, holder]);
    });
  }

  /* ---------- 화면: 담당자 ---------- */
  var STATUS = [["lead", "신청"], ["lecture", "강의 참석"], ["contracted", "계약 고객"], ["ended", "관리 종료"]];
  function viewAdvisor(me) {
    var tab = "book"; var holder = el("div");
    var tabs = el("div", { class: "tabs" });
    function drawTabs() {
      tabs.textContent = "";
      [["book", "예약 관리"], ["list", "고객 목록"], ["reviews", "후기"], ["mine", "고객 화면 시험 (내 계정)"]].forEach(function (t) {
        tabs.appendChild(el("button", { type: "button", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { pickTab(t[0]); } }));
      });
    }
    function go() {
      holder.textContent = ""; holder.appendChild(el("p", { class: "muted", text: "불러오는 중입니다." }));
      var p = tab === "mine" ? viewClientHome(me, { advisor: true }) : tab === "book" ? viewBookings(go) : tab === "reviews" ? reviews() : list();
      p.then(function (n) { holder.textContent = ""; holder.appendChild(n); }, function (e) { holder.textContent = ""; holder.appendChild(el("p", { class: "msg bad", text: e.message })); });
    }
    function pickTab(t) { tab = t; drawTabs(); window.scrollTo(0, 0); go(); }   // 탭을 바꾸면 맨 위에서 시작
    function list() {
      return Promise.all([rest("GET", "profiles?select=*&order=created_at.desc"), rest("GET", "worksheets?select=id,client_id,steps_done,updated_at,submitted_at&order=updated_at.desc"),
        rest("GET", "consents?select=client_id,decided_at,signer_name&kind=eq.commission&agreed=is.true&text_version=eq." + AGREE_VERSION + "&order=decided_at.desc")]).then(function (res) {
        var byClient = {}; res[1].forEach(function (w) { if (!byClient[w.client_id]) byClient[w.client_id] = w; });
        var agreed = {}; res[2].forEach(function (c) { if (!agreed[c.client_id]) agreed[c.client_id] = c; });
        var rows = res[0].map(function (p) {
          var w = byClient[p.id]; var n = w ? Object.keys(w.steps_done || {}).length : 0;
          var sel = el("select", { "aria-label": "상태", onchange: function (e) { rest("PATCH", "profiles?id=eq." + p.id, { status: e.target.value }).then(null, function (err) { tell(err.message); go(); }); } },
            STATUS.map(function (s) { return el("option", { value: s[0], text: s[1] }); }));
          sel.value = p.status;
          return el("tr", {}, [
            el("td", { text: (p.display_name || "(이름 없음)") + (p.role === "advisor" ? " · 담당자" : "") }),
            el("td", {}, [sel]),
            el("td", { text: agreed[p.id] ? stamp(agreed[p.id].decided_at) + (agreed[p.id].signer_name ? " · " + agreed[p.id].signer_name : "") : "—" }),
            el("td", { text: w ? n + "/" + STEPS.length + (w.submitted_at ? " · 제출" : "") : "아직 없음" }),
            el("td", { text: w ? stamp(w.updated_at) : "—" }),
            el("td", {}, [w ? el("button", { class: "link-btn", type: "button", text: "작성지 보기", onclick: function () { openClient(p, w.id); } }) : null,
              p.role === "advisor" ? null : el("button", { class: "link-btn", type: "button", text: "자료 지우기", onclick: function () { remove(p); } })])
          ]);
        });
        return el("section", {}, [el("h1", { text: "고객 목록", style: "margin-bottom:16px" }), el("div", { class: "table-wrap" }, [el("table", { class: "clients" }, [
          el("thead", {}, [el("tr", {}, ["이름", "상태", "상담 동의", "작성지", "마지막 저장", ""].map(function (h) { return el("th", { text: h }); }))]), el("tbody", {}, rows)])]),
          el("p", { class: "src", text: "‘계약 고객’으로 바꾸면 그 고객이 상담 동의 · 후기 작성 · 사전 작성지를 쓸 수 있습니다. 고객이 카카오로 한 번 로그인해야 이 목록에 나타납니다. 화면에 고객 이름이 보이니 다른 사람이 보는 곳에서는 열지 마세요." })]);
      });
    }
    function reviews() {
      return Promise.all([rest("GET", "reviews?select=*&order=created_at.desc"), rest("GET", "profiles?select=id,display_name"),
        rest("GET", "consents?select=client_id,signer_name&signer_name=not.is.null&order=decided_at.desc")]).then(function (res) {
        var signed = {}; res[2].forEach(function (c) { if (!signed[c.client_id]) signed[c.client_id] = c.signer_name; });
        var names = {}; res[1].forEach(function (p) { names[p.id] = signed[p.id] || p.display_name || "(이름 없음)"; });
        function oops(e) { tell(e.message); }
        var kids = [el("h1", { text: "후기" })];
        if (!res[0].length) kids.push(el("p", { class: "muted", text: "아직 들어온 후기가 없습니다." }));
        res[0].forEach(function (r) {
          var state = r.published_at ? "실을 후기로 표시함" : r.scope === "public" ? "실어도 됨 · 아직 확인 전" : "담당자만 참고";
          var dl = [];
          REVIEW_Q.forEach(function (q) { if (r[q[0]]) { dl.push(el("dt", { text: q[1].replace(" (선택)", "") + (q[0] === "wishes" ? " (싣지 않음)" : "") })); dl.push(el("dd", { text: r[q[0]] })); } });
          if ((r.helped || []).length) { dl.push(el("dt", { text: "가장 도움이 된 것" })); dl.push(el("dd", { text: r.helped.join(" · ") })); }
          dl.push(el("dt", { text: "실을 때 표기" })); dl.push(el("dd", { text: r.label || "(비움 · 나이대와 직업만)" }));
          kids.push(el("div", { class: "panel" }, [
            el("h2", { text: names[r.client_id] + " · " + state }),
            el("p", { class: "src", text: "저장한 때 " + stamp(r.updated_at) }),
            el("dl", { class: "kv" }, dl),
            el("div", { style: "display:flex;flex-wrap:wrap;gap:16px" }, [
              r.scope === "public" && !r.published_at ? el("button", { class: "link-btn", type: "button", text: "실을 후기로 표시", onclick: function () { rest("PATCH", "reviews?id=eq." + r.id, { published_at: new Date().toISOString(), unpublished_at: null }).then(go, oops); } }) : null,
              r.published_at ? el("button", { class: "link-btn", type: "button", text: "내리기", onclick: function () { rest("PATCH", "reviews?id=eq." + r.id, { published_at: null, unpublished_at: new Date().toISOString() }).then(go, oops); } }) : null,
              el("button", { class: "link-btn", type: "button", text: "지우기", onclick: function () { ask("이 후기를 지웁니다. 되돌릴 수 없습니다. 지울까요?", "지우기").then(function (ok) { if (ok) rest("DELETE", "reviews?id=eq." + r.id).then(go, oops); }); } })
            ])
          ]));
        });
        kids.push(el("p", { class: "src", text: "‘실어도 됩니다’를 고른 후기만 실을 수 있습니다. 실을 때 글을 고치지 않고, 수익률 · 수익 금액 · 보장 표현 · 상품과 회사 이름 · 다른 사람을 알아볼 수 있는 내용이 든 문장만 뺍니다. ‘아쉬웠던 점’은 싣지 않습니다. 고객이 내려 달라고 하면 바로 ‘내리기’를 누릅니다. 지금은 표시만 해 두는 단계이고, 홈페이지 화면에 후기를 보여 주는 칸은 아직 없습니다." }));
        return el("section", { style: "display:grid;gap:24px" }, kids);
      });
    }
    function openClient(p, id) {
      holder.textContent = "";
      rest("GET", "worksheets?id=eq." + id).then(function (rows) {
        holder.appendChild(el("button", { class: "link-btn", type: "button", text: "← 고객 목록", onclick: go }));
        holder.appendChild(viewWorksheet(rows[0], p, { readOnly: true, advisor: true, title: (p.display_name || "(이름 없음)") + " · 사전 작성지" }));
      }, function (e) { holder.appendChild(el("p", { class: "msg bad", text: e.message })); });
    }
    function remove(p) {
      ask((p.display_name || "이 고객") + "의 작성지 · 투자성향 · 동의 기록 · 후기를 모두 지웁니다. 되돌릴 수 없습니다. 지울까요?", "지우기").then(function (ok) { if (ok) rest("DELETE", "profiles?id=eq." + p.id).then(go, function (e) { tell(e.message); }); });
    }
    drawTabs(); go();
    show(tabs, holder);
  }

  /* ---------- 화면: 예약 관리 (담당자) ---------- */
  var KST_KEY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });
  var KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
  var KST_DAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
  var BOOK_STATUS = { "new": "새 신청", confirmed: "확정", done: "상담함", cancelled: "취소" };

  function viewBookings(reload) {
    var nowIso = new Date().toISOString();
    return Promise.all([
      rest("GET", "bookings?select=*&order=starts_at.asc.nullslast,created_at.desc"),
      rest("GET", "blocks?select=*&ends_at=gte." + encodeURIComponent(nowIso) + "&order=starts_at"),
      rest("GET", "open_rule?select=*&id=eq.1")
    ]).then(function (res) {
      var bookings = res[0], blocks = res[1], rule = (res[2] && res[2][0]) || {};
      var msg = el("p", { class: "msg bad", hidden: true });
      function oops(e) { msg.textContent = e.message; msg.hidden = false; msg.scrollIntoView({ block: "center" }); }
      var today = KST_KEY.format(new Date());

      /* 들어온 예약 */
      function bookingBox(b) {
        return el("dl", { class: "kv" }, [
          el("dt", { text: "이름" }), el("dd", { text: b.name }),
          el("dt", { text: "연락처" }), el("dd", { text: b.phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3") }),
          el("dt", { text: "희망 장소" }), el("dd", { text: b.place || "—" }),
          b.memo ? el("dt", { text: "남긴 말" }) : null, b.memo ? el("dd", { text: b.memo }) : null,
          b.wish ? el("dt", { text: "원하는 때" }) : null, b.wish ? el("dd", { text: b.wish }) : null,
          el("dt", { text: "관심 주제" }), el("dd", { text: (b.topics || []).join(" · ") || "—" }),
          b.check_result ? el("dt", { text: "자가 점검" }) : null, b.check_result ? el("dd", { text: b.check_result }) : null,
          el("dt", { text: "만난 경로" }), el("dd", { text: b.channel || "—" }),
          el("dt", { text: "신청한 때" }), el("dd", { text: stamp(b.created_at) })
        ]);
      }
      function setStatus(b, st) { return function () { rest("PATCH", "bookings?id=eq." + b.id, { status: st }).then(reload, oops); }; }
      function removeBooking(b) {
        return function () {
          ask(b.name + " 님의 신청 정보를 지웁니다. 그 시간은 다시 예약할 수 있게 열립니다. 되돌릴 수 없습니다. 지울까요?", "지우기").then(function (ok) { if (ok) rest("DELETE", "bookings?id=eq." + b.id).then(reload, oops); });
        };
      }
      function cancelBooking(b) {
        return function () {
          ask(b.name + " 님의 예약을 취소합니다. 그 시간은 다시 예약할 수 있게 열립니다. 취소 사실은 고객에게 직접 알려 주세요. 취소할까요?", "예약 취소").then(function (ok) { if (ok) rest("PATCH", "bookings?id=eq." + b.id, { status: "cancelled" }).then(reload, oops); });
        };
      }
      function bookingRow(b) {
        var when = b.starts_at ? KST_TIME.format(new Date(b.starts_at)) + " · " + (b.minutes || rule.minutes || 90) + "분" : "시간을 고르지 않음";
        var cancelled = b.status === "cancelled";
        // 시간 바꾸기: 누르면 날짜 · 시간 칸이 펼쳐진다
        var at = b.starts_at ? new Date(b.starts_at) : null;
        var mDate = el("input", { type: "date", value: at ? KST_KEY.format(at) : "", "aria-label": "새 날짜" });
        var hm = at ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(at) : "";
        var mTime = el("input", { type: "time", step: "600", value: hm, "aria-label": "새 시간" });
        var mover = el("div", { class: "mover", hidden: true }, [
          el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center" }, [mDate, mTime,
            el("button", {
              class: "btn btn-main", type: "button", text: "이 시간으로 옮기기", onclick: function () {
                if (!mDate.value || !/^\d\d:\d0$/.test(mTime.value)) return oops(new Error("날짜와 시간을 확인해 주세요. 시간은 10분 단위입니다."));
                rest("POST", "rpc/move_booking", { p_id: b.id, p_start: new Date(mDate.value + "T" + mTime.value + ":00+09:00").toISOString() })
                  .then(reload, function (e) { oops(new Error(e.message === "TAKEN" ? "그 시간에 다른 예약이 있습니다." : e.message)); });
              }
            })]),
          el("p", { class: "src", text: "옮긴 시간은 고객에게 직접 알려 주세요. 기본으로 여는 시간 밖으로도 옮길 수 있습니다." })
        ]);
        return el("div", { class: "wide" + (cancelled ? " blocked" : "") }, [
          el("label", { text: when + " · " + (BOOK_STATUS[b.status] || b.status) }),
          bookingBox(b),
          el("div", { style: "display:flex;flex-wrap:wrap;gap:12px" }, [
            b.status === "new" ? el("button", { class: "link-btn", type: "button", text: "확정으로 표시", onclick: setStatus(b, "confirmed") }) : null,
            !cancelled && b.status !== "done" ? el("button", { class: "link-btn", type: "button", text: "상담함으로 표시", onclick: setStatus(b, "done") }) : null,
            el("button", { class: "link-btn", type: "button", text: cancelled ? "다시 잡기 (시간 정하기)" : "시간 바꾸기", onclick: function () { mover.hidden = !mover.hidden; } }),
            !cancelled && b.status !== "done" ? el("button", { class: "link-btn", type: "button", text: "예약 취소", onclick: cancelBooking(b) }) : null,
            el("button", { class: "link-btn", type: "button", text: "신청 지우기", onclick: removeBooking(b) })
          ]),
          mover
        ]);
      }
      function dayBoxes(list, into) {
        var days = {}, order = [];
        list.forEach(function (b) { var k = b.starts_at ? KST_KEY.format(new Date(b.starts_at)) : "none"; if (!days[k]) { days[k] = []; order.push(k); } days[k].push(b); });
        order.forEach(function (k) {
          var box = el("div", { class: "sec-box" }, [el("div", { class: "day-head" }, [el("p", { text: k === "none" ? "시간을 고르지 않은 신청" : KST_DAY.format(new Date(days[k][0].starts_at)) })])]);
          days[k].forEach(function (b) { box.appendChild(bookingRow(b)); });
          into.appendChild(box);
        });
      }
      var cut = Date.now() - 24 * 3600 * 1000;
      var live = bookings.filter(function (b) { return b.status !== "cancelled"; });
      var gone = bookings.filter(function (b) { return b.status === "cancelled"; });
      var coming = live.filter(function (b) { return !b.starts_at || new Date(b.starts_at).getTime() >= cut; });
      var past = live.filter(function (b) { return b.starts_at && new Date(b.starts_at).getTime() < cut; }).reverse();
      var listBox = el("div", { class: "panel" }, [el("h2", { text: "들어온 예약" })]);
      if (!coming.length) listBox.appendChild(el("p", { class: "muted", text: "아직 들어온 예약이 없습니다. 예약이 들어오면 휴대폰 알림이 오고 여기에 나타납니다." }));
      dayBoxes(coming, listBox);
      if (past.length) {
        var pastBox = el("details", {}, [el("summary", { class: "link-btn", text: "지난 예약 " + past.length + "건 보기" })]);
        dayBoxes(past, pastBox);
        listBox.appendChild(pastBox);
      }
      if (gone.length) {
        var goneBox = el("details", {}, [el("summary", { class: "link-btn", text: "취소된 예약 " + gone.length + "건 보기" })]);
        dayBoxes(gone, goneBox);
        listBox.appendChild(goneBox);
      }

      /* 막기: 일정이 생긴 시간 · 하루 · 여러 날 */
      var bFrom = el("input", { type: "date", min: today, "aria-label": "막을 날" });
      var bTo = el("input", { type: "date", min: today, "aria-label": "마지막 날" });
      var allDay = el("input", { type: "checkbox", checked: true });
      var tFrom = el("input", { type: "time", step: "600", value: "12:00", "aria-label": "막기 시작 시간" });
      var tTo = el("input", { type: "time", step: "600", value: "14:00", "aria-label": "막기 끝 시간" });
      var timeRow = el("div", { class: "wide", hidden: true }, [el("label", { text: "막을 시간 (부터 ~ 까지)" }), el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center" }, [tFrom, el("span", { text: "~" }), tTo])]);
      allDay.addEventListener("change", function () { timeRow.hidden = allDay.checked; });
      var bNote = el("input", { type: "text", maxlength: "40", placeholder: "예) 병원 · 가족 모임 (나만 보는 메모)", "aria-label": "메모" });
      var blocker = el("div", { class: "panel" }, [
        el("h2", { text: "시간 막기" }),
        el("p", { class: "muted", text: "개인 일정이 생기면 그 시간이나 그 날을 막아 주세요. 막은 시간은 고객 달력에서 사라집니다. 이미 들어온 예약은 그대로 둡니다." }),
        el("div", { class: "wide" }, [el("label", { text: "날짜" }), bFrom]),
        el("div", { class: "wide" }, [el("label", { text: "마지막 날 (여러 날을 막을 때만)" }), bTo]),
        el("label", { class: "agree" }, [allDay, el("span", { text: "하루 종일 막기" })]),
        timeRow,
        el("div", { class: "wide" }, [el("label", { text: "메모 (선택)" }), bNote]),
        el("button", {
          class: "btn btn-main", type: "button", text: "막기", onclick: function () {
            if (!bFrom.value) return oops(new Error("날짜를 골라 주세요."));
            var end = bTo.value && bTo.value >= bFrom.value ? bTo.value : bFrom.value;
            var note = bNote.value.trim() || null, rows = [];
            if (allDay.checked) {
              rows.push({ starts_at: new Date(bFrom.value + "T00:00:00+09:00").toISOString(), ends_at: new Date(new Date(end + "T00:00:00+09:00").getTime() + 86400000).toISOString(), note: note });
            } else {
              if (!tFrom.value || !tTo.value || tTo.value <= tFrom.value) return oops(new Error("막을 시간을 확인해 주세요. 끝 시간이 시작 시간보다 늦어야 합니다."));
              var d = new Date(bFrom.value + "T00:00:00Z"), last = new Date(end + "T00:00:00Z");
              while (d <= last && rows.length < 62) {
                var k = d.toISOString().slice(0, 10);
                rows.push({ starts_at: new Date(k + "T" + tFrom.value + ":00+09:00").toISOString(), ends_at: new Date(k + "T" + tTo.value + ":00+09:00").toISOString(), note: note });
                d = new Date(d.getTime() + 86400000);
              }
            }
            rest("POST", "blocks", rows).then(reload, oops);
          }
        })
      ]);
      function blockLabel(k) {
        var s = new Date(k.starts_at), e = new Date(k.ends_at);
        function midnight(d) { return (d.getTime() + 9 * 3600000) % 86400000 === 0; }
        var whole = midnight(s) && midnight(e);
        if (whole) {
          var lastDay = new Date(e.getTime() - 60000);
          return KST_KEY.format(s) === KST_KEY.format(lastDay) ? KST_DAY.format(s) + " · 하루 종일" : KST_DAY.format(s) + " ~ " + KST_DAY.format(lastDay) + " · 하루 종일";
        }
        return KST_DAY.format(s) + " · " + KST_TIME.format(s) + " ~ " + KST_TIME.format(e);
      }
      var blockList = el("div", { class: "sec-box" }, [el("div", { class: "day-head" }, [el("p", { text: "막아 둔 시간" })])]);
      if (!blocks.length) blockList.appendChild(el("div", { class: "wide" }, [el("p", { class: "muted", text: "막아 둔 시간이 없습니다." })]));
      blocks.forEach(function (k) {
        blockList.appendChild(el("div", { class: "wide" }, [
          el("label", { text: blockLabel(k) + (k.note ? " · " + k.note : "") }),
          el("div", {}, [el("button", { class: "link-btn", type: "button", text: "막기 풀기", onclick: function () { rest("DELETE", "blocks?id=eq." + k.id).then(reload, oops); } })])
        ]));
      });
      blocker.appendChild(blockList);

      /* 기본으로 여는 시간 */
      var WEEK = ["일", "월", "화", "수", "목", "금", "토"];
      var weekOn = {}; (rule.weekdays || []).forEach(function (w) { weekOn[w] = true; });
      var weekChips = el("div", { class: "opts" }, [1, 2, 3, 4, 5, 6, 0].map(function (w) {
        return el("label", {}, [el("input", { type: "checkbox", checked: !!weekOn[w], onchange: function (e) { weekOn[w] = e.target.checked; } }), el("span", { text: WEEK[w] })]);
      }));
      var first = el("input", { type: "time", step: "600", value: rule.first_start || "10:00", "aria-label": "가장 이른 시작 시간" });
      var last = el("input", { type: "time", step: "600", value: rule.last_start || "19:30", "aria-label": "가장 늦은 시작 시간" });
      function pick(opts, val, label) {
        var s = el("select", { "aria-label": label }, opts.map(function (o) { return el("option", { value: String(o[0]), text: o[1] }); }));
        s.value = String(val); if (!s.value) s.value = String(opts[0][0]);
        return s;
      }
      var minutes = pick([[60, "60분"], [90, "90분"], [120, "120분"]], rule.minutes || 90, "상담 길이");
      var gap = pick([[0, "없음"], [10, "10분"], [20, "20분"], [30, "30분"], [60, "1시간"]], rule.gap_minutes == null ? 30 : rule.gap_minutes, "예약 사이 여유");
      var ahead = pick([[14, "2주 앞까지"], [28, "4주 앞까지"], [56, "8주 앞까지"], [84, "12주 앞까지"]], rule.days_ahead || 28, "예약을 받는 기간");
      var enabled = el("input", { type: "checkbox", checked: rule.enabled !== false });
      var opener = el("div", { class: "panel" }, [
        el("h2", { text: "기본으로 여는 시간" }),
        el("p", { class: "muted", text: "아래 요일과 시간대는 내일부터 항상 열려 있습니다. 고객은 이 시간대 안에서 10분 단위로 시작 시간을 고릅니다. 예약이 들어오면 그 시간과 앞뒤 여유만큼은 자동으로 닫힙니다." }),
        el("label", { class: "agree" }, [enabled, el("span", { text: "예약 받기 (끄면 달력에서 아무 시간도 고를 수 없습니다)" })]),
        el("div", { class: "q" }, [el("p", { text: "여는 요일" }), weekChips]),
        el("div", { class: "wide" }, [el("label", { text: "가장 이른 시작 시간" }), first]),
        el("div", { class: "wide" }, [el("label", { text: "가장 늦은 시작 시간" }), last]),
        el("div", { class: "wide" }, [el("label", { text: "상담 길이" }), minutes]),
        el("div", { class: "wide" }, [el("label", { text: "예약과 예약 사이 여유 (이동 시간)" }), gap]),
        el("div", { class: "wide" }, [el("label", { text: "예약을 받는 기간" }), ahead]),
        el("button", {
          class: "btn btn-main", type: "button", text: "저장", onclick: function () {
            var days = [0, 1, 2, 3, 4, 5, 6].filter(function (w) { return weekOn[w]; });
            if (!days.length) return oops(new Error("요일을 하나 이상 골라 주세요."));
            if (!/^\d\d:\d0$/.test(first.value) || !/^\d\d:\d0$/.test(last.value)) return oops(new Error("시간은 10분 단위로 적어 주세요. (예: 10:00 · 19:30)"));
            if (last.value < first.value) return oops(new Error("가장 늦은 시작 시간이 가장 이른 시작 시간보다 빠릅니다."));
            rest("PATCH", "open_rule?id=eq.1", {
              enabled: enabled.checked, weekdays: days, first_start: first.value, last_start: last.value,
              minutes: Number(minutes.value), gap_minutes: Number(gap.value), days_ahead: Number(ahead.value), updated_at: new Date().toISOString()
            }).then(reload, oops);
          }
        })
      ]);

      return el("section", { style: "display:grid;gap:24px" }, [
        el("h1", { text: "예약 관리" }), msg, listBox, blocker, opener,
        el("p", { class: "src", text: "새 신청이 오면 휴대폰 알림 앱(ntfy)으로 날짜와 시간만 알려 줍니다. 이름 · 연락처 · 희망 장소는 이 화면에서 확인해 주세요. 고객이 시간을 바꾸거나 취소해도 알림이 옵니다. ‘예약 취소’는 기록을 남기고 시간만 다시 열고, ‘신청 지우기’는 이름과 연락처까지 지웁니다. 상담으로 이어지지 않은 신청은 ‘신청 지우기’로 지웁니다." })
      ]);
    });
  }

  /* ---------- 시작 ---------- */
  function start() {
    if (!URL_ || !KEY || !SPEC) return fail(new Error("설정이 빠졌습니다 (assets/config.js · app/spec.js)."));
    loadSession();
    var fromHash = takeHash();
    if (fromHash && fromHash.error) return viewSignedOut("로그인이 끝나지 않았습니다: " + fromHash.error);
    if (fromHash && fromHash.access_token) saveSession(fromHash);
    if (!session || !uid()) return viewSignedOut();
    document.getElementById("logout").hidden = false;
    document.getElementById("logout").addEventListener("click", logout);
    rest("GET", "profiles?id=eq." + uid()).then(function (rows) {
      var me = rows[0];
      if (!me) throw new Error("계정 정보가 없습니다. 담당 자산관리사에게 알려 주세요.");
      var nick = me.display_name;
      if (!nick) { try { var m = JSON.parse(decodeURIComponent(escape(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))).user_metadata || {}; nick = m.name || m.full_name || m.nickname || m.user_name || ""; } catch (e) { nick = ""; } }
      document.getElementById("who").textContent = (nick ? nick + " 님" : "") + (me.role === "advisor" ? " · 담당자" : "");
      return rest("GET", "consents?client_id=eq." + me.id + "&kind=eq.collect&order=decided_at.desc&limit=1").then(function (c) {
        var enter = function () {
          if (me.role === "advisor") return viewAdvisor(me);
          if (me.status !== "contracted") return viewWaiting(me);
          return viewClientHome(me).then(function (n) { show(n); });
        };
        if (!c.length || !c[0].agreed) return viewConsent(function () { Promise.resolve(enter()).then(null, fail); });
        return enter();
      });
    }).then(null, function (e) {
      if (/만료|로그인이 필요/.test(e.message)) return viewSignedOut(e.message);
      fail(e);
    });
  }
  start();
})();
