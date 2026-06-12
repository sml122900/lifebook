import Link from "next/link";

// 개인정보 처리방침 v1.0 (경영방 확정). 공개 정적 페이지(비로그인 접근,
// proxy.ts PUBLIC_PATHS 등록). 사업자 등록(6/17 예정) 전까지 [ ] placeholder
// 노출 — 등록 후 정식 사업자 정보·시행일·수탁자 사명·국외이전 보유기간으로 교체.
// 상단 "초안 — [시행일] 시행 예정" 유지.

export const metadata = {
  title: "개인정보 처리방침 — 라이프북",
  description: "라이프북 개인정보 처리방침.",
};

// 0항 — 회사의 약속 4조. 데이터 원칙 강조 카드로 먼저 노출.
const PROMISES = [
  "회원님의 인생 기록을 외부에 제공하거나 판매하지 않습니다.",
  "회원님의 기록을 광고에 사용하지 않습니다.",
  "개인 프로필을 분석한 맞춤형 광고를 하지 않습니다.",
  "AI 처리를 위한 국외 이전을 투명하게 고지합니다.",
] as const;

// 4항 — 법정 보유 기간.
const RETENTION = [
  { item: "계약 또는 청약철회 등에 관한 기록", period: "5년", law: "전자상거래법" },
  { item: "대금결제 및 재화 등의 공급에 관한 기록", period: "5년", law: "전자상거래법" },
  { item: "소비자 불만 또는 분쟁처리에 관한 기록", period: "3년", law: "전자상거래법" },
  { item: "표시·광고에 관한 기록", period: "6개월", law: "전자상거래법" },
  { item: "로그인(접속) 기록", period: "3개월", law: "통신비밀보호법" },
] as const;

function Article({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-ink">{title}</h2>
      {children}
    </section>
  );
}

