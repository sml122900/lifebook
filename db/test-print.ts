// My Life 인쇄본 회귀(2026-11-08 — docs/phase/print-mylife.md §10 P1·P2·P4). LLM 0 · 결제 호출 0.
//
//   ① 배치(합성 지도) — 중앙값·최대 계정 장수가 설계 어림 안 · 장 안 계 상자 겹침 0 · 본문 밖 0 · 위성이 열 안 · 이야기는 한 번씩 ·
//      시기 행성 크기(이야기 0~1·2~3·4 이상) · 표지 차례
//   ② 빼기(출력본에만) — 시기(이야기 함께)·이야기·사람·장소·모임·장소 묶음·사용자 카테고리·항목 · 없는 노드 키 무시
//   ③ 간선 켜고 끄기 — 사람 끄면 사람·모임 위성·점선 0, 오른쪽 목록은 남음 · 장소 끄기 따로 · 한 장 계 상자 최대 6(§2.3 "6번 넘게" 규칙 불필요)
//   ④ 다른 분 이름 첫 글자 — 위성·목록·인물록만 · 장소·주인 이름 그대로
//   ⑤ 장 이어짐(나누기) — 이어서·다음 장 이름·앞 장 이름 · 나온 장 번호
//   ⑥ 장수 상한·가격(2026-11-09 장당 8,000원·배송비 포함 — 구간 폐기) — 20장 넘으면 overLimit · 장수 × 8,000원 · 1~20장 밖 = 금액 없음 ·
//      최고가 160,000원 = 20장 · 금액 없거나 최고가 넘으면 판매 안 함 · 상품 공개(장당 표시·무료배송) · 화면 금액 줄 = 서버 주문과 같은 함수
//   ⑦ PDF 묶기 — 머리·쪽 수·xref 위치·표지만 재단선
//   ⑧ DB(픽스처 계정) — 편집 상태 저장·불러오기(이상한 키 거름) · 금액 없으면 주문 거절(행 0) · 주문 = 서버가 다시 센 장수·금액(장당 × 장수)·스냅샷 ·
//      배송지 없음·상한 넘음 거절 · 편집·주문 뒤에도 실제 지도 그대로 · 남의 계정 편집 상태 안 보임
//   ⑨ 화면·결제 — 성공 화면이 인쇄 주문만 위젯 시크릿 키로 확인 · 주문 제작 청약철회 제한 문구 없음 · 숨긴 상품 상세 404 ·
//      인쇄 상품 주문 화면 → /my-life/print · 실결제 꺼짐 · 문구 확정
//   ⑪ 결제 수단 미선택 연타(2026-11-09) — 대기 주문 1건(재사용·동시 잠금) · 위젯 거절 = 결제 수단 안내
//   ⑫ 토큰 충전 비공개(2026-11-09 — 토스 신청 전) — 충전 주문 서버 거절(행 0) · /billing = 안내 화면 · 충전 진입 버튼·충전 안내·
//      "충전한 토큰은 환불이 어렵습니다" 숨김 · 잔액·차감은 그대로 · 상점 공개 상품 = 인쇄본 하나
//   ⑩ 강물 포스터 판매 종료(2026-11-08 — test-v3-poster-bridge 퇴역, 주문 막기 검사는 여기로) — 숨긴 상품(책·씨앗·포스터) 주문 거절 ·
//      인쇄본은 일반 주문 경로 거절(인쇄본 화면 경로만 — 2026-11-09) ·
//      포스터 그리기 코드 없음 · 옛 /poster 주소 → 인쇄본 · 보존 주문 2건만 그림(관리자·주인 주문 상세)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { createPendingPrintOrder, getPrintDraft, PRINT_PAYMENT_LIVE_ENABLED, PRINT_PRODUCT_ID, sanitizePrintOptions, savePrintDraft, type PrintSnapshot } from "../lib/commerce/print-orders";
import { PRINT_MAX_TOTAL_KRW, PRINT_MIN_PAGES, PRINT_PAGE_KRW, PRINT_SHIPPING_KRW, printOnSale, printPrice } from "../lib/commerce/print-price";
import { getProduct, shippingKrwOf } from "../lib/commerce/products";
import { createPendingProductOrder } from "../lib/commerce/orders";
import { PRODUCTS } from "../lib/commerce/products";
import { createPendingOrder } from "../lib/tokens/orders";
import { TOPUP_OPEN } from "../lib/tokens/policy";
import { keptPosterImages } from "../lib/commerce/kept-poster";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import type { MyLifeData } from "../lib/my-life";
import { getMyLifeData } from "../lib/my-life";
import { addLink, createGroupNode, createPeriodNode, createPersonNode, createPlaceNode, createStoryNode } from "../lib/my-life-edit";
import { DEFAULT_PRINT_OPTIONS, initialName, layoutPrint, liveKeys, PRINT, printKey, type PrintLayout, type PrintOptions, type PrintPage } from "../lib/print-layout";
import { buildPdf } from "../lib/print-pdf";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

