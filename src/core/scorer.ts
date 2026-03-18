import { AggregatedReport } from "../types";

export type Grade = "A" | "B" | "C" | "D";

export interface ScoreResult {
  score: number;
  grade: Grade;
  gradeEmoji: string;
  trend?: string;
  breakdown: {
    base: number;
    errorPenalty: number;
    warnPenalty: number;
    covPenalty: number;
  };
}

const ERROR_PENALTY = 10;
const WARNING_PENALTY = 3;
const COV_PENALTY = 10;
const COV_THRESHOLD = 80;

export function calculateScore(
  report: AggregatedReport,
  prevScore?: number, // предыдущий score для тренда
): ScoreResult {
  const errorPenalty = report.totalErrors * ERROR_PENALTY;
  const warnPenalty = report.totalWarnings * WARNING_PENALTY;

  // Coverage penalty — берём из test-runner meta если есть
  const coverage = getCoverage(report);
  const covPenalty =
    coverage !== null && coverage < COV_THRESHOLD ? COV_PENALTY : 0;

  const score = Math.max(0, 100 - errorPenalty - warnPenalty - covPenalty);
  const grade = getGrade(score);

  return {
    score,
    grade: grade.letter,
    gradeEmoji: grade.emoji,
    trend: prevScore !== undefined ? getTrend(score, prevScore) : undefined,
    breakdown: {
      base: 100,
      errorPenalty,
      warnPenalty,
      covPenalty,
    },
  };
}

// Буквенная оценка
function getGrade(score: number): { letter: Grade; emoji: string } {
  if (score >= 90) return { letter: "A", emoji: "🟢" };
  if (score >= 70) return { letter: "B", emoji: "🟡" };
  if (score >= 50) return { letter: "C", emoji: "🟠" };
  return { letter: "D", emoji: "🔴" };
}

// Тренд относительно предыдущего score
function getTrend(current: number, prev: number): string {
  const diff = current - prev;
  if (diff > 0) return `↑ +${diff}`;
  if (diff < 0) return `↓ ${diff}`;
  return "→ no change";
}

// Достаём coverage из runnerMetas
function getCoverage(report: AggregatedReport): number | null {
  const testMeta = report.runnerMetas.find((r) => r.name === "tundra / tests");
  return testMeta?.meta.coverage?.overall ?? null;
}
