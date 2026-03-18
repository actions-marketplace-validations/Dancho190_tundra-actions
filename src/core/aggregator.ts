import _ from "lodash";
import {
  Issue,
  RunnerResult,
  CheckConclusion,
  AggregatedReport,
} from "../types";

export function aggregate(results: RunnerResult[]): AggregatedReport {
  // Собираем все issues в один массив
  const allIssues: Issue[] = _.flatMap(results, (r) => r.issues);

  const totalErrors = allIssues.filter((i) => i.severity === "error").length;
  const totalWarnings = allIssues.filter(
    (i) => i.severity === "warning",
  ).length;

  return {
    allIssues,
    bySource: groupBySource(allIssues),
    byFile: groupByFile(allIssues),
    totalErrors,
    totalWarnings,
    conclusion: mergeConclusions(results.map((r) => r.conclusion)),
    runnerMetas: results.map((r) => ({ name: r.name, meta: r.meta })),
  };
}

// группировка по источнику
// { eslint: [Issue, ...], tundra: [Issue, ...] }
function groupBySource(issues: Issue[]): Record<string, Issue[]> {
  return _.groupBy(issues, "source");
}

// группировка по файлу
function groupByFile(issues: Issue[]): Record<string, Issue[]> {
  // Только issues у которых есть file
  const withFile = issues.filter((i) => !!i.file);
  return _.groupBy(withFile, "file");
}

// пайплайн падает, если хотя бы один runner вернул failure
function mergeConclusions(conclusions: CheckConclusion[]): CheckConclusion {
  if (conclusions.includes("failure")) return "failure";
  if (conclusions.includes("neutral")) return "neutral";
  return "success";
}
