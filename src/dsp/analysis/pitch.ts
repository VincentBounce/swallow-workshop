/**
 * YIN fundamental frequency estimator (de Cheveigné & Kawahara 2002),
 * cumulative-mean-normalised difference with parabolic refinement.
 */
export function yin(frame: ArrayLike<number>, fs: number, fmin = 50, fmax = 800, threshold = 0.15): { f0: number; confidence: number } {
  const n = frame.length;
  const maxLag = Math.min(Math.floor(fs / fmin), Math.floor(n / 2));
  const minLag = Math.max(2, Math.floor(fs / fmax));
  const d = new Float64Array(maxLag + 1);
  const w = n - maxLag;
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const diff = frame[i] - frame[i + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  let run = 0;
  const cm = new Float64Array(maxLag + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    cm[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let best = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cm[tau] < threshold) {
      while (tau + 1 <= maxLag && cm[tau + 1] < cm[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let mv = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) if (cm[tau] < mv) { mv = cm[tau]; best = tau; }
    if (mv > 0.45) return { f0: 0, confidence: 0 };
  }
  let t = best;
  if (best > 1 && best < maxLag) {
    const a = cm[best - 1], b = cm[best], c = cm[best + 1];
    const den = a - 2 * b + c;
    if (Math.abs(den) > 1e-12) t = best + (0.5 * (a - c)) / den;
  }
  return { f0: fs / t, confidence: Math.max(0, 1 - cm[best]) };
}