// ── 합성 지도 ─────────────────────────────────────────────
type Spec = { periods: number; stories: number[]; people: number; places: number; chipsPerStory: number };
function synth(spec: Spec): MyLifeData {
  const people = Array.from({ length: spec.people }, (_, i) => ({ id: `p${i}`, name: `김영${i}희`, relation: i % 2 ? "친구" : null, metYear: null, groupIds: [], body: "", birthYear: null, memo: null }));
  const places = Array.from({ length: spec.places }, (_, i) => ({ id: `l${i}`, name: `장소${i}`, address: null, source: null, lat: null, lng: null, groupIds: [] }));
  let k = 0;
  const events = Array.from({ length: spec.periods }, (_, i) => {
    const id = `e${i}`;
    const stories = Array.from({ length: spec.stories[i] ?? 0 }, (_, j) => {
      const chips = Array.from({ length: spec.chipsPerStory }, () => {
        const n = k++;
        return n % 3 === 2 && places.length
          ? { kind: "place" as const, id: places[n % places.length].id, name: "" }
          : people.length
            ? { kind: "person" as const, id: people[n % people.length].id, name: "" }
            : null;
      }).filter((c): c is NonNullable<typeof c> => !!c);
      return { id: `s${i}_${j}`, kind: "STORY" as const, title: `이야기 ${i}-${j}`, content: "", primaryEventId: id, otherEventIds: [], subjectPersonId: null, chips, richBody: false, bodyVersion: 0, decor: j === 0 ? "ring" : null };
    });
    return { id, type: "CUSTOM" as const, label: `시기 ${i}`, year: 1960 + i * 5, endYear: 1963 + i * 5, stories, decor: null, personIds: people.length ? [people[i % people.length].id] : [], placeIds: [], groupIds: [] };
  });
  return { events, people, groups: [], places, placeGroups: [] } as unknown as MyLifeData;
}

const periodPages = (l: PrintLayout) => l.pages.filter((p): p is Extract<PrintPage, { kind: "period" }> => p.kind === "period");
function geometryProblems(l: PrintLayout): string[] {
  const out: string[] = [];
  periodPages(l).forEach((p, i) => {
    let prevEnd = -1;
    for (const s of p.systems) {
      const top = s.y - PRINT.SYS_PAD;
      if (top < prevEnd) out.push(`장${i} 겹침 ${s.key}`);
      if (top + s.h > PRINT.BODY_H) out.push(`장${i} 본문 밖 ${s.key}`);
      for (const sat of s.sats) if (sat.x - PRINT.SAT_CELL_W / 2 < 0 || sat.x + PRINT.SAT_CELL_W / 2 > PRINT.COL_W || sat.y + PRINT.SAT_D / 2 + 48 > top + s.h) out.push(`장${i} 위성 밖 ${sat.key}`);
      prevEnd = top + s.h;
    }
    for (const e of p.list) if (e.y > PRINT.BODY_H) out.push(`장${i} 목록 밖`);
  });
  return out;
}
const storyKeys = (l: PrintLayout) => periodPages(l).flatMap((p) => p.systems.filter((s) => s.kind === "story").map((s) => s.key));
const allSatNames = (l: PrintLayout) => periodPages(l).flatMap((p) => [...p.systems.flatMap((s) => s.sats.map((x) => x.name)), ...p.list.map((x) => x.name)]);

