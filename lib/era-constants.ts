// era_event 본인 회상(content) 길이 상한 — prisma 의존 없는 순수 상수.
// lib/era-stash(서버) 와 EraMemoryEditor(클라) 가 공유한다. "use server"
// 파일은 number 를 export 할 수 없고, lib/era-stash 는 prisma 를 끌어와
// 클라에서 못 쓰므로 이 순수 모듈이 단일 진실 원천 (place-types.ts 패턴).
export const ERA_MEMORY_MAX_LENGTH = 500;
