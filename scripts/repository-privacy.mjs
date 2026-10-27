const forbiddenFilename = /(^|\/)(\.env(?!\.example$)(?:\.|$)|credentials(?:\/|\.json$)|secrets\/|backups\/|service[-_]account[^/]*\.json$|[^/]*firebase-adminsdk[^/]*\.json$|id_(?:rsa|ed25519)|(?:backup|dump)[^/]*\.sql$)|\.(?:pem|key|p12|pfx|jks|dump|bundle|backup|sqlite\d?)$/i;
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const exampleDomains = new Set(['example.test', 'example.com', 'example.net', 'example.org', 'example.invalid']);
const personalHomePath = /(?:\/(?:Users|home)\/[^/\s"'<>]+\/|[a-z]:[\\/]+Users[\\/]+[^\\/\r\n"'<>]+[\\/])/i;
const deploymentHostname = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app\b/i;

function firstPartyEmailContent(file, content) {
  // Preserve required upstream attribution. Gitleaks still scans these files.
  if (file === 'LICENSE' || file === 'THIRD_PARTY_NOTICES.txt') return '';
  if (file === 'package-lock.json') {
    try {
      const lock = JSON.parse(content);
      // npm copies upstream deprecation notices verbatim, sometimes with a
      // maintainer's public contact. Do not exempt the rest of the lockfile.
      for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
        if (path.startsWith('node_modules/') && metadata && typeof metadata === 'object') {
          delete metadata.deprecated;
        }
      }
      return JSON.stringify(lock);
    } catch {
      // A malformed lockfile must not suppress the original content scan.
    }
  }
  return content;
}

export function repositoryPrivacyViolations(file, content) {
  const violations = [];
  if (forbiddenFilename.test(file)) violations.push('credential or backup filename');
  if (personalHomePath.test(file) || personalHomePath.test(content)) violations.push('personal home-directory path');
  if (deploymentHostname.test(file) || deploymentHostname.test(content)) violations.push('installation deployment hostname');
  const emailContent = `${file}\n${firstPartyEmailContent(file, content)}`.replaceAll('\\.', '.');
  for (const email of emailContent.match(emailPattern) ?? []) {
    const domain = email.slice(email.indexOf('@') + 1).toLowerCase();
    if (!exampleDomains.has(domain)) violations.push('non-example email address');
  }
  // Diagnostics deliberately contain categories, never the matching private value.
  return [...new Set(violations)];
}

export function redactRepositoryPath(file) {
  return file.replace(emailPattern, '[redacted-email]').replace(personalHomePath, '[redacted-home]/')
    .replace(new RegExp(deploymentHostname.source, 'gi'), '[redacted-host]');
}
