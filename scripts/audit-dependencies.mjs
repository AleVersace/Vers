import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const reviewedAdvisory = 'https://github.com/advisories/GHSA-g3hv-75wg-m249';
const reviewedSourceHash = '746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d';

// See docs/DEPENDENCY-SECURITY.md. No severity or advisory-wide exclusions.
export function auditFindings(report, packages, sourceHash, now = new Date()) {
  if (report?.error || report?.auditReportVersion !== 2 ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object') {
    throw new Error('Unsupported or failed npm audit response');
  }
  const entries = Object.entries(report.vulnerabilities);
  const failures = [];
  const reviewed = [];
  let directCount = 0;
  for (const [name, finding] of entries) {
    if (!Array.isArray(finding.via) || !finding.via.length ||
        !Array.isArray(finding.nodes) || !finding.nodes.length) {
      throw new Error(`Incomplete audit finding: ${name}`);
    }
    for (const via of finding.via) {
      if (typeof via === 'string') {
        if (!Object.hasOwn(report.vulnerabilities, via)) {
          throw new Error(`Unresolved audit dependency: ${via}`);
        }
        continue; // Inherited risk is evaluated at its direct advisory below.
      }
      if (!via || typeof via !== 'object' || typeof via.url !== 'string') {
        throw new Error(`Malformed advisory: ${name}`);
      }
      directCount++;
      const reviewedFalsePositive = name === 'minimatch' &&
        via.url === reviewedAdvisory && via.name === 'minimatch' &&
        now < new Date('2026-12-02T00:00:00Z') &&
        finding.nodes.every(node => {
          const pkg = packages[node];
          return /^node_modules\/(?:[^./][^/]*\/)*minimatch$/.test(node) &&
            pkg?.version === '3.1.5' && pkg.dev === true &&
            sourceHash(node) === reviewedSourceHash;
        });
      (reviewedFalsePositive ? reviewed : failures).push(`${name}: ${via.url}`);
    }
  }
  if (entries.length && !directCount) throw new Error('No direct advisories in a nonempty audit report');
  return { failures: [...new Set(failures)], reviewed: [...new Set(reviewed)] };
}

function main() {
  const audit = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (audit.error || audit.signal || ![0, 1].includes(audit.status)) {
    throw new Error('npm audit did not complete successfully');
  }
  const report = JSON.parse(audit.stdout);
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const result = auditFindings(report, lock.packages, node =>
    createHash('sha256').update(readFileSync(`${node}/minimatch.js`)).digest('hex'));
  for (const finding of result.reviewed) console.log(`Reviewed false positive (dev-only 3.1.5; expires 2026-12-02): ${finding}`);
  for (const finding of result.failures) console.error(`Unresolved vulnerability: ${finding}`);
  if (result.failures.length) process.exitCode = 1;
  else console.log('Dependency audit passed; all other advisories remain blocking.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
