/** Nelder-Mead simplex minimisation (unconstrained; clamp inside f if needed). */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  step: number[],
  maxIter = 400,
  tol = 1e-6,
): { x: number[]; fx: number; iters: number } {
  const n = x0.length;
  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += step[i];
    simplex.push(p);
  }
  let values = simplex.map(f);
  let iter = 0;
  for (; iter < maxIter; iter++) {
    const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < tol) break;
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const refl = centroid.map((c, j) => c + (c - worst[j]));
    const fr = f(refl);
    if (fr < values[0]) {
      const exp = centroid.map((c, j) => c + 2 * (c - worst[j]));
      const fe = f(exp);
      if (fe < fr) { simplex[n] = exp; values[n] = fe; } else { simplex[n] = refl; values[n] = fr; }
    } else if (fr < values[n - 1]) {
      simplex[n] = refl; values[n] = fr;
    } else {
      const contr = centroid.map((c, j) => c + 0.5 * (worst[j] - c));
      const fc = f(contr);
      if (fc < values[n]) { simplex[n] = contr; values[n] = fc; } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (values[i] < values[best]) best = i;
  return { x: simplex[best], fx: values[best], iters: iter };
}
