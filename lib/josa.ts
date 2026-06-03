// 한국어 조사 자동 선택 — 받침 유무로 분기.
//
// 마지막 글자가 한글 음절(가-힣) 이 아니면 받침 없음으로 처리(이름이 영문/
// 숫자/이모지일 때 자연스러움). 자음 단독("ㄱ" 같은 자모) 도 안전한 기본.
//
// 사용:
//   `${name}${withJosa(name, "과/와")} 함께한`  →  영희와 / 철수와 / 영수와
//   `${title}${objectJosa(title)} 남겼어요`      →  "여행을" / "사진를"
//
// objectJosa 는 FamilyNewsCard 에서 이미 같은 의미로 사용 중 — 이 lib 으로
// 통합. 호출부는 import 만 갈아끼우면 됨.

function hasBatchim(word: string): boolean {
  const ch = word.trim().at(-1);
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false; // 한글 음절이 아니면 받침 없음
  return (code - 0xac00) % 28 !== 0;
}

// "을/를" 한 형태로 묶어 받음. 슬래시는 받침/없음 순.
type JosaPair = "을/를" | "과/와" | "이/가" | "은/는" | "으로/로" | "아/야";

export function withJosa(word: string, pair: JosaPair): string {
  const [batchim, noBatchim] = pair.split("/") as [string, string];
  return hasBatchim(word) ? batchim : noBatchim;
}

// 자주 쓰는 단축들 — 가독성 + 마이그레이션 호환.
export function objectJosa(word: string): "을" | "를" {
  return hasBatchim(word) ? "을" : "를";
}

export function subjectJosa(word: string): "이" | "가" {
  return hasBatchim(word) ? "이" : "가";
}
