// Does a Vercel CI task get a Vercel OIDC token? Prints claims, never the token.
import { readFileSync } from 'node:fs';

// Names only, never values: which identity hints does this environment provide?
const names = Object.keys(process.env).filter((k) => k.startsWith('VERCEL_') || k === 'CI').sort();
console.log('env names:', names.join(', ') || '(none)');

const file = process.env.VERCEL_OIDC_TOKEN_FILE;
const jwt = process.env.VERCEL_OIDC_TOKEN || (file ? readFileSync(file, 'utf8').trim() : '');
if (!jwt) {
  console.log('VERCEL_OIDC_TOKEN: absent', file ? `(token file ${file} is empty)` : '');
} else {
  const { iss, sub, aud, environment, exp } = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  console.log(`VERCEL_OIDC_TOKEN: present${file ? ' (from token file)' : ''}`, {
    iss,
    sub,
    aud,
    environment,
    expiresIn: exp - Math.floor(Date.now() / 1000),
  });
}
