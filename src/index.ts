import * as core from "@actions/core";
import * as github from "@actions/github";

import { detectProject } from "./core/detect";
import { getDiffFiles, getAllFiles } from "./runner/listRunner";
import { runTundra } from "./runner/tundra";
import { runLint } from "./runner/lintRunner";
import { runTests } from "./runner/testRunner";
import { aggregate } from "./core/aggregator";
import { calculateScore } from "./core/scorer";
import { postAllChecks } from "./github/checks";
import { postComment, setCommitStatus } from "./github.api";
import { buildAnnotationsHTML } from "./github/annotations";
import { ActionInputs, RunnerResult } from "./types";

async function run(): Promise<void> {
  try {
    // Inputs
    const inputs: ActionInputs = {
      githubToken: core.getInput("github-token", { required: true }),
      mode: core.getInput("mode") as "diff" | "full",
      eslint: core.getInput("eslint") === "true",
      eslintConfig: core.getInput("eslint-config"),
      frameworks: core.getInput("frameworks"),
      failOnError: core.getInput("fail-on-error") === "true",
    };

    const octokit = github.getOctokit(inputs.githubToken);
    const ctx = github.context;
    const isPR = !!ctx.payload.pull_request;
    const workspace = process.env.GITHUB_WORKSPACE!;

    core.info(`Tundra | mode=${inputs.mode} pr=${isPR}`);

    // detect
    // Результат используем чтобы решить что запускать
    const projectCtx = await detectProject(workspace);

    // full → весь workspace (глубже)
    const files =
      inputs.mode === "diff" && isPR
        ? await getDiffFiles(octokit, ctx, workspace)
        : await getAllFiles(workspace);

    if (files.length === 0) {
      core.info("No relevant files found, skipping.");
      core.setOutput("passed", "true");
      core.setOutput("score", "100");
      return;
    }

    core.info(`📁 ${files.length} files to analyze`);

    // Все три runner'а запускаются одновременно
    // Каждый независим — падение одного не останавливает остальные
    const frameworks = projectCtx.frameworks.length
      ? projectCtx.frameworks
      : inputs.frameworks
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

    const [tundraResult, lintResult, testResult] = await Promise.all([
      // Tundra SDK — всегда, это главный runner
      runTundra({ workspace, frameworks }),

      // ESLint — только если есть конфиг или юзер явно включил
      inputs.eslint && (projectCtx.hasESLintConfig || !!inputs.eslintConfig)
        ? runLint(files, projectCtx.eslintConfigPath ?? inputs.eslintConfig)
        : Promise.resolve(null),

      // Tests — только если detect нашёл jest или vitest
      projectCtx.hasTests ? runTests(projectCtx) : Promise.resolve(null),
    ]);

    // Фильтруем null — runner'ы которые не запускались
    const runnerResults: RunnerResult[] = [
      tundraResult,
      lintResult,
      testResult,
    ].filter((r): r is RunnerResult => r !== null);

    core.info(
      `✅ Runners done: ${runnerResults.map((r) => r.name).join(", ")}`,
    );

    const report = aggregate(runnerResults);

    const { score, grade, gradeEmoji } = calculateScore(report);

    core.info(`📊 Score: ${score}/100 ${gradeEmoji} ${grade}`);

    await postAllChecks(octokit, ctx, runnerResults);

    if (isPR) {
      const html = buildAnnotationsHTML(report, score, gradeEmoji);
      await postComment(octokit, ctx, html);
    }

    // Используется Branch Protection для блокировки мержа
    await setCommitStatus(octokit, ctx, report.conclusion === "success");

    // Step Summary
    const summaryHtml = buildAnnotationsHTML(report, score, gradeEmoji);
    await core.summary.addRaw(summaryHtml).write();

    // output
    // Доступны в следующих шагах workflow через steps.tundra.outputs.*
    core.setOutput(
      "endpoints-count",
      String(tundraResult?.meta.endpointsFound ?? 0),
    );
    core.setOutput(
      "issues-count",
      String(report.totalErrors + report.totalWarnings),
    );
    core.setOutput("passed", String(report.conclusion === "success"));
    core.setOutput("score", String(score));

    // Логируем итог
    core.info(
      [
        `\n🌲 Tundra done`,
        `   endpoints : ${tundraResult?.meta.endpointsFound ?? 0}`,
        `   errors    : ${report.totalErrors}`,
        `   warnings  : ${report.totalWarnings}`,
        `   score     : ${score}/100 ${gradeEmoji}`,
        `   passed    : ${report.conclusion === "success"}`,
      ].join("\n"),
    );

    // и есть реальные errors (не warnings)
    if (inputs.failOnError && report.conclusion === "failure") {
      core.setFailed(
        `Tundra: ${report.totalErrors} error(s) · score ${score}/100`,
      );
    }
  } catch (err: any) {
    core.setFailed(`Tundra failed: ${err.message}`);
    core.debug(err.stack ?? "no stack trace");
  }
}

run();
