/** Best-of-rounds mean milliseconds per call of `fn`, so a loaded machine inflates a round but not the result. Budgets built on it sit at about 3x the measured time. */
export const bench = (name: string, n: number, fn: (i: number) => void, rounds = 7) => {
  for (let i = 0; i < Math.min(n, 20); i++) fn(i);
  let best = Infinity;
  for (let r = 0; r < rounds; r++) {
    const t = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    best = Math.min(best, (performance.now() - t) / n);
  }
  console.log(`bench ${name}: ${best.toFixed(4)} ms`);
  return best;
};

const calibration = () => { let s = 0; for (let i = 1; i < 20000; i++) s += Math.sin(i) * Math.sqrt(i); return s; };
const QUIET_MS = 0.2;

/** A budget in ms measured on a quiet machine, stretched by how much slower this machine currently runs a fixed reference loop. */
export const budget = (quietMs: number) => quietMs * Math.max(1, bench('calibration', 20, calibration, 9) / QUIET_MS);
