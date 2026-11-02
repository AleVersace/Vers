# Dependency security review

Run `npm run security:audit` after `npm ci`. CI uses the same command. It runs
`npm audit --json` and fails on any unresolved advisory at any severity, malformed
report or registry error. `npm audit --audit-level=low` remains useful for the
unfiltered upstream report.

## Updates on 2 November 2026

- Pin transitive `glob` to 14.0.3, which includes the fix for
  [GHSA-3g3m-2fjr-6pw4](https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4).
- Pin modern `minimatch` (requested major 9 or later) to 11.0.4, including the fix
  for [GHSA-g3hv-75wg-m249](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
- Preserve ESLint's legacy `minimatch` 3 API. Replacing its callable CommonJS
  export with the modern object export would break existing lint plugins.

## Narrow, temporary false-positive review

The npm advisory range `<11.0.1` also reports `minimatch` 3.1.5 and its dependent
lint tools. The maintainer's advisory describes amplification in
`firstPhasePreProcess()` with `optimizationLevel >= 2`. Inspection of the actual
3.1.5 implementation shows that it has neither that method nor that optimization
pass: `globParts` is produced by splitting each brace-expanded pattern once.
This is our applicability assessment, not a claim that upstream withdrew the
advisory or that the package is immune to other vulnerabilities.

The audit wrapper recognizes only that advisory, only for development-only
`minimatch` **3.1.5**, and only if the installed `minimatch.js` matches the reviewed
SHA-256 `746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d`.
All other advisories, versions, changed source files and production dependencies
remain blocking. Inherited findings are assessed through their direct advisory.
This exception expires on **2 December 2026** and must then be removed or reviewed
again. Tests cover these boundaries and the actual installed legacy parser.

Remove the override and exception when upstream dependencies adopt fixed,
compatible packages. Do not use `npm audit fix --force` to downgrade or replace
ESLint merely to clear the report.
