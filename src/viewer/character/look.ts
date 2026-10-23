// Turns a look (presets and sliders) into weights for the character's shape
// targets. A signed weight on a slider target picks its "-" or "+" side.
import type { Appearance, SliderKey } from '../../../shared/appearance.ts';

type W = Record<string, number>;

// Face shape presets: MakeHuman head shapes, with a little jaw and chin to match.
const SHAPE: W[] = [
  { shape_oval: 0.7 },
  { shape_round: 0.7, headFat: 0.25, chinP: -0.2 },
  { shape_square: 0.75, jaw: 0.4, chinW: 0.3 },
  { shape_rectangular: 0.7, chinH: 0.3 },
  { shape_invertedtriangular: 0.65, cheekB: 0.3, chinW: -0.3 },
  { shape_diamond: 0.6, cheekB: 0.5, jaw: 0.25 },
  { shape_triangular: 0.6, jaw: 0.3 },
];
const EYE: W[] = [
  { eyeOpen: 0.5, eyeFold: 0.2 },
  { eyeOpen: 0.1, eyeOut: 0.15 },
  { eyeOpen: -0.45, eyeFold: -0.1 },
  { eyeFold: -0.8, eyeOpen: -0.15 },
  { eyeOpen: 0.7, eyeS: 0.3 },
  { eyeOut: 0.65, eyeIn: -0.2 },
];
const NOSE: W[] = [
  {},
  { noseL: -0.5, noseUp: 0.6, noseTip: 0.2, noseP: -0.3 },
  { noseW: 0.7, nostril: 0.6, noseFlare: 0.5, noseTip: 0.4 },
  { noseL: 0.6, noseP: 0.3, noseUp: -0.3 },
  { noseHump: 0.8, noseCurve: 0.5, noseL: 0.3, noseP: 0.3 },
  { noseW: -0.5, noseL: -0.4, noseP: -0.4, noseVol: -0.4 },
];
const MOUTH: W[] = [
  {},
  { lipU: 0.7, lipL: 0.7 },
  { lipU: -0.6, lipL: -0.6 },
  { mouthW: 0.7 },
  { mouthW: -0.6, lipL: 0.2 },
];
// Expressions: calm, focused, smiley, fierce, cheeky, determined.
const FACE: W[] = [
  { smile: 0.15 },
  { browA: -0.4, eyeOpen: -0.25 },
  { smile: 0.85, eyeOpen: -0.2, cheekV: 0.25, dimple: 0.5 },
  { browA: -0.9, browY: -0.4, smile: -0.4, eyeOpen: -0.2 },
  { smile: 0.5, browA: 0.4 },
  { browA: -0.5, smile: -0.45, eyeOpen: -0.1 },
];
// Heritage: blends of the African and Asian macro shapes over the European base.
const HERITAGE: [number, number][] = [[0, 0], [1, 0], [0, 1], [0.2, 0.35], [0.22, 0.18], [0.5, 0.25]];

// Slider → target weights at full travel (±1).
const SLIDE: Record<SliderKey, W> = {
  headW: { headW: 0.8 },
  jaw: { jaw: 1 },
  chinL: { chinH: 1 },
  chinP: { chinP: 1 },
  chinW: { chinW: 1 },
  cheekB: { cheekB: 1 },
  cheekV: { cheekV: 1 },
  eyeSize: { eyeS: 0.8 },
  eyeSep: { eyeX: 0.8 },
  eyeY: { eyeY: 0.8 },
  eyeTilt: { eyeOut: 1, eyeIn: -0.5 },
  eyeOpen: { eyeOpen: 0.9 },
  eyeFold: { eyeFold: 1 },
  browH: { browY: 0.9 },
  browA: { browA: 0.9 },
  noseW: { noseW: 1 },
  noseL: { noseL: 1 },
  noseP: { noseP: 1 },
  noseHump: { noseHump: 1 },
  noseTip: { noseTip: 1 },
  noseUp: { noseUp: 1 },
  mouthW: { mouthW: 1 },
  lipU: { lipU: 1 },
  lipL: { lipL: 1 },
  earS: { earS: 0.8 },
  earOut: { earOut: 1 },
  neckW: { neckW: 1 },
  muscle: {},
  mass: {},
};

/** Target weights for a look: slider targets signed, single targets 0..1. */
export function morphWeights(a: Appearance): W {
  const w: W = {};
  const put = (m: W, k = 1) => {
    for (const [t, v] of Object.entries(m)) w[t] = (w[t] ?? 0) + v * k;
  };
  put(SHAPE[a.faceShape] ?? SHAPE[0]);
  put(EYE[a.eyes] ?? EYE[1]);
  put(NOSE[a.nose] ?? NOSE[0]);
  put(MOUTH[a.mouth] ?? MOUTH[0]);
  put(FACE[a.face] ?? FACE[0]);
  for (const k of Object.keys(SLIDE) as SliderKey[]) put(SLIDE[k], ((a[k] ?? 10) - 10) / 10);
  // A footballer's neck is a little thicker than average.
  put({ neckW: 0.35 });
  const [af, as] = HERITAGE[a.heritage] ?? HERITAGE[0];
  w.african = af;
  w.asian = as;
  // Build: muscle and weight, with athletes leaning muscular.
  const mu = ((a.muscle ?? 13) - 10) / 10;
  const ma = ((a.mass ?? 10) - 10) / 10;
  if (mu > 0) w.musclePlus = mu;
  else w.muscleMinus = -mu;
  if (ma > 0) w.weightPlus = ma * 0.8;
  else w.weightMinus = -ma * 0.8;
  return w;
}
