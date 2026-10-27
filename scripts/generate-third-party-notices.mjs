import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const lock = JSON.parse(readFileSync('package-lock.json','utf8'));
const notices = ['Vers third-party dependency notices\n\nVers code is AGPL-3.0-only. The dependencies below retain their own licenses.\nGenerated from package-lock.json and installed production package notices.\nKeep the original package notices when distributing dependencies or builds.\n'];
const seen = new Set();
for (const [path, entry] of Object.entries(lock.packages).sort()) {
  if (!path || entry.dev || !existsSync(join(path,'package.json'))) continue;
  const pkg = JSON.parse(readFileSync(join(path,'package.json'),'utf8'));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  seen.add(id);
  notices.push(`\n${'='.repeat(72)}\n${id}\nLicense: ${pkg.license ?? entry.license ?? 'See package distribution'}\nSource: https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}\n`);
  for (const filename of readdirSync(path).filter(f => /^(LICENSE|LICENCE|COPYING|NOTICE)(\..*)?$/i.test(f))) {
    try { notices.push(`\n--- ${filename} ---\n${readFileSync(join(path,filename),'utf8')}\n`); } catch { /* Notice directories stay with the original package. */ }
  }
}
writeFileSync('THIRD_PARTY_NOTICES.txt', notices.join('\n').replace(/\r\n/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trimEnd() + '\n');
console.log(`Recorded notices for ${seen.size} production dependency versions.`);
