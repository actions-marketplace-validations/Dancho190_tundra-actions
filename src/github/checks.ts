/**
  ВАЖНО: нужен permission checks: write в workflow юзера
 Батчинг по 50 — жёсткое ограничение GitHub API
 */

import * as github from "@actions/github";
import * as core from "@actions/core";
import {
  RunnerResult,
  Annotation,
  CheckPayload,
  issueToAnnotation,
} from "../types";

type Octokit = ReturnType<typeof github.getOctokit>;
type Context = typeof github.context;

export async function postAllChecks(
  octokit: Octokit,
  ctx: Context,
  results: RunnerResult[],
): Promise<void> {
  // Параллельно — каждый чек независим
  await Promise.all(results.map((result) => postCheck(octokit, ctx, result)));
}

async function postCheck(
  octokit: Octokit,
  ctx: Context,
  result: RunnerResult,
): Promise<void> {
  const sha = ctx.payload.pull_request?.head.sha ?? ctx.sha;

  try {
    // Шаг 1 — создаём чек со статусом in_progress
    const { data: check } = await octokit.rest.checks.create({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      name: result.name,
      head_sha: sha,
      status: "in_progress",
      started_at: new Date().toISOString(),
    });

    // Шаг 2 — конвертируем issues в annotations
    const annotations: Annotation[] = result.issues
      .map(issueToAnnotation)
      .filter((a): a is Annotation => a !== null);

    // Шаг 3 — завершаем чек с результатом
    // Батчим annotations по 50 — ограничение GitHub API
    await completeCheck(
      octokit,
      ctx,
      check.id,
      buildPayload(result, annotations),
      annotations,
    );

    core.info(`✅ Check: ${result.name} → ${result.conclusion}`);
  } catch (err: any) {
    // Не роняем pipeline — warning в лог
    core.warning(`checks: failed "${result.name}" — ${err.message}`);
  }
}

async function completeCheck(
  octokit: Octokit,
  ctx: Context,
  checkId: number,
  payload: CheckPayload,
  annotations: Annotation[],
): Promise<void> {
  const BATCH = 50;

  // Первый вызов — завершаем чек + первые 50 annotations
  await octokit.rest.checks.update({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    check_run_id: checkId,
    status: "completed",
    conclusion: payload.conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: payload.name,
      summary: payload.summary,
      annotations: annotations.slice(0, BATCH),
    },
  });

  // Остальные батчи если annotations > 50
  for (let i = BATCH; i < annotations.length; i += BATCH) {
    await octokit.rest.checks.update({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      check_run_id: checkId,
      output: {
        title: payload.name,
        summary: payload.summary,
        annotations: annotations.slice(i, i + BATCH),
      },
    });
  }
}

// Строим payload для чека
function buildPayload(
  result: RunnerResult,
  annotations: Annotation[],
): CheckPayload {
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const icon = errors > 0 ? "🔴" : warnings > 0 ? "🟡" : "🟢";

  // Базовый summary
  let summary = `${icon} **${result.name}**\n\n`;
  summary += `| Metric | Value |\n|--------|-------|\n`;
  summary += `| Errors | ${errors} |\n`;
  summary += `| Warnings | ${warnings} |\n`;
  summary += `| Files scanned | ${result.meta.filesScanned} |\n`;
  summary += `| Duration | ${result.meta.durationMs}ms |\n`;

  // Дополнительные поля для test-runner
  if (result.meta.passed !== undefined) {
    summary += `| Tests passed | ${result.meta.passed} |\n`;
    summary += `| Tests failed | ${result.meta.failed} |\n`;
  }

  // Coverage если есть
  if (result.meta.coverage) {
    const cov = result.meta.coverage as any;
    summary += `| Coverage | ${cov.overall}% |\n`;
  }

  return {
    name: result.name,
    conclusion: result.conclusion,
    summary,
    annotations,
  };
}
