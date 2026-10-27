import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function protectedBy(protection, appId) {
  return protection?.enforce_admins?.enabled === true
    && protection.required_status_checks?.strict === true
    && protection.required_status_checks.checks?.some(check => check.context === 'verify' && check.app_id === appId)
    && protection.allow_force_pushes?.enabled === false
    && protection.allow_deletions?.enabled === false;
}

/** Read-only by default. This tool never changes repository visibility. */
export async function publicationGuards(name, { api, apply = false }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(name ?? '')) {
    throw new Error('Pass an explicit OWNER/REPOSITORY target.');
  }
  const base = `repos/${name}`;
  const repo = await api('GET', base);
  if (repo.archived) throw new Error('The target repository is archived.');
  if (repo.private !== false) {
    if (apply) throw new Error('Repository is private: no settings changed. This tool cannot publish it.');
    return { repository: name, visibility: 'private', status: 'waiting_for_publication', writes: 0,
      next: 'After an explicit publication decision, run this check again; review its plan before using --apply.' };
  }
  const branchPath = `${base}/branches/${encodeURIComponent(repo.default_branch)}`;
  const head = await api('GET', branchPath);
  const runs = await api('GET', `${base}/commits/${head.commit.sha}/check-runs?per_page=100`);
  const verify = runs.check_runs?.filter(run => run.name === 'verify' && run.app?.slug === 'github-actions')
    .sort((a, b) => b.id - a.id)[0];
  if (!verify || verify.status !== 'completed' || verify.conclusion !== 'success' || !Number.isInteger(verify.app.id)) {
    throw new Error('The default branch needs a successful latest GitHub Actions verify check before configuration.');
  }
  const protection = await api('GET', `${branchPath}/protection`, undefined, true);
  if (protection && !protectedBy(protection, verify.app.id)) {
    throw new Error('Existing branch protection needs manual review; no settings were overwritten.');
  }
  const changes = [
    { method: 'PUT', path: `${base}/actions/permissions/workflow`, body: {
      default_workflow_permissions: 'read', can_approve_pull_request_reviews: false,
    } },
    { method: 'PUT', path: `${base}/actions/permissions/fork-pr-contributor-approval`, body: {
      approval_policy: 'all_external_contributors',
    } },
    { method: 'PUT', path: `${base}/private-vulnerability-reporting` },
  ];
  if (!protection) changes.unshift({ method: 'PUT', path: `${branchPath}/protection`, body: {
    required_status_checks: { strict: true, checks: [{ context: 'verify', app_id: verify.app.id }] },
    enforce_admins: true, required_pull_request_reviews: null, restrictions: null,
    allow_force_pushes: false, allow_deletions: false,
  } });
  const summary = { repository: name, visibility: 'public', branch: repo.default_branch, commit: head.commit.sha };
  if (!apply) return { ...summary, status: 'plan_only', writes: 0, changes };

  // Reject a changed target or revision before the first write.
  const currentRepo = await api('GET', base);
  const currentHead = await api('GET', branchPath);
  if (currentRepo.private !== false || currentRepo.archived || currentRepo.id !== repo.id
    || currentRepo.default_branch !== repo.default_branch || currentHead.commit.sha !== head.commit.sha) {
    throw new Error('Repository state changed during review; no settings changed. Run the check again.');
  }
  for (const change of changes) await api(change.method, change.path, change.body);
  const checked = await api('GET', `${branchPath}/protection`);
  const workflow = await api('GET', `${base}/actions/permissions/workflow`);
  const forks = await api('GET', `${base}/actions/permissions/fork-pr-contributor-approval`);
  const reporting = await api('GET', `${base}/private-vulnerability-reporting`);
  if (!protectedBy(checked, verify.app.id) || workflow.default_workflow_permissions !== 'read'
    || workflow.can_approve_pull_request_reviews !== false || forks.approval_policy !== 'all_external_contributors'
    || reporting.enabled !== true) {
    throw new Error('Some settings were not confirmed after application; inspect GitHub before continuing publication.');
  }
  return { ...summary, status: 'verified', writes: changes.length };
}

function githubApi(method, path, body, allowMissing = false) {
  const args = ['api', path, '--method', method];
  if (body !== undefined) args.push('--input', '-');
  const response = spawnSync('gh', args, { encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body) });
  let data;
  try { data = response.stdout?.trim() ? JSON.parse(response.stdout) : null; } catch { data = null; }
  if (response.error || response.status !== 0) {
    if (allowMissing && String(data?.status) === '404') return null;
    // Provider output may include private metadata; keep diagnostics bounded.
    throw new Error(`GitHub request failed: ${method} ${path}. Check gh authentication and repository permissions.`);
  }
  return data;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [name, flag, ...extra] = process.argv.slice(2);
  try {
    if (extra.length || (flag !== undefined && flag !== '--apply')) throw new Error('Usage: node scripts/publication-guards.mjs OWNER/REPO [--apply]');
    console.log(JSON.stringify(await publicationGuards(name, { api: githubApi, apply: flag === '--apply' }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
