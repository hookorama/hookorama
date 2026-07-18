#!/usr/bin/env bun
/**
 * act-train — stacked-PR merge train.
 *
 * Walks the current gh-stack from the bottom. For each open PR:
 *   - If mergeStateStatus is CLEAN, reviewDecision is not CHANGES_REQUESTED,
 *     and there are no unresolved review threads, merge it with
 *     merge_method=merge and delete the head branch.
 *   - Otherwise, print the first dirty PR and exit with code 2.
 *
 * Usage with /act train:
 *   bun .agents/skills/act-train/scripts/train.mjs [--dry-run]
 *
 * When it exits 2, run /act pr <n> on the reported PR, then re-run.
 */
import { spawnSync } from 'node:child_process';

const DRY_RUN = process.argv.includes('--dry-run');

function sh(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  return {
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    status: result.status ?? 1,
  };
}

function gh(args) {
  const r = sh('gh', args);
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

function getRepo() {
  const raw = gh(['repo', 'view', '--json', 'owner,name']);
  const { owner, name } = JSON.parse(raw);
  return { owner: owner.login, repo: name };
}

function getStack() {
  const raw = gh(['stackx', 'view', '--json']);
  return JSON.parse(raw);
}

function prView(prNumber, fields) {
  const raw = gh(['pr', 'view', String(prNumber), '--json', ['number', ...fields].join(',')]);
  return JSON.parse(raw);
}

function isAiReviewer(login) {
  return /cubic|code[-_\s]*rabbit|amazon[-_\s]*q|qodo|chatgpt[-_\s]*codex|gemini|kilo|codeant|snyk|github-actions/i.test(
    login,
  );
}

function getUnresolvedThreadCount(owner, repo, prNumber) {
  const query = `
    query($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
              isOutdated
              comments(first: 1) { nodes { author { login } } }
            }
          }
        }
      }
    }
  `;
  const raw = gh([
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `repo=${repo}`,
    '-F',
    `pr=${prNumber}`,
  ]);
  const data = JSON.parse(raw);
  const nodes = data?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  return nodes.filter((n) => {
    if (n.isResolved || n.isOutdated) return false;
    const author = n.comments?.nodes?.[0]?.author?.login ?? '';
    return !isAiReviewer(author);
  }).length;
}

function mergePr(owner, repo, prNumber, headSha) {
  const args = [
    'api',
    `repos/${owner}/${repo}/pulls/${prNumber}/merge`,
    '-X',
    'PUT',
    '-f',
    'merge_method=merge',
    '-f',
    'delete_branch=true',
    '-f',
    `sha=${headSha}`,
  ];
  const raw = gh(args);
  const result = JSON.parse(raw);
  if (!result.merged) {
    throw new Error(`merge failed: ${result.message || raw}`);
  }
  return result;
}

function setBaseMain(owner, repo, prNumber) {
  // idempotent; harmless if already based on main
  sh('gh', ['pr', 'edit', String(prNumber), '--base', 'main', '--repo', `${owner}/${repo}`]);
}

function checkStatus(statusCheck) {
  if (statusCheck.__typename === 'CheckRun') {
    return { name: statusCheck.name, status: statusCheck.conclusion ?? statusCheck.status };
  }
  if (statusCheck.__typename === 'StatusContext') {
    return { name: statusCheck.context, status: statusCheck.state };
  }
  return { name: 'unknown', status: 'UNKNOWN' };
}

function summarizeDirty(pr, unresolvedThreads) {
  const lines = [
    `PR #${pr.number} (${pr.headRefName}) is not clean.`,
    `  mergeStateStatus: ${pr.mergeStateStatus}`,
  ];
  if (pr.reviewDecision) {
    lines.push(`  reviewDecision: ${pr.reviewDecision}`);
  }
  if (unresolvedThreads > 0) {
    lines.push(`  unresolved review threads: ${unresolvedThreads}`);
  }

  const dirty = (pr.statusCheckRollup ?? []).filter((c) => {
    const { name, status } = checkStatus(c);
    if (!status || status === 'SUCCESS' || status === 'NEUTRAL' || status === 'SKIPPED') {
      return false;
    }
    return !isAiReviewer(name);
  });

  if (dirty.length > 0) {
    lines.push('  non-passing checks:');
    for (const c of dirty) {
      const { name, status } = checkStatus(c);
      lines.push(`    - ${name}: ${status}`);
    }
  }

  lines.push('');
  lines.push(`Run /act pr ${pr.number}`);
  return lines.join('\n');
}

function run() {
  const { owner, repo } = getRepo();
  let iteration = 0;

  while (true) {
    iteration += 1;
    if (iteration > 20) {
      throw new Error('too many iterations; bailing out');
    }

    const stack = getStack();
    const openBranches = stack.branches.filter((b) => b.pr?.state === 'OPEN');
    const next = openBranches[0];

    if (!next) {
      console.warn('All stacked PRs are merged. Done.');
      return 0;
    }

    const prNumber = next.pr.number;
    console.warn(`\n==> PR #${prNumber} (${next.name})`);

    const pr = prView(prNumber, [
      'mergeStateStatus',
      'reviewDecision',
      'statusCheckRollup',
      'headRefName',
      'baseRefName',
      'headRefOid',
      'url',
      'state',
    ]);

    if (pr.state !== 'OPEN') {
      console.warn(`  state is ${pr.state}; skipping.`);
      continue;
    }

    const unresolvedThreads = getUnresolvedThreadCount(owner, repo, prNumber);

    if (
      pr.mergeStateStatus === 'CLEAN' &&
      pr.reviewDecision !== 'CHANGES_REQUESTED' &&
      unresolvedThreads === 0
    ) {
      console.warn(`  CLEAN. ${DRY_RUN ? '[dry-run] would merge' : 'Merging'}...`);

      if (DRY_RUN) {
        console.warn(
          `  [dry-run] would merge PR #${prNumber} and delete ${pr.headRefName}`,
        );
      } else {
        const result = mergePr(owner, repo, prNumber, pr.headRefOid);
        console.warn(`  merged: ${result.sha}`);
      }

      // Ensure the following PR is targeted at main now that its base branch is gone.
      const nextAfter = openBranches[1];
      if (nextAfter?.pr?.number != null) {
        setBaseMain(owner, repo, nextAfter.pr.number);
      }

      continue;
    }

    console.warn(summarizeDirty(pr, unresolvedThreads));
    return 2;
  }
}

try {
  const code = run();
  process.exit(code);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
