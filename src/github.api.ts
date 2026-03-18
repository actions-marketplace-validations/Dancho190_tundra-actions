import * as github from "@actions/github";
import * as core from "@actions/core";

type Octokit = ReturnType<typeof github.getOctokit>;
type Context = typeof github.context;

export async function getChangedFiles(
  octokit: Octokit,
  ctx: Context,
): Promise<{ filename: string; status: string; patch?: string }[]> {
  const { data } = await octokit.rest.pulls.listFiles({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: ctx.payload.pull_request!.number,
    per_page: 100,
  });
  return data.map((f: any) => ({
    filename: f.filename,
    status: f.status,
    patch: f.patch,
  }));
}

export async function postComment(
  octokit: Octokit,
  ctx: Context,
  body: string,
): Promise<void> {
  const { owner, repo } = ctx.repo;
  const prNumber = ctx.payload.pull_request!.number;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const old = comments.find(
      (c: any) =>
        c.body?.includes("<!-- tundra-report -->") && c.user?.type === "Bot",
    );

    if (old) {
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: old.id,
      });
      core.info("Deleted previous Tundra comment");
    }
  } catch {}

  // Постим новый
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });

  core.info("✅ Posted Tundra report to PR");
}

export async function setCommitStatus(
  octokit: Octokit,
  ctx: Context,
  passed: boolean,
): Promise<void> {
  const sha = ctx.payload.pull_request?.head.sha ?? ctx.sha;

  await octokit.rest.repos.createCommitStatus({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    sha,
    state: passed ? "success" : "failure",
    context: "tundra / review",
    description: passed ? "Tundra: all checks passed" : "Tundra: issues found",
    target_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
}
