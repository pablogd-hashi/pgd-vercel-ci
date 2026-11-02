// Asks a live deployment what Vault lets it reach, and fails if it can reach
// anything outside its own environment. No model calls and no secrets: on Vercel
// CI the request to our own deployment carries a Vercel CI OIDC token in the
// x-vercel-trusted-oidc-idp-token header (tag ci:oidc:deployments), and the
// deployment logs in to Vault with its own OIDC token.
//
// Locally: node scripts/verify-radius.mjs https://pgd-vercel-ci.vercel.app
const PKG = '@pgd-vercel-ci/agent';

const base = process.argv[2] ?? deploymentUrl();
const res = await fetch(`${base}/api/radius`);
const identity = await fetch(`${base}/api/identity`).then((r) => r.json());
if (!res.ok) fail(`GET /api/radius returned ${res.status}: ${await res.text()}`);
const probes = await res.json();

const env = identity.environment === 'production' ? 'production' : 'preview';
const tier = (target) =>
  target.startsWith('role:') || target.startsWith('sys/') ? 'never' : target.includes('prod/') ? 'production' : 'preview';

console.log(`deployment: ${base}`);
console.log(`identity:   ${identity.sub}`);
console.log(`vault role: ${identity.vault?.role ?? identity.vault?.error}\n`);

const problems = [];
for (const p of probes) {
  const expected = tier(p.target) === env;
  console.log(`${p.reachable ? 'ALLOW' : 'DENY '} ${p.status}  ${p.target}`);
  if (p.reachable && !expected) problems.push(`${p.target} is reachable from ${env}`);
  if (!p.reachable && expected && p.kind === 'secret') problems.push(`${p.target} should be reachable from ${env}`);
}
if (identity.vault?.role !== `agent-${env}`) problems.push(`expected role agent-${env}, got ${identity.vault?.role}`);

if (problems.length) fail(problems.join('\n'));
console.log(`\nblast radius OK: ${env} reaches only ${env} secrets`);

function deploymentUrl() {
  // Set by Vercel CI for tasks that depend on <package>#deployment.
  const urls = JSON.parse(process.env.VERCEL_DEPLOYMENT_URLS ?? '{}');
  if (!urls[PKG]) fail(`no deployment URL for ${PKG} in VERCEL_DEPLOYMENT_URLS; pass one as an argument`);
  return `https://${urls[PKG]}`;
}

function fail(message) {
  console.error(`\nblast radius FAILED:\n${message}`);
  process.exit(1);
}
