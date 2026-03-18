import _ from "lodash";
import {
  Issue,
  Annotation,
  AggregatedReport,
  severityToAnnotationLevel,
} from "../types";

// Конвертирует массив issues в массив аннотаций для GitHub Checks API
export function issuesToAnnotations(issues: Issue[]): Annotation[] {
  return _.chain(issues)
    .filter((i) => !!i.file && !!i.line && i.line > 0)
    .map((i) => ({
      path: i.file!.replace(/^\//, ""),
      start_line: Math.max(1, i.line!),
      end_line: Math.max(1, i.endLine ?? i.line!),
      annotation_level: severityToAnnotationLevel(i.severity),
      message: i.message,
      title: i.title ?? i.rule ?? i.source,
      ...(i.rule
        ? { raw_details: `Rule: ${i.rule}\nSource: ${i.source}` }
        : {}),
    }))
    .uniqBy((a) => `${a.path}:${a.start_line}:${a.message}`)
    .orderBy(
      [
        (a) =>
          a.annotation_level === "failure"
            ? 0
            : a.annotation_level === "warning"
              ? 1
              : 2,
        "path",
        "start_line",
      ],
      ["asc", "asc", "asc"],
    )
    .value();
}

export function batchAnnotations(
  annotations: Annotation[],
  size = 50,
): Annotation[][] {
  const batches: Annotation[][] = [];
  for (let i = 0; i < annotations.length; i += size) {
    batches.push(annotations.slice(i, i + size));
  }
  return batches.length ? batches : [[]];
}

// ── 2. HTML блок для PR комментария ───────────────────────

export function buildAnnotationsHTML(
  report: AggregatedReport,
  score: number,
  grade: string,
): string {
  const errors = report.totalErrors;
  const warnings = report.totalWarnings;

  const errorPenalty = errors * 10;
  const warnPenalty = warnings * 3;

  // Группируем issues по файлу
  const byFile = _.groupBy(
    report.allIssues.filter((i) => !!i.file),
    "file",
  );

  // Строим карточки по файлам
  const fileCards = Object.entries(byFile)
    .map(([file, issues]) => buildFileCard(file, issues))
    .join("\n");

  // Лого SVG (треугольник + три линии)
  const logo = `<svg width="28" height="28" viewBox="0 0 200 200" fill="none">
    <path d="M100 28 L172 132 L28 132 Z" stroke="white" stroke-width="14" stroke-linejoin="round" fill="none"/>
    <line x1="28" y1="150" x2="172" y2="150" stroke="white" stroke-width="12" stroke-linecap="round"/>
    <line x1="52"  y1="166" x2="148" y2="166" stroke="white" stroke-width="9"  stroke-linecap="round"/>
  </svg>`;

  return `
<div style="background:#0a0a0a;border-radius:12px;padding:20px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;border:1px solid #1a1a1a">

  <!-- Header -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #1e1e1e">
    ${logo}
    <div>
      <div style="color:#ffffff;font-size:15px;font-weight:500;letter-spacing:-0.02em">tundra / review</div>
      <div style="color:#555555;font-size:11px;margin-top:2px">${Object.keys(byFile).length} files · ${report.allIssues.length} issues</div>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      ${errors > 0 ? `<span style="background:#1a0a0a;color:#e05555;border:1px solid #3a1a1a;border-radius:6px;padding:3px 10px;font-size:11px">${errors} error${errors > 1 ? "s" : ""}</span>` : ""}
      ${warnings > 0 ? `<span style="background:#0f0f00;color:#d4a017;border:1px solid #2a2500;border-radius:6px;padding:3px 10px;font-size:11px">${warnings} warning${warnings > 1 ? "s" : ""}</span>` : ""}
      <span style="background:#0a1a0a;color:#3ecf8e;border:1px solid #0f2f1f;border-radius:6px;padding:3px 10px;font-size:11px">Score ${score} ${grade}</span>
    </div>
  </div>

  <!-- File cards -->
  ${fileCards || `<div style="color:#555;font-size:12px;text-align:center;padding:20px 0">No issues found</div>`}

  <!-- Score breakdown -->
  <div style="border-top:1px solid #1a1a1a;padding-top:14px;display:flex;gap:10px;margin-top:16px">
    ${scoreCard("base", "100", "#ffffff", "#111111")}
    ${divider("−")}
    ${scoreCard("errors ×10", `−${errorPenalty}`, "#e05555", "#0f0707")}
    ${divider("−")}
    ${scoreCard("warnings ×3", `−${warnPenalty}`, "#d4a017", "#0c0b00")}
    ${divider("=")}
    ${scoreCard("score", `${score} ${grade}`, "#3ecf8e", "#0a1a0a")}
  </div>

</div>`;
}

// ── Карточка одного файла ──────────────────────────────────
function buildFileCard(file: string, issues: Issue[]): string {
  const rows = issues.map((issue) => buildIssueRow(issue)).join("\n");

  return `
  <div style="margin-bottom:16px">
    <div style="color:#444444;font-size:11px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect x="1" y="1" width="8" height="8" rx="1" fill="none" stroke="#444" stroke-width="1"/>
      </svg>
      ${escHtml(file)}
    </div>
    ${rows}
  </div>`;
}

// ── Одна строка issue ──────────────────────────────────────
function buildIssueRow(issue: Issue): string {
  const isError = issue.severity === "error";
  const isWarning = issue.severity === "warning";

  const bgColor = isError ? "#0f0707" : isWarning ? "#0c0b00" : "#060c0a";
  const borderColor = isError ? "#2a1010" : isWarning ? "#252000" : "#0f2520";
  const labelColor = isError ? "#e05555" : isWarning ? "#d4a017" : "#3ecf8e";
  const ruleColor = issue.source === "tundra" ? "#2a8a6a" : "#555555";

  const icon = isError ? errorIcon() : isWarning ? warningIcon() : noticeIcon();

  // Сниппет кода если есть номер строки
  const snippet = issue.line
    ? `
    <div style="background:#0a0a0a;border-radius:6px;padding:8px 10px;margin-top:8px;overflow:hidden">
      <div style="color:#555555;font-size:10px;margin-bottom:4px">${escHtml(issue.file ?? "")}:${issue.line}</div>
      <code style="color:#888888;font-size:11px;display:block">${escHtml(issue.message)}</code>
    </div>`
    : "";

  return `
    <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:8px;padding:12px 14px;margin-bottom:6px;display:flex;gap:12px;align-items:flex-start">
      <div style="flex-shrink:0;margin-top:1px">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap">
          <span style="color:${labelColor};font-size:11px;font-weight:500">${issue.severity}</span>
          ${issue.line ? `<code style="color:#888888;font-size:10px">L${issue.line}</code>` : ""}
          ${issue.rule ? `<code style="color:${ruleColor};font-size:10px">${escHtml(issue.rule)}</code>` : ""}
        </div>
        <div style="color:#d0cfc8;font-size:12px;line-height:1.5">${escHtml(issue.message)}</div>
        ${snippet}
      </div>
    </div>`;
}

// ── Score card ─────────────────────────────────────────────
function scoreCard(
  label: string,
  value: string,
  color: string,
  bg: string,
): string {
  return `
    <div style="flex:1;background:${bg};border-radius:8px;padding:10px 12px;text-align:center">
      <div style="color:#555555;font-size:10px;margin-bottom:4px">${label}</div>
      <div style="color:${color};font-size:16px;font-weight:500">${value}</div>
    </div>`;
}

function divider(char: string): string {
  return `<div style="display:flex;align-items:center;color:#333333;font-size:12px">${char}</div>`;
}

// ── SVG иконки severity ────────────────────────────────────
function errorIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" fill="#e05555" opacity="0.15"/>
    <circle cx="7" cy="7" r="5.5" stroke="#e05555" stroke-width="1" fill="none"/>
    <line x1="7" y1="4" x2="7" y2="8" stroke="#e05555" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="7" cy="10.5" r="0.8" fill="#e05555"/>
  </svg>`;
}

function warningIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 14 14">
    <path d="M7 2L13 12H1Z" fill="#d4a017" opacity="0.15"/>
    <path d="M7 2L13 12H1Z" stroke="#d4a017" stroke-width="1" fill="none"/>
    <line x1="7" y1="6" x2="7" y2="9" stroke="#d4a017" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="7" cy="11" r="0.8" fill="#d4a017"/>
  </svg>`;
}

function noticeIcon(): string {
  return `<svg width="14" height="14" viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="6" fill="#3ecf8e" opacity="0.15"/>
    <circle cx="7" cy="7" r="5.5" stroke="#3ecf8e" stroke-width="1" fill="none"/>
    <line x1="7" y1="5" x2="7" y2="9" stroke="#3ecf8e" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="7" cy="4" r="0.8" fill="#3ecf8e"/>
  </svg>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
