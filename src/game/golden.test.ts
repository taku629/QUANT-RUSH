import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fingerprint, GOLDEN_CASES, runScripted } from './fingerprint';

/**
 * Gameplay must be identical to the frozen v3 baseline (tests/golden/gameplay-v3.json).
 * Visual changes must never change any of these values. tests/golden/gameplay-v2.json is kept as
 * the historical v2.0.0-prototype record (v3 changed the rules, so it no longer matches).
 */
const golden = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/golden/gameplay-v3.json', import.meta.url)), 'utf8')) as { seed: number; vehicle: string; seconds: number; fingerprint: Record<string, unknown> }[];

describe('gameplay is unchanged vs. v3 baseline', () => {
  it('covers the same cases', () => {
    expect(golden.map((g) => [g.seed, g.vehicle, g.seconds])).toEqual(GOLDEN_CASES.map((c) => [c.seed, c.vehicle, c.seconds]));
  });
  for (const g of golden) {
    it(`seed ${g.seed} / ${g.vehicle}: market, fills, inventory, cash, PnL, hedges, ALPHA, obstacles, collisions, gates, clock, score`, () => {
      const fp = fingerprint(runScripted(g.seed, g.vehicle as never, g.seconds));
      expect(fp).toEqual(g.fingerprint);
    });
  }
});
