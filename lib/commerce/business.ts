// 사업자 정보 — 전자상거래법 고지 필수 항목 (풋터·처리방침 단일 진실 원천).
// 통신판매업번호는 발급 후 mailOrderRegNo 만 교체하면 풋터·처리방침 자동 반영.

export const BUSINESS_INFO = {
  companyName: "라이프북",
  ceoName: "이성민",
  bizRegNo: "147-02-03988",
  address: "서울특별시 강남구 일원로9길 70, 402호(일원동)",
  csPhone: "010-5539-1947",
  csEmail: "sml122900@gmail.com",
  mailOrderRegNo: "신고 예정",      // 통신판매업 신고번호 발급 후 교체 (~6/19)
  privacyOfficerName: "이성민",
  privacyOfficerTitle: "대표",
  hostingProvider: "Vercel Inc.",
} as const;