const P = "text-lg leading-relaxed text-ink-soft";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <p className="text-base text-ink-soft">
        <Link href="/" className="underline hover:text-ink">
          ← 라이프북 홈으로
        </Link>
      </p>

      <h1 className="mt-4 text-ink">개인정보 처리방침</h1>

      {/* 초안 안내 — 시행 전 임시본 + placeholder 교체 예정 명시 */}
      <p
        role="note"
        className="mt-4 rounded-md border-2 border-brand bg-banner px-5 py-4 text-lg text-ink"
      >
        <strong className="text-action">초안 — [시행일] 시행 예정.</strong> 아래
        <span className="font-semibold"> [ ] </span>표시 항목은 사업자 등록 후
        정식 정보로 교체됩니다.
      </p>

      {/* 0항 — 회사의 약속 (강조 카드) */}
      <section className="mt-10" aria-labelledby="promises-title">
        <h2 id="promises-title" className="text-ink">
          회사의 약속
        </h2>
        <ul className="mt-5 flex flex-col gap-3">
          {PROMISES.map((p) => (
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

      {/* 1~10항 */}
      <div className="mt-10 flex flex-col gap-8">
        <Article title="1. 수집하는 개인정보 항목">
          <p className={P}>
            회사는 서비스 제공에 필요한 최소한의 개인정보만 수집합니다.
          </p>
          <ul className="mt-1 flex flex-col gap-3">
            <li className={P}>
              <strong className="text-ink">가. 가입·로그인</strong> — 구글
              계정(OAuth) 정보(이름, 이메일, 프로필 이미지)와 출생연도.
            </li>
            <li className={P}>
              <strong className="text-ink">나. 서비스 이용 중 생성</strong> —
              회원님이 직접 입력한 인생 기록(연도·사건·회상), AI 대화 내용,
              사진(올리실 때 기기에서 위치정보(GPS)를 제거한 뒤 저장), 가족
              룸의 공유 내용과 별명. 음성으로 입력하신 경우 기기에서 글자로
              변환된 텍스트만 저장하며, 음성(오디오) 원본은 저장하지 않습니다.
            </li>
            <li className={P}>
              <strong className="text-ink">다. 결제</strong> — 결제 일시·금액·
              상품 등 거래 기록. 카드번호 등 결제수단 정보는 결제대행사인
              토스페이먼츠가 처리하며, 회사는 저장하지 않습니다.
            </li>
            <li className={P}>
              <strong className="text-ink">라. 자동 생성·접속</strong> —
              로그인 유지를 위한 세션 쿠키만 사용하며, 분석·광고 목적의 쿠키는
              사용하지 않습니다. 서버·인프라 운영 과정에서 접속 기록(IP 등)이
              클라우드 사업자에 의해 자동 생성·보관될 수 있습니다.
            </li>
          </ul>
          <p
            className="mt-3 rounded-md border border-line bg-surface px-5 py-4 text-lg text-ink"
          >
            <strong className="text-ink">민감정보</strong> — 회사는 건강·정치·
            종교 등 민감정보를 수집하거나 입력을 유도하지 않습니다. 회원님이
            회상에 자발적으로 민감정보를 적으시더라도, 이를 프로파일링이나
            광고에 사용하지 않습니다.
          </p>
        </Article>

        <Article title="2. 개인정보의 이용 목적">
          <p className={P}>
            회원 식별·인증, 인생 연혁 작성·보관, AI 회상 보조와 문장 다듬기,
            가족 공유 기능 제공, 결제·정산, 문의 응대 및 서비스 개선을 위해
            이용합니다.
          </p>
        </Article>

        <Article title="3. 개인정보의 국외 이전">
          <p className={P}>
            회사는 AI 기능 제공을 위해 아래와 같이 개인정보를 국외로
            이전합니다. 회원님은 가입 시 이에 대해 별도로 동의하실 수 있으며,
            동의하지 않으실 권리가 있습니다(미동의 시 일부 AI 기능 이용이
            제한될 수 있습니다).
          </p>
          <dl className="mt-2 flex flex-col gap-1 rounded-md border border-line bg-surface px-5 py-4 text-lg">
            <Row label="이전받는 자" value="Anthropic, PBC" />
            <Row label="이전 국가" value="미국" />
            <Row label="이전 항목" value="AI 기능 이용 시 회원님이 입력한 텍스트" />
            <Row label="이전 일시·방법" value="서비스 이용 시점에 네트워크를 통한 전송" />
            <Row label="이용 목적" value="AI 회상 보조·문장 다듬기" />
            <Row label="보유·이용 기간" value="[Anthropic 보유기간 — 확인 후 확정]" />
          </dl>
        </Article>

        <Article title="4. 개인정보의 보유 및 이용 기간">
          <p className={P}>
            수집·이용 목적이 달성되면 지체 없이 파기합니다. 다만 관계 법령에
            따라 아래 기간 동안 보존합니다.
          </p>
          <div className="mt-2 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-base">
              <thead className="bg-surface text-ink">
                <tr>
                  <th className="px-4 py-3 font-semibold">보존 항목</th>
                  <th className="px-4 py-3 font-semibold">기간</th>
                  <th className="px-4 py-3 font-semibold">근거</th>
                </tr>
              </thead>
              <tbody>
                {RETENTION.map((r) => (
                  <tr key={r.item} className="border-t border-line text-ink-soft">
                    <td className="px-4 py-3">{r.item}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.period}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.law}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Article>

        <Article title="5. 개인정보의 제3자 제공">
          <p className={P}>
            회사는 회원님의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에
            근거가 있거나 수사기관의 적법한 요청이 있는 경우는 예외로 합니다.
          </p>
        </Article>

        <Article title="6. 개인정보 처리의 위탁">
          <p className={P}>
            원활한 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁합니다.
          </p>
          <ul className="mt-1 flex flex-col gap-2">
            <li className={P}>· 토스페이먼츠㈜ — 결제 처리</li>
            <li className={P}>· [호스팅 사업자] — 서비스 인프라 운영 및 데이터 보관</li>
          </ul>
        </Article>

        <Article title="7. 정보주체의 권리·의무 및 행사 방법">
          <p className={P}>
            회원님은 언제든지 본인 개인정보의 열람·정정·삭제·처리정지 및 동의
            철회(회원 탈퇴)를 요청하실 수 있습니다. 서비스 내 설정 화면에서 직접
            처리하시거나 아래 보호책임자에게 요청하실 수 있습니다.
          </p>
        </Article>

        <Article title="8. 개인정보 보호책임자">
          <dl className="flex flex-col gap-1 rounded-md border border-line bg-surface px-5 py-4 text-lg">
            <Row label="성명" value="이성민" />
            <Row label="직책" value="대표" />
            <Row label="이메일" value="[이메일]" />
            <Row label="전화" value="[전화]" />
          </dl>
        </Article>

        <Article title="9. 개인정보의 파기">
          <p className={P}>
            보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이
            파기합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제하며, 결제
            등 법정 보존 정보는 보존 기간 동안 분리 보관한 뒤 파기합니다.
          </p>
        </Article>

        <Article title="10. 고지의 의무 및 시행">
          <p className={P}>
            이 개인정보 처리방침의 내용에 추가·삭제·수정이 있을 경우 시행 전
            서비스 내 공지를 통해 안내합니다.
          </p>
          <p className={"mt-1 " + P}>· 시행일: [시행일]</p>
        </Article>
      </div>

      {/* 사업자 정보 — 등록 후 교체 */}
      <section className="mt-12 border-t border-line pt-6 text-base text-ink-faint">
        <dl className="flex flex-col gap-1">
          <Row label="상호" value="[상호]" subtle />
          <Row label="대표자" value="[대표자]" subtle />
          <Row label="사업자등록번호" value="[등록번호]" subtle />
          <Row label="주소" value="[주소]" subtle />
          <Row label="문의" value="[이메일] · [전화]" subtle />
        </dl>
        <p className="mt-4">© 2026 Lifebook</p>
      </section>
    </main>
  );
}

function Row({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className={subtle ? "text-ink-faint" : "font-semibold text-ink"}>
        {label}
      </dt>
      <dd className={subtle ? "text-ink-faint" : "text-ink-soft"}>{value}</dd>
    </div>
  );
}
