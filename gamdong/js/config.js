// ============================================================
//  감동 투표 앱 설정 파일
//  README.md의 "Firebase 연결하기"를 따라 아래 값을 채워 넣으세요.
//  apiKey 가 비어 있으면 '데모 모드'로 동작합니다.
//  (데모 모드: 한 컴퓨터의 브라우저 탭끼리만 연동 — 리허설/미리보기용)
// ============================================================

window.GAMDONG_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBSba96rl5JZQzqSNi-nk5y803hkcm6mTM",
    authDomain: "hkgms-820ff.firebaseapp.com",
    databaseURL: "https://hkgms-820ff-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "hkgms-820ff",
    appId: "1:785243740780:web:af1e4dba74128b35e41649"
  },

  // 진행자(관리자)로 로그인할 구글 계정 이메일
  // database.rules.json 의 ADMIN_EMAIL 과 똑같이 적어 주세요.
  adminEmail: "idealjade7@gmail.com",

  // 관객 투표 페이지 주소 (QR코드에 들어갈 주소)
  // 비워 두면 현재 사이트 주소의 index.html 을 자동으로 사용합니다.
  voteUrl: ""
};
