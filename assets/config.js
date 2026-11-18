/* 사이트 설정. 값만 바꾸면 된다. */
window.RN_CONFIG = {
  // true: 게시 동의를 확인하기 전인 카드(publish_case: 확인 필요)를 '예시' 딱지를 붙여 보여 준다.
  // false: 게시 동의를 받은 사례만 보여 준다. 외부에 올리기 전에는 false 로 두거나 동의를 받는다.
  showExamples: false,

  // 상담 신청을 보낼 주소. 비어 있으면 미리보기(아무 데도 보내지 않음).
  // 전송 방식을 정한 뒤에 채운다 → README '상담 신청 전송 방식'.
  formEndpoint: ""
};
