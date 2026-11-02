import { getVercelOidcToken } from '@vercel/oidc';

// Claims Vercel puts in every OIDC token. Vault verifies the signature;
// we only decode locally to pick the right Vault role and to label spans.
export type VercelClaims = {
  iss: string;
  sub: string; // owner:<team>:project:<project>:environment:<env>
  owner: string;
  project: string;
  environment: string; // development | preview | production | <custom>
  exp: number;
};

export type WorkloadIdentity = {
  jwt: string;
  claims: VercelClaims;
};

export async function getWorkloadIdentity(): Promise<WorkloadIdentity> {
  // Request header on Functions, VERCEL_OIDC_TOKEN(_FILE) in builds, CI and local dev.
  const jwt = await getVercelOidcToken();
  return { jwt, claims: decodeClaims(jwt) };
}

export function decodeClaims(jwt: string): VercelClaims {
  const [, payload] = jwt.split('.');
  if (!payload) throw new Error('Malformed OIDC token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}
