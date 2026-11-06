// 한국어 조사 자동 선택 — 받침 유무로 분기. 앱의 조사 고르기는 이 파일 하나(2026-11-05 성민: 한 곳만).
//
// 마지막 글자 기준:
//   한글 음절 — 받침 그대로.
//   숫자 — 읽는 소리(0 영·십·백·천·만 / 1 일 / 3 삼 / 6 육 / 7 칠 / 8 팔 = 받침, 2 이 / 4 사 / 5 오 / 9 구 = 없음).
//   영문 — 읽는 소리가 분명한 끝만 받침(l 폴·빌 · m 톰 · n 존 · ng 콩 · ck 잭). 모음·r(피터)·s(제임스)·그 밖은 판단이
//     어려워 받침 없음 쪽("를"·"와"·"가")으로.
//   그 밖(자모 "ㄱ"·기호·이모지) — 받침 없음 쪽.
//
// 사용:
//   `${name}${withJosa(name, "과/와")} 함께한`  →  영희와 / 철수와 / 영수와
//   `${title}${objectJosa(title)} 남겼어요`      →  "여행을" / "사진를"
//
// objectJosa 는 FamilyNewsCard 에서 이미 같은 의미로 사용 중 — 이 lib 으로
// 통합. 호출부는 import 만 갈아끼우면 됨.

const DIGIT_BATCHIM = new Set(["0", "1", "3", "6", "7", "8"]);

function hasBatchim(word: string): boolean {
  const w = word.trim();
  const ch = w.at(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return DIGIT_BATCHIM.has(ch);
  if (/[A-Za-z]/.test(ch)) return /(?:l|m|n|ng|ck)$/i.test(w);
  return false;
}

// "을/를" 한 형태로 묶어 받음. 슬래시는 받침/없음 순.
type JosaPair = "을/를" | "과/와" | "이/가" | "은/는" | "으로/로" | "아/야" | "이랑/랑";

export function withJosa(word: string, pair: JosaPair): string {
  const [batchim, noBatchim] = pair.split("/") as [string, string];
  return hasBatchim(word) ? batchim : noBatchim;
}

// 자주 쓰는 단축들 — 가독성 + 마이그레이션 호환.
export function objectJosa(word: string): "을" | "를" {
  return hasBatchim(word) ? "을" : "를";
}
