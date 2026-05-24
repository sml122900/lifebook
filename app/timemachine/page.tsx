import { redirect } from "next/navigation";

// 타임머신 진입점 — Phase T3 검증 범위는 2025.6 ~ 2026.5. 기본 진입은
// 가장 최근 달인 2026년 5월. (시드가 더 넓어지면 new Date() 기반으로
// 바꾼다.)
export default function TimemachineEntry() {
  redirect("/timemachine/2026/5");
}
