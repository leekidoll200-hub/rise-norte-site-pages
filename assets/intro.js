/* 돈깨비 스토리.
   - 앞의 12장은 장면 그림(assets/story/s01~s12.jpg · 자막은 그림 안에 있다).
   - 뒤의 4장은 돈깨비 단독 컷(s13.jpg)을 배경으로 화면에서 직접 만든 장면이다: 자기소개 → 상황 설명 → 앞으로 어떻게 → “자, 그럼 시작해 볼까!”
   - 사이트: 메뉴의 ‘스토리’를 누르면 나온다(자동으로 틀지 않는다). 장면은 저절로 넘어가고, 화면을 누르면 바로 다음 장면.
   - 강의: story.html 을 열면 전체 화면 발표용으로 뜬다(저절로 넘어가지 않음 · → 또는 클릭으로 넘김 · F 전체 화면).
   - 설정(assets/config.js)의 showIntro 가 true 일 때만 동작한다. 배포본에서는 기본으로 꺼진다(scripts/build_deploy.py). */
(function () {
  "use strict";
  var CONFIG = window.RN_CONFIG || {};
  var root = document.getElementById("intro");
  if (!root || !CONFIG.showIntro) return;
  var LECTURE = document.body.getAttribute("data-story") === "lecture";

  var SEEN = "rn_intro_seen";
  var FRAMES = [];
  for (var i = 1; i <= 12; i++) FRAMES.push({ img: "assets/story/s" + (i < 10 ? "0" + i : i) + ".jpg", ms: 4300 });
  // 11번째 장면: 그림 속 말풍선의 글(태국어)을 우리말 말풍선으로 덮는다
  FRAMES[10].patch = { text: "사라져라, 사라져라, 얍!", left: 24.5, top: 18.6, width: 31.5, height: 10.6 };
  var DON = "assets/story/s13.jpg";
  FRAMES.push({ compose: true, ms: 8000, lines: [
    "안녕하세요, 돈깨비입니다 ㅎㅎ",
    "오늘 여러분과 함께 ‘구조’를 찾아드리러 왔습니다.",
    "돈독귀신의 유혹에서 여러분을 지켜드리겠습니다."] });
  FRAMES.push({ compose: true, ms: 9000, title: "방금 보신 건, 남의 이야기가 아닙니다", lines: [
    "달콤귀는 지금 쓰라 하고, 질투귀는 남과 견주게 합니다.",
    "불안귀는 걱정만 하다 미루게 하고, 탐욕귀는 크게 걸게 합니다.",
    "넷이 합쳐진 것이 돈독귀신입니다. 의지가 아니라 구조로 막아야 합니다."] });
  FRAMES.push({ compose: true, ms: 10000, title: "그래서 이렇게 합니다", steps: true, lines: [
    "지금 내 돈이 어디에 있는지부터 봅니다.",
    "돈마다 자리를 정합니다. 쓸 돈, 지킬 돈, 불릴 돈.",
    "정한 대로 실행하는 것까지 옆에서 같이 갑니다."] });
  FRAMES.push({ compose: true, last: true, big: "자, 그럼 시작해 볼까!" });
  var N = FRAMES.length;

  var bg = root.querySelector(".intro-bg");
  var img = root.querySelector(".intro-img");
  var patch = root.querySelector(".intro-patch");
  var comp = root.querySelector(".intro-compose");
  var bar = root.querySelector(".intro-bar i");
  var end = root.querySelector(".intro-end");
  var count = root.querySelector(".intro-count");
  var hint = root.querySelector(".intro-hint");
  var idx = -1, timer = null;

  function markSeen() { try { localStorage.setItem(SEEN, "1"); } catch (e) { /* 저장 못 해도 넘어간다 */ } }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  function drawCompose(f) {
    comp.textContent = "";
    var pic = node("div", "ic-pic"); pic.style.backgroundImage = 'url("' + DON + '")';
    var box = node("div", "ic-box" + (f.big ? " ic-big" : ""));
    box.appendChild(node("p", "ic-name", "돈깨비"));
    if (f.title) box.appendChild(node("h2", "ic-title", f.title));
    if (f.big) box.appendChild(node("p", "ic-shout", f.big));
    (f.lines || []).forEach(function (t, k) {
      var p = node("p", "ic-line" + (f.steps ? " ic-step" : ""));
      if (f.steps) p.appendChild(node("b", null, ["하나", "둘", "셋"][k] || String(k + 1)));
      p.appendChild(document.createTextNode(t));
      p.style.animationDelay = (0.5 + k * 1.5) + "s";
      box.appendChild(p);
    });
    comp.appendChild(pic); comp.appendChild(box);
  }

  function show(n) {
    idx = n;
    clearTimeout(timer);
    var f = FRAMES[n];
    img.classList.remove("on");
    comp.hidden = !f.compose;
    patch.hidden = true;
    if (f.compose) {
      img.removeAttribute("src");
      bg.style.backgroundImage = "none";
      drawCompose(f);
    } else {
      var pre = new Image();
      pre.onload = pre.onerror = function () {
        if (idx !== n) return;
        img.src = f.img;
        bg.style.backgroundImage = 'url("' + f.img + '")';
        img.style.animationName = "none";
        void img.offsetWidth;                                  // 애니메이션을 처음부터 다시
        img.style.animationName = f.patch ? "none" : (n % 2 ? "introZoomOut" : "introZoomIn");
        img.classList.add("on");
        if (f.patch) placePatch(f.patch);
      };
      pre.src = f.img;
    }
    var nx = FRAMES[n + 1];
    if (nx) { var im = new Image(); im.src = nx.img || DON; }   // 다음 장면 미리 받기
    bar.style.width = ((n + 1) / N * 100) + "%";
    count.textContent = (n + 1) + " / " + N;
    end.hidden = !f.last || LECTURE;
    if (f.last && window.RN_TRACK) window.RN_TRACK("story_end");
    hint.hidden = !!f.last;
    if (!LECTURE && !f.last) timer = setTimeout(next, f.ms);
  }
  /* 그림 위의 정해진 자리에 말풍선을 덮는다(그림은 가로세로 비율을 지키며 가운데에 놓인다) */
  function placePatch(p) {
    var stage = root.querySelector(".intro-stage"), W = stage.clientWidth, H = stage.clientHeight;
    var w = Math.min(W, H * 16 / 9), h = w * 9 / 16, x0 = (W - w) / 2, y0 = (H - h) / 2;
    patch.textContent = p.text;
    patch.style.left = (x0 + w * p.left / 100) + "px";
    patch.style.top = (y0 + h * p.top / 100) + "px";
    patch.style.width = (w * p.width / 100) + "px";
    patch.style.height = (h * p.height / 100) + "px";
    patch.style.fontSize = Math.max(9, h * 0.042) + "px";
    patch.hidden = false;
  }
  window.addEventListener("resize", function () { var f = FRAMES[idx]; if (f && f.patch && !root.hidden) placePatch(f.patch); });

  function next() { if (idx < N - 1) show(idx + 1); }
  function prev() { if (idx > 0) show(idx - 1); }

  function open() {
    root.hidden = false;
    root.classList.remove("out");
    document.body.classList.add("intro-on");
    if (window.RN_TRACK) window.RN_TRACK("story_start");
    show(0);
    var skip = root.querySelector(".intro-skip");
    if (skip && !LECTURE) skip.focus();
  }
  function close(hash) {
    clearTimeout(timer);
    if (window.RN_TRACK) window.RN_TRACK("story_close", { n: idx + 1 });
    markSeen();
    root.classList.add("out");
    document.body.classList.remove("intro-on");
    setTimeout(function () { root.hidden = true; }, 500);
    if (hash) location.hash = hash;
  }

  var skipBtn = root.querySelector(".intro-skip");
  if (skipBtn) skipBtn.addEventListener("click", function (e) { e.stopPropagation(); if (LECTURE) show(0); else close(); });
  root.querySelector(".intro-stage").addEventListener("click", function (e) {
    if (e.target.closest(".intro-end")) return;
    next();
  });
  Array.prototype.forEach.call(root.querySelectorAll("[data-intro-go]"), function (b) {
    b.addEventListener("click", function () { close(b.getAttribute("data-intro-go") || null); });
  });
  document.addEventListener("keydown", function (e) {
    if (root.hidden) return;
    if (e.key === "Escape") { if (!LECTURE) close(); }
    else if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown" || e.key === "Enter") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "Home") show(0);
    else if ((e.key === "f" || e.key === "F") && LECTURE) {
      if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen();
    }
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-intro-replay]"), function (b) {
    b.hidden = false;
    b.addEventListener("click", function (e) { e.preventDefault(); open(); });
  });

  // 사이트에서는 자동으로 틀지 않는다(메뉴의 ‘스토리’). 강의용 화면(story.html)은 열자마자 시작한다.
  if (LECTURE) open();
})();
