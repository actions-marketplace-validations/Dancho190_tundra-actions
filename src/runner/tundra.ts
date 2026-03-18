import * as core from "@actions/core";
import { scanProject, scanFile, groupEndpointsBy } from "@dan321/tundra-sdk"; // импортируем функции из tundra-sdk
import { RunnerResult, issuesToConclusion } from "../types";

interface TundraOptions {
  workspace: string;
  frameworks: string[];
}

export async function runTundra(
  opts: TundraOptions,
): Promise<RunnerResult | null> {
  const start = Date.now();
  core.info(`tundra-runner: scanning ${opts.workspace}`);

  try {
    const result = await scanProject(opts.workspace, {
      // Передаём фреймворки если detect их нашёл
      // Если пусто — SDK сам определит
      frameworks: opts.frameworks.length ? (opts.frameworks as any) : undefined,
    });

    const grouped = result.endpoints.length
      ? groupEndpointsBy(result.endpoints, "file")
      : {};

    core.info(
      `tundra-runner: found ${result.endpoints.length} endpoints in ${Date.now() - start}ms`,
    );

    return {
      name: "tundra / endpoints",
      issues: [],
      conclusion: "success",
      meta: {
        filesScanned: result.stats.totalFiles,
        durationMs: Date.now() - start,
        endpointsFound: result.endpoints.length,
        grouped, // сохраняем для reporter'а
      },
    };
  } catch (err: any) {
    core.warning(`tundra-runner: failed — ${err.message}`);
    return null;
  }
}
