/* 친구에게 보내기: 카카오톡 공유 창을 바로 연다.
   - assets/config.js 의 kakaoJsKey(카카오 개발자 사이트의 ‘JavaScript 키’ · 공개해도 되는 키)가 있어야 동작한다.
     카카오 개발자 사이트에서 이 사이트 주소를 ‘JavaScript SDK 도메인’에 등록해 두어야 한다(안 하면 4019 오류).
   - 키가 없거나 실패하면 false 를 돌려준다 → 부르는 쪽이 휴대폰 공유 창이나 주소 복사로 넘어간다.
   - 카카오 SDK는 단추를 누를 때만 불러온다(2.8.5 · 파일이 바뀌면 integrity 가 맞지 않아 실행되지 않는다).
   쓰는 법: RN_KAKAO_SHARE({ title, text, url, image, button }).then(function (ok) { if (!ok) …다른 방법… }) */
(function () {
  "use strict";
  var SDK = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js";
  var SRI = "sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj";
  var loading = null;
  function load() {
    if (window.Kakao) return Promise.resolve();
    if (!loading) loading = new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = SDK; s.integrity = SRI; s.crossOrigin = "anonymous";
      s.onload = function () { ok(); }; s.onerror = function () { loading = null; fail(new Error("sdk")); };
      document.head.appendChild(s);
    });
    return loading;
  }
  window.RN_KAKAO_SHARE = function (o) {
    var key = (window.RN_CONFIG || {}).kakaoJsKey;
    if (!key) return Promise.resolve(false);
    return load().then(function () {
      if (!window.Kakao.isInitialized()) window.Kakao.init(key);
      var link = { mobileWebUrl: o.url, webUrl: o.url };
      window.Kakao.Share.sendDefault({
        objectType: "feed",
        content: { title: o.title, description: o.text, imageUrl: o.image, link: link },
        buttons: [{ title: o.button || "테스트 하러 가기", link: link }]
      });
      return true;
    }).then(null, function () { return false; });
  };
})();
