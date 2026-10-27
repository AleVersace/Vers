import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, rmSync, readFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { repositoryPrivacyViolations, redactRepositoryPath } from './repository-privacy.mjs';
const files = [...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const violations = [];
const staging = mkdtempSync(join(tmpdir(),'vers-security-'));
try {
  for (const file of files) {
    const displayPath = redactRepositoryPath(file);
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isFile()) { violations.push(`${displayPath}: not a regular file`); continue; }
    for (const reason of repositoryPrivacyViolations(file, readFileSync(file, 'utf8'))) {
      violations.push(`${displayPath}: ${reason}`);
    }
    const dest = join(staging,file); mkdirSync(dirname(dest),{recursive:true}); cpSync(file,dest);
  }
  if (violations.length) { console.error([...new Set(violations)].join('\n')); process.exitCode=1; }
  const binary = process.env.GITLEAKS_BINARY || 'gitleaks';
  const scan = spawnSync(binary,['dir',staging,'--redact','--no-banner'],{stdio:'inherit'});
  if (scan.error) { console.error('Install gitleaks or set GITLEAKS_BINARY to its executable path.'); process.exitCode=1; }
  else if (scan.status !== 0) process.exitCode=1;
  if (!process.exitCode) console.log(`Security checks passed for ${files.length} distributable files.`);
} finally { rmSync(staging,{recursive:true,force:true}); }
