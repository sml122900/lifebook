// Phase 8.1 baseline measurement: run the two AI calls that make up
// one full "memory" cycle (guided questions + title summarization)
// across a few representative events so we can pick a sane conversion
// constant and a sane signup grant.
//
// Run with: npx tsx db/test-memory-usage.ts

import "dotenv/config";

import {
  generateGuidedQuestionsRaw,
  summarizeAnswer,
  type MemoryEventContext,
} from "../lib/memory-chat";

const events: MemoryEventContext[] = [
  {
    title: "광화문 연가",
    description: "이문세 · 이영훈 작곡 발라드",
    year: 1987,
    category: "trigger",
    domain: "music",
    ageAtYear: 22,
  },
  {
    title: "강남스타일",
    description: "싸이 · 글로벌 신드롬",
    year: 2012,
    category: "trigger",
    domain: "music",
    ageAtYear: 47,
  },
  {
    title: "IMF 외환위기",
    description: "1997년 한국 외환위기. 대규모 구조조정과 실업 발생.",
    year: 1997,
    category: "anchor",
    domain: "economy",
    ageAtYear: 32,
  },
];

const answers = [
  "그 시절 광화문에 자주 갔어요. 친구들과 음악을 들으며 거리를 걸었던 기억이 나요.",
  "강남에 처음 가본 게 그 즈음이었어요. 인파에 놀랐던 게 떠올라요.",
  "회사에서 IMF 때 정말 힘들었어요. 많은 동료가 떠났던 게 기억나요.",
];

async function main() {
  let totalIn = 0;
  let totalOut = 0;
  const cycles: Array<{ event: string; gIn: number; gOut: number; sIn: number; sOut: number; cycleTotal: number }> = [];

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const answer = answers[i];

    // chat() inside both helpers logs [ai] usage. We re-derive the
    // numbers here by reading the model's response usage from the
    // raw chat returned by importing more, but the helpers don't
    // expose usage — re-run the underlying chat once instead.
    // Simpler: time the two calls and rely on the [ai] log lines
    // emitted to stdout. We'll just count totals via a stderr hook.

    process.stdout.write(`\n[${i + 1}/${events.length}] ${event.title}\n`);

    // generate
    const before = { in: totalIn, out: totalOut };
    const captured = await captureUsage(async () => {
      await generateGuidedQuestionsRaw(event);
      await summarizeAnswer(event, answer);
    });
    totalIn += captured.in;
    totalOut += captured.out;
    const cycleTotal = captured.in + captured.out;
    cycles.push({
      event: event.title,
      gIn: captured.gIn,
      gOut: captured.gOut,
      sIn: captured.sIn,
      sOut: captured.sOut,
      cycleTotal,
    });
    process.stdout.write(
      `  guided: in=${captured.gIn} out=${captured.gOut}\n  summary: in=${captured.sIn} out=${captured.sOut}\n  cycle total: ${cycleTotal} tokens\n`,
    );
  }

  console.log("");
  console.log("──────────── PER-CYCLE SUMMARY ────────────");
  for (const c of cycles) {
    console.log(`  ${c.event.padEnd(16)}  cycle=${c.cycleTotal}`);
  }
  const avgIn = Math.round(totalIn / events.length);
  const avgOut = Math.round(totalOut / events.length);
  const avgTotal = avgIn + avgOut;
  console.log("");
  console.log(`AVERAGE per memory cycle: in=${avgIn}  out=${avgOut}  total=${avgTotal} tokens`);
}

// Capture [ai] log lines emitted by lib/ai.ts during fn() so we can
// extract usage without modifying production code paths.
async function captureUsage(fn: () => Promise<void>): Promise<{
  in: number;
  out: number;
  gIn: number;
  gOut: number;
  sIn: number;
  sOut: number;
}> {
  const origLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (line.startsWith("[ai]")) {
      lines.push(line);
    } else {
      origLog(...args);
    }
  };
  try {
    await fn();
  } finally {
    console.log = origLog;
  }
  // Parse "[ai] model=... in=N out=N total=N"
  const parsed = lines.map((l) => {
    const inMatch = l.match(/in=(\d+)/);
    const outMatch = l.match(/out=(\d+)/);
    return {
      in: inMatch ? Number(inMatch[1]) : 0,
      out: outMatch ? Number(outMatch[1]) : 0,
    };
  });
  // First call = guided questions, second = summary
  const g = parsed[0] ?? { in: 0, out: 0 };
  const s = parsed[1] ?? { in: 0, out: 0 };
  return {
    in: g.in + s.in,
    out: g.out + s.out,
    gIn: g.in,
    gOut: g.out,
    sIn: s.in,
    sOut: s.out,
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
