// Asks a live deployment what Vault lets it reach, and fails if it can reach
// anything outside its own environment. No model calls and no secrets: on Vercel
// CI the request to our own deployment carries a Vercel CI OIDC token in the
// x-vercel-trusted-oidc-idp-token header (tag ci:oidc:deployments), and the
// deployment logs in to Vault with its own OIDC token.
// See https://vercel.com/docs/ci/configuration (Testing against your deployments).
//
// Locally: node scripts/verify-radius.mjs https://pgd-vercel-ci.vercel.app
const PKG = '@pgd-vercel-ci/agent';

const base = process.argv[2] ?? deploymentUrl();
const identity = await getJson('/api/identity');
const probes = await getJson('/api/radius');

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

// Don't follow redirects: Deployment Protection answers a rejected caller with a
// redirect to the Vercel login page, and we want to report that, not parse it.
async function getJson(path) {
  const res = await fetch(`${base}${path}`, { redirect: 'manual' });
  const type = res.headers.get('content-type') ?? '';
  if (res.ok && type.includes('application/json')) return res.json();
  const hints = ['location', 'x-vercel-error', 'x-vercel-id', 'x-vercel-protection-bypass', 'www-authenticate']
    .map((h) => [h, res.headers.get(h)])
    .filter(([, v]) => v)
    .map(([h, v]) => `  ${h}: ${h === 'location' ? v.split('?')[0] : v}`);
  fail(`GET ${path} returned ${res.status} (${type || 'no content-type'})\n${hints.join('\n')}`);
}

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
