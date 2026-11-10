"use client";

// 고객센터 FAQ — 카테고리별 섹션 + 아코디언(한 번에 하나만 열림).
// 어르신 친화: 큰 글씨·넉넉한 간격·부드러운 펼침(grid-rows 0fr↔1fr).
// 순수 정적 콘텐츠 — 데이터/DB 없음.
// 2026-11-08 지금 화면(V3 — 이야기 나누기·My Life) 기준으로 답 정리, 배송 기간 = 상품 페이지(최대 14일).
// 답 문구 2026-11-10 확정(성민).

import { useState } from "react";
import { TOKEN_REFUND_LINES } from "@/lib/commerce/order-display";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { TOPUP_OPEN } from "@/lib/tokens/policy";

// topup = 토큰 충전 안내 — 충전이 닫혀 있을 때(TOPUP_OPEN false — 2026-11-09~10 비공개) 숨김.
type QA = { q: string; a: string; topup?: true };
type Category = { title: string; items: QA[] };

const FAQ: Category[] = [
  {
    title: "서비스 사용법",
    items: [
      {
        q: "이야기는 어떻게 입력하나요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: '[내 정보] 메뉴의 "이야기 나누기"에서 AI와 대화하면 이야기가 정리돼요. My Life 지도의 [+ 만들기]로 직접 적으셔도 돼요. 휴대폰 자판의 마이크 버튼으로 말로 적으셔도 괜찮아요.',
      },
      {
        q: "인쇄본은 어떻게 만드나요?",
        // 2026-11-09 가격 확정(장당 8,000원·배송비 포함) — 옛 "준비하고 있어요"
        a: '[내 정보] 메뉴의 "인쇄본 만들기"에서 My Life 지도를 시기마다 한 장씩 담은 인쇄본을 만들 수 있어요. 한 장에 8,000원이고 배송비는 따로 없어요.',
      },
      {
        q: "입력한 내용을 수정하거나 지울 수 있나요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침 · 2026-11-10 지우기 버튼 이름 = 이야기 패널 실제 버튼
        a: `네, 언제든지 고치거나 지울 수 있어요. My Life 지도에서 이야기를 누르면 아래에 창이 열리는데, [글 고치기]로 고치고 [${MY_LIFE_COPY.edit.deleteNode.story}]로 지울 수 있어요.`,
      },
      {
        q: "사진은 어떻게 넣나요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        // 2026-11-08 — "내 사진" 메뉴는 V3 에서 숨김(3단계)
        a: "이야기의 [글 고치기] 화면에서 [사진 넣기]를 누르면 돼요.",
      },
    ],
  },
  {
    title: "토큰·결제",
    items: [
      {
        q: "토큰이 뭔가요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "토큰은 일부 AI 기능(글 다듬기, AI에게 물어보기 등)에 쓰는 포인트예요. 가입 시 50토큰을 드려요.", // 2026-11-08 포스터 배경 그리기 뺌
      },
      {
        q: "토큰은 어떻게 충전하나요?",
        topup: true,
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "[내 정보]를 눌러 [토큰 화면 열기] → [토큰 충전하러 가기]를 누르시면 돼요.",
      },
      {
        q: "토큰 환불이 되나요?",
        // 2026-11-10 성민 지시 — 옛 "충전한 토큰은 환불이 어렵습니다" 지움. 답 = 환불정책·약관 제25조·충전 화면·상점과 같은 문장(TOKEN_REFUND_LINES).
        // [임시 — 성민 확정 필요] · [법률 검토 필요]
        a: TOKEN_REFUND_LINES.join(" "),
        topup: true,
      },
      {
        q: "무료로 쓸 수 있는 기능이 있나요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "이야기 나누기와 My Life 지도는 토큰 없이 쓰실 수 있어요. 사용법 도우미도 무료예요. 가입 시 드리는 50토큰으로 다른 AI 기능도 써 보실 수 있어요.",
      },
    ],
  },
  {
    title: "인쇄본 주문·배송",
    items: [
      {
        q: "인쇄본 주문은 어떻게 하나요?",
        // 2026-11-08 — 출력 편집 화면(/my-life/print)에서 빼기·장수·금액 확인 뒤 배송지·결제
        a: "인쇄본 화면에서 넣을 이야기를 고르고 장수와 금액을 확인한 뒤, 받으실 곳을 적고 결제하시면 주문이 완료돼요.",
      },
      {
        q: "주문 후 취소·환불이 되나요?",
        // [법률 검토 필요] 2026-11-09 — 환불 정책 v1.1(약관 제15조·제16조)과 맞춤
        a: "주문 확인을 받으신 날(상품을 그보다 늦게 받으시면 받으신 날)부터 7일 안에는 취소하거나 반품하실 수 있어요. 제품에 하자가 있으면 받으신 날부터 3개월, 아신 날부터 30일 안에 연락 주세요. 무상으로 다시 만들어 드리거나 환불해 드려요.",
      },
      {
        q: "배송은 얼마나 걸리나요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "결제일로부터 최대 14일 이내에 배송해 드려요.",
      },
      {
        q: "주문 상태는 어디서 확인하나요?",
        // 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: '[내 정보] 메뉴의 "주문 내역"에서 현재 상태(접수·제작·배송 중 등)를 확인하실 수 있어요.',
      },
    ],
  },
  {
    title: "계정",
    items: [
      {
        q: "비밀번호를 잊어버렸어요.",
        a: "아래 이메일로 가입하신 이메일과 함께 문의해 주세요. 도와드릴게요.",
      },
      {
        q: "회원 탈퇴는 어떻게 하나요?",
        a: '설정 메뉴에서 "회원 탈퇴"를 선택하실 수 있어요. 탈퇴 시 모든 이야기 데이터가 삭제되니 신중하게 결정해 주세요.', // 2026-11-08 포스터 뺌
      },
      {
        q: "가족 대신 가입해줄 수 있나요?",
        a: "네, 가족분의 이메일로 대신 가입해 이야기를 입력해드릴 수 있어요. 많은 분들이 자녀가 부모님 계정을 만들어드리고 있어요.",
      },
    ],
  },
  {
    title: "기술 문제",
    items: [
      {
        q: "앱이 느리거나 오류가 나요.",
        a: "페이지를 새로고침(F5)하거나 앱을 껐다 켜보세요. 그래도 문제가 있으면 아래 이메일로 연락 주세요.",
      },
      {
        q: "음성 인식이 잘 안 돼요.",
        a: "조용한 곳에서 마이크에 가까이 대고 말씀해보세요. 브라우저에서 마이크 접근을 허용했는지도 확인해 주세요.",
      },
      {
        q: "저장이 안 돼요.",
        a: "인터넷 연결을 확인하시고, 다시 시도해 보세요. 계속 안 되면 아래 이메일로 연락 주세요.",
      },
    ],
  },
];

export function HelpFaq() {
  // 한 번에 하나만 열림 — 전역 단일 openId.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      {FAQ.map((cat, ci) => (
        <section key={cat.title} className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold text-action">{cat.title}</h2>
          <div className="flex flex-col gap-2">
            {cat.items.filter((qa) => TOPUP_OPEN || !qa.topup).map((qa, qi) => {
              const id = `${ci}-${qi}`;
              const open = openId === id;
              return (
                <div
                  key={id}
                  className="overflow-hidden rounded-md border-2 border-line bg-surface"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : id)}
                    aria-expanded={open}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
                  >
                    <span className="text-lg font-semibold text-ink">
                      Q. {qa.q}
                    </span>
                    <span aria-hidden className="shrink-0 text-action">
                      {open ? "▲" : "▼"}
                    </span>
                  </button>
                  <div
                    className={[
                      "grid transition-all duration-200 ease-out",
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    ].join(" ")}
                  >
                    <div className="overflow-hidden">
                      <p className="whitespace-pre-line border-t-2 border-line px-5 py-4 text-lg leading-relaxed text-ink">
                        {qa.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
