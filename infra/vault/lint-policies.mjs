// Static guardrail that runs before any model is called: a preview policy
// must never mention production paths or Vault's own sys/ and auth/ APIs.
import { readFileSync } from 'node:fs';

const FORBIDDEN = [/\bprod\//, /^\s*path\s+"sys\//m, /^\s*path\s+"auth\//m, /path\s+"\*"/, /path\s+"secret\/\*"/, /"sudo"/];
const policy = readFileSync(new URL('./policies/agent-preview.hcl', import.meta.url), 'utf8');

const hits = FORBIDDEN.filter((re) => re.test(policy.replace(/^\s*#.*$/gm, '')));
if (hits.length) {
  console.error(`agent-preview.hcl widens the blast radius: ${hits.map(String).join(', ')}`);
  process.exit(1);
}
console.log('agent-preview.hcl: preview-only ✔');
