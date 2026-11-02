// Mints a token shaped exactly like a Vercel OIDC token, signed by a local key.
// Lets you run the blast-radius suite against a local Vault with no Vercel account.
// usage: node mint-token.mjs <key.pem> <team> <project> <environment>
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [keyPath, team, project, environment] = process.argv.slice(2);
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const header = b64({ typ: 'JWT', alg: 'RS256', kid: 'local' });
const claims = b64({
  iss: `https://oidc.vercel.com/${team}`,
  aud: `https://vercel.com/${team}`,
  sub: `owner:${team}:project:${project}:environment:${environment}`,
  iat: now, nbf: now, exp: now + 3600,
  owner: team, owner_id: 'team_local', project, project_id: 'prj_local', environment,
});
const sig = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(readFileSync(keyPath)).toString('base64url');
process.stdout.write(`${header}.${claims}.${sig}`);