const EMAIL = "fixture-print@lifebook.invalid";
const EMAIL_B = "fixture-print-b@lifebook.invalid";
async function removeFixtures() {
  for (const email of [EMAIL, EMAIL_B]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function main() {
  // ① 배치
  const median = synth({ periods: 8, stories: [1, 0, 1, 0, 1, 0, 1, 0], people: 2, places: 0, chipsPerStory: 1 });
  const maxSpec = synth({ periods: 8, stories: [3, 3, 3, 3, 3, 3, 3, 2], people: 12, places: 14, chipsPerStory: 2 });
  const lMed = layoutPrint(median, "주인", DEFAULT_PRINT_OPTIONS);
  const lMax = layoutPrint(maxSpec, "주인", DEFAULT_PRINT_OPTIONS);
  console.log(`  (장수 — 중앙값 ${lMed.pageCount}장 · 최대 ${lMax.pageCount}장)`);
  // 장 채움 = 시기 장마다 마지막 계 끝 ÷ 본문 높이(계 상자 경계에서만 나누므로 빈칸이 생김 — 평균 60% 이상이면 장이 헛되이 늘지 않음).
  // 실제 지도(2026-11-08 운영 V3 4계정, 전부 테스트 계정 — 읽기만): 7·7·8·12장. 아래 무거운 합성(이야기마다 위성 2 + 시기마다 사람)은 실제 최대보다 무거움.
  const fill = (l: PrintLayout) => {
    const ps = periodPages(l);
    return ps.reduce((n, p) => n + (p.systems[p.systems.length - 1].y - PRINT.SYS_PAD + p.systems[p.systems.length - 1].h) / PRINT.BODY_H, 0) / ps.length;
  };
  check("① 장수 — 중앙값 합성 4~7장 · 무거운 합성 ≤ 20장 · 시기 장 채움 평균 60% 이상", lMed.pageCount >= 4 && lMed.pageCount <= 7 && lMax.pageCount <= PRINT.MAX_PAGES && fill(lMax) >= 0.6, { med: lMed.pageCount, max: lMax.pageCount, fill: fill(lMax) });
  check("① 장 안 계 상자 겹침 0 · 본문 밖 0 · 위성이 시간 줄기 열 안 · 목록 본문 안", [...geometryProblems(lMed), ...geometryProblems(lMax)].length === 0, [...geometryProblems(lMed), ...geometryProblems(lMax)].slice(0, 5));
  const wantStories = maxSpec.events.flatMap((e) => e.stories.map((s) => printKey.story(s.id))).sort();
  check("① 이야기는 주 소속 시기에서 한 번씩", JSON.stringify([...storyKeys(lMax)].sort()) === JSON.stringify(wantStories));
  const p0 = periodPages(lMax)[0].systems[0];
  const big = layoutPrint(synth({ periods: 1, stories: [5], people: 0, places: 0, chipsPerStory: 0 }), "", DEFAULT_PRINT_OPTIONS);
  check("① 시기 행성 크기 = 이야기 0~1·2~3·4 이상 → 128·144·160 · 이야기 128", periodPages(lMed)[0].systems[0].d === 128 && p0.d === 144 && periodPages(big)[0].systems[0].d === 160 && periodPages(big)[0].systems[1].d === 128);
  const cover = lMax.pages[0];
  check("① 표지 = 첫 장 · 차례에 시기마다 한 줄(장 번호)", cover.kind === "cover" && cover.toc.length === 8 && cover.toc.every((t) => t.page >= 2 && t.page <= lMax.pageCount) && cover.owner === "주인");

  // ② 빼기
  const ex1 = layoutPrint(maxSpec, "주인", { ...DEFAULT_PRINT_OPTIONS, excluded: [printKey.event("e0"), printKey.story("s1_0"), printKey.person("p0"), printKey.place("l2"), "ev:없는노드", "pe:없는사람"] });
  const keysEx1 = periodPages(ex1).flatMap((p) => [...p.systems.map((s) => s.key), ...p.systems.flatMap((s) => s.sats.map((x) => x.key)), ...p.list.map((x) => x.key)]);
  const peopleRows = ex1.pages.filter((p) => p.kind === "people").flatMap((p) => (p.kind === "people" ? p.rows.map((r) => r.name) : []));
  check("② 빼기 — 시기(그 이야기 함께)·이야기·사람·장소가 계·위성·목록·인물록에서 빠짐 · 없는 노드 키 무시",
    !keysEx1.some((k) => ["ev:e0", "st:s0_0", "st:s0_1", "st:s0_2", "st:s1_0", "pe:p0", "pl:l2"].includes(k)) && !peopleRows.includes("김영0희") && keysEx1.includes("st:s1_1") && ex1.pages.every((p) => p.kind !== "period" || p.systems.length > 0));
  const withGroups = { ...maxSpec, groups: [{ id: "g0", name: "동창회", memberIds: ["p1", "p2"] }], placeGroups: [{ id: "pg0", name: "고향", memberIds: ["l0"] }], custom: { categories: [{ id: "c0", name: "물건", refs: [] }], groups: [], items: [{ id: "i0", name: "라디오", categoryId: "c0", body: "", related: [] }, { id: "i1", name: "자전거", categoryId: "c0", body: "", related: [] }], builtinNames: { PEOPLE: null, PLACES: null } } } as MyLifeData;
  const rowsOf = (l: PrintLayout, kind: "people" | "places" | "custom") => l.pages.flatMap((p) => (p.kind === kind ? p.rows.map((r) => r.name) : []));
  const g0 = layoutPrint(withGroups, "", DEFAULT_PRINT_OPTIONS);
  const g1 = layoutPrint(withGroups, "", { ...DEFAULT_PRINT_OPTIONS, excluded: ["gl:g0", "pgl:pg0", "cn:i1"] });
  const g2 = layoutPrint(withGroups, "", { ...DEFAULT_PRINT_OPTIONS, excluded: ["cat:c0"] });
  check("② 모임·장소 묶음 빼기 = 묶음만 빠지고 안의 분·곳은 남음 · 항목 빼기 · 카테고리 빼기 = 그 장 없음",
    rowsOf(g0, "people").includes("동창회") && !rowsOf(g1, "people").includes("동창회") && rowsOf(g1, "people").includes("김영1희") &&
      rowsOf(g0, "places").includes("고향") && !rowsOf(g1, "places").includes("고향") && rowsOf(g1, "places").includes("장소0") &&
      rowsOf(g0, "custom").join() === "물건,라디오,자전거" && rowsOf(g1, "custom").join() === "물건,라디오" && rowsOf(g2, "custom").length === 0,
    { g0: rowsOf(g0, "custom"), g1: rowsOf(g1, "custom") });
  const live = liveKeys(withGroups);
  check("② 지금 지도 키 — 시기·이야기·사람·장소·모임·장소 묶음·카테고리·항목", ["ev:e0", "st:s0_0", "pe:p0", "pl:l0", "gl:g0", "pgl:pg0", "cat:c0", "cn:i0"].every((k) => live.has(k)) && !live.has("ev:없는노드"));

  // ③ 간선
  const offPeople = layoutPrint(maxSpec, "", { ...DEFAULT_PRINT_OPTIONS, showPeopleEdges: false });
  const offPlace = layoutPrint(maxSpec, "", { ...DEFAULT_PRINT_OPTIONS, showPlaceEdges: false });
  const kinds = (l: PrintLayout) => new Set(periodPages(l).flatMap((p) => [...p.systems.flatMap((s) => s.sats.map((x) => x.kind)), ...p.edges.map((e) => `edge:${e.kind}`)]));
  const listKinds = (l: PrintLayout) => new Set(periodPages(l).flatMap((p) => p.list.map((x) => x.kind)));
  check("③ 사람 간선 끄기 = 사람 위성·점선 0 · 장소는 그대로 · 오른쪽 목록에 사람 남음",
    !kinds(offPeople).has("person") && !kinds(offPeople).has("edge:person") && kinds(offPeople).has("place") && listKinds(offPeople).has("person"));
  check("③ 장소 간선 끄기 = 장소 위성·점선 0 · 사람 그대로 · 목록에 장소 남음",
    !kinds(offPlace).has("place") && !kinds(offPlace).has("edge:place") && kinds(offPlace).has("person") && listKinds(offPlace).has("place") && kinds(lMax).has("edge:person"));
  // §2.3 "한 분이 한 장에 6번 넘게 나오면 점선 없이 이야기 N편" — 한 장 계 상자가 최대 6개(위성 없는 계 144 × 6 + 사이 16 × 5 = 944 ≤ 1028)라
  // 생기지 않는다 → 규칙을 두지 않음. 그 전제(가장 작은 계로만 채워도 한 장 6개)를 확인.
  const tiny = layoutPrint(synth({ periods: 1, stories: [20], people: 1, places: 0, chipsPerStory: 1 }), "", { ...DEFAULT_PRINT_OPTIONS, showPeopleEdges: false });
  check("③ 한 장 계 상자 최대 6개(가장 작은 계로 채워도) → 한 분 점선 최대 6", Math.max(...periodPages(tiny).map((p) => p.systems.length)) === 6 && Math.max(...periodPages(lMax).map((p) => p.edges.length)) > 0);

  // ④ 이니셜
  const ini = layoutPrint(withGroups, "주인", { ...DEFAULT_PRINT_OPTIONS, initials: true });
  const names = allSatNames(ini).filter((n) => n.startsWith("김"));
  check("④ 다른 분 이름 첫 글자 — 위성·목록·인물록 \"김○○\" · 장소·모임·주인 이름 그대로 · 한 글자 이름 = ○",
    names.length > 0 && names.every((n) => n === "김○○") && rowsOf(ini, "people").filter((n) => n.startsWith("김")).every((n) => n === "김○○") &&
      allSatNames(ini).some((n) => n.startsWith("장소")) && rowsOf(ini, "people").includes("동창회") && ini.pages[0].kind === "cover" && ini.pages[0].owner === "주인" &&
      initialName("솔") === "○" && initialName("남궁민수") === "남○○");

  // ⑤ 장 이어짐
  const long = layoutPrint(synth({ periods: 2, stories: [12, 1], people: 6, places: 0, chipsPerStory: 3 }), "", DEFAULT_PRINT_OPTIONS);
  const lp = periodPages(long);
  check("⑤ 나누기 — 한 시기가 넘치면 다음 장 \"이어서\" · 앞 장은 다음 장으로 이어짐 · 앞 장·다음 장 이름 · 나온 장 번호",
    lp.length >= 3 && lp[0].continues && lp[1].continued && !lp[0].continued && lp[0].nextLabel === "시기 0" && lp[1].prevLabel === "시기 0" &&
      long.pages.some((p) => p.kind === "people" && p.rows.some((r) => r.pages.length > 1)),
    lp.map((p) => [p.continued, p.continues, p.periods.map((x) => x.label)]));

  // ⑥ 상한·가격(2026-11-09 장당 8,000원 · 배송비 포함)
  const huge = layoutPrint(synth({ periods: 40, stories: Array(40).fill(3), people: 4, places: 2, chipsPerStory: 3 }), "", DEFAULT_PRINT_OPTIONS);
  const p7 = printPrice(7);
  check("⑥ 20장 넘으면 overLimit · 금액 = 장당 8,000원 × 장수 + 배송 0(최소 2장 16,000 · 7장 56,000 · 20장 160,000) · 1장(표지만)·21장·소수 = 금액 없음",
    huge.overLimit && huge.pageCount > PRINT.MAX_PAGES && !lMax.overLimit && PRINT_PAGE_KRW === 8_000 && PRINT_SHIPPING_KRW === 0 &&
      !!p7 && p7.unitKrw === 8_000 && p7.quantity === 7 && p7.shippingKrw === 0 && p7.totalKrw === 56_000 && PRINT_MIN_PAGES === 2 && printPrice(2)?.totalKrw === 16_000 && printPrice(1) === null &&
      printPrice(20)?.totalKrw === 160_000 && printPrice(21) === null && printPrice(0) === null && printPrice(2.5) === null && printPrice(huge.pageCount) === null);
  const product = getProduct(PRINT_PRODUCT_ID);
  check("⑥ 최고가 160,000원 = 20장 · 판매 중(상품 공개 · 목록 장당 8,000원 · 무료배송) · 금액 0 또는 최고가 넘는 장당 금액 = 판매 안 함",
    PRINT_MAX_TOTAL_KRW === 160_000 && PRINT_PAGE_KRW * PRINT.MAX_PAGES === PRINT_MAX_TOTAL_KRW && printOnSale() && product?.orderable === true &&
      product.unitKrw === 8_000 && product.pricePrefix === "장당" && shippingKrwOf(product) === 0 && !printOnSale(0) && !printOnSale(8_001));
  const editor6 = read("app/my-life/print/PrintEditor.tsx");
  check("⑥ 화면 금액 줄·주문 단계 = 서버 주문과 같은 함수(printPrice) — 화면에 금액 계산식 따로 없음",
    editor6.includes("printPrice(layout.pageCount)") && editor6.includes("total={price.totalKrw}") && read("lib/commerce/print-orders.ts").includes("printPrice(layout.pageCount, pageKrw)") &&
      !/8_?000|tierFor/.test(editor6));

  const detail6 = read("app/shop/[productId]/page.tsx");
  check("⑥ 최소 2장(2026-11-09 성민) — 인쇄본 화면 금액 줄에 최소 장수 안내 · 상품 상세에 최소 2장 · 교환·반품·환불 요약 줄 + 환불정책 링크",
    editor6.includes("layout.pageCount < PRINT_MIN_PAGES") && editor6.includes("T.minPages(") && read("lib/print-copy.ts").includes("minPages:") &&
      detail6.includes("최소 {PRINT_MIN_PAGES}장") && detail6.includes("REFUND_SUMMARY_LINES.map") && detail6.includes('href="/refund"') &&
      read("lib/commerce/order-display.ts").includes("export const REFUND_SUMMARY_LINES"));

  // ⑦ PDF
  const fake = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7) % 256));
  const pdf = buildPdf([
    { jpeg: fake(500), pxW: 10, pxH: 14, mmW: 216, mmH: 303, trimMm: 3 },
    { jpeg: fake(300), pxW: 10, pxH: 14, mmW: 210, mmH: 297 },
    { jpeg: fake(200), pxW: 10, pxH: 14, mmW: 210, mmH: 297 },
  ]);
  const s = Buffer.from(pdf).toString("latin1");
  const xrefAt = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  const offs = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  check("⑦ PDF — 머리 %PDF-1.4 · 쪽 3 · xref 가 객체 시작을 가리킴 · 재단선(TrimBox)은 표지만 · A4 = 595×842pt",
    s.startsWith("%PDF-1.4") && s.includes("/Count 3") && s.slice(xrefAt).startsWith("xref") && offs.length === 11 && offs.every((o, i) => s.slice(o).startsWith(`${i + 1} 0 obj`)) &&
      (s.match(/\/TrimBox/g) ?? []).length === 1 && s.includes("/MediaBox [0 0 595.28 841.89]") && s.trimEnd().endsWith("%%EOF"));

  // ⑧ DB(픽스처 계정)
  await removeFixtures();
  try {
    const now = new Date();
    const mk = async (email: string, name: string) =>
      (await prisma.user.create({ data: { email, name, birthYear: 1950, onboardingTrack: "V3", isTestAccount: true, termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION }, select: { id: true } })).id;
    const a = await mk(EMAIL, "[fixture] 인쇄");
    const b = await mk(EMAIL_B, "[fixture] 인쇄 남");
    const per1 = await createPeriodNode(a, { label: "[fixture] 국민학교", year: 1957, endYear: 1962 });
    const per2 = await createPeriodNode(a, { label: "[fixture] 첫 직장", year: 1970, endYear: null });
    if (!per1.ok || !per2.ok) throw new Error("시기 만들기 실패: " + JSON.stringify([per1, per2]));
    const mom = await createPersonNode(a, { name: "[fixture] 어머니", relation: "어머니" });
    const mate = await createPersonNode(a, { name: "[fixture] 짝꿍", relation: "친구" });
    const place = await createPlaceNode(a, { name: "[fixture] 학교 운동장" });
    if (!mom.ok || !("personId" in mom) || !mate.ok || !("personId" in mate) || !place.ok) throw new Error("사람·장소 만들기 실패");
    const st1 = await createStoryNode(a, { lifeEventId: per1.eventId, kind: "STORY", title: "[fixture] 운동회", content: "[fixture] 운동회 날 달리기를 했다.", personIds: [mom.personId], placeIds: [place.placeId] });
    const st2 = await createStoryNode(a, { lifeEventId: per2.eventId, kind: "STORY", title: "[fixture] 첫 월급", content: "[fixture] 첫 월급으로 내복을 샀다.", personIds: [mate.personId] });
    if (!st1.ok || !st2.ok) throw new Error("이야기 만들기 실패: " + JSON.stringify([st1, st2]));
    const grp = await createGroupNode(a, { name: "[fixture] 동네 친구들", memberIds: [mate.personId] });
    if (grp.ok) await addLink(a, { type: "EPISODE", id: st2.episodeId }, { type: "PERSON_GROUP", id: grp.groupId });

    const mapBefore = JSON.stringify(await getMyLifeData(a));
    const draftEmpty = await getPrintDraft(a);
    const saved = await savePrintDraft(a, { excluded: [printKey.story(st1.episodeId), "evil:<script>", 42, "pe:../../x"], showPeopleEdges: false, showPlaceEdges: true, initials: true, extra: "무시" });
    const back = await getPrintDraft(a);
    check("⑧ 편집 상태 — 처음 = 기본값 · 저장·불러오기 같음 · 모양 틀린 키·값 거름 · 남의 계정은 기본값",
      JSON.stringify(draftEmpty) === JSON.stringify(DEFAULT_PRINT_OPTIONS) && JSON.stringify(saved) === JSON.stringify(back) &&
        JSON.stringify(back.excluded) === JSON.stringify([printKey.story(st1.episodeId)]) && back.initials && !back.showPeopleEdges &&
        JSON.stringify(await getPrintDraft(b)) === JSON.stringify(DEFAULT_PRINT_OPTIONS),
      back);

    const ship = { recipientName: "[fixture] 받는 분", recipientPhone: "010-0000-0000", postalCode: "00000", address1: "[fixture] 주소", address2: null, jibunAddress: null, deliveryMemo: null };
    const notSale = await createPendingPrintOrder(a, back, ship, 0);
    const rowsAfterNotSale = await prisma.productOrder.count({ where: { userId: a } });
    check("⑧ 금액 없음(장당 0원) = 주문 거절 · 주문 행 0", !notSale.ok && rowsAfterNotSale === 0, notSale);
    const hidden = await Promise.all([
      createPendingProductOrder(a, "book", ship, "bank_transfer"),
      createPendingProductOrder(a, "charm", ship, "card"),
      createPendingProductOrder(a, "poster", ship, "card"),
      createPendingProductOrder(a, PRINT_PRODUCT_ID, ship, "card"),
    ]);
    check("⑩ 숨긴 상품(책 무통장·씨앗·판매 종료 포스터) · 인쇄본(인쇄본 화면 경로만) 일반 주문 경로 거절 · 주문 행 0",
      hidden.every((r) => !r.ok) && (await prisma.productOrder.count({ where: { userId: a } })) === 0, hidden);

    const noShip = await createPendingPrintOrder(a, back, { ...ship, address1: " " });
    const tooDear = await createPendingPrintOrder(a, back, ship, PRINT_MAX_TOTAL_KRW); // 장당 금액이 최고가를 넘게 — 판매 안 함
    // 화면이 보낸 값엔 지도에 없는 키를 섞음 — 서버는 지금 지도 키만 씀
    const opts: PrintOptions = { excluded: [printKey.story(st1.episodeId), "pe:cxxxxxxxxxxxxxxxxxxxxxxxxx"], showPeopleEdges: true, showPlaceEdges: true, initials: false };
    const ok = await createPendingPrintOrder(a, opts, ship);
    const order = ok.ok ? await prisma.productOrder.findUnique({ where: { id: ok.order.orderId } }) : null;
    const snap = order?.printSnapshot as unknown as PrintSnapshot | null;
    const recompute = layoutPrint(await getMyLifeData(a), "[fixture] 인쇄", sanitizePrintOptions(opts, liveKeys(await getMyLifeData(a))));
    const price = printPrice(recompute.pageCount)!;
    check("⑧ 배송지 없음·최고가 넘는 금액 = 거절(행 0)", !noShip.ok && !tooDear.ok && rowsAfterNotSale === 0, { noShip, tooDear });
    check("⑧ 주문 = 서버가 다시 센 장수 × 장당 8,000원 · 배송 0 · 화면 금액(printPrice)과 같음 · 결제창 상품명에 장수 · 상품 mylife-print · 카드·대기 · 테스트 결제(실결제 꺼짐) · 스냅샷 = 그 배치 · 지도에 없는 키는 버림",
      ok.ok && !!order && order.productId === PRINT_PRODUCT_ID && order.optionId === null && order.unitKrw === 8_000 && order.quantity === recompute.pageCount &&
        order.totalKrw === recompute.pageCount * 8_000 && order.totalKrw === price.totalKrw && ok.order.totalKrw === price.totalKrw && ok.order.orderName === `My Life 인쇄본 (${recompute.pageCount}장)` &&
        order.shippingKrw === 0 && order.paymentMethod === "card" && order.status === "pending" && order.paymentLive === false && PRINT_PAYMENT_LIVE_ENABLED === false &&
        !!snap && snap.layout.pageCount === recompute.pageCount && JSON.stringify(snap.options.excluded) === JSON.stringify([printKey.story(st1.episodeId)]) &&
        !JSON.stringify(snap.layout).includes("[fixture] 운동회") && JSON.stringify(snap.layout).includes("[fixture] 첫 월급") && snap.owner === "[fixture] 인쇄",
      { ok, order: order && { optionId: order.optionId, unit: order.unitKrw, qty: order.quantity, total: order.totalKrw }, pages: recompute.pageCount });
    // ⑪ 결제 수단 미선택 연타(2026-11-09) — [결제하기]를 여러 번(동시에도) 눌러도 미결제 대기 주문은 하나(같은 번호 다시 씀),
    //    배송지 등은 마지막 값. 화면은 위젯 거절을 "주문 실패"가 아니라 결제 수단 안내로, 창 닫기는 안내 없음.
    const taps = await Promise.all([1, 2, 3].map((k) => createPendingPrintOrder(a, opts, { ...ship, deliveryMemo: `[fixture] 연타 ${k}` })));
    const again = await createPendingPrintOrder(a, opts, { ...ship, recipientName: "[fixture] 마지막 받는 분" });
    const pendings = await prisma.productOrder.findMany({ where: { userId: a, productId: PRINT_PRODUCT_ID, status: "pending" }, select: { id: true, recipientName: true } });
    const ids = new Set([ok, ...taps, again].map((r) => (r.ok ? r.order.orderId : "x")));
    const editor11 = read("app/my-life/print/PrintEditor.tsx");
    check("⑪ 결제 수단 미선택 연타 — 대기 주문 1건(같은 주문 번호 다시 씀 · 동시에 눌러도) · 배송지 = 마지막 값 · 화면 = 결제 수단 안내(주문 실패 아님)·창 닫기 안내 없음",
      pendings.length === 1 && ids.size === 1 && !ids.has("x") && pendings[0].recipientName === "[fixture] 마지막 받는 분" &&
        editor11.includes(`setError(code === "USER_CANCEL" ? null : T.pickMethod);`) && read("lib/print-copy.ts").includes("pickMethod:"),
      { pendings, ids: [...ids] });
    // ⑫ 토큰 충전 비공개 — 화면을 거치지 않은 요청도 주문 0
    const topupRefused = await createPendingOrder(a, "starter").then(() => false, () => true);
    check("⑫ 토큰 충전 비공개 — 충전 주문 서버 거절 · 충전 주문 행 0", !TOPUP_OPEN && topupRefused && (await prisma.tokenOrder.count({ where: { userId: a } })) === 0);
    const mapAfter = JSON.stringify(await getMyLifeData(a));
    check("⑧ 편집 저장·주문 뒤에도 실제 지도 그대로(getMyLifeData 같음)", mapBefore === mapAfter);
  } finally {
    await removeFixtures();
  }
  check("⑧ 픽스처 정리 — 탈퇴 경로로 편집 상태·대기 주문 함께 삭제", (await prisma.printDraft.count({ where: { user: { email: { in: [EMAIL, EMAIL_B] } } } })) === 0 && (await prisma.user.count({ where: { email: { in: [EMAIL, EMAIL_B] } } })) === 0);

  // ⑨ 화면·결제 소스
  const success = read("app/shop/order/success/page.tsx");
  const toss = read("lib/tokens/toss.ts");
  const editor = read("app/my-life/print/PrintEditor.tsx");
  check("⑨ 성공 화면 — 인쇄 주문만 결제위젯 시크릿 키로 확인(서버가 주문 상품을 보고 정함) · 위젯은 금액 먼저·결제수단·약관",
    success.includes("widget: kind === PRINT_PRODUCT_ID") && toss.includes("TOSS_WIDGET_SECRET_KEY") && editor.includes("setAmount") && editor.includes("renderPaymentMethods") && editor.includes("renderAgreement") && editor.includes("requestPayment"));
  check("⑨ 인쇄 주문 화면에 주문 제작 청약철회 제한 문구 없음(법률 검토 필요 — 성민 2026-11-08)", !/청약철회|제17조/.test(editor));
  check("⑨ 숨긴 상품(orderable false) 상세 404 · 인쇄 상품 주문 화면 → /my-life/print · 문구 확정(2026-11-10 — [임시] 표시 없음)",
    /orderable === false\) notFound\(\)/.test(read("app/shop/[productId]/page.tsx")) && read("app/shop/[productId]/order/page.tsx").includes('redirect("/my-life/print")') &&
      !read("lib/print-copy.ts").includes("[임시") && !read("lib/commerce/products.ts").includes("[임시"));

  // ⑫ 토큰 충전 비공개 — 화면·문구
  const billingLinkFiles = ["app/account/tokens/page.tsx", "app/account/delete/page.tsx", "app/components/VoiceTextarea.tsx", "app/life-timeline/free-record/FreeRecordClient.tsx",
    "app/memory/[eventId]/AnswerForm.tsx", "app/timemachine/[year]/[month]/AssistantPanel.tsx", "components/InsufficientBalanceCard.tsx"];
  const faq = read("app/help/HelpFaq.tsx");
  check("⑫ 충전 화면 = 안내(주소로 와도) · 충전 진입 버튼·충전 권유는 TOPUP_OPEN 일 때만 · 고객센터 충전·\"환불이 어렵습니다\" 문항 숨김 · 투어·서버 부족 안내에 충전 말 없음 · 차감 코드는 그대로",
    read("app/billing/page.tsx").includes("if (!TOPUP_OPEN) {") && billingLinkFiles.every((f) => read(f).includes("TOPUP_OPEN")) &&
      faq.includes("filter((qa) => TOPUP_OPEN || !qa.topup)") && (faq.match(/topup: true,/g) ?? []).length === 2 &&
      /충전한 토큰은 환불이 어렵습니다[^\n]*\n\s*topup: true/.test(faq) && read("lib/tours.ts").includes("(TOPUP_OPEN ?") &&
      ["app/api/clova-stt/charge/route.ts", "app/api/companion/route.ts", "app/api/memory/[memoryId]/refine/route.ts", "app/api/refine-text/route.ts"].every((f) => read(f).includes("lowBalanceTail(") && !/"토큰이 부족해요\. 충전/.test(read(f))) &&
      !read("lib/tokens/charge.ts").includes("TOPUP_OPEN") && !read("lib/tokens/wallet.ts").includes("TOPUP_OPEN"));
  check("⑫ 상점 공개 상품 = My Life 인쇄본 하나", JSON.stringify(PRODUCTS.filter((p) => p.orderable !== false).map((p) => p.id)) === JSON.stringify(["mylife-print"]));

  // ⑩ 강물 포스터 판매 종료
  const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
  check("⑩ 포스터 — 상품 숨김(목록·상세·주문 없음) · 그리기 코드·맞춤 배경·포스터 주문 모듈 없음 · 옛 /poster 주소 → /my-life/print",
    getProduct("poster")?.orderable === false && !exists("app/poster") && !exists("lib/poster") && !exists("app/api/poster") && !exists("lib/commerce/poster-orders.ts") &&
      !exists("public/poster/river-bg.png") && read("next.config.ts").includes('{ source: "/poster/:path*", destination: "/my-life/print", permanent: false }'));
  check("⑩ 보존 주문 그림 — 2건만(다른 주문 = 그림 없음, Storage 호출 0) · 관리자 발주·주인 주문 상세가 보여 줌",
    (await keptPosterImages("cxxxxxxxxxxxxxxxxxxxxxxxx")) === null && read("app/admin/orders/[orderId]/page.tsx").includes("await keptPosterImages(order.id)") &&
      read("app/account/orders/[orderId]/page.tsx").includes("await keptPosterImages(order.id)"));

  console.log(failed ? `\nFAIL ${failed} / ${count}` : `\nALL PASS (${count})`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
