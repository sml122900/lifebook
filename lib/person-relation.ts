// v3 P14-2 — 인물 dedup 의 관계(relation) 호환 판정. 순수 모듈.
//
// P12-3 dedup 은 이름(공백 무시)만 봐서 "국사 선생님 박정호"(고등학교)와
// "동아리 선배 박정호"(대학교)가 한 사람으로 합쳐졌고, 그 뒤 두 번째
// 인물에도 "박정호 선생님과" 존칭이 따라붙었다. 이름이 같아도 관계가
// 명백히 다른 부류면 별도 인물로 둔다.
//
// 정책(핸드오프): 애매하면 병합 안 하는 쪽이 안전 — 오병합은 잘못된
// 존칭까지 이어진다. 관계가 비어 있거나 "지인"(추출 기본값)이면 정보가
// 없는 것이라 병합. 두 관계가 같은 부류(친구 vs 친한 친구)면 병합. 부류가
// 다르거나(선생님 vs 선배) 어느 쪽도 부류를 못 잡았는데 문구가 서로
// 포함 관계도 아니면 별도.

const RELATION_GROUPS: { key: string; terms: string[] }[] = [
  { key: "teacher", terms: ["선생", "담임", "은사", "스승", "교수", "교장", "교감"] },
  {
    key: "senior",
    terms: ["선배", "선임", "고참", "사수", "상사", "상관", "사장", "부장", "과장", "팀장", "원장", "소대장", "중대장", "대장", "반장"],
  },
  { key: "junior", terms: ["후배", "후임", "부하", "제자", "학생"] },
  { key: "peer", terms: ["친구", "짝꿍", "단짝", "동기", "동창", "급우", "동료", "전우", "동아리", "이웃", "짝"] },
  { key: "spouse", terms: ["아내", "남편", "집사람", "안사람", "마누라", "와이프", "신랑", "서방", "바깥양반", "배우자", "각시"] },
  { key: "parent", terms: ["어머니", "아버지", "엄마", "아빠", "부모"] },
  { key: "grandparent", terms: ["할머니", "할아버지"] },
  { key: "sibling", terms: ["형", "누나", "오빠", "언니", "동생", "형제", "자매", "남매"] },
  { key: "child", terms: ["아들", "딸", "자녀", "자식", "손주", "손자", "손녀"] },
  { key: "relative", terms: ["이모", "고모", "삼촌", "외삼촌", "큰아버지", "작은아버지", "큰어머니", "작은어머니", "사촌", "조카", "친척"] },
];

const NO_INFO = new Set(["", "지인"]);

function normalize(relation: string | null | undefined): string {
  return (relation ?? "").replace(/\s+/g, "");
}

// 첫 매칭 부류. "동아리 선배" 처럼 두 부류 어휘가 겹치면 뒤에 오는(핵심)
// 어휘를 우선 — 문장 끝에 가까운 토큰이 보통 관계의 머리다.
export function relationGroup(relation: string | null | undefined): string | null {
  const r = normalize(relation);
  if (!r) return null;
  let best: { key: string; idx: number } | null = null;
  for (const g of RELATION_GROUPS) {
    for (const t of g.terms) {
      const idx = r.lastIndexOf(t);
      if (idx >= 0 && (!best || idx > best.idx)) best = { key: g.key, idx };
    }
  }
  return best?.key ?? null;
}

export function isRelationCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (NO_INFO.has(na) || NO_INFO.has(nb)) return true;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const ga = relationGroup(na);
  const gb = relationGroup(nb);
  if (ga && gb) return ga === gb;
  return false;
}
