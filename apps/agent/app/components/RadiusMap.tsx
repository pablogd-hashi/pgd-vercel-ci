'use client';

import type { Probe } from '@pgd-vercel-ci/agent-core';

const SIZE = 440;
const C = SIZE / 2;
const INNER = 92; // reachable
const FENCE = 138; // the blast radius
const OUTER = 182; // everything Vault refuses
const PAD_X = 150; // room for labels left and right of the outer ring

export type Hit = { target: string; allowed: boolean; at: number };

// Normalise what the agent typed into the same shape as probe targets.
export const normalisePath = (p: string) => p.replace(/^\/+/, '').replace(/^secret\/(data\/)?/, '');

export function RadiusMap({ probes, hits, environment }: { probes: Probe[]; hits: Hit[]; environment: string }) {
  // Paths the agent tried that weren't in the probe set still get a node.
  const known = new Set(probes.map((p) => p.target));
  const adHoc: Probe[] = hits
    .filter((h) => !known.has(h.target))
    .filter((h, i, all) => all.findIndex((x) => x.target === h.target) === i)
    .map((h) => ({ target: h.target, kind: 'trick', reachable: h.allowed, status: h.allowed ? 200 : 403 }));
  const all = [...probes, ...adHoc];
  const inside = all.filter((p) => p.reachable);
  const outside = all.filter((p) => !p.reachable);
  const lastHit = new Map(hits.map((h) => [h.target, h.at]));
  const envColor = `var(--${environment === 'production' ? 'production' : environment === 'development' ? 'development' : 'preview'})`;

  const place = (list: Probe[], r: number, offset: number) =>
    list.map((p, i) => {
      const a = offset + (i / Math.max(list.length, 1)) * Math.PI * 2;
      return { p, x: C + r * Math.cos(a), y: C + r * Math.sin(a), a };
    });
  const nodes = [...place(inside, INNER, -Math.PI / 2), ...place(outside, OUTER, -Math.PI / 2 + 0.35)];

  return (
    <svg className="map" viewBox={`${-PAD_X} 0 ${SIZE + PAD_X * 2} ${SIZE}`} role="img" aria-label="Blast radius map">
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor={envColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={envColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={FENCE} fill="url(#glow)" />
      <circle cx={C} cy={C} r={FENCE} fill="none" stroke={envColor} strokeDasharray="4 5" strokeOpacity="0.8" />
      <circle cx={C} cy={C} r={OUTER} fill="none" stroke="var(--line)" />
      <text x={C} y={C - FENCE - 8} textAnchor="middle" style={{ fill: envColor, letterSpacing: '0.12em' }}>
        BLAST RADIUS
      </text>

      {nodes.map(({ p, x, y, a }) => {
        // Denied edges stop at the fence, with an ✕ where Vault said no.
        const fx = C + FENCE * Math.cos(a);
        const fy = C + FENCE * Math.sin(a);
        const color = p.reachable ? 'var(--allow)' : 'var(--deny)';
        const hitAt = lastHit.get(p.target);
        const label = p.kind === 'role' ? p.target : p.target.length > 30 ? p.target.slice(0, 29) + '…' : p.target;
        const right = Math.cos(a) >= 0;
        const ly = y + (Math.sin(a) > 0.3 ? 18 : Math.sin(a) < -0.3 ? -12 : 4);
        return (
          <g key={p.target}>
            {p.reachable ? (
              <line x1={C} y1={C} x2={x} y2={y} stroke={color} strokeOpacity="0.55" />
            ) : (
              <>
                <line x1={x} y1={y} x2={fx} y2={fy} stroke={color} strokeOpacity="0.5" strokeDasharray={p.kind === 'secret' ? '0' : '3 3'} />
                <text x={fx} y={fy + 4} textAnchor="middle" style={{ fill: 'var(--deny)', fontSize: 13, fontWeight: 700 }}>
                  ✕
                </text>
              </>
            )}
            {hitAt && <circle key={`r${hitAt}`} className="ring-pulse" cx={x} cy={y} r={7} fill="none" stroke={color} strokeWidth="2" />}
            <circle key={`n${hitAt ?? 0}`} className={`node ${hitAt ? 'hit' : ''}`} cx={x} cy={y} r={p.kind === 'secret' ? 6 : 4.5} fill={color}>
              <title>{`${p.target} → ${p.reachable ? 'ALLOW' : 'DENY'} (${p.status})`}</title>
            </circle>
            <text x={x + (right ? 10 : -10)} y={ly} textAnchor={right ? 'start' : 'end'}>
              {label}
            </text>
          </g>
        );
      })}

      <circle cx={C} cy={C} r={34} fill="var(--panel-2)" stroke={envColor} strokeWidth="2" />
      <text x={C} y={C - 3} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: 10, fontWeight: 600 }}>
        AGENT
      </text>
      <text x={C} y={C + 10} textAnchor="middle" style={{ fill: envColor, fontSize: 8 }}>
        {environment}
      </text>
    </svg>
  );
}
