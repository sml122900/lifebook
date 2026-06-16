// 사업자 정보 — 전자상거래법 고지 필수 항목 (풋터 단일 진실 원천).
// 통신판매업번호는 발급 후 mailOrderRegNo 만 교체하면 풋터 자동 반영.

export const BUSINESS_INFO = {
  companyName: "[ 상호명 ]",
  ceoName: "[ 대표자명 ]",
  bizRegNo: "[ 사업자등록번호 ]",   // 예: 000-00-00000
  address: "[ 사업장 주소 ]",
  csPhone: "[ 고객센터 전화 ]",
  csEmail: "support@lifebook.kr",
  mailOrderRegNo: "신고 예정",      // 통신판매업 신고번호 발급 후 교체
} as const;
