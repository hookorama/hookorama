#!/usr/bin/env bun
/**
 * act-train — stacked-PR merge train.
 *
 * Walks the current gh-stack from the bottom. For each open PR:
 *   - If mergeStateStatus is CLEAN, reviewDecision is not CHANGES_REQUESTED,
 *     and there are no unresolved non-AI review threads, merge it with
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

function fetchAllReviewThreads(owner, repo, prNumber) {
  const nodes = [];
  let cursor = undefined;
  let hasNext = true;
  while (hasNext) {
    const afterDecl = cursor ? '$after: String' : '';
    const afterArg = cursor ? 'after: $after' : '';
    const varDecls = `$owner: String!, $repo: String!, $pr: Int!, $n: Int!${afterDecl ? ', ' + afterDecl : ''}`;
    const query = `
      query(${varDecls}) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pr) {
            reviewThreads(first: $n${afterArg ? ', ' + afterArg : ''}) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                isResolved
                isOutdated
                comments(first: 1) { nodes { author { login } } }
              }
            }
          }
        }
      }
    `;
    const args = [
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
      '-F',
      'n=100',
    ];
    if (cursor) {
      args.push('-f', `after=${cursor}`);
    }
    const raw = gh(args);
    const data = JSON.parse(raw);
    const page = data?.data?.repository?.pullRequest?.reviewThreads;
    nodes.push(...(page?.nodes ?? []));
    hasNext = page?.pageInfo?.hasNextPage ?? false;
    cursor = page?.pageInfo?.endCursor ?? undefined;
  }
  return nodes;
}

function getBlockingThreadCount(owner, repo, prNumber) {
  const nodes = fetchAllReviewThreads(owner, repo, prNumber);
  return nodes.filter((n) => {
    if (n.isResolved) return false;
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
    `sha=${headSha}`,
  ];
  const raw = gh(args);
  const result = JSON.parse(raw);
  if (!result.merged) {
    throw new Error(`merge failed: ${result.message || raw}`);
  }
  return result;
}

function deleteHeadBranch(owner, repo, headRefName) {
  const encoded = headRefName.split('/').map(encodeURIComponent).join('/');
  gh(['api', `repos/${owner}/${repo}/git/refs/heads/${encoded}`, '-X', 'DELETE']);
}

function log(message) {
  console.log(message);
}

function setBaseMain(owner, repo, prNumber) {
  gh(['pr', 'edit', String(prNumber), '--base', 'main', '--repo', `${owner}/${repo}`]);
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

function summarizeDirty(pr, blockingThreads) {
  const lines = [
    `PR #${pr.number} (${pr.headRefName}) is not clean.`,
    `  mergeStateStatus: ${pr.mergeStateStatus}`,
  ];
  if (pr.reviewDecision) {
    lines.push(`  reviewDecision: ${pr.reviewDecision}`);
  }
  if (blockingThreads > 0) {
    lines.push(`  unresolved non-AI review threads: ${blockingThreads}`);
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
  const processedInDryRun = new Set();

  let iteration = 0;

  while (true) {
    iteration += 1;

    const stack = getStack();
    const openBranches = stack.branches.filter((b) => b.pr?.state === 'OPEN');

    if (iteration > openBranches.length + 5) {
      throw new Error('too many iterations; bailing out');
    }

    const next = DRY_RUN
      ? openBranches.find((b) => !processedInDryRun.has(b.pr.number))
      : openBranches[0];

    if (!next) {
      log('All stacked PRs are merged. Done.');
      return 0;
    }

    const prNumber = next.pr.number;
    log(`\n==> PR #${prNumber} (${next.name})`);

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
      if (DRY_RUN) {
        processedInDryRun.add(prNumber);
      }
      log(`  state is ${pr.state}; skipping.`);
      continue;
    }

    const blockingThreads = getBlockingThreadCount(owner, repo, prNumber);

    if (
      pr.mergeStateStatus === 'CLEAN' &&
      pr.reviewDecision !== 'CHANGES_REQUESTED' &&
      blockingThreads === 0
    ) {
      if (DRY_RUN) {
        processedInDryRun.add(prNumber);
        log(`  [dry-run] would merge PR #${prNumber} and delete ${pr.headRefName}`);
      } else {
        const result = mergePr(owner, repo, prNumber, pr.headRefOid);
        log(`  merged: ${result.sha}`);
        try {
          deleteHeadBranch(owner, repo, pr.headRefName);
          log(`  deleted branch: ${pr.headRefName}`);
        } catch (err) {
          log(
            `  warning: failed to delete branch ${pr.headRefName}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (!DRY_RUN) {
        const index = openBranches.indexOf(next);
        const nextAfter = openBranches[index + 1];
        if (nextAfter?.pr?.number != null) {
          setBaseMain(owner, repo, nextAfter.pr.number);
        }
      }

      continue;
    }

    log(summarizeDirty(pr, blockingThreads));
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
