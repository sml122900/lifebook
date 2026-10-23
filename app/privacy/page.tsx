import Link from "next/link";

import { BUSINESS_INFO } from "@/lib/commerce/business";

// 개인정보 처리방침 v1.1 (경영방 확정). 공개 정적 페이지(비로그인 접근,
// proxy.ts PUBLIC_PATHS 등록). 2026-09-10 — 토스페이먼츠 PG 심사 대응으로
// placeholder([시행일] 배너·10항 시행일) 제거, 정식 시행일로 확정.
// v1.1(2026-10-24 시행) —가입·로그인 수단과 수집 항목 정비, 국외 이전 대상 추가, 처리위탁 목록 갱신.

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

// 3항 — 국외 이전(업체별).
const TRANSFERS = [
  {
    to: "Anthropic, PBC",
    contact: "https://www.anthropic.com/legal/privacy",
    country: "미국",
    items:
      "AI 기능 이용 시 입력하신 대화·회상 내용, 녹음을 변환한 텍스트, 답변 품질을 위해 함께 전달하는 기본 정보(출생연도·지역, 인물 이름·관계, 대화 중 답하신 내용)",
    purpose: "AI 회상 보조·문장 다듬기·인생 기록 정리·포스터 문장 생성",
    period:
      "API 처리 후 7일 이내 자동 삭제 (법령·정책 위반 대응 목적 제외, 모델 학습 미사용)",
  },
  {
    to: "OpenAI, L.L.C.",
    contact: "https://openai.com/policies/privacy-policy",
    country: "미국",
    items: "취향 키워드(직접 입력하신 취향, AI가 정리한 취향)",
    purpose: "포스터 맞춤 배경 이미지 생성",
    period:
      "API 처리 후 최대 30일 이내 삭제 (부정 이용 감시 목적, 모델 학습 미사용)",
  },
  {
    to: "Google LLC",
    contact: "https://policies.google.com/privacy",
    country: "미국",
    items: "장소 검색어, 지도에 표시하는 장소명·좌표",
    purpose: "장소 검색 및 지도 표시",
    period: "검색·표시 처리 완료 시까지 (Google 개인정보처리방침에 따름)",
  },
  {
    to: "Vercel Inc.",
    contact: "https://vercel.com/legal/privacy-policy",
    country: "미국",
    items: "서비스 이용 과정에서 처리되는 개인정보 전반",
    purpose: "서비스 서버 운영",
    period: "회원 탈퇴 또는 위탁 계약 종료 시까지",
  },
  {
    to: "Supabase, Inc.",
    contact: "https://supabase.com/privacy",
    country: "미국 법인(데이터 저장 위치: 대한민국 서울 리전)",
    items: "회원 정보, 인생 기록, 사진·녹음 파일 등 저장 데이터 전반",
    purpose: "데이터베이스·파일 저장",
    period: "회원 탈퇴 또는 위탁 계약 종료 시까지",
  },
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
              <strong className="text-ink">가. 가입·로그인</strong>
              <ul className="mt-1 flex flex-col gap-1">
                <li>· 카카오 로그인: 닉네임, 카카오 회원 식별값</li>
                <li>
                  · 네이버 로그인: 이름(없으면 별명), 프로필 이미지, 네이버 회원
                  식별값
                </li>
                <li>
                  · 구글 로그인: 이름, 이메일, 프로필 이미지, 구글 회원 식별값
                </li>
                <li>· 이메일 가입: 이름, 이메일, 비밀번호(암호화하여 저장)</li>
              </ul>
              <p className="mt-1">
                소셜 로그인 시 로그인 처리를 위해 각 사업자가 발급한 인증 토큰을
                함께 저장합니다. 카카오·네이버의 이메일과 프로필 이미지는
                회원님이 해당 서비스에서 제공에 동의하신 경우에만 수집됩니다.
              </p>
            </li>
            <li className={P}>
              <strong className="text-ink">나. 서비스 이용 중 입력·생성</strong>{" "}
              — 회원님이 직접 입력한 인생 기록(연도·사건·회상), AI 대화 내용,
              사진(올리실 때 기기에서 위치정보(GPS)를 제거한 뒤 저장), 가족
              룸의 공유 내용과 별명. 음성으로 입력하신 경우 글자로 변환된
              텍스트와 녹음 파일을 함께 저장합니다.
              <ul className="mt-1 flex flex-col gap-1">
                <li>
                  · 기본 정보: 출생연도·출생 월, 출생지, 성별, 그리고 대화 중
                  답하신 학교·거주지·관심사·좋아하는 음악·영화·취미 등
                </li>
                <li>
                  · 인물 기록: 회원님이 적으신 가족·친구 등의 이름, 관계,
                  출생연도
                </li>
                <li>· 장소 기록: 장소명과 위치(좌표)</li>
                <li>
                  · 취향 정보: 직접 입력하신 취향과, 포스터 배경 제작을 위해
                  AI가 대화 내용에서 정리한 취향 키워드
                </li>
              </ul>
            </li>
            <li className={P}>
              <strong className="text-ink">다. 음성 녹음 파일</strong> —
              녹음 파일은 회원님만 접근할 수 있는 비공개 서버(Supabase Storage
              비공개 버킷)에 저장됩니다. 회고·재생 목적으로만 사용하며, 외부에
              제공하거나 광고에 활용하지 않습니다. 회원 탈퇴 시 함께 삭제됩니다.
            </li>
            <li className={P}>
              <strong className="text-ink">라. 결제</strong> — 결제 일시·금액·
              상품 등 거래 기록. 카드번호 등 결제수단 정보는 결제대행사인
              토스페이먼츠가 처리하며, 회사는 저장하지 않습니다.
            </li>
            <li className={P}>
              <strong className="text-ink">마. 자동 생성·접속</strong> —
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
            인생 포스터 문장 및 배경 이미지 생성, 장소 검색과 지도 표시, 가족
            공유 기능 제공, 결제·정산, 문의 응대 및 서비스 개선을 위해
            이용합니다.
          </p>
        </Article>

        <Article title="3. 개인정보의 국외 이전">
          <p className={P}>
            회사는 서비스 제공을 위해 아래와 같이 개인정보를 국외로 이전합니다.
            인생 기록 정리, AI 대화, 데이터 저장 등 라이프북의 핵심 기능이 아래
            사업자를 통해 제공되므로, 국외 이전 동의는 서비스 이용을 위한 필수
            동의입니다. 회원님은 동의를 거부하실 권리가 있으나, 거부하시는 경우
            서비스를 이용하실 수 없습니다.
          </p>
          <p className={"mt-1 " + P}>
            <strong className="text-ink">이전 일시·방법</strong> — 서비스 이용
            시점에 네트워크를 통해 전송합니다.
          </p>
          <div className="mt-2 flex flex-col gap-3">
            {TRANSFERS.map((t) => (
              <dl
                key={t.to}
                className="flex flex-col gap-1 rounded-md border border-line bg-surface px-5 py-4 text-lg"
              >
                <Row label="이전받는 자" value={t.to} />
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-semibold text-ink">연락처</dt>
                  <dd className="break-all text-ink-soft">{t.contact}</dd>
                </div>
                <Row label="이전 국가" value={t.country} />
                <Row label="이전 항목" value={t.items} />
                <Row label="이용 목적" value={t.purpose} />
                <Row label="보유·이용 기간" value={t.period} />
              </dl>
            ))}
          </div>
          <p className={"mt-2 " + P}>
            음성 입력 기능은 브라우저에 내장된 음성 인식을 사용하며, 이용 중인
            브라우저(예: 크롬)에 따라 음성이 브라우저 제공사의 서버에서 처리될 수
            있습니다.
          </p>
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
            <li className={P}>· {BUSINESS_INFO.hostingProvider} — 서비스 인프라 운영</li>
            <li className={P}>· Supabase, Inc. — 데이터베이스 및 파일 저장</li>
            <li className={P}>· 네이버클라우드㈜ — 음성 텍스트 변환(STT) 처리 (국내 위탁)</li>
            <li className={P}>· 네이버㈜ — 장소 검색 및 지도 표시 (국내 위탁)</li>
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
            <Row label="성명" value={BUSINESS_INFO.privacyOfficerName} />
            <Row label="직책" value={BUSINESS_INFO.privacyOfficerTitle} />
            <Row label="이메일" value={BUSINESS_INFO.csEmail} />
            <Row label="전화" value={BUSINESS_INFO.csPhone} />
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
          <p className={"mt-1 " + P}>· 시행일: 2026년 10월 24일</p>
          <p className={P}>· 개정 이력</p>
          <ul className="flex flex-col gap-1 pl-4">
            <li className={P}>- v1.0 — 2026년 9월 10일 시행</li>
            <li className={P}>
              - v1.1 — 2026년 10월 24일 시행 (가입·로그인 수단과 수집 항목 정비,
              국외 이전 대상 추가, 처리위탁 목록 갱신)
            </li>
          </ul>
        </Article>
      </div>

      {/* 사업자 정보 */}
      <section className="mt-12 border-t border-line pt-6 text-base text-ink-faint">
        <dl className="flex flex-col gap-1">
          <Row label="상호" value={BUSINESS_INFO.companyName} subtle />
          <Row label="대표자" value={BUSINESS_INFO.ceoName} subtle />
          <Row label="사업자등록번호" value={BUSINESS_INFO.bizRegNo} subtle />
          <Row label="주소" value={BUSINESS_INFO.address} subtle />
          <Row label="문의" value={`${BUSINESS_INFO.csEmail} · ${BUSINESS_INFO.csPhone}`} subtle />
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
