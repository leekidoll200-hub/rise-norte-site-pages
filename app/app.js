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

  /* 길잡이 돈깨비의 말풍선 */
  function guide(text) {
    return el("div", { class: "guide guide-left" }, [el("span", { class: "guide-face", "aria-hidden": "true" }),
      el("div", { class: "guide-say" }, [el("b", { text: "돈깨비" }), el("p", { text: text })])]);
  }

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
      guide("상담을 받으신 분이 쓰는 화면입니다. 카카오로 로그인하면 상담 동의와 후기 작성, 사전 작성지를 쓸 수 있고 내 자료만 보입니다."),
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
      guide("담당 자산관리사가 확인하면 이 화면이 열립니다. 열린 뒤에 아래 ‘새로 고침’을 눌러 주세요."),
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
  var AGREE_VERSION = "contract-2026-11-20";   // 2026-11-20: 월급날 관리 항목(월급날 날짜 · 다달이 확인한 결과 · 소개 주소의 코드)을 넣음
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
        el("dt", { text: "항목" }), el("dd", { text: "이름 · 연락처 · 주소 · 이메일 · 생년월일 · 직업 · 가족 상황 · 소득 · 지출 · 자산 · 부채 · 보험 가입 내역 · 투자성향 · 보내 주신 자료(급여명세서 · 원천징수영수증 · 종합소득세 신고서 · 연말정산 서류 · 국민연금 예상액 등) · 이 화면에서 고르신 내 상황(일하는 형태 · 건강보험 가입 형태 · 부가가치세 유형 · 사는 집 · 차 · 함께 챙기는 가족)과 월급날 관리 기록(월급날 날짜 · 다달이 확인한 네 자리 결과와 남기신 말 · 알림을 켜고 끈 때 · ‘친구에게 보내기’ 주소의 코드)" }),
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
      return el("section", { class: "panel" }, [el("h1", { text: "재무설계 상담 확인 · 동의서" }), el("p", { class: "muted", text: "라이즈노르테 대표 자산관리사 이승준" }),
        guide("천천히 읽어 보세요. 모르는 말이 있으면 옆에 있는 담당자에게 바로 물어보시면 됩니다.")]
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
        guide("편하게 적어 주세요. 짧아도 좋고, 비워 두셔도 됩니다. 아쉬웠던 점을 적어 주시면 다음 상담을 고치는 데 씁니다."),
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



  /* ---------- 홈 화면에 깔기(설치형 웹앱) ----------
     설계: docs/캐릭터_사업/관리_기능_설계.md 1번. 깔면 주소창 없이 앱처럼 열린다. 알림 보내기는 아직 만들지 않았다.
     아이폰은 사파리에서만, 안드로이드는 크롬 등에서 된다. 카카오톡 안에서 연 화면에서는 깔 수 없다. */
  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); installEvt = e; });
  function isInstalled() {
    try { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; } catch (e) { return false; }
  }
  function installGuide(full) {
    if (isInstalled()) return full ? el("p", { class: "msg", text: "홈 화면에 깔려 있습니다. 지금 앱으로 열어 보고 계십니다." }) : null;
    var ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua), inApp = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
    var steps = inApp ? ["지금은 다른 앱 안에서 열린 화면이라 깔 수 없습니다.", ios ? "오른쪽 아래 ‘…’ 또는 공유 단추에서 ‘Safari로 열기’를 누른 뒤 다시 해 보세요." : "오른쪽 위 ‘⋮’에서 ‘다른 브라우저로 열기’를 누른 뒤 다시 해 보세요."]
      : ios ? ["사파리 아래쪽 가운데의 공유 단추(네모에서 화살표가 올라가는 그림)를 누릅니다.", "아래로 내려 ‘홈 화면에 추가’를 누릅니다.", "오른쪽 위 ‘추가’를 누르면 홈 화면에 돈깨비가 생깁니다."]
      : ["오른쪽 위 ‘⋮’를 누릅니다.", "‘홈 화면에 추가’ 또는 ‘앱 설치’를 누릅니다.", "‘설치’를 누르면 홈 화면에 돈깨비가 생깁니다."];
    var kids = [guide("나를 홈 화면에 꺼내 두자구! 그러면 월급날에 바로 만날 수 있어."),
      el("ol", { class: "install-steps" }, steps.map(function (t) { return el("li", { text: t }); }))];
    if (installEvt && !inApp) kids.push(el("button", { class: "btn btn-main btn-wide", type: "button", text: "홈 화면에 깔기", onclick: function () {
      var e = installEvt; installEvt = null; e.prompt();
    } }));
    if (!full) kids.push(el("button", { class: "link-btn", type: "button", text: "나중에 하기", onclick: function () {
      try { sessionStorage.setItem("rn_install_later", "1"); } catch (e) { /* 넘어간다 */ }
      box.hidden = true;
    } }));
    var box = el("div", { class: "panel install-box" }, [el("h2", { text: "홈 화면에 돈깨비 꺼내 두기" })].concat(kids));
    return box;
  }

  /* ---------- 화면: 월급날 도장판 · 설정 (계약 고객) ----------
     설계: docs/캐릭터_사업/월급날_돈깨비.md. 대사는 app/payday.js.
     알림은 따로 동의서를 받지 않고 ‘설정’에서 켜고 끈다(사용자 2026-11-20). 받는 정보는 상담 확인 · 동의서 3번에 적혀 있다.
     고객에게 자동으로 보내는 것은 없다. 월급날 아침에 담당자에게만 알림이 가고, 담당자가 카카오톡으로 직접 보낸다. */
  var PAY = window.RN_PAYDAY || null, payAgain = false;
  var GHOST_IMG = { dalkom: "../assets/ghost_dalkom.webp", jiltu: "../assets/ghost_jiltu.webp", buran: "../assets/ghost_buran.webp", tamyok: "../assets/ghost_tamyok.webp", dondok: "../assets/dondok.webp" };
  function seoulToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }   // 2026-11-20
  function loadCare(me) {
    return rest("GET", "care?client_id=eq." + me.id).then(function (rows) {
      return rows[0] || rest("POST", "rpc/set_my_care", { p_payday: null, p_notify: false });
    });
  }
  function copyText(text, done) {
    function manual() { tell("복사하지 못했습니다. 아래 글을 길게 눌러 복사해 주세요.\n\n" + text); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, manual); else manual();
  }
  function ghostSay(key, name, text, big) {
    return el("div", { class: "pay-say" + (big ? " pay-star" : "") }, [
      el("span", { class: "pay-face", "aria-hidden": "true", style: 'background-image:url("' + GHOST_IMG[key] + '")' }),
      el("div", {}, [el("b", { text: name }), el("p", { text: "“" + text + "”" })])]);
  }
  function stampBoard(stamps, year) {
    var have = {}; stamps.forEach(function (s) { have[Number(s.month.slice(5, 7))] = s; });
    var cells = [];
    for (var m = 1; m <= 12; m++) {
      var s = have[m], n = s ? ["dalkom", "jiltu", "buran", "tamyok"].filter(function (k) { return s.kept[k]; }).length : 0;
      cells.push(el("div", { class: "pay-cell" + (s ? " on" : ""), "aria-label": m + "월 " + (s ? "도장 받음 · 지킨 자리 " + n + "곳" : "아직") }, [
        el("small", { text: m + "월" }), s ? el("span", { class: "pay-seal", text: "RN" }) : null, s ? el("small", { text: "★".repeat(n) || "·" }) : null]));
    }
    return el("div", {}, [el("h2", { text: year + "년 도장판 · " + stamps.length + " / 12" }), el("div", { class: "pay-board" }, cells)]);
  }

  /* 이달에 챙길 것: 가입 질문지 답에 맞는 줄만, 많아야 셋(마감이 있는 것부터). 자료는 app/monthly.js */
  function monthlyFor(mon, st) {
    var M = window.RN_MONTHLY; if (!M) return [];
    st = st || {};
    var pay = st.work === "employee" || st.work === "both", biz = st.work === "biz" || st.work === "freelance" || st.work === "both";
    var ok = { all: true, pay: pay, side: st.work === "both", biz: biz, free: st.work === "freelance",
      vat: biz && (st.vat === "general" || st.vat === "unknown"), local: st.health === "local",
      own: st.home === "own", rent: st.home === "rent", car: st.car === "yes" };
    return (M.months[mon] || []).filter(function (r) { return ok[r.who]; })
      .sort(function (a, b) { return (b.due - a.due) || ((a.who === "all") - (b.who === "all")); }).slice(0, 3);
  }
  function monthlyBox(mon, st) {
    var rows = monthlyFor(mon, st);
    if (!rows.length) return null;
    var GN = { dalkom: "달콤귀", jiltu: "질투귀", buran: "불안귀", tamyok: "탐욕귀" };
    return el("div", { class: "pay-monthly" }, [el("h2", { text: "이달에 챙길 것" })].concat(rows.map(function (r) {
      return el("div", { class: "pay-item" }, [
        el("p", { class: "pay-item-t", text: r.title }),
        r.g ? ghostSay(r.g, GN[r.g], r.say, false) : null,
        guide(r.don + (r.who === "vat" && st && st.vat === "unknown" ? " 일반과세에 해당되는지부터 확인해 보자." : ""))]);
    }), [el("p", { class: "src", text: window.RN_MONTHLY.foot })]));
  }
  function viewPayday(me, reload) {
    if (!PAY) return Promise.reject(new Error("대사 파일을 불러오지 못했습니다 (app/payday.js)."));
    var today = seoulToday(), year = today.slice(0, 4), mon = Number(today.slice(5, 7)), L = PAY.months[mon];
    return Promise.all([loadCare(me), rest("GET", "stamps?client_id=eq." + me.id + "&order=month.desc&limit=14")]).then(function (res) {
      var care = res[0] || {}, all = res[1] || [];
      var thisYear = all.filter(function (s) { return s.month.slice(0, 4) === year; });
      var mine = all.filter(function (s) { return s.month === year + "-" + today.slice(5, 7) + "-01"; })[0] || null;
      var prev = all.filter(function (s) { return s.month < year + "-" + today.slice(5, 7) + "-01"; })[0] || null;   // 바로 앞에 찍은 달
      var promise = care.promise || {};
      var kids = [el("h1", { text: mon + "월 월급날 도장판" })];

      var order = ["d", "j", "b", "t"].sort(function (a, b) { return (b === L.star) - (a === L.star); });
      var KEY_OF = { d: "dalkom", j: "jiltu", b: "buran", t: "tamyok" }, NAME_OF = { d: "달콤귀", j: "질투귀", b: "불안귀", t: "탐욕귀" };
      var says = el("div", { class: "pay-says" }, order.map(function (k) { return ghostSay(KEY_OF[k], NAME_OF[k], L[k], k === L.star); }));
      if (L.boss) says.appendChild(ghostSay("dondok", "돈독귀신", L.boss, true));
      kids.push(says, guide(L.don), el("p", { class: "msg", text: "이달에 할 일: " + L.todo }));

      function shareBox() {
        var url = new URL("../index.html", location.href); url.search = "?r=" + care.ref_code; url.hash = "#check";
        return el("div", { class: "pay-share" }, [
          guide(PAY.friend),
          el("button", { class: "btn btn-main btn-wide", type: "button", text: "돈깨비를 친구에게 보내기", onclick: function () {
            var text = "내 안의 돈독귀신 테스트래. 너는 어떤 귀신이 나와? " + url.href;
            if (navigator.share) navigator.share({ title: "내 안의 돈독귀신 테스트", text: "내 안의 돈독귀신 테스트래. 너는 어떤 귀신이 나와?", url: url.href }).then(null, function () {});
            else copyText(text, function () { tell("주소를 복사했습니다. 카카오톡이나 문자에 붙여 넣어 보내세요."); });
          } }),
          el("p", { class: "src", text: "주소에는 이름이나 연락처가 들어가지 않습니다." })]);
      }

      if (mine && payAgain) { mine = null; }
      payAgain = false;
      if (mine) {
        var n = PAY.seats.filter(function (s) { return mine.kept[s.key]; }).length;
        kids.push(el("div", { class: "pay-done" }, [el("span", { class: "pay-seal pay-seal-lg", text: "RN" }), el("p", { text: "이번 달 도장을 받았습니다 · 지킨 자리 " + n + "곳" })]),
          guide(PAY.stamp(n)), monthlyBox(mon, care.situation), stampBoard(thisYear, year), shareBox(),
          el("button", { class: "link-btn", type: "button", text: "이번 달 확인을 다시 하기", onclick: function () { mine = null; reload(null, true); } }));
        return el("section", { class: "panel" }, kids);
      }

      var kept = {}, err = el("p", { class: "msg bad", hidden: true });
      PAY.seats.forEach(function (s) {
        var reply = el("p", { class: "pay-reply", hidden: true });
        var yes = el("button", { type: "button", "aria-pressed": "false", text: s.yes }), no = el("button", { type: "button", "aria-pressed": "false", text: s.no });
        function pick(v) {
          kept[s.key] = v; yes.setAttribute("aria-pressed", String(v)); no.setAttribute("aria-pressed", String(!v));
          var twice = !v && prev && prev.kept && prev.kept[s.key] === false;
          reply.textContent = v ? s.ghost + ": “" + s.kept + "”" : "돈깨비: “" + (twice ? PAY.twice : s.miss) + "”";
          reply.hidden = false; err.hidden = true;
        }
        yes.addEventListener("click", function () { pick(true); }); no.addEventListener("click", function () { pick(false); });
        kids.push(el("div", { class: "pay-seat" }, [
          el("h2", {}, [el("span", { class: "pay-face", "aria-hidden": "true", style: 'background-image:url("' + GHOST_IMG[s.key] + '")' }), s.seat + " · " + s.ghost]),
          promise[s.key] ? el("p", { class: "pay-promise", text: "약속: " + promise[s.key] }) : null,
          el("p", { text: s.ask }),
          el("div", { class: "tabs pay-pick" }, [yes, no]), reply]));
      });
      var note = el("textarea", { maxlength: "300", rows: "2", "aria-label": "담당자에게 물어볼 것" });
      kids.push(el("div", { class: "wide" }, [el("label", { text: "담당자에게 물어볼 것이 있나요? (선택)" }), note]), err);
      var btn = el("button", { class: "btn btn-main btn-wide", type: "button", text: "도장 받기", onclick: function () {
        if (PAY.seats.some(function (s) { return kept[s.key] === undefined; })) { err.textContent = "네 자리를 모두 골라 주세요. 못 지킨 달도 도장은 받습니다."; err.hidden = false; return; }
        btn.disabled = true;
        rest("POST", "rpc/stamp_month", { p_kept: kept, p_note: note.value.trim() || null }).then(function () { reload(); },
          function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
      } });
      kids.push(btn, el("p", { class: "src", text: "못 지킨 달도 도장은 받습니다." }), stampBoard(thisYear, year));
      return el("section", { class: "panel" }, kids);
    });
  }
  function viewCareSettings(me, reload) {
    return loadCare(me).then(function (care) {
      care = care || {};
      var day = el("select", { "aria-label": "월급날" }, [el("option", { value: "", text: "고르기" })].concat(
        Array.from({ length: 31 }, function (_, i) { return el("option", { value: String(i + 1), text: i === 30 ? "말일(31일)" : (i + 1) + "일" }); })));
      day.value = care.payday ? String(care.payday) : "";
      var on = el("input", { type: "checkbox", checked: !!care.notify });
      var err = el("p", { class: "msg bad", hidden: true });
      var btn = el("button", { class: "btn btn-main btn-wide", type: "button", text: "설정 저장", onclick: function () {
        if (on.checked && !day.value) { err.textContent = "알림을 받으려면 월급날을 골라 주세요."; err.hidden = false; return; }
        btn.disabled = true;
        rest("POST", "rpc/set_my_care", { p_payday: day.value ? Number(day.value) : null, p_notify: on.checked })
          .then(function () { reload("설정을 저장했습니다."); }, function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
      } });
      return el("section", { class: "panel" }, [
        el("h1", { text: "설정" }),
        el("div", { class: "wide" }, [el("label", { text: "월급날" }), day]),
        el("label", { class: "agree" }, [on, el("span", { text: "월급날에 카카오톡으로 도장판 안내 받기" })]),
        el("p", { class: "src", text: "켜 두면 다달이 월급날에 담당 자산관리사가 카카오톡으로 안내를 보내 드립니다. 안내만 보내고 광고는 보내지 않습니다. 언제든 여기서 끌 수 있습니다."
          + (care.notify_at ? " 마지막으로 바꾼 때: " + stamp(care.notify_at) : "") }),
        err, btn,
        el("button", { class: "link-btn", type: "button", text: "내 상황(일하는 형태 · 건강보험 · 집 · 차 · 가족) 고치기", onclick: function () { reload(null, true); } }),
        installGuide(true)]);
    });
  }


  /* ---------- 가입 질문지: 내 상황 등록 (계약 고객) ----------
     설계: docs/캐릭터_사업/관리_기능_설계.md 2번. 다 채워야 월급날 도장판 · 설정이 열린다. ‘설정’에서 다시 고칠 수 있다.
     고르기만 하고 적는 칸이 없다. 소득 금액 · 주민등록번호 · 계좌번호 · 건강 정보는 묻지 않는다.
     ‘돈이 들어오는 날’은 설정의 월급날과 같은 칸이다. 광고가 섞이는 ‘소식 알림’은 넣지 않았다. */
  var SITU_Q = [
    { key: "work", ask: "어떻게 일하세요?", opts: [["employee", "직장인(월급)"], ["biz", "개인사업자"], ["freelance", "프리랜서(3.3% 떼고 받음)"], ["both", "직장 + 부수입"], ["none", "지금은 소득 없음"]] },
    { key: "health", ask: "건강보험은 어떻게 들어 있나요?", opts: [["job", "직장가입자"], ["local", "지역가입자"], ["dependent", "가족 밑으로(피부양자)"], ["unknown", "모름"]] },
    { key: "vat", ask: "부가가치세는 어떤 유형인가요?", only: function (a) { return a.work === "biz" || a.work === "freelance" || a.work === "both"; },
      opts: [["general", "일반과세"], ["simple", "간이과세"], ["exempt", "면세"], ["na", "사업자 등록 없음"], ["unknown", "모름"]] },
    { key: "home", ask: "사는 집은 어떤가요?", opts: [["own", "내 집"], ["jeonse", "전세"], ["rent", "월세"], ["family", "가족과 함께"]] },
    { key: "car", ask: "차가 있나요?", opts: [["yes", "있다"], ["no", "없다"]] }
  ];
  var FAMILY = [["spouse", "배우자"], ["child", "자녀"], ["parent", "부모님"]];
  function viewSituation(me, care, onDone) {
    var a = Object.assign({}, care.situation || {}), fam = {};
    (a.family || []).forEach(function (f) { fam[f] = true; });
    var err = el("p", { class: "msg bad", hidden: true }), blocks = {};
    function draw(q) {
      var row = el("div", { class: "tabs tabs-wrap pay-opts" }, q.opts.map(function (o) {
        var b = el("button", { type: "button", "aria-pressed": String(a[q.key] === o[0]), text: o[1], onclick: function () {
          a[q.key] = o[0]; err.hidden = true;
          Array.prototype.forEach.call(row.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); });
          refresh();
        } });
        return b;
      }));
      return (blocks[q.key] = el("div", { class: "q" }, [el("p", { text: q.ask }), row]));
    }
    function refresh() { SITU_Q.forEach(function (q) { if (q.only) blocks[q.key].hidden = !q.only(a); }); }
    var day = el("select", { "aria-label": "돈이 들어오는 날" }, [el("option", { value: "", text: "고르기" })].concat(
      Array.from({ length: 31 }, function (_, i) { return el("option", { value: String(i + 1), text: i === 30 ? "말일(31일)" : (i + 1) + "일" }); })));
    day.value = care.payday ? String(care.payday) : "";
    var irregular = el("input", { type: "checkbox", checked: !!a.irregular });
    var kids = [el("h1", { text: "내 상황 알려 주기" }),
      guide("어떻게 지내는지 알려 줘. 너한테 맞는 것만 골라서 같이 챙기자구! 1분이면 돼."),
      el("p", { class: "src", text: "모르는 것은 ‘모름’을 고르세요. 나중에 ‘설정’에서 고칠 수 있습니다." })];
    SITU_Q.forEach(function (q, i) {
      kids.push(draw(q));
      if (i === 1) kids.push(el("div", { class: "q" }, [el("p", { text: "돈이 들어오는 날은 언제인가요?" }), day,
        el("label", { class: "agree" }, [irregular, el("span", { text: "들어오는 날이 일정하지 않아요 (위에는 ‘돈 정리하는 날’로 삼을 날을 골라 주세요)" })])]));
    });
    kids.push(el("div", { class: "q" }, [el("p", { text: "함께 챙기는 가족이 있나요? (여러 개 골라도 되고, 없으면 그대로 두세요)" }),
      el("div", { class: "opts" }, FAMILY.map(function (f) {
        return el("label", {}, [el("input", { type: "checkbox", checked: !!fam[f[0]], onchange: function (e) { fam[f[0]] = e.target.checked; } }), el("span", { text: f[1] })]);
      }))]));
    var btn = el("button", { class: "btn btn-main btn-wide", type: "button", text: "저장하고 시작하기", onclick: function () {
      if (SITU_Q[2].only(a) === false) a.vat = "na";
      var miss = SITU_Q.filter(function (q) { return !a[q.key]; })[0];
      if (miss) { err.textContent = "‘" + miss.ask + "’를 골라 주세요."; err.hidden = false; blocks[miss.key].scrollIntoView({ block: "center" }); return; }
      if (!day.value) { err.textContent = "돈이 들어오는 날을 골라 주세요."; err.hidden = false; day.focus(); return; }
      btn.disabled = true;
      var body = { work: a.work, health: a.health, vat: a.vat, home: a.home, car: a.car, irregular: irregular.checked,
        family: FAMILY.map(function (f) { return f[0]; }).filter(function (k) { return fam[k]; }) };
      rest("POST", "rpc/set_my_situation", { p: body })
        .then(function () { return rest("POST", "rpc/set_my_care", { p_payday: Number(day.value), p_notify: null }); })
        .then(onDone, function (e) { btn.disabled = false; err.textContent = e.message; err.hidden = false; });
    } });
    kids.push(err, btn);
    refresh();
    return el("section", { class: "panel" }, kids);
  }

  /* ---------- 화면: 계약 고객의 첫 화면 (상담 동의 · 후기 · 사전 작성지) ---------- */
  function viewClientHome(me, opts) {
    var tab = null, holder = el("div"), tabs = el("div", { class: "tabs tabs-wrap" }), note = el("p", { class: "msg", hidden: true }), editSitu = false;
    function drawTabs() {
      tabs.textContent = "";
      [["agree", "상담 동의"], ["pay", "월급날 도장판"], ["review", "후기 작성"], ["sheet", "사전 작성지"], ["set", "설정"]].forEach(function (t) {
        tabs.appendChild(el("button", { type: "button", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { note.hidden = true; go(t[0]); } }));
      });
    }
    function go(t, message) {
      tab = t; drawTabs();
      if (message) { note.textContent = message; note.hidden = false; }
      holder.textContent = ""; holder.appendChild(el("p", { class: "muted", text: "불러오는 중입니다." }));
      var gated = (t === "pay" || t === "set") ? loadCare(me).then(function (care) {
        if (care && care.situation_at && !editSitu) return null;
        editSitu = false;
        return viewSituation(me, care || {}, function () { go("pay", "저장했습니다. 이제 월급날 도장판을 쓸 수 있습니다."); });
      }) : Promise.resolve(null);
      var p = gated.then(function (q) {
        if (q) return q;
        return t === "agree" ? viewAgreement(me, function () { go("pay", "동의를 저장했습니다."); })
        : t === "review" ? viewReview(me, function (m) { go("review", m); })
        : t === "pay" ? viewPayday(me, function (m, again) { payAgain = !!again; go("pay", m); })
        : t === "set" ? viewCareSettings(me, function (m, edit) { editSitu = !!edit; go("set", m); })
        : openOwnWorksheet(me, opts);
      });
      p.then(function (n) { holder.textContent = ""; holder.appendChild(n); window.scrollTo(0, 0); },
        function (e) { holder.textContent = ""; holder.appendChild(el("p", { class: "msg bad", text: e.message })); });
    }
    return loadAgreement(me).then(function (done) {
      go(done ? "pay" : "agree");                    // 동의를 마친 고객은 월급날 도장판부터
      var later = false; try { later = sessionStorage.getItem("rn_install_later") === "1"; } catch (e) { /* 넘어간다 */ }
      return el("div", {}, [later || (opts && opts.advisor) ? null : installGuide(false), tabs, note, holder]);
    });
  }

  /* ---------- 화면: 담당자 ---------- */
  var STATUS = [["lead", "신청"], ["lecture", "강의 참석"], ["contracted", "계약 고객"], ["ended", "관리 종료"]];
  function viewAdvisor(me) {
    var tab = "book"; var holder = el("div");
    var tabs = el("div", { class: "tabs tabs-wrap" });
    function drawTabs() {
      tabs.textContent = "";
      [["book", "예약 관리"], ["stats", "통계"], ["list", "고객 목록"], ["pay", "월급날 · 소개"], ["reviews", "후기"], ["mine", "고객 화면 시험 (내 계정)"]].forEach(function (t) {
        tabs.appendChild(el("button", { type: "button", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { pickTab(t[0]); } }));
      });
    }
    function go() {
      holder.textContent = ""; holder.appendChild(el("p", { class: "muted", text: "불러오는 중입니다." }));
      var p = tab === "mine" ? viewClientHome(me, { advisor: true }) : tab === "book" ? viewBookings(go) : tab === "reviews" ? reviews() : tab === "stats" ? statsView() : tab === "pay" ? paydayView() : list();
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

    /* ---------- 월급날 · 소개: 오늘 월급날인 고객 · 이번 달 도장 · 약속 적기 · 소개 표 ---------- */
    function paydayView() {
      var today = seoulToday(), ym = today.slice(0, 7), mon = Number(today.slice(5, 7)), dayNow = Number(today.slice(8, 10));
      var lastDay = new Date(Number(today.slice(0, 4)), mon, 0).getDate();
      var L = PAY ? PAY.months[mon] : null;
      var appUrl = new URL("index.html", location.href); appUrl.search = "?s=pay"; appUrl.hash = "";
      return Promise.all([
        rest("GET", "profiles?select=id,display_name,status,role&status=eq.contracted&order=created_at.desc"),
        rest("GET", "care?select=*"),
        rest("GET", "stamps?select=*&order=month.desc&limit=400"),
        rest("POST", "rpc/referrals", {}).then(null, function () { return null; })      // 통계 SQL(008)이 아직이면 비워 둔다
      ]).then(function (res) {
        var careBy = {}; (res[1] || []).forEach(function (c) { careBy[c.client_id] = c; });
        var stampsBy = {}; (res[2] || []).forEach(function (s) { (stampsBy[s.client_id] = stampsBy[s.client_id] || []).push(s); });
        var due = [], rows = (res[0] || []).map(function (p) {
          var c = careBy[p.id] || {}, st = stampsBy[p.id] || [], cur = st.filter(function (s) { return s.month.slice(0, 7) === ym; })[0];
          var isToday = c.notify && c.payday && Math.min(c.payday, lastDay) === dayNow;
          if (isToday) due.push(p.display_name || "(이름 없음)");
          var two = st.length >= 2 ? PAY.seats.filter(function (s) { return st[0].kept[s.key] === false && st[1].kept[s.key] === false; }).map(function (s) { return s.seat; }) : [];
          var dayIn = el("input", { type: "number", min: "1", max: "31", value: c.payday || "", "aria-label": "월급날", style: "width:5em" });
          var ins = {}; PAY.seats.forEach(function (s) { ins[s.key] = el("input", { type: "text", maxlength: "60", value: (c.promise || {})[s.key] || "", placeholder: "예) 한 달 ○○만 원까지 (상품 이름은 적지 않습니다)", "aria-label": s.seat + " 약속" }); });
          var saved = el("span", { class: "muted" });
          var edit = el("details", {}, [el("summary", { class: "link-btn", text: "월급날 · 네 자리 약속 적기" }),
            el("div", { class: "wide" }, [el("label", { text: "월급날 (1~31 · 31은 말일)" }), dayIn])].concat(PAY.seats.map(function (s) {
              return el("div", { class: "wide" }, [el("label", { text: s.seat + " (" + s.ghost + ")" }), ins[s.key]]);
            }), [el("button", { class: "btn btn-main", type: "button", text: "저장", onclick: function () {
              var d = dayIn.value === "" ? null : Number(dayIn.value);
              if (d !== null && !(d >= 1 && d <= 31)) { tell("월급날은 1부터 31 사이로 적어 주세요."); return; }
              var pr = {}; PAY.seats.forEach(function (s) { var v = ins[s.key].value.trim(); if (v) pr[s.key] = v; });
              rest("POST", "care?on_conflict=client_id", { client_id: p.id, payday: d, promise: pr }, "resolution=merge-duplicates")
                .then(function () { saved.textContent = " 저장했습니다."; }, function (e) { tell(e.message); });
            } }), saved]));
          var msg = (p.display_name ? p.display_name + "님, " : "") + PAY.kakao + "\n" + appUrl.href;
          return el("tr", {}, [
            el("td", { text: (p.display_name || "(이름 없음)") + (isToday ? " · 오늘 월급날" : "") }),
            el("td", { text: c.payday ? (c.payday === 31 ? "말일" : c.payday + "일") : "—" }),
            el("td", { text: c.notify ? "켬" : "끔" }),
            el("td", { text: cur ? "찍음 · 지킨 자리 " + PAY.seats.filter(function (s) { return cur.kept[s.key]; }).length + "곳" : "아직" }),
            el("td", { text: (cur && cur.note ? "한 줄: " + cur.note : "") + (two.length ? (cur && cur.note ? " / " : "") + "두 달째 못 지킴: " + two.join(" · ") : "") || "—" }),
            el("td", {}, [c.notify ? el("button", { class: "link-btn", type: "button", text: "알림 문구 복사", onclick: function () { copyText(msg, function () { tell("복사했습니다. 카카오톡에 붙여 넣어 보내세요.\n\n" + msg); }); } }) : null, edit])
          ]);
        });
        var refs = res[3];
        return el("section", { style: "display:grid;gap:24px" }, [
          el("h1", { text: "월급날 · 소개" }),
          el("p", { class: "msg", text: due.length ? "오늘 월급날(알림 켬): " + due.join(" · ") : "오늘 월급날인 고객(알림 켬)은 없습니다." }),
          el("div", { class: "table-wrap" }, [el("table", { class: "clients" }, [
            el("thead", {}, [el("tr", {}, ["이름", "월급날", "알림", mon + "월 도장", "살필 것", ""].map(function (h) { return el("th", { text: h }); }))]),
            el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: "6", text: "계약 고객이 아직 없습니다." })])])])]),
          el("p", { class: "src", text: "알림은 고객이 자기 화면의 ‘설정’에서 켜고 끕니다. 켠 고객에게만 보내세요. 자동으로 나가는 것은 없고, 월급날 아침 8시 30분에 담당자 휴대폰으로 ‘오늘 월급날 고객 n명’만 옵니다. 다달이 보내는 연락과 소개 답례는 소속 회사 규정을 먼저 확인하세요(확인 필요)." }),
          el("div", { class: "panel" }, [el("h2", { text: "소개" }), el("p", { class: "muted", text: "고객의 ‘친구에게 보내기’ 주소로 들어온 방문 · 테스트를 끝낸 방문 · 상담 신청 수입니다." }),
            refs === null ? el("p", { class: "msg", text: "방문 통계가 아직 켜지지 않아 셀 수 없습니다." })
              : el("div", { class: "table-wrap" }, [el("table", { class: "clients" }, [
                  el("thead", {}, [el("tr", {}, ["이름", "코드", "들어온 방문", "테스트 끝냄", "상담 신청"].map(function (h) { return el("th", { text: h }); }))]),
                  el("tbody", {}, refs.length ? refs.map(function (r) { return el("tr", {}, [r.name, r.ref_code, r.visits, r.results, r.bookings].map(function (v) { return el("td", { text: String(v) }); })); })
                    : [el("tr", {}, [el("td", { colspan: "5", text: "아직 기록이 없습니다." })])])])])])
        ]);
      });
    }
    /* ---------- 통계: 방문 · 머문 시간 · 단계별 전환 · 유입 경로 ---------- */
    var statDays = 7;
    function statsView() {
      var VIEW_NAME = { home: "홈", check: "자가 점검", how: "진행 방식", cases: "상담 사례", faq: "자주 묻는 질문", apply: "상담 신청", privacy: "처리방침" };
      var SRC_NAME = { direct: "직접 들어옴 · 링크", naver: "네이버", google: "구글", kakao: "카카오 · 다음", instagram: "인스타그램", youtube: "유튜브", facebook: "페이스북", threads: "스레드", ig: "인스타그램(꼬리표)", th: "스레드(꼬리표)", yt: "유튜브(꼬리표)", blog: "블로그", card: "명함 · 인쇄물", sh: "공유 주소로 옴", img: "결과 그림으로 옴", pay: "월급날 알림", ad: "광고" };
      var DEV_NAME = { mobile: "휴대폰", tablet: "태블릿", desktop: "PC" };
      var to = KST_KEY.format(new Date()), from = KST_KEY.format(new Date(Date.now() - (statDays - 1) * 86400000));
      function dur(ms) { ms = Number(ms) || 0; var s = Math.round(ms / 1000); return s < 60 ? s + "초" : Math.floor(s / 60) + "분 " + (s % 60) + "초"; }
      var GHOST_NAME = { dalkom: "달콤귀", jiltu: "질투귀", buran: "불안귀", tamyok: "탐욕귀", dondok: "돈독귀신(넷 다)", none: "돈깨비만(해당 없음)" };
      function crit(a, b, line) { return !b ? "—" : a / b >= line ? "넘음" : "아직"; }
      function pct(a, b) { return b ? (Math.round(a / b * 1000) / 10) + "%" : "—"; }
      function won(v) { return v == null || !isFinite(v) ? "—" : Math.round(v).toLocaleString("ko-KR") + "원"; }
      function table(heads, rows) {
        return el("div", { class: "table-wrap" }, [el("table", { class: "clients stat-table" }, [
          el("thead", {}, [el("tr", {}, heads.map(function (h) { return el("th", { text: h }); }))]),
          el("tbody", {}, rows.length ? rows.map(function (r) { return el("tr", {}, r.map(function (c) { return el("td", {}, [c instanceof Node ? c : String(c)]); })); })
            : [el("tr", {}, [el("td", { colspan: String(heads.length), text: "아직 기록이 없습니다." })])])])]);
      }
      function bar(v, max) { return el("div", { class: "stat-bar" }, [el("i", { style: "width:" + (max ? Math.max(2, Math.round(v / max * 100)) : 0) + "%" }), el("span", { text: String(v) })]); }
      return Promise.all([
        rest("POST", "rpc/stats", { p_from: from, p_to: to }),
        rest("GET", "ad_costs?select=*&day=gte." + from + "&day=lte." + to + "&order=day.desc"),
        rest("GET", "lecture_logs?select=*&order=day.desc"),          // 손으로 적는 기록은 기간과 상관없이 전부
        rest("GET", "mention_logs?select=*&order=day.desc")
      ]).then(function (res) {
        var s = res[0] || {}, costs = res[1] || [], lectures = res[2] || [], mentions = res[3] || [], t = s.total || {};
        var lecSurveys = lectures.reduce(function (a, l) { return a + l.surveys; }, 0), lecNamed = lectures.reduce(function (a, l) { return a + l.named; }, 0);

        function delBtn(path) { return el("button", { class: "link-btn", type: "button", text: "지우기", onclick: function () { ask("이 기록을 지울까요?", "지우기").then(function (ok) { if (ok) rest("DELETE", path).then(go, function (e) { tell(e.message); }); }); } }); }
        /* 강의 기록 적기 */
        var lDay = el("input", { type: "date", value: to, "aria-label": "강의 날짜" });
        var lTag = el("input", { type: "text", maxlength: "20", placeholder: "예) lec-2701a (QR에 붙인 꼬리표)", "aria-label": "강의 꼬리표" });
        var lAtt = el("input", { type: "number", min: "0", "aria-label": "참석 수" });
        var lSur = el("input", { type: "number", min: "0", "aria-label": "걷은 설문 수" });
        var lNam = el("input", { type: "number", min: "0", "aria-label": "이름을 맞게 적은 수" });
        var lNote = el("input", { type: "text", maxlength: "100", placeholder: "회사 · 사람 이름은 적지 않습니다", "aria-label": "메모" });
        var lErr = el("p", { class: "msg bad", hidden: true });
        var lecBox = el("details", { class: "panel" }, [
          el("summary", { text: "강의 기록 적기 (캐릭터 이름을 기억하는 비율)" }),
          el("p", { class: "muted", text: "강의 끝 종이 설문에서 ‘기억나는 캐릭터 이름’을 하나라도 맞게 적은 수를 적습니다." }),
          el("div", { class: "wide" }, [el("label", { text: "날짜" }), lDay]),
          el("div", { class: "wide" }, [el("label", { text: "강의 꼬리표(선택)" }), lTag]),
          el("div", { class: "wide" }, [el("label", { text: "참석 수" }), lAtt]),
          el("div", { class: "wide" }, [el("label", { text: "걷은 설문 수" }), lSur]),
          el("div", { class: "wide" }, [el("label", { text: "이름을 맞게 적은 수" }), lNam]),
          el("div", { class: "wide" }, [el("label", { text: "메모(선택)" }), lNote]),
          lErr,
          el("button", { class: "btn btn-main", type: "button", text: "적기", onclick: function () {
            var a = Number(lAtt.value), sv = Number(lSur.value), nm = Number(lNam.value);
            if (!lDay.value || lAtt.value === "" || lSur.value === "" || lNam.value === "" || !(a >= 0) || !(sv >= 0) || !(nm >= 0) || nm > sv) {
              lErr.textContent = "날짜와 숫자 셋을 적어 주세요. 이름을 맞게 적은 수는 걷은 설문 수보다 클 수 없습니다."; lErr.hidden = false; return;
            }
            rest("POST", "lecture_logs", { day: lDay.value, tag: lTag.value.trim().toLowerCase() || null, attendees: Math.round(a), surveys: Math.round(sv), named: Math.round(nm), note: lNote.value.trim() || null })
              .then(go, function (e) { lErr.textContent = e.message; lErr.hidden = false; });
          } })
        ].concat(lectures.map(function (l) {
          return el("div", { class: "wide" }, [el("label", { text: l.day + (l.tag ? " · " + l.tag : "") + " · 참석 " + l.attendees + " · 설문 " + l.surveys + " · 이름 맞힘 " + l.named + (l.note ? " · " + l.note : "") }),
            el("div", {}, [delBtn("lecture_logs?id=eq." + l.id)])]);
        })));
        /* 한 줄 기록 적기 */
        var mDay = el("input", { type: "date", value: to, "aria-label": "날짜" });
        var mPlace = el("select", { "aria-label": "어디서" }, ["상담", "강의", "메시지", "SNS", "지인"].map(function (x) { return el("option", { text: x }); }));
        var mLine = el("input", { type: "text", maxlength: "120", placeholder: "예) 강의 뒤 담당자가 ‘우리 팀은 탐욕귀래요’라고 함", "aria-label": "한 줄" });
        var mErr = el("p", { class: "msg bad", hidden: true });
        var menBox = el("details", { class: "panel" }, [
          el("summary", { text: "한 줄 기록 적기 (누가 먼저 캐릭터 이야기를 꺼낸 일)" }),
          el("p", { class: "muted", text: "고객 이름은 적지 않습니다." }),
          el("div", { class: "wide" }, [el("label", { text: "날짜" }), mDay]),
          el("div", { class: "wide" }, [el("label", { text: "어디서" }), mPlace]),
          el("div", { class: "wide" }, [el("label", { text: "한 줄" }), mLine]),
          mErr,
          el("button", { class: "btn btn-main", type: "button", text: "적기", onclick: function () {
            if (!mDay.value || !mLine.value.trim()) { mErr.textContent = "날짜와 한 줄을 적어 주세요."; mErr.hidden = false; return; }
            rest("POST", "mention_logs", { day: mDay.value, place: mPlace.value, line: mLine.value.trim() }).then(go, function (e) { mErr.textContent = e.message; mErr.hidden = false; });
          } })
        ].concat(mentions.map(function (m) {
          return el("div", { class: "wide" }, [el("label", { text: m.day + " · " + m.place + " · " + m.line }), el("div", {}, [delBtn("mention_logs?id=eq." + m.id)])]);
        })));
        var range = el("div", { class: "tabs" }, [[1, "오늘"], [7, "7일"], [30, "30일"], [90, "90일"]].map(function (d) {
          return el("button", { type: "button", "aria-pressed": String(statDays === d[0]), text: d[1], onclick: function () { statDays = d[0]; go(); } });
        }));
        var cards = el("div", { class: "stat-cards" }, [
          ["방문자", t.visitors || 0, "서로 다른 사람(브라우저)"], ["방문 횟수", t.sessions || 0, "들어온 횟수"],
          ["화면 조회", t.views || 0, "메뉴를 본 횟수"], ["평균 머문 시간", dur(t.avg_ms), "한 번 들어와서"],
          ["자가 점검 결과", t.result || 0, "결과 보기를 누른 방문"], ["상담 신청", s.bookings || 0, "실제로 들어온 예약"]
        ].map(function (c) { return el("div", { class: "stat" }, [el("b", { text: String(c[1]) }), el("span", { text: c[0] }), el("small", { text: c[2] })]); }));

        var steps = [["사이트 방문", t.sessions || 0], ["자가 점검 화면", t.check || 0], ["결과 보기", t.result || 0], ["상담 신청 화면", t.apply || 0], ["시간 고름", t.pick || 0], ["예약 완료", t.book || 0]];
        var funnel = table(["단계", "방문 수", "앞 단계 대비", "처음 대비"], steps.map(function (st, i) {
          return [st[0], bar(st[1], steps[0][1]), i ? pct(st[1], steps[i - 1][1]) : "—", i ? pct(st[1], steps[0][1]) : "100%"];
        }));

        var maxV = Math.max.apply(null, (s.daily || []).map(function (d) { return d.sessions; }).concat([1]));
        var daily = table(["날짜", "방문 횟수", "방문자", "평균 머문 시간", "점검 결과", "예약"], (s.daily || []).slice().reverse().map(function (d) {
          return [d.day.slice(5).replace("-", "월 ") + "일", bar(d.sessions, maxV), d.visitors, dur(d.avg_ms), d.result, d.book];
        }));

        var maxP = Math.max.apply(null, (s.by_view || []).map(function (v) { return v.views; }).concat([1]));
        var views = table(["화면", "조회 수", "평균 머문 시간"], (s.by_view || []).map(function (v) { return [VIEW_NAME[v.view] || v.view, bar(v.views, maxP), dur(v.avg_ms)]; }));

        var costBy = {}; (s.costs || []).forEach(function (c) { costBy[c.src] = Number(c.amount) || 0; });
        var srcs = table(["들어온 경로", "방문", "점검 결과", "예약", "예약 전환", "광고비", "방문당 비용", "예약당 비용"], (s.by_src || []).map(function (r) {
          var c = costBy[r.src];
          return [SRC_NAME[r.src] || r.src, r.sessions, r.result, r.book, pct(r.book, r.sessions), c == null ? "—" : won(c), c == null ? "—" : won(c / r.sessions), c == null || !r.book ? "—" : won(c / r.book)];
        }));
        var devs = table(["기기", "방문", "예약"], (s.by_dev || []).map(function (r) { return [DEV_NAME[r.dev] || r.dev, r.sessions, r.book]; }));
        var maxH = Math.max.apply(null, (s.by_hour || []).map(function (h) { return h.sessions; }).concat([1]));
        var hours = table(["시간대", "방문"], (s.by_hour || []).map(function (h) { return [h.hour + "시", bar(h.sessions, maxH)]; }));
        var maxC = Math.max.apply(null, (s.check_n || []).map(function (c) { return c.c; }).concat([1]));
        var checks = table(["해당 개수", "사람 수"], (s.check_n || []).map(function (c) { return [c.n + "개", bar(c.c, maxC)]; }));

        /* 광고비 적기: 경로 이름은 위 표의 ‘들어온 경로’에 나온 영문 이름과 같게 */
        var cDay = el("input", { type: "date", value: to, "aria-label": "날짜" });
        var cSrc = el("input", { type: "text", maxlength: "30", placeholder: "예) naver · instagram", "aria-label": "경로" });
        var cAmt = el("input", { type: "number", min: "0", step: "1000", placeholder: "원", "aria-label": "금액" });
        var cErr = el("p", { class: "msg bad", hidden: true });
        var costBox = el("details", { class: "panel" }, [
          el("summary", { text: "광고비 적기 (방문당 · 예약당 비용을 보려면)" }),
          el("p", { class: "muted", text: "광고를 집행한 날짜 · 경로 · 금액을 적으면 위 표에서 방문당 비용과 예약당 비용이 계산됩니다. 경로는 광고 링크 끝에 붙인 이름과 같게 적습니다(예: 링크가 …/?from=naver 이면 naver)." }),
          el("div", { class: "wide" }, [el("label", { text: "날짜" }), cDay]),
          el("div", { class: "wide" }, [el("label", { text: "경로" }), cSrc]),
          el("div", { class: "wide" }, [el("label", { text: "금액(원)" }), cAmt]),
          cErr,
          el("button", {
            class: "btn btn-main", type: "button", text: "적기", onclick: function () {
              var sv = cSrc.value.trim().toLowerCase(), av = Number(cAmt.value);
              if (!cDay.value || !sv || !(av >= 0) || cAmt.value === "") { cErr.textContent = "날짜 · 경로 · 금액을 모두 적어 주세요."; cErr.hidden = false; return; }
              rest("POST", "ad_costs", { day: cDay.value, src: sv, amount: Math.round(av) }).then(go, function (e) { cErr.textContent = e.message; cErr.hidden = false; });
            }
          })
        ].concat(costs.map(function (c) {
          return el("div", { class: "wide" }, [el("label", { text: c.day + " · " + c.src + " · " + Number(c.amount).toLocaleString("ko-KR") + "원" }),
            el("div", {}, [el("button", { class: "link-btn", type: "button", text: "지우기", onclick: function () { rest("DELETE", "ad_costs?id=eq." + c.id).then(go, function (e) { tell(e.message); }); } })])]);
        })));

        var off = false; try { off = localStorage.getItem("rn_notrack") === "1"; } catch (e) { /* 넘어간다 */ }
        var mine = el("button", { class: "link-btn", type: "button", text: off ? "이 브라우저의 방문을 다시 세기" : "이 브라우저의 방문은 세지 않기",
          onclick: function () { try { off ? localStorage.removeItem("rn_notrack") : localStorage.setItem("rn_notrack", "1"); } catch (e) { /* 넘어간다 */ } go(); } });

        function sec(title, note, body) { return el("div", { class: "panel" }, [el("h2", { text: title }), note ? el("p", { class: "muted", text: note }) : null, body]); }
        return el("section", { style: "display:grid;gap:24px" }, [
          el("h1", { text: "통계" }), range,
          el("p", { class: "src", text: from + " ~ " + to + " · 이름 · 연락처 없이 횟수만 셉니다. 담당자로 로그인한 브라우저와 PC 확인용 주소는 세지 않습니다." }),
          cards,
          sec("단계별 전환", "방문한 사람이 어디까지 갔는지입니다. 숫자가 크게 줄어드는 단계가 손볼 곳입니다.", funnel),
          sec("날짜별", null, daily),
          sec("화면별", "어느 메뉴를 많이 보고 오래 머무는지입니다.", views),
          sec("들어온 경로별", "링크에 ?s=이름 을 붙여 보내면 경로가 나뉩니다(예: 인스타 소개 칸은 …/?s=ig#check, 강의 QR은 …/?s=lec-2701a#check, 명함은 …/?s=card). 예전의 ?from=이름 도 그대로 됩니다.", srcs),
          sec("캐릭터 1단계 기준", (t.result || 0) < 100 ? "결과를 본 방문이 100이 안 됩니다. 아직 판단하기 이릅니다(숫자가 작으면 비율이 크게 출렁입니다)." : "결과를 본 방문 " + (t.result || 0) + " 기준입니다.",
            table(["기준", "지금", "기준선", "넘었는지"], [
              ["끝까지 한 비율 (결과 ÷ 시작)", pct(t.result || 0, s.check_start || 0), "60%", crit(t.result || 0, s.check_start || 0, 0.6)],
              ["공유 (‘친구에게 테스트 보내기’ ÷ 결과)", pct(s.share || 0, t.result || 0), "10%", crit(s.share || 0, t.result || 0, 0.1)],
              ["신청 화면으로 간 비율 (‘이 결과로 상담 신청’ ÷ 결과)", pct(s.to_apply || 0, t.result || 0), "5%", crit(s.to_apply || 0, t.result || 0, 0.05)],
              ["캐릭터 이름을 기억한 비율 (강의 설문 · 전체 기간)", lecSurveys ? pct(lecNamed, lecSurveys) + " (" + lecNamed + " / " + lecSurveys + ")" : "강의 기록 없음", "50%", crit(lecNamed, lecSurveys, 0.5)],
              ["먼저 캐릭터 이야기를 꺼낸 일 (전체 기간)", mentions.length + "번", "5번", mentions.length >= 5 ? "넘음" : "아직"],
              ["공유 주소 · 결과 그림으로 들어온 방문 (?s=sh · ?s=img)", String(s.shared_in || 0), "—", "—"]
            ])),
          lecBox, menBox,
          sec("경로별 테스트 결과", "강의 QR에 ?s=lec-코드 를 붙이면 그 강의의 귀신 분포가 여기에 따로 나옵니다.", table(["들어온 경로", "나온 결과", "횟수"], (s.who_by_src || []).map(function (w) {
            return [SRC_NAME[w.src] || w.src, GHOST_NAME[w.who] || w.who, w.c];
          }))),
          sec("돈독귀신 테스트", "테스트를 시작한 방문 " + (s.check_start || 0) + " · 결과까지 본 방문 " + (t.result || 0) + " (" + pct(t.result || 0, s.check_start || 0) + ")", table(["나온 결과", "횟수"], (s.check_who || []).map(function (w) {
            var NAME = { dalkom: "달콤귀", jiltu: "질투귀", buran: "불안귀", tamyok: "탐욕귀", dondok: "돈독귀신(넷 다)", none: "돈깨비만(해당 없음)" };
            return [NAME[w.who] || w.who, w.c];
          }))),
          sec("테스트에서 고른 개수", null, checks),
          sec("스토리", null, table(["재생을 시작한 방문", "끝까지 본 방문", "끝까지 본 비율"], [[t.story || 0, t.story_end || 0, pct(t.story_end || 0, t.story || 0)]])),
          sec("기기별", null, devs),
          sec("시간대별 방문", null, hours),
          costBox, mine
        ]);
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
