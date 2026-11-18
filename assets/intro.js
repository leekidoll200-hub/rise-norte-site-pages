/* 돈깨비 이야기(첫 화면 애니메이션).
   - 장면 그림(assets/story/s01~s13.jpg)을 차례로 보여 준다. 자막은 그림 안에 들어 있다.
   - 처음 온 사람에게 홈에서 한 번만 자동으로 나온다. ‘건너뛰기’는 항상 보이고, 화면을 누르면 다음 장면으로 넘어간다.
   - 설정(assets/config.js)의 showIntro 가 true 일 때만 동작한다. 배포본에서는 기본으로 꺼진다(scripts/build_deploy.py). */
(function () {
  "use strict";
  var CONFIG = window.RN_CONFIG || {};
  var root = document.getElementById("intro");
  if (!root || !CONFIG.showIntro) return;

  var SEEN = "rn_intro_seen";
  var N = 13;          // 장면 수
  var DUR = 4300;      // 한 장면을 보여 주는 시간(ms) → 모두 55초쯤
  var frames = [];
  for (var i = 1; i <= N; i++) frames.push("assets/story/s" + (i < 10 ? "0" + i : i) + ".jpg");

  var bg = root.querySelector(".intro-bg");
  var img = root.querySelector(".intro-img");
  var bar = root.querySelector(".intro-bar i");
  var end = root.querySelector(".intro-end");
  var count = root.querySelector(".intro-count");
  var idx = -1, timer = null;

  function seen() { try { return localStorage.getItem(SEEN) === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(SEEN, "1"); } catch (e) { /* 저장 못 해도 넘어간다 */ } }

  function show(n) {
    idx = n;
    clearTimeout(timer);
    img.classList.remove("on");
    var src = frames[n];
    var pre = new Image();
    pre.onload = pre.onerror = function () {
      if (idx !== n) return;
      img.src = src;
      bg.style.backgroundImage = 'url("' + src + '")';
      img.style.animationName = "none";
      void img.offsetWidth;                                  // 애니메이션을 처음부터 다시
      img.style.animationName = n % 2 ? "introZoomOut" : "introZoomIn";
      img.classList.add("on");
      if (n + 1 < N) { var nx = new Image(); nx.src = frames[n + 1]; }   // 다음 장면 미리 받기
    };
    pre.src = src;
    bar.style.width = ((n + 1) / N * 100) + "%";
    count.textContent = (n + 1) + " / " + N;
    end.hidden = n !== N - 1;
    root.querySelector(".intro-hint").hidden = n === N - 1;
    if (n < N - 1) timer = setTimeout(next, DUR);
  }
  function next() { if (idx < N - 1) show(idx + 1); }
  function prev() { if (idx > 0) show(idx - 1); }

  function open() {
    root.hidden = false;
    root.classList.remove("out");
    document.body.classList.add("intro-on");
    show(0);
    root.querySelector(".intro-skip").focus();
  }
  function close(hash) {
    clearTimeout(timer);
    markSeen();
    root.classList.add("out");
    document.body.classList.remove("intro-on");
    setTimeout(function () { root.hidden = true; }, 500);
    if (hash) location.hash = hash;
  }

  root.querySelector(".intro-skip").addEventListener("click", function (e) { e.stopPropagation(); close(); });
  root.querySelector(".intro-stage").addEventListener("click", function (e) {
    if (e.target.closest(".intro-end")) return;
    if (idx < N - 1) next();
  });
  Array.prototype.forEach.call(root.querySelectorAll("[data-intro-go]"), function (b) {
    b.addEventListener("click", function () { close(b.getAttribute("data-intro-go") || null); });
  });
  document.addEventListener("keydown", function (e) {
    if (root.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") prev();
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-intro-replay]"), function (b) {
    b.hidden = false;
    b.addEventListener("click", function (e) { e.preventDefault(); open(); });
  });

  // 처음 온 사람 · 홈으로 들어온 경우에만 자동으로 보여 준다(다른 화면 주소로 바로 온 사람은 방해하지 않는다)
  var h = location.hash;
  if (!seen() && (h === "" || h === "#" || h === "#home")) open();
})();
