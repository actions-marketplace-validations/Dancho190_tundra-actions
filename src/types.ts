export type IssueSource =
  | "eslint" // ESLint нашёл проблему
  | "tundra" // Tundra SDK нашёл проблему
  | "security" // security check
  | "coverage"; // coverage ниже порога

export type IssueSeverity = "error" | "warning" | "notice";

export interface Issue {
  source: IssueSource;

  // Серьёзность — маппится в GitHub annotation_level
  // error   → "failure"
  // warning → "warning"
  // notice  → "notice"
  severity: IssueSeverity;

  // Локация в коде (опционально — не всегда есть)
  file?: string;
  line?: number;
  endLine?: number;
  col?: number;

  rule?: string; // "no-unused-vars", "tundra/unprotected-endpoint"
  message: string; // описание проблемы
  title?: string; // короткий заголовок для annotation
}

export interface RunnerMeta {
  filesScanned: number;
  durationMs: number;
  // Test runner поля
  passed?: number;
  failed?: number;
  skipped?: number;
  coverage?: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
    overall: number;
  };
  // Tundra runner поля
  endpointsFound?: number;
  grouped?: Record<string, any[]>;
}

export interface RunnerResult {
  name: string;

  // Все найденные проблемы
  issues: Issue[];

  // Мета-информация для summary
  meta: RunnerMeta;

  // Итоговый статус runner'ов
  conclusion: CheckConclusion;
}

// CheckPayload — что уходит в GitHub Checks API

export type CheckConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped";

export type AnnotationLevel = "notice" | "warning" | "failure";

export interface Annotation {
  path: string; // относительный путь файла
  start_line: number;
  end_line: number;
  annotation_level: AnnotationLevel;
  message: string;
  title?: string;
  raw_details?: string; // дополнительный контекст
}

export interface CheckPayload {
  name: string;
  conclusion: CheckConclusion;
  summary: string; // markdown — главный текст чека
  text?: string; // markdown — детали (опционально)
  annotations: Annotation[];
}

export interface ProjectContext {
  // ESLint
  hasESLintConfig: boolean;
  eslintConfigPath: string | null; // точный путь к конфигу

  // Tests
  hasTests: boolean;
  testRunner: "vitest" | "jest" | null;
  hasCoverage: boolean;

  // Tundra SDK установлен у юзера
  hasTundra: boolean;

  // Languages
  isTypeScript: boolean;
  isPython: boolean;
  isJava: boolean;

  // Frameworks → подсказка для tundra-runner
  frameworks: string[];

  // Env
  workspace: string;
  repoUrl: string;
  branch: string;
}

export interface ActionInputs {
  githubToken: string;
  mode: "diff" | "full";
  eslint: boolean;
  eslintConfig: string;
  frameworks: string;
  failOnError: boolean;
}

export interface AggregatedReport {
  allIssues: Issue[];
  bySource: Record<string, Issue[]>;
  byFile: Record<string, Issue[]>;
  totalErrors: number;
  totalWarnings: number;
  conclusion: CheckConclusion;
  runnerMetas: { name: string; meta: RunnerMeta }[];
}

// Утилиты
// Маппинг severity → GitHub annotation_level
export function severityToAnnotationLevel(s: IssueSeverity): AnnotationLevel {
  switch (s) {
    case "error":
      return "failure";
    case "warning":
      return "warning";
    case "notice":
      return "notice";
  }
}

// Маппинг issues[] → conclusion
export function issuesToConclusion(issues: Issue[]): CheckConclusion {
  if (issues.some((i) => i.severity === "error")) return "failure";
  return "success";
}

// Issue → Annotation (для GitHub Checks API)
export function issueToAnnotation(issue: Issue): Annotation | null {
  if (!issue.file || !issue.line) return null;

  return {
    path: issue.file,
    start_line: issue.line,
    end_line: issue.endLine ?? issue.line,
    annotation_level: severityToAnnotationLevel(issue.severity),
    message: issue.message,
    title: issue.title ?? issue.rule ?? issue.source,
  };
}
