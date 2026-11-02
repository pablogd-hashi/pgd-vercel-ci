// Does a Vercel CI task get a Vercel OIDC token? Prints claims, never the token.
const jwt = process.env.VERCEL_OIDC_TOKEN;
if (!jwt) {
  console.log('VERCEL_OIDC_TOKEN: absent', process.env.VERCEL_OIDC_TOKEN_FILE ? '(token file set)' : '');
} else {
  const { iss, sub, aud, environment, exp } = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  console.log('VERCEL_OIDC_TOKEN: present', { iss, sub, aud, environment, expiresIn: exp - Math.floor(Date.now() / 1000) });
}
