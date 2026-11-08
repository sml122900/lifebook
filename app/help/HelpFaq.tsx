"use client";

// 고객센터 FAQ — 카테고리별 섹션 + 아코디언(한 번에 하나만 열림).
// 어르신 친화: 큰 글씨·넉넉한 간격·부드러운 펼침(grid-rows 0fr↔1fr).
// 순수 정적 콘텐츠 — 데이터/DB 없음.
// 2026-11-08 지금 화면(V3 — 이야기 나누기·My Life) 기준으로 답 정리, 배송 기간 = 상품 페이지(최대 14일).
// 고친 답은 [임시] 주석 — 확정 전.

import { useState } from "react";

type QA = { q: string; a: string };
type Category = { title: string; items: QA[] };

const FAQ: Category[] = [
  {
    title: "서비스 사용법",
    items: [
      {
        q: "이야기는 어떻게 입력하나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: '[내 정보] 메뉴의 "이야기 나누기"에서 AI와 대화하면 이야기가 정리돼요. My Life 지도의 [+ 만들기]로 직접 적으셔도 돼요. 휴대폰 자판의 마이크 버튼으로 말로 적으셔도 괜찮아요.',
      },
      {
        q: "포스터는 어떻게 만드나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: '[내 정보] 메뉴의 "포스터 만들기"에서 디자인을 고르고, 담고 싶은 이야기를 고르면 포스터 시안이 만들어져요.',
      },
      {
        q: "입력한 내용을 수정하거나 지울 수 있나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "네, 언제든지 고치거나 지울 수 있어요. My Life 지도에서 이야기를 누르면 아래에 창이 열리는데, [글 고치기]로 고치고 [이 노드 지우기]로 지울 수 있어요.",
      },
      {
        q: "사진은 어떻게 넣나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: '이야기의 [글 고치기] 화면에서 [사진 넣기]를 누르면 돼요. [내 정보] 메뉴의 "내 사진"에서도 올릴 수 있어요.',
      },
    ],
  },
  {
    title: "토큰·결제",
    items: [
      {
        q: "토큰이 뭔가요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "토큰은 일부 AI 기능(맞춤 포스터 배경 그리기, AI에게 물어보기 등)에 쓰는 포인트예요. 가입 시 50토큰을 드려요.",
      },
      {
        q: "토큰은 어떻게 충전하나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "[내 정보]를 눌러 [토큰 화면 열기] → [토큰 충전하러 가기]를 누르시면 돼요.",
      },
      {
        q: "토큰 환불이 되나요?",
        // 법률 검토 필요(2026-11-08 — 충전 토큰 청약철회·환불 가능 여부). 문장은 바꾸지 않음(성민 지시).
        a: "충전한 토큰은 환불이 어렵습니다. 충전 전에 무료 토큰으로 먼저 써보세요.",
      },
      {
        q: "무료로 쓸 수 있는 기능이 있나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "이야기 나누기와 My Life 지도는 토큰 없이 쓰실 수 있어요. 사용법 도우미도 무료예요. 가입 시 드리는 50토큰으로 다른 AI 기능도 써 보실 수 있어요.",
      },
    ],
  },
  {
    title: "포스터 주문·배송",
    items: [
      {
        q: "포스터 주문은 어떻게 하나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "포스터 시안 화면에서 [이 포스터 주문하기]를 누르고, 배송지를 적은 뒤 결제하시면 주문이 완료돼요.",
      },
      {
        q: "주문 후 취소·환불이 되나요?",
        a: "제작이 시작되기 전까지 취소·환불이 가능해요. 제작 시작 후에는 취소가 어렵고, 제품에 문제가 있을 경우 7일 이내에 연락 주시면 무상으로 다시 만들어드려요.",
      },
      {
        q: "배송은 얼마나 걸리나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
        a: "결제일로부터 최대 14일 이내에 배송해 드려요.",
      },
      {
        q: "주문 상태는 어디서 확인하나요?",
        // [임시 — 성민 확정 필요] 2026-11-08 지금 화면(V3 My Life) 기준으로 고침
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
        a: '설정 메뉴에서 "회원 탈퇴"를 선택하실 수 있어요. 탈퇴 시 모든 이야기와 포스터 데이터가 삭제되니 신중하게 결정해 주세요.',
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
            {cat.items.map((qa, qi) => {
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
