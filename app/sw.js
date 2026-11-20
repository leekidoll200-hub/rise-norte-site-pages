/* 돈깨비 앱 알림(서비스 워커) · 2026-11-20 · 계획 docs/plan.md 3단계
   - 범위는 /app/ 뿐이다(로그인한 계약 고객 화면). 공개 화면에는 관여하지 않는다.
   - 하는 일은 둘: 알림을 받으면 보여 주고, 누르면 도장판 화면을 연다.
   - 화면 파일을 저장해 두지(캐시) 않는다. 고친 화면이 늘 바로 보이게. */
"use strict";

var SCOPE = self.registration.scope;                 // 예: https://…/rise-norte-site-pages/app/
var ICON = new URL("../assets/icons/icon_192.png", SCOPE).href;

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  var url = typeof d.url === "string" && d.url.indexOf(SCOPE) === 0 ? d.url : SCOPE + "?s=push";
  e.waitUntil(self.registration.showNotification(d.title || "돈깨비", {
    body: d.body || "도장판을 열어 보세요.",
    icon: ICON,
    badge: ICON,
    tag: "rn-payday",                                  // 같은 알림이 여러 번 와도 하나만 보인다
    data: { url: url }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || SCOPE;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(SCOPE) === 0 && "focus" in list[i]) {
        return list[i].navigate ? list[i].navigate(url).then(function (c) { return c && c.focus(); }, function () { return list[i].focus(); }) : list[i].focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
