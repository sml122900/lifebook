import Link from "next/link";

// ⚠️ 초안(v0) — 데이터 원칙 골자 + 표준 처리방침 구조만 담은 임시본.
// 법적 최종 문구는 경영·재무방 데이터정책 소관 → 시행 전 전문 검토 필수.
// 공개 정적 페이지(비로그인 접근). proxy.ts 의 PUBLIC_PATHS 에 "/privacy" 등록.

export const metadata = {
  title: "개인정보 처리방침 — 라이프북",
  description: "라이프북의 데이터 원칙과 개인정보 처리방침(초안).",
};

// 데이터 원칙 — 강조 카드로 먼저 보여주는 핵심 약속.
const PRINCIPLES = [
  "회원님의 인생 기록은 외부에 제공하거나 판매하지 않습니다.",
  "회원님의 기록을 광고에 사용하지 않습니다.",
  "개인 프로필을 분석해 맞춤 광고를 만들지 않습니다.",
] as const;

// 표준 처리방침 구조 (v0 골자).
const SECTIONS = [
  {
    title: "1. 수집하는 정보",
    body: "가입에 필요한 이메일과 로그인 정보, 회원님이 직접 입력한 인생 기록(연도·사건·회상·사진 등), 가족과 함께 쓰실 때의 별명 등 최소한의 정보만 수집합니다.",
  },
  {
    title: "2. 이용 목적",
    body: "서비스 제공(인생 연혁 작성·보관), AI를 이용한 회상 보조와 문장 다듬기, 가족과의 공유 기능 제공에만 사용합니다.",
  },
  {
    title: "3. AI 처리 및 국외 이전",
    body: "회상 보조·문장 다듬기를 위해 입력하신 글의 일부가 해외에 있는 AI 처리 업체(예: Anthropic)로 전송될 수 있습니다. 이 국외 이전은 가입 시 별도 동의를 받은 범위에서만 이루어집니다.",
  },
  {
    title: "4. 보관 및 파기",
    body: "회원님의 기록은 탈퇴 시 삭제됩니다. 다만 결제 관련 기록은 전자상거래법 등 관련 법령에 따라 일정 기간 익명화하여 보관할 수 있습니다.",
  },
  {
    title: "5. 제3자 제공",
    body: "법령에 따른 경우를 제외하고, 회원님의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.",
  },
  {
    title: "6. 회원님의 권리",
    body: "회원님은 언제든지 본인 정보의 열람·정정·삭제, 동의 철회, 회원 탈퇴를 요청하실 수 있습니다. 설정 화면에서 직접 처리하실 수 있습니다.",
  },
  {
    title: "7. 문의",
    body: "개인정보 처리에 관한 문의는 서비스 내 문의 창구를 통해 접수해 주세요.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <p className="text-base text-ink-soft">
        <Link href="/" className="underline hover:text-ink">
          ← 라이프북 홈으로
        </Link>
      </p>

      <h1 className="mt-4 text-ink">개인정보 처리방침</h1>

      {/* 초안 안내 — 시행 전 임시본임을 명시 */}
      <p
        role="note"
        className="mt-4 rounded-md border-2 border-brand bg-banner px-5 py-4 text-lg text-ink"
      >
        <strong className="text-action">초안(v0)</strong> — 이 문서는 데이터
        원칙의 골자를 담은 임시본이며, 최종 법적 문구는 시행 전 별도로
        확정·게시됩니다.
      </p>

      {/* 데이터 원칙 — 핵심 약속 강조 */}
      <section className="mt-10" aria-labelledby="principles-title">
        <h2 id="principles-title" className="text-ink">
          우리의 약속
        </h2>
        <ul className="mt-5 flex flex-col gap-3">
          {PRINCIPLES.map((p) => (
            <li
              key={p}
              className="flex items-start gap-3 rounded-md border border-line bg-surface px-5 py-4 text-lg text-ink"
            >
              <span aria-hidden className="mt-0.5 text-xl text-success">
                ✓
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 표준 처리방침 본문 */}
      <section className="mt-10 flex flex-col gap-7" aria-label="처리방침 본문">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="text-ink">{s.title}</h2>
            <p className="mt-2 text-lg leading-relaxed text-ink-soft">
              {s.body}
            </p>
          </div>
        ))}
      </section>

      <p className="mt-12 text-base text-ink-faint">© 2026 Lifebook</p>
    </main>
  );
}
