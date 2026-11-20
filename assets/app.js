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

  /* ---------- 머리의 로그인 · 닉네임 · 로그아웃 ----------
     로그인 전에는 ‘로그인’ 버튼, 로그인하면 카카오 닉네임과 ‘로그아웃’이 보인다.
     로그인 정보는 로그인 뒤 화면(app/)과 같은 자리(localStorage의 rn_session)에 둔다.
     route()보다 먼저 돌아야 한다(카카오에서 돌아온 주소의 #access_token 을 치우기 위해). */
  var ACCT_STORE = "rn_session";
  function acctSession() { try { return JSON.parse(localStorage.getItem(ACCT_STORE)); } catch (e) { return null; } }
  function acctNick(sess) {
    try {
      var b = sess.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      var c = JSON.parse(decodeURIComponent(escape(atob(b)))), m = c.user_metadata || {};
      return m.name || m.full_name || m.nickname || m.user_name || m.preferred_username || "내 상담";
    } catch (e) { return null; }
  }
  var acctJustIn = false;   // 방금 카카오 로그인에서 돌아왔는지
  (function () {
    if (location.hash.indexOf("access_token=") === -1 && location.hash.indexOf("error=") === -1) return;
    var p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    if (p.get("access_token")) {
      try { localStorage.setItem(ACCT_STORE, JSON.stringify({ access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_at: Number(p.get("expires_at")) })); acctJustIn = true; sessionStorage.removeItem("rn_role"); } catch (e) { /* 저장 못 하면 로그인 전 상태로 보인다 */ }
    }
  })();
  /* 이 계정이 담당자인지(본인 프로필의 역할만 읽는다 · 한 번 읽으면 창을 닫을 때까지 기억) */
  function acctRole(sess) {
    try { var c = sessionStorage.getItem("rn_role"); if (c) return Promise.resolve(c); } catch (e) { /* 기억 못 해도 다시 읽으면 된다 */ }
    var id;
    try { id = JSON.parse(decodeURIComponent(escape(atob(sess.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))).sub; } catch (e) { return Promise.resolve(""); }
    return fetch(CONFIG.supabaseUrl + "/rest/v1/profiles?select=role&id=eq." + id, { headers: { apikey: CONFIG.supabaseKey, Authorization: "Bearer " + sess.access_token } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var role = (rows[0] && rows[0].role) || "";
        try { if (role) sessionStorage.setItem("rn_role", role); } catch (e) { /* 넘어간다 */ }
        return role;
      }, function () { return ""; });
  }
  function drawAcct() {
    var box = $("acct");
    if (!box || !CONFIG.supabaseUrl) return;
    box.textContent = "";
    var sess = acctSession(), nick = sess && sess.access_token ? acctNick(sess) : null;
    if (!nick) {
      var inBtn = el("button", "acct-btn", "로그인"); inBtn.type = "button";
      inBtn.addEventListener("click", function () {
        if (window.RN_TRACK) window.RN_TRACK("login_click");
        location.href = CONFIG.supabaseUrl + "/auth/v1/authorize?provider=kakao&redirect_to=" + encodeURIComponent(location.origin + location.pathname);
      });
      box.appendChild(inBtn);
      return;
    }
    var me = el("a", "acct-name", nick + " 님"); me.href = "app/index.html"; me.title = "내 상담 화면으로 가기";
    // 담당자 계정이면: 방금 로그인했을 때는 관리자 화면으로 바로 보내고, 평소에는 ‘관리자 화면’ 단추를 보여 준다.
    acctRole(sess).then(function (role) {
      if (role !== "advisor") return;
      if (acctJustIn) { location.replace("app/index.html"); return; }
      me.textContent = "관리자 화면"; me.title = nick + " 님 · 관리자 화면으로 가기"; me.classList.add("acct-admin");
    });
    var out = el("button", "acct-out", "로그아웃"); out.type = "button";
    out.addEventListener("click", function () {
      try { localStorage.removeItem(ACCT_STORE); sessionStorage.removeItem("rn_role"); } catch (e) { /* 그래도 화면은 바꾼다 */ }
      fetch(CONFIG.supabaseUrl + "/auth/v1/logout", { method: "POST", headers: { apikey: CONFIG.supabaseKey, Authorization: "Bearer " + sess.access_token } }).then(null, function () {});
      drawAcct();
    });
    box.appendChild(me); box.appendChild(out);
  }
  drawAcct();

  /* ---------- 메뉴: 누른 메뉴의 화면만 보여 준다 ----------
     주소 뒤의 #이름으로 화면을 고른다(뒤로 가기가 되고, 그 화면의 주소를 그대로 보낼 수 있다).
     자바스크립트가 꺼져 있으면 모든 구역이 한 페이지로 이어져 보인다. */
  var VIEW_OF = { home: "home", quick: "home", check: "check", how: "how", why: "how", cases: "cases", faq: "faq", apply: "apply", privacy: "privacy" };
  var TITLES = { home: "재무설계 상담", check: "1분 자가 점검", how: "진행 방식", cases: "상담 사례", faq: "자주 묻는 질문", apply: "상담 신청", privacy: "개인정보 처리방침" };
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
    // 다른 화면으로 넘어가면 항상 맨 위에서 시작한다(부드럽게 이동하지 않고 바로).
    if (target && !first) target.scrollIntoView({ behavior: "auto", block: "start" }); else toTop();
    var cur = document.querySelector('.nav [aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function toTop() {
    var jump = function () { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); };
    jump(); requestAnimationFrame(jump); setTimeout(jump, 80);   // 브라우저가 뒤늦게 옮기는 경우까지 덮는다
  }
  window.addEventListener("hashchange", function () { route(false); });
  // 메뉴 · 버튼(#이름 링크)을 누르면 브라우저가 스스로 화면을 옮기지 않게 하고 직접 화면을 바꾼다.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a || a.hasAttribute("data-intro-replay")) return;
    var id = a.getAttribute("href").slice(1) || "home";
    if (!VIEW_OF[id]) return;
    e.preventDefault();
    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    route(false);
  });
  route(true);

  /* ---------- 길잡이 돈깨비의 말풍선 ---------- */
  function guide(text) {
    var box = el("div", "guide"), face = el("span", "guide-face"), say = el("div", "guide-say");
    face.setAttribute("aria-hidden", "true");
    say.appendChild(el("b", null, "돈깨비")); say.appendChild(el("p", null, text));
    box.appendChild(face); box.appendChild(say);
    return box;
  }

  /* ---------- 1분 자가 점검 = ‘내 안의 돈독귀신 테스트’ ----------
     설계: docs/캐릭터_사업/테스트_설계.md. 열두 문항은 네 귀신에 세 개씩 붙어 있다(문항의 data-g).
     어느 귀신의 문항을 많이 눌렀는지로 결과를 낸다. 넷 모두 2개 이상이면 돈독귀신, 하나도 없으면 돈깨비만.
     귀신은 겁주는 존재가 아니라 누구에게나 있는 것이고, 자리를 정해 주면 얌전해진다는 것이 결론이다.
     수익 약속 · 지어낸 숫자 · 손실 협박은 넣지 않는다. */
  /* 주소 꼬리표(?s=ig · lec-코드 · sh …)를 이 방문 동안 기억한다. 상담 신청의 ‘만난 경로’에 같이 붙인다. */
  var TAG = "", REF = "";
  try {
    var q0 = new URLSearchParams(location.search);
    var s0 = (q0.get("s") || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20);
    if (s0) sessionStorage.setItem("rn_tag", s0);
    TAG = sessionStorage.getItem("rn_tag") || "";
    var r0 = (q0.get("r") || "").toUpperCase();
    if (/^[A-Z2-9]{5}$/.test(r0)) sessionStorage.setItem("rn_ref", r0);     // 소개한 고객의 코드(무작위 다섯 글자 · 이름과 상관없음)
    REF = sessionStorage.getItem("rn_ref") || "";
    var g0 = q0.get("g");
    if (g0 && /^(dalkom|jiltu|buran|tamyok|dondok)$/.test(g0)) {
      var GN = { dalkom: "달콤귀", jiltu: "질투귀", buran: "불안귀", tamyok: "탐욕귀", dondok: "돈독귀신" };
      var from = el("p", "check-from", "테스트를 보내 준 분은 " + GN[g0] + "가 나왔습니다. 나는 어떤 귀신일까요?");
      $("checkForm").parentNode.insertBefore(from, $("checkForm"));
    }
    var chSel = $("f-ch"), CH = /^(ig|th)$/.test(TAG) ? "인스타그램 · 스레드" : /^(yt|blog)$/.test(TAG) ? "유튜브 · 블로그" : /^lec/.test(TAG) ? "법인 강의" : /^(sh|img)$/.test(TAG) || REF ? "소개" : "";
    if (CH && chSel && !chSel.value) chSel.value = CH;
  } catch (e) { /* 저장 칸을 못 써도 넘어간다 */ }
  var checkForm = $("checkForm");
  /* 문항 모음: 귀신마다 다섯 개(모두 스무 개). 화면에는 귀신마다 세 개씩 열두 개만 낸다.
     맨 앞의 것이 ‘자리’ 문항(그 귀신의 자리가 비어 있는가)이라 늘 나오고, 나머지 넷 가운데 둘을 그때그때 고른다.
     열두 개를 넘기지 않는 까닭: 문항이 늘수록 끝까지 가는 사람이 준다(docs/HISTORY.md 2026-11-19 조사 기록).
     적는 꼴: [상담 신청에 넘길 짧은 이름, 화면에 보이는 문항] */
  var POOL = {
    dalkom: [
      ["돈 흐름 모름", "월급이 들어오면 어디로 얼마가 나가는지 바로 말하기 어렵다"],
      ["보상 결제", "힘든 날에는 ‘오늘 고생했으니까’ 하며 계획에 없던 결제를 한다"],
      ["작은 결제 합 모름", "구독 · 할부 · 작은 결제가 한 달에 모두 얼마인지 합쳐 본 적이 없다"],
      ["할인에 구매", "할인 · 무료 배송 · ‘오늘만’이라는 말에 필요 없던 것을 산 적이 있다"],
      ["명세서 보고 놀람", "카드 명세서를 보고 ‘이걸 언제 썼지’ 싶었던 적이 있다"]],
    jiltu: [
      ["돈의 목적 없음", "모으고는 있는데, 무엇을 위한 돈인지 정해져 있지 않다"],
      ["남 따라 가입", "남이 좋다고 해서 가입하거나 산 금융상품이 있다"],
      ["수익 인증에 흔들림", "SNS · 유튜브의 수익 인증을 보고 마음이 흔들린 적이 있다"],
      ["주변 씀씀이에 맞춤", "친구 · 동료가 차 · 집 · 여행에 쓰는 것을 보면 나도 맞춰야 할 것 같다"],
      ["또래와 견줘 조급", "또래보다 모은 돈이 적은 것 같아 조급해진 적이 있다"]],
    buran: [
      ["비상금 없음", "비상금이 따로 없거나, 있어도 다른 돈과 섞여 있다"],
      ["석 달 넘게 미룸", "정리해야지 하면서 미룬 지 석 달이 넘었다"],
      ["보장 내용 모름", "걱정돼서 가입은 했는데, 내 보험이 무엇을 보장하는지 설명하기 어렵다"],
      ["잔액 보기 겁남", "통장 · 카드 앱을 열어 보기가 겁나서 미룬 적이 있다"],
      ["필요한 돈 계산 안 함", "노후나 큰일이 걱정은 되는데, 얼마가 필요한지 계산해 본 적은 없다"]],
    tamyok: [
      ["쓸 때 안 정한 투자", "주식 · 코인에 넣은 돈을, 언제 쓸 돈인지 정하지 않고 넣었다"],
      ["되찾으려 더 넣음", "잃은 돈을 한 번에 되찾으려고 더 넣은 적이 있다"],
      ["한 번에 크게", "천천히 모으는 것은 답답하고, 크게 불릴 방법이 따로 있을 것 같다"],
      ["감당 넘는 금액", "‘이번만 잘되면’ 하는 마음으로 감당하기 어려운 금액을 넣은 적이 있다"],
      ["알아보기 전에 넣음", "오를 것 같다는 말에, 내용을 알아보기 전에 먼저 넣은 적이 있다"]]
  };
  function shuffled(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /* 열두 문항을 새로 뽑아 화면에 놓는다. 세 바퀴를 돌며 귀신마다 하나씩 놓고, ‘자리’ 문항은 마지막 바퀴에 둔다. */
  function buildCheck() {
    var keys = ["dalkom", "jiltu", "buran", "tamyok"], pick = {}, n = 0;
    keys.forEach(function (g) { var two = shuffled(POOL[g].slice(1)).slice(0, 2); pick[g] = [two[0], two[1], POOL[g][0]]; });
    checkForm.textContent = "";
    for (var round = 0; round < 3; round++) {
      shuffled(keys).forEach(function (g) {
        var q = pick[g][round], label = el("label", "check"), input = document.createElement("input");
        input.type = "checkbox"; input.value = q[0]; input.setAttribute("data-g", g);
        if (round === 2) input.setAttribute("data-seat", "1");
        n++;
        var tick = el("span", "tick"); tick.setAttribute("aria-hidden", "true");
        label.appendChild(input);
        label.appendChild(el("span", "num", (n < 10 ? "0" : "") + n));
        label.appendChild(el("span", "check-t", q[1]));
        label.appendChild(tick);
        checkForm.appendChild(label);
      });
    }
  }
  buildCheck();
  var checked = [];
  var CHECK_TOTAL = checkForm.querySelectorAll("input").length;
  var GHOSTS = {
    dalkom: { name: "달콤귀", nick: "오늘을 즐길 줄 아는 사람", color: "#D9488F", img: "assets/ghost_dalkom.webp",
      say: "오늘 고생했잖아. 이 정도는 괜찮아, 응?",
      tame: "즐기는 돈에 ‘한 달에 여기까지’ 금을 긋자. 그 안에서는 마음껏 쓰는 거야!",
      seat: "자리를 찾으면 달콤귀는 기쁨 담당이 돼. 정해 둔 만큼은 마음 편히 즐기게 해 줘." },
    jiltu: { name: "질투귀", nick: "지고는 못 사는 사람", color: "#3567D6", img: "assets/ghost_jiltu.webp",
      say: "쟤는 벌써 저만큼 갔대. 너만 그대로래.",
      tame: "남 말고 네 목표를 적어 보자. 무엇을 위해, 언제까지. 그럼 저 녀석도 견줄 데가 생겨.",
      seat: "자리를 찾으면 질투귀는 기록 담당이 돼. 남의 소식 대신 ‘지난달보다 얼마나 왔는지’를 물어 와." },
    buran: { name: "불안귀", nick: "돌다리도 두들겨 보는 사람", color: "#2A9A5C", img: "assets/ghost_buran.webp",
      say: "근데… 잘못되면 어쩌지? 조금만 더 알아보고 하자…",
      tame: "만일을 위한 돈부터 따로 떼어 두자. 기댈 데가 있으면 저 녀석도 덜 떨어.",
      seat: "자리를 찾으면 불안귀는 경보 담당이 돼. 아무 때나 울지 않고 정말 살펴볼 일이 있을 때만 알려 줘." },
    tamyok: { name: "탐욕귀", nick: "크게 그리는 사람", color: "#CF3434", img: "assets/ghost_tamyok.webp",
      say: "조금씩 해서 언제 모아? 한 번에 가자!",
      tame: "불리는 돈에는 ‘언제 쓸 돈인지’와 ‘여기까지만’을 먼저 적자. 급한 성미는 그 안에서만 부리는 거야.",
      seat: "자리를 찾으면 탐욕귀는 성장 담당이 돼. 급한 성미가 오래 버티는 끈기로 바뀌어." },
    dondok: { name: "돈독귀신", nick: "넷이 다 모인 사람", color: "#7B3FBF", img: "assets/dondok.webp",
      say: "어머, 넷이 다 와 있네. 편하게 있어. 지금 그대로.",
      tame: "넷을 한꺼번에 상대하면 져. 어디가 새는지부터 보고, 하나씩 자리를 정하자구!",
      seat: "자리를 찾으면 돈독귀신은 사라지지 않고 흩어져. 네 귀신이 각자 자리로 가는 거야." }
  };
  var G_ORDER = ["dalkom", "jiltu", "buran", "tamyok"];
  var LEVEL = ["조용함", "속삭이는 중", "제법 시끄러움", "날뛰는 중"];
  var duelShown = false, lastKey = null, lastClicked = null, checkStarted = false;

  /* 지금 누른 것으로 결과를 정한다 */
  function ghostResult() {
    var count = { dalkom: 0, jiltu: 0, buran: 0, tamyok: 0 }, seat = {};
    Array.prototype.forEach.call(checkForm.querySelectorAll("input:checked"), function (i) {
      var g = i.getAttribute("data-g"); count[g]++; if (i.getAttribute("data-seat")) seat[g] = true;
    });
    var total = G_ORDER.reduce(function (a, g) { return a + count[g]; }, 0);
    var key;
    if (total === 0) key = "none";
    else if (G_ORDER.every(function (g) { return count[g] >= 2; })) key = "dondok";
    else {
      var max = Math.max.apply(null, G_ORDER.map(function (g) { return count[g]; }));
      var top = G_ORDER.filter(function (g) { return count[g] === max; });
      if (top.length > 1) { var s2 = top.filter(function (g) { return seat[g]; }); if (s2.length) top = s2; }
      key = top.length > 1 && lastClicked && top.indexOf(lastClicked) !== -1 ? lastClicked : top[0];
    }
    return { key: key, count: count, total: total,
      also: G_ORDER.filter(function (g) { return g !== key && key !== "dondok" && count[g] >= 2; }) };
  }
  function bubble(cls, faceCls, faceImg, who, lines) {
    var row = el("div", "say " + cls), face = el("span", faceCls), b = el("div", "say-b");
    face.setAttribute("aria-hidden", "true");
    if (faceImg) face.style.backgroundImage = 'url("' + faceImg + '")';
    b.appendChild(el("b", null, who));
    lines.forEach(function (t, i) { b.appendChild(el("p", i ? "say-sub" : null, t)); });
    row.appendChild(face); row.appendChild(b);
    return row;
  }
  function drawDuel(force) {
    var box = $("checkResult");
    if (!duelShown) { box.hidden = true; return; }
    var r = ghostResult();
    box.hidden = false;
    box.textContent = "";
    box.className = "ghost-result" + (force || r.key !== lastKey ? " pop" : "");
    if (r.key === "none") {
      box.style.setProperty("--g", "#8A6A1F");
      box.appendChild(bubble("say-good", "guide-face", null, "돈깨비", ["어이쿠, 귀신들이 다 제자리에 앉아 있네! 자리가 흐트러지지 않았는지만 가끔 같이 보자."]));
    } else {
      var g = GHOSTS[r.key];
      box.style.setProperty("--g", g.color);
      var head = el("div", "gr-head"), pic = el("span", "gr-pic");
      pic.setAttribute("aria-hidden", "true"); pic.style.backgroundImage = 'url("' + g.img + '")';
      var txt = el("div", "gr-txt");
      txt.appendChild(el("p", "gr-over", "내 안의 돈독귀신, 지금은"));
      txt.appendChild(el("p", "gr-name", r.key === "dondok" ? "넷이 합쳐진 돈독귀신" : g.name));
      txt.appendChild(el("p", "gr-nick", "“" + g.nick + "”"));
      head.appendChild(pic); head.appendChild(txt);
      box.appendChild(head);
      box.appendChild(bubble("say-bad", "say-face", g.img, g.name, [g.say]));
      var bars = el("div", "gr-bars");
      G_ORDER.forEach(function (k) {
        var row = el("div", "gr-bar");
        row.style.setProperty("--c", GHOSTS[k].color);
        row.appendChild(el("span", "gr-bar-n", GHOSTS[k].name));
        var dots = el("span", "gr-dots"); dots.setAttribute("aria-hidden", "true");
        for (var d = 1; d <= 3; d++) dots.appendChild(el("i", d <= r.count[k] ? "on" : null));
        row.appendChild(dots);
        row.appendChild(el("span", "gr-bar-l", LEVEL[r.count[k]]));
        bars.appendChild(row);
      });
      box.appendChild(bars);
      if (r.also.length) box.appendChild(el("p", "gr-also", "옆에 " + r.also.map(function (k) { return GHOSTS[k].name; }).join(" · ") + "도 와 있습니다."));
      box.appendChild(bubble("say-good", "guide-face", null, "돈깨비", [g.tame, g.seat]));
    }
    box.appendChild(el("p", "gr-note", "자리를 정하는 일은 혼자 하면 미루기 쉽습니다. 순서부터 같이 잡아 봐요."));
    var acts = el("div", "gr-acts");
    var go = el("a", "btn btn-main btn-lg", "이 결과로 상담 신청"); go.href = "#apply";
    go.addEventListener("click", function () { if (window.RN_TRACK) window.RN_TRACK("to_apply", { view: r.key }); });
    var again = el("button", "link", "다시 하기"); again.type = "button";
    again.addEventListener("click", function () {
      buildCheck();                                   // 다시 할 때는 문항을 새로 뽑는다
      duelShown = false; lastKey = null; lastClicked = null; updateCheck();
      checkForm.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    /* 친구에게 테스트 보내기: 주소에 꼬리표(s=sh)와 내 결과(g=)를 붙인다. 이름 · 연락처는 주소에 넣지 않는다. */
    var share = el("button", "btn btn-line", "친구에게 테스트 보내기"); share.type = "button";
    var shared = el("p", "gr-shared"); shared.hidden = true; shared.setAttribute("aria-live", "polite");
    share.addEventListener("click", function () {
      var url = location.origin + location.pathname + "?s=sh&g=" + r.key + "#check";
      var text = r.key === "none" ? "내 안의 돈독귀신 테스트, 너는 어떤 귀신이 나와?"
        : "내 안의 돈독귀신 테스트 해 봤는데 나는 " + GHOSTS[r.key].name + "래. 너는 어떤 귀신이야?";
      if (window.RN_TRACK) window.RN_TRACK("share", { view: r.key });
      function copied() { shared.textContent = "주소를 복사했습니다. 카카오톡이나 문자에 붙여 넣어 보내세요."; shared.hidden = false; }
      function manual() { shared.textContent = "이 주소를 길게 눌러 복사해 보내세요: " + url; shared.hidden = false; }
      var kakao = window.RN_KAKAO_SHARE ? window.RN_KAKAO_SHARE({ title: "내 안의 돈독귀신 테스트", text: text, url: url,
        image: new URL("assets/icons/icon_512.png", location.href).href }) : Promise.resolve(false);
      kakao.then(function (ok) {            // 카카오톡 공유 창이 안 되면 휴대폰 공유 창, 그것도 없으면 주소 복사
        if (ok) return;
        if (navigator.share) { navigator.share({ title: "내 안의 돈독귀신 테스트", text: text, url: url }).then(null, function () {}); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + " " + url).then(copied, manual); else manual();
      });
    });
    acts.appendChild(go); acts.appendChild(share); acts.appendChild(shared); acts.appendChild(again);
    box.appendChild(acts);
    lastKey = r.key;
  }
  /* 상담 신청에 함께 넘길 글(결과와 고른 항목의 짧은 이름) */
  function checkSummary() {
    if (!checked.length) return null;
    var r = ghostResult();
    var head = "돈독귀신 테스트: " + (r.key === "dondok" ? "돈독귀신" : GHOSTS[r.key].name)
      + " (" + G_ORDER.map(function (k) { return GHOSTS[k].name.slice(0, 2) + " " + r.count[k]; }).join(" · ") + ")";
    return head + " / 고른 것: " + checked.join(" / ");
  }
  function updateCheck() {
    checked = Array.prototype.filter.call(
      checkForm.querySelectorAll("input"), function (i) { return i.checked; }
    ).map(function (i) { return i.value; });
    var n = checked.length;
    $("checkCount").textContent = "열두 가지 중 " + n + "가지 해당";
    drawDuel(false);

    var note = $("fromCheck");
    note.hidden = n === 0;
    note.textContent = n === 0 ? "" : checkSummary();
  }
  checkForm.addEventListener("change", function (e) {
    if (e.target && e.target.checked) lastClicked = e.target.getAttribute("data-g");
    if (!checkStarted) { checkStarted = true; if (window.RN_TRACK) window.RN_TRACK("check_start"); }
    updateCheck();
  });
  checkForm.addEventListener("submit", function (e) { e.preventDefault(); });
  $("checkShow").addEventListener("click", function () {
    duelShown = true;
    drawDuel(true);
    var r = ghostResult();
    if (window.RN_TRACK) window.RN_TRACK("check_result", { n: checked.length, view: r.key,
      sc: G_ORDER.map(function (k) { return r.count[k]; }).join("") });   // sc = 달콤 · 질투 · 불안 · 탐욕 점수(각 0~3). 고른 문항은 보내지 않는다
    $("checkResult").scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
      card.appendChild(q);
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
      list.appendChild(guide("아직 실은 사례가 없습니다. 곧 올리겠습니다."));
      return;
    }
    $("caseCount").textContent = "사례 " + shown.length + "건";
    if (!shown.length) {
      list.appendChild(guide("고른 조건에 맞는 사례가 아직 없습니다. 조건을 하나 풀어 보세요."));
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

  /* ---------- 상담 예약: 달력에서 날짜를 고르고 10분 단위로 시작 시간을 고른다 ----------
     여는 요일 · 시간대는 담당자가 정해 두고(기본으로 열림), 이미 찬 구간과 막은 구간만 빠진다.
     달력은 open_days 함수로 규칙과 찬 구간만 읽는다(누구의 예약인지는 오지 않는다).
     신청은 book_consult 함수로만 들어가고, 겹치는 시간은 데이터베이스가 거절한다. */
  var form = $("applyForm");
  var done = $("applyDone");
  var SB = CONFIG.supabaseUrl, SBK = CONFIG.supabaseKey;
  var CONSENT_VERSION = "2026-11-20";   // 2026-11-20: 만난 경로에 주소의 경로 표시가 같이 붙는다는 말을 넣음
  var cal = $("cal");
  var rule = null, busy = [], freeByDay = {}, dayKeys = [], month = null, pickedDay = null, pickedHour = null, pickedAt = null;

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
  function toMin(hm) { return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)); }
  function kstHour(d) { return Math.floor(((d.getTime() + 9 * 3600000) % 86400000) / 3600000); }
  function hourLabel(h) { return h === 12 ? "낮 12시" : (h < 12 ? "오전 " : "오후 ") + (h % 12) + "시"; }
  /* 날짜마다 고를 수 있는 시작 시간(10분 단위)을 계산한다 */
  function compute() {
    freeByDay = {}; dayKeys = [];
    if (!rule || !rule.enabled) return;
    var base = new Date(fmtKey.format(new Date()) + "T00:00:00+09:00").getTime();
    var first = toMin(rule.first), last = toMin(rule.last), len = rule.minutes * 60000;
    for (var i = 1; i <= rule.days_ahead; i++) {
      var dayStart = base + i * 86400000, key = fmtKey.format(new Date(dayStart));
      if (rule.weekdays.indexOf(new Date(key + "T00:00:00Z").getUTCDay()) === -1) continue;
      var list = [];
      for (var m = first; m <= last; m += 10) {
        var s = dayStart + m * 60000, e = s + len, clash = false;
        for (var b = 0; b < busy.length; b++) { if (s < busy[b][1] && e > busy[b][0]) { clash = true; break; } }
        if (!clash) list.push(new Date(s));
      }
      if (list.length) { freeByDay[key] = list; dayKeys.push(key); }
    }
  }
  function loadSlots() {
    cal.textContent = ""; cal.appendChild(el("p", "src", "열린 시간을 불러오는 중입니다."));
    return sb("rpc/open_days", { method: "POST", body: "{}" }).then(function (res) {
      rule = res && res.rule; busy = ((res && res.busy) || []).map(function (b) { return [new Date(b[0]).getTime(), new Date(b[1]).getTime()]; });
      compute();
      if (pickedDay && !freeByDay[pickedDay]) { pickedDay = null; pickedHour = null; }
      if (pickedAt && !(freeByDay[pickedDay] || []).some(function (d) { return d.getTime() === pickedAt.getTime(); })) pickedAt = null;
      if (!month || !dayKeys.some(function (k) { return k.slice(0, 7) === month; })) month = dayKeys.length ? dayKeys[0].slice(0, 7) : fmtKey.format(new Date()).slice(0, 7);
      drawCal();
    }, function () {
      rule = null; busy = []; compute(); month = month || fmtKey.format(new Date()).slice(0, 7);
      drawCal("열린 시간을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.");
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
        if (freeByDay[key]) {
          b.classList.add("open");
          b.setAttribute("aria-label", m + "월 " + d + "일 · 예약할 수 있음");
          if (key === pickedDay) b.setAttribute("aria-pressed", "true");
          b.addEventListener("click", function () { pickedDay = key; pickedHour = null; pickedAt = null; drawCal(); });
        } else { b.disabled = true; }
        grid.appendChild(b);
      })(d);
    }
    cal.appendChild(grid);
    if (!note) cal.appendChild(el("p", dayKeys.length ? "cal-legend" : "cal-note", dayKeys.length
      ? "골드 점이 있는 날에 예약할 수 있습니다. 날짜를 누르면 시간이 나옵니다."
      : "지금은 예약할 수 있는 시간이 없습니다."));
    if (pickedDay && freeByDay[pickedDay]) {
      var free = freeByDay[pickedDay];
      var box = el("div", "cal-times");
      box.appendChild(el("p", "cal-day", fmtDay.format(free[0])));
      box.appendChild(el("p", "sub", "몇 시쯤이 좋으세요?"));
      var hours = [], seen = {};
      free.forEach(function (t) { var h = kstHour(t); if (!seen[h]) { seen[h] = true; hours.push(h); } });
      var hl = el("div", "cal-slots");
      hours.forEach(function (h) {
        var t = el("button", "cal-t", hourLabel(h)); t.type = "button";
        if (pickedHour === h) t.setAttribute("aria-pressed", "true");
        t.addEventListener("click", function () { pickedHour = h; pickedAt = null; drawCal(); });
        hl.appendChild(t);
      });
      box.appendChild(hl);
      if (pickedHour !== null) {
        box.appendChild(el("p", "sub", "시작 시간 (10분 단위)"));
        var ml = el("div", "cal-slots");
        free.filter(function (t) { return kstHour(t) === pickedHour; }).forEach(function (at) {
          var t = el("button", "cal-t cal-m", fmtTime.format(at)); t.type = "button";
          if (pickedAt && pickedAt.getTime() === at.getTime()) t.setAttribute("aria-pressed", "true");
          t.addEventListener("click", function () { pickedAt = at; drawCal(); $("e-when").hidden = true; if (window.RN_TRACK) window.RN_TRACK("time_pick"); });
          ml.appendChild(t);
        });
        box.appendChild(ml);
      }
      cal.appendChild(box);
    }
    if (pickedAt) cal.appendChild(el("p", "cal-picked", "고른 시간: " + fmtDay.format(pickedAt) + " " + fmtTime.format(pickedAt) + " (약 " + rule.minutes + "분)"));
  }

  function setErr(inputId, errId, bad) {
    $(errId).hidden = !bad;
    if (inputId) $(inputId).setAttribute("aria-invalid", bad ? "true" : "false");
    return bad;
  }
  var MESSAGES = {
    NAME: "이름을 확인해 주세요.", PHONE: "휴대폰 번호를 확인해 주세요.", CONSENT: "동의가 필요합니다.", WHEN: "날짜와 시간을 골라 주세요.",
    TAKEN: "방금 그 시간이 찼습니다. 다른 시간을 골라 주세요.",
    LIMIT_PHONE: "같은 번호로는 하루에 다섯 번까지 신청할 수 있습니다.", LIMIT_ALL: "신청이 몰리고 있습니다. 잠시 뒤 다시 시도해 주세요."
  };
  var sending = false;
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var name = $("f-name").value.trim();
    var tel = $("f-tel").value.trim();
    var digits = tel.replace(/\D/g, "");
    var bad = [
      setErr(null, "e-when", !pickedAt) && "cal",
      setErr("f-name", "e-name", !name) && "f-name",
      setErr("f-tel", "e-tel", !/^01\d{8,9}$/.test(digits)) && "f-tel",
      setErr("f-agree", "e-agree", !$("f-agree").checked) && "f-agree"
    ].filter(Boolean);
    $("e-send").hidden = true;
    if (bad.length) { var t = $(bad[0]); if (t.focus) t.focus(); t.scrollIntoView({ block: "center" }); return; }

    var topics = Array.prototype.map.call(form.querySelectorAll('input[name="topic"]:checked'), function (i) { return i.value; });
    var btn = form.querySelector('button[type="submit"]');
    sending = true; btn.disabled = true; btn.textContent = "보내는 중…";
    var at = pickedAt;
    var payload = {
      p_start: at.toISOString(), p_name: name, p_phone: digits, p_topics: topics, p_channel: (($("f-ch").value || "") + (TAG ? " [" + TAG + "]" : "") + (REF ? " [r:" + REF + "]" : "")).trim().slice(0, 40) || null,
      p_check: checkSummary(),
      p_place: $("f-place").value.trim() || null, p_memo: $("f-memo").value.trim() || null, p_consent: CONSENT_VERSION
    };
    var when = fmtDay.format(at) + " " + fmtTime.format(at);
    function send(replace) {
      payload.p_replace = !!replace;
      return sb("rpc/book_consult", { method: "POST", body: JSON.stringify(payload) }).then(function (res) {
        var from = res && res.moved_from ? new Date(res.moved_from) : null;
        $("doneTitle").textContent = from ? "예약 시간을 바꿨습니다" : "예약이 접수됐습니다";
        $("doneText").textContent = (from ? "앞의 예약(" + fmtDay.format(from) + " " + fmtTime.format(from) + ")은 취소했습니다. " : "")
          + when + "에 잡아 두었습니다. 장소는 남겨 주신 번호로 연락드려 함께 정합니다.";
        form.hidden = true; done.hidden = false; done.focus();
        form.reset(); pickedAt = null; pickedHour = null; pickedDay = null;
        if (window.RN_TRACK) window.RN_TRACK("book");
      }, function (err) {
        var box = $("e-send");
        if (/^HAVE:/.test(err.code || "")) {
          // 같은 이름 · 연락처로 잡힌 예약이 있다 → 바꿀지 묻는다
          var old = new Date(err.code.slice(5));
          return ask("이미 " + fmtDay.format(old) + " " + fmtTime.format(old) + " 예약이 있습니다.\n" + when + "(으)로 바꿀까요?\n바꾸면 앞의 예약은 취소됩니다.", "바꾸기").then(function (ok) {
            if (ok) return send(true);
            box.textContent = "예약을 바꾸지 않았습니다. 앞의 예약(" + fmtDay.format(old) + " " + fmtTime.format(old) + ")은 그대로입니다."; box.hidden = false;
          });
        }
        box.textContent = MESSAGES[err.code] || "보내지 못했습니다. 잠시 뒤 다시 시도해 주세요."; box.hidden = false;
        if (err.code === "TAKEN") { pickedAt = null; loadSlots(); }
      });
    }
    send(false).then(function () { sending = false; btn.disabled = false; btn.textContent = "상담 신청하기"; });
  });

  /* 예약 취소: 예약할 때 쓴 이름과 연락처가 모두 맞아야 한다 */
  $("c-go").addEventListener("click", function () {
    var msg = $("c-msg"), n = $("c-name").value.trim(), t = $("c-tel").value.replace(/\D/g, "");
    function say(text, ok) { msg.textContent = text; msg.className = ok ? "cal-picked" : "err"; msg.hidden = false; }
    if (!n || !/^01\d{8,9}$/.test(t)) return say("예약할 때 쓴 이름과 휴대폰 번호를 적어 주세요.");
    ask("예약을 취소할까요?", "예약 취소").then(function (ok) {
    if (!ok) return;
    sb("rpc/cancel_my_booking", { method: "POST", body: JSON.stringify({ p_name: n, p_phone: t }) }).then(function (res) {
      var d = new Date(res.starts_at);
      say(fmtDay.format(d) + " " + fmtTime.format(d) + " 예약을 취소했습니다.", true);
      $("c-name").value = ""; $("c-tel").value = ""; loadSlots();
    }, function (err) {
      say(err.code === "NOT_FOUND" ? "그 이름과 연락처로 된 예약을 찾지 못했습니다. 예약할 때 적은 그대로 적어 주세요." : "취소하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    });
    });
  });

  $("doneBack").addEventListener("click", function () {
    done.hidden = true; form.hidden = false; loadSlots();
  });
  if (SB && SBK) loadSlots(); else { month = fmtKey.format(new Date()).slice(0, 7); drawCal("예약 설정이 빠져 있습니다."); }
})();
