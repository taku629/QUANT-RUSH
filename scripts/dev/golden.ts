/** Write the gameplay golden file (run ONLY on the baseline you want to freeze). */
import { writeFileSync } from 'node:fs';
import { fingerprint, GOLDEN_CASES, runScripted } from '../../src/game/fingerprint';
const out = GOLDEN_CASES.map((c) => ({ ...c, fingerprint: fingerprint(runScripted(c.seed, c.vehicle, c.seconds)) }));
writeFileSync(process.argv[2] ?? 'tests/golden/gameplay-v3.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.map((o) => o.fingerprint), null, 1));
