/* 사이트 설정. 값만 바꾸면 된다. */
window.RN_CONFIG = {
  // true: 게시 동의를 확인하기 전인 카드(publish_case: 확인 필요)를 '예시' 딱지를 붙여 보여 준다.
  // false: 게시 동의를 받은 사례만 보여 준다. 외부에 올리기 전에는 false 로 두거나 동의를 받는다.
  showExamples: false,

  // true: 메뉴에 ‘스토리’가 생기고, 누르면 ‘돈깨비 스토리’(장면 13장 · 55초쯤)가 나온다. 자동으로 틀지 않는다.
  // 배포본에도 기본으로 나간다(빼려면 python scripts/build_deploy.py --no-intro).
  showIntro: true,

  // 상담 신청을 보낼 주소. 비어 있으면 미리보기(아무 데도 보내지 않음).
  // 전송 방식을 정한 뒤에 채운다 → README '상담 신청 전송 방식'.
  formEndpoint: "",

  // Supabase 프로젝트(로그인 · 고객 데이터). 여기 적는 것은 공개해도 되는 값뿐이다.
  // 관리자 키(service_role · secret)와 데이터베이스 비밀번호는 절대 이 파일 · 저장소에 넣지 않는다.
  // 누가 무엇을 볼 수 있는지는 데이터베이스 권한(RLS)이 막는다 → supabase/schema_draft.sql
  supabaseUrl: "https://cyghwusriftgqbaonywd.supabase.co",
  supabaseKey: "sb_publishable_QgeW8-4Vu_DVjm5orJzMFg_R8ExV-4Q",

  // 카카오톡 공유(‘친구에게 보내기’를 누르면 카카오톡 공유 창이 바로 뜬다)에 쓰는 ‘JavaScript 키’.
  // 카카오 개발자 사이트 > 내 애플리케이션 > 앱 키에서 본다. 공개해도 되는 키다(REST API 키 · Admin 키 · Client Secret 은 절대 넣지 않는다).
  // 같은 곳의 ‘JavaScript SDK 도메인’에 사이트 주소를 등록해야 동작한다. 비어 있으면 휴대폰 공유 창 · 주소 복사로 넘어간다.
  kakaoJsKey: "cf81cb5b5e6d23e0316d1d838f8568dd"
};
