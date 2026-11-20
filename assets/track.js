/* 방문 통계(관리자 화면의 ‘통계’ 탭에서 본다).
   - 이름 · 연락처 · IP 는 보내지 않는다. 방문자는 이 브라우저가 만든 임의의 값으로만 구분한다.
   - 보내는 것: 방문 · 화면 이동 · 화면에 머문 시간 · 스토리 재생 · 자가 점검 결과 본 것 · 시간 고른 것 · 예약 완료 · 들어온 경로 · 기기 종류.
   - 세지 않는 경우: PC에서 확인용으로 열었을 때(localhost · 파일) · 담당자로 로그인한 브라우저 · localStorage 의 rn_notrack 이 있을 때.
   - 주소 꼬리표: ?s=ig(인스타그램) · th · yt · blog · lec-코드(강의) · card · sh(공유로 옴) · img(결과 그림으로 옴) · ad … 를 들어온 경로로 쓴다.
     ?g=달콤귀 등(공유한 사람의 결과)은 방문 한 줄에만 같이 적는다. 주소 모양은 …/?s=ig#check. (설계: rise-norte-character/docs/측정_설계.md)
   - 다른 코드는 window.RN_TRACK("종류", { n: 숫자 }) 로 적는다. 통계가 꺼져 있어도 이 함수는 항상 있다(아무 일도 안 함). */
(function () {
  "use strict";
  var CONFIG = window.RN_CONFIG || {};
  window.RN_TRACK = function () {};
  var host = location.hostname;
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey || CONFIG.track === false) return;
  if (location.protocol === "file:" || host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    if (!/[?&]track=1/.test(location.search)) return;      // PC에서 시험할 때만 ?track=1
  }
  try {
    if (localStorage.getItem("rn_notrack") === "1") return;
    if (sessionStorage.getItem("rn_role") === "advisor") return;
  } catch (e) { return; }

  function rid() {
    var s = "";
    try { var a = new Uint8Array(8); crypto.getRandomValues(a); for (var i = 0; i < a.length; i++) s += ("0" + a[i].toString(16)).slice(-2); }
    catch (e) { s = Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-8); }
    return s;
  }
  var vid, sid, fresh = false, src, dev;
  try {
    vid = localStorage.getItem("rn_vid"); if (!vid) { vid = rid(); localStorage.setItem("rn_vid", vid); }
    sid = sessionStorage.getItem("rn_sid"); if (!sid) { sid = rid(); sessionStorage.setItem("rn_sid", sid); fresh = true; }
    src = sessionStorage.getItem("rn_src");
  } catch (e) { return; }

  /* 들어온 경로: 주소의 ?utm_source= 나 ?from= 이 먼저, 없으면 직전 사이트 */
  function source() {
    var q = new URLSearchParams(location.search), u = (q.get("s") || q.get("utm_source") || q.get("from") || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 30);
    if (u) return u;
    var r = document.referrer; if (!r) return "direct";
    var h; try { h = new URL(r).hostname.replace(/^www\.|^m\./, ""); } catch (e) { return "direct"; }
    if (h === host.replace(/^www\./, "")) return "direct";
    if (/naver\./.test(h)) return "naver"; if (/google\./.test(h)) return "google"; if (/daum\.|kakao/.test(h)) return "kakao";
    if (/instagram\./.test(h)) return "instagram"; if (/youtube\.|youtu\.be/.test(h)) return "youtube";
    if (/facebook\.|fb\./.test(h)) return "facebook"; if (/threads\./.test(h)) return "threads";
    return h.slice(0, 30);
  }
  if (!src) { src = source(); try { sessionStorage.setItem("rn_src", src); } catch (e) { /* 넘어간다 */ } }
  var ref = "";
  try {
    var r0 = (new URLSearchParams(location.search).get("r") || "").toUpperCase();
    if (/^[A-Z2-9]{5}$/.test(r0)) sessionStorage.setItem("rn_ref", r0);
    ref = sessionStorage.getItem("rn_ref") || "";
  } catch (e) { /* 넘어간다 */ }
  dev = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";

  var queue = [], timer = null;
  var URL_ = CONFIG.supabaseUrl + "/rest/v1/rpc/track";
  function flush() {
    clearTimeout(timer); timer = null;
    if (!queue.length) return;
    var batch = queue.splice(0, 30);
    try {
      fetch(URL_, { method: "POST", keepalive: true, headers: { apikey: CONFIG.supabaseKey, Authorization: "Bearer " + CONFIG.supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_events: batch }) }).then(null, function () {});
    } catch (e) { /* 통계는 실패해도 화면에 영향 없다 */ }
  }
  function push(type, data) {
    var e = { vid: vid, sid: sid, type: type, src: src, dev: dev };
    if (ref && (type === "visit" || type === "check_result")) e.r = ref;     // 소개 주소로 온 방문과 테스트 완료만
    if (data) { if (data.view) e.view = data.view; if (data.ms != null) e.ms = Math.max(0, Math.round(data.ms)); if (data.n != null) e.n = Math.max(0, Math.round(data.n));
      if (data.g && /^(dalkom|jiltu|buran|tamyok|dondok|none)$/.test(data.g)) e.g = data.g;
      if (data.sc && /^[0-3]{4}$/.test(data.sc)) e.sc = data.sc; }
    queue.push(e);
    if (queue.length >= 12) flush(); else if (!timer) timer = setTimeout(flush, 4000);
  }
  window.RN_TRACK = function (type, data) { try { push(type, data); } catch (e) { /* 넘어간다 */ } };

  /* 화면(메뉴)별 조회와 머문 시간: 화면이 보이는 동안만 잰다 */
  var cur = null, since = 0, acc = 0;
  function now() { return Date.now(); }
  function leave() {
    if (!cur) return;
    var ms = acc + (since ? now() - since : 0);
    if (ms > 500) push("leave", { view: cur, ms: ms });
    cur = null; since = 0; acc = 0;
  }
  function enter(view) {
    if (view === cur) return;
    leave();
    cur = view; acc = 0; since = document.hidden ? 0 : now();
    push("view", { view: view });
  }
  if (fresh) push("visit", { view: document.body.getAttribute("data-view") || "home", g: new URLSearchParams(location.search).get("g") });
  enter(document.body.getAttribute("data-view") || "home");
  new MutationObserver(function () { enter(document.body.getAttribute("data-view") || "home"); })
    .observe(document.body, { attributes: true, attributeFilter: ["data-view"] });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (since) { acc += now() - since; since = 0; } var v = cur; leave(); cur = null; flush(); pending = v; }
    else if (pending) { var p = pending; pending = null; cur = p; acc = 0; since = now(); }
  });
  var pending = null;
  window.addEventListener("pagehide", function () { leave(); flush(); });
})();
