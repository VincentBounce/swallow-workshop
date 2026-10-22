import type { EngineParams } from '../../dsp/engine/params';

/**
 * The controls of the voice, as a person thinks of them. Every leaf of the
 * engine parameters belongs to exactly one; a performer or a filter that
 * takes over a control locks every parameter in it.
 */
export type ControlId =
  | 'posture' // tongue, jaw, lips, larynx
  | 'velum'
  | 'teeth'
  | 'body' // size and shape of the tract, piriform fossae
  | 'nose' // nostrils, nasal cycle and leak
  | 'pitch' // F0 and vibrato
  | 'lungs' // air on/off and its pressure
  | 'glottis' // opening of the folds
  | 'quality' // fold model, voice quality, voicing
  | 'noise' // turbulence sources and the noise generator
  | 'filter' // head, tube or no filter
  | 'tube' // the drawn or measured tube
  | 'walls' // wall losses
  | 'volume';

export const CONTROL_IDS: ControlId[] = ['posture', 'velum', 'teeth', 'body', 'nose', 'pitch', 'lungs', 'glottis', 'quality', 'noise', 'filter', 'tube', 'walls', 'volume'];

const NOSE = new Set(['anatomy.nasalLeak', 'anatomy.nasalCycle', 'anatomy.nostrilLeft', 'anatomy.nostrilRight']);

/** The control a parameter (dotted path, e.g. `articulators.jaw`) belongs to. */
export function controlOf(path: string): ControlId | null {
  if (path === 'articulators.velum') return 'velum';
  if (path.startsWith('articulators.')) return 'posture';
  if (path.startsWith('teeth.')) return 'teeth';
  if (NOSE.has(path)) return 'nose';
  if (path.startsWith('anatomy.')) return 'body';
  if (path === 'source.f0' || path === 'source.vibratoRate' || path === 'source.vibratoDepth') return 'pitch';
  if (path === 'source.ps' || path === 'phonate') return 'lungs';
  if (path === 'abduction') return 'glottis';
  if (path.startsWith('source.') || path === 'voicing') return 'quality';
  if (path.startsWith('noise.')) return 'noise';
  if (path === 'tubeMode' || path === 'bypassTract') return 'filter';
  if (path === 'tubeAreas' || path === 'tubeLength') return 'tube';
  if (path === 'losses') return 'walls';
  if (path === 'volume') return 'volume';
  return null;
}

/** Every leaf path of the parameters (arrays count as one leaf). */
export function leafPaths(p: EngineParams): string[] {
  const out: string[] = [];
  const walk = (o: Record<string, unknown>, pre: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v as Record<string, unknown>, pre + k + '.');
      else out.push(pre + k);
    }
  };
  walk(p as unknown as Record<string, unknown>, '');
  return out;
}

const same = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
};

/** The controls whose parameters differ between two states. */
export function touched(before: EngineParams, after: EngineParams): Set<ControlId> {
  const out = new Set<ControlId>();
  const walk = (a: Record<string, unknown>, b: Record<string, unknown>, pre: string) => {
    for (const k of Object.keys(b)) {
      const x = a[k], y = b[k];
      if (y && typeof y === 'object' && !Array.isArray(y)) walk((x ?? {}) as Record<string, unknown>, y as Record<string, unknown>, pre + k + '.');
      else if (!same(x, y)) { const c = controlOf(pre + k); if (c) out.add(c); }
    }
  };
  walk(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, '');
  return out;
}

/** A view of a value that the compiler refuses to change, at any depth. */
export type DeepReadonly<T> = T extends (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** A copy deep enough that changing it never touches the original. */
export function cloneParams(o: DeepReadonly<EngineParams> | EngineParams): EngineParams {
  return {
    ...o,
    articulators: { ...o.articulators }, anatomy: { ...o.anatomy }, teeth: { ...o.teeth }, source: { ...o.source },
    noise: { ...o.noise, user: { ...o.noise.user, curve: o.noise.user.curve.slice() } }, tubeAreas: o.tubeAreas.slice(),
  };
}
