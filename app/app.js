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
      el("h1", { text: "내 재무 · 사전 작성지" }),
      el("p", { class: "muted", text: "상담 고객 전용 화면입니다. 카카오로 로그인하면 내 자료만 볼 수 있습니다." }),
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
      el("p", { class: "src", text: "주민등록번호 · 계좌번호 · 건강 정보는 받지 않습니다. 적지 말아 주세요." }),
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
      el("p", { text: "사전 작성지는 상담 계약 뒤에 열립니다. 담당 자산관리사가 열어 드리면 이 화면에서 바로 쓸 수 있습니다." }),
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

  /* ---------- 화면: 담당자 ---------- */
  var STATUS = [["lead", "신청"], ["lecture", "강의 참석"], ["contracted", "계약 고객"], ["ended", "관리 종료"]];
  function viewAdvisor(me) {
    var tab = "list"; var holder = el("div");
    var tabs = el("div", { class: "tabs" });
    function drawTabs() {
      tabs.textContent = "";
      [["list", "고객 목록"], ["mine", "작성지 시험 (내 계정)"]].forEach(function (t) {
        tabs.appendChild(el("button", { type: "button", "aria-pressed": String(tab === t[0]), text: t[1], onclick: function () { tab = t[0]; drawTabs(); go(); } }));
      });
    }
    function go() {
      holder.textContent = ""; holder.appendChild(el("p", { class: "muted", text: "불러오는 중입니다." }));
      var p = tab === "mine" ? openOwnWorksheet(me, { advisor: true }) : list();
      p.then(function (n) { holder.textContent = ""; holder.appendChild(n); }, function (e) { holder.textContent = ""; holder.appendChild(el("p", { class: "msg bad", text: e.message })); });
    }
    function list() {
      return Promise.all([rest("GET", "profiles?select=*&order=created_at.desc"), rest("GET", "worksheets?select=id,client_id,steps_done,updated_at,submitted_at&order=updated_at.desc")]).then(function (res) {
        var byClient = {}; res[1].forEach(function (w) { if (!byClient[w.client_id]) byClient[w.client_id] = w; });
        var rows = res[0].map(function (p) {
          var w = byClient[p.id]; var n = w ? Object.keys(w.steps_done || {}).length : 0;
          var sel = el("select", { "aria-label": "상태", onchange: function (e) { rest("PATCH", "profiles?id=eq." + p.id, { status: e.target.value }).then(null, function (err) { alert(err.message); go(); }); } },
            STATUS.map(function (s) { return el("option", { value: s[0], text: s[1] }); }));
          sel.value = p.status;
          return el("tr", {}, [
            el("td", { text: (p.display_name || "(이름 없음)") + (p.role === "advisor" ? " · 담당자" : "") }),
            el("td", {}, [sel]),
            el("td", { text: w ? n + "/" + STEPS.length + (w.submitted_at ? " · 제출" : "") : "아직 없음" }),
            el("td", { text: w ? stamp(w.updated_at) : "—" }),
            el("td", {}, [w ? el("button", { class: "link-btn", type: "button", text: "작성지 보기", onclick: function () { openClient(p, w.id); } }) : null,
              p.role === "advisor" ? null : el("button", { class: "link-btn", type: "button", text: "자료 지우기", onclick: function () { remove(p); } })])
          ]);
        });
        return el("section", {}, [el("h1", { text: "고객 목록", style: "margin-bottom:16px" }), el("div", { class: "table-wrap" }, [el("table", { class: "clients" }, [
          el("thead", {}, [el("tr", {}, ["이름", "상태", "작성지", "마지막 저장", ""].map(function (h) { return el("th", { text: h }); }))]), el("tbody", {}, rows)])]),
          el("p", { class: "src", text: "‘계약 고객’으로 바꾸면 그 고객이 사전 작성지를 쓸 수 있습니다. 화면에 고객 이름이 보이니 다른 사람이 보는 곳에서는 열지 마세요." })]);
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
      if (!confirm((p.display_name || "이 고객") + "의 작성지 · 투자성향 · 동의 기록을 모두 지웁니다. 되돌릴 수 없습니다. 지울까요?")) return;
      rest("DELETE", "profiles?id=eq." + p.id).then(go, function (e) { alert(e.message); });
    }
    drawTabs(); go();
    show(tabs, holder);
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
      document.getElementById("who").textContent = (me.display_name || "") + (me.role === "advisor" ? " 담당자" : "");
      return rest("GET", "consents?client_id=eq." + me.id + "&kind=eq.collect&order=decided_at.desc&limit=1").then(function (c) {
        var enter = function () {
          if (me.role === "advisor") return viewAdvisor(me);
          if (me.status !== "contracted") return viewWaiting(me);
          return openOwnWorksheet(me).then(function (n) { show(n); });
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
