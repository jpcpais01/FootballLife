// Background sound, made live with the Web Audio API (no audio files to download).
// Menus get a calm, endless lo-fi loop: warm pads, an electric piano, soft bass and brushed drums
// over an eight-chord progression in D. Matches swap it for a stadium crowd that murmurs,
// swells, claps along and roars at goals. Browsers only allow sound after a tap, so it starts
// on the first one. Settings are remembered per device.

export interface SoundPrefs { music: boolean; crowd: boolean; vol: number }
type Scene = 'menu' | 'match' | 'none';

const KEY = 'fl-sound';
const DEFAULTS: SoundPrefs = { music: true, crowd: true, vol: 0.6 };

export function soundPrefs(): SoundPrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
export function setSoundPrefs(p: Partial<SoundPrefs>) {
  const next = { ...soundPrefs(), ...p };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  apply();
}

let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, crowdBus: GainNode, verbIn: GainNode, delayIn: GainNode;
let white: AudioBuffer, pink: AudioBuffer;
let scene: Scene = 'menu';
let timer = 0;

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Picks the soundscape for a page: crowd in matches, music everywhere else. */
export function setScene(s: Scene) {
  if (s === scene) return;
  scene = s;
  apply();
}

/** The crowd erupts (a goal). */
export function roar() {
  if (!ctx || scene !== 'match' || !soundPrefs().crowd) return;
  crowd?.roar();
}

/** Arms the first-tap unlock. Call once at startup. */
export function initSound() {
  const events = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
  const unlock = () => {
    if (!ctx) build();
    void ctx!.resume().then(() => {
      if (ctx!.state !== 'running') return;
      for (const e of events) window.removeEventListener(e, unlock, true);
      apply();
    });
  };
  for (const e of events) window.addEventListener(e, unlock, { capture: true, passive: true });
  // Silence in the background, pick up again on return.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
}

function build() {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC({ latencyHint: 'playback' });
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.02;
  comp.release.value = 0.4;
  comp.connect(ctx.destination);
  master = gain(0, comp);
  musicBus = gain(0, master);
  crowdBus = gain(0, master);

  // Reverb: a generated stereo hall tail, slightly darkened.
  const verb = ctx.createConvolver();
  verb.buffer = impulse(3.2);
  verbIn = gain(1, verb);
  const verbTone = ctx.createBiquadFilter();
  verbTone.type = 'lowpass';
  verbTone.frequency.value = 5200;
  verb.connect(verbTone).connect(gain(0.55, musicBus));

  // Dotted-eighth echo with a softening filter in the loop.
  const delay = ctx.createDelay(2);
  delay.delayTime.value = BEAT * 0.75;
  const fb = gain(0.32);
  const fbTone = ctx.createBiquadFilter();
  fbTone.type = 'lowpass';
  fbTone.frequency.value = 2400;
  delayIn = gain(1, delay);
  delay.connect(fbTone).connect(fb).connect(delay);
  fbTone.connect(gain(0.5, musicBus));
  fbTone.connect(gain(0.25, verbIn));

  white = noise(1, false);
  pink = noise(6, true);
}

function gain(v: number, to?: AudioNode) {
  const g = ctx!.createGain();
  g.gain.value = v;
  if (to) g.connect(to);
  return g;
}

function noise(secs: number, isPink: boolean) {
  const len = Math.floor(ctx!.sampleRate * secs);
  const buf = ctx!.createBuffer(2, len, ctx!.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (!isPink) { d[i] = w; continue; }
      // Paul Kellet's pink filter.
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // Crossfade the ends so the loop has no click.
    const f = Math.min(2048, len >> 4);
    for (let i = 0; i < f; i++) {
      const k = i / f;
      d[i] = d[i] * k + d[len - f + i] * (1 - k);
    }
  }
  return buf;
}

function impulse(secs: number) {
  const len = Math.floor(ctx!.sampleRate * secs);
  const buf = ctx!.createBuffer(2, len, ctx!.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  return buf;
}

/** Pushes the prefs and scene into the mix with smooth fades. */
function apply() {
  if (!ctx) return;
  const p = soundPrefs();
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(p.vol * p.vol * 2, t, 0.08);
  const musicOn = p.music && scene === 'menu';
  const crowdOn = p.crowd && scene === 'match';
  musicBus.gain.setTargetAtTime(musicOn ? 0.8 : 0, t, musicOn ? 1.2 : 0.5);
  crowdBus.gain.setTargetAtTime(crowdOn ? 0.6 : 0, t, crowdOn ? 0.8 : 0.4);
  if (musicOn && !timer) startMusic();
  if (!musicOn && timer) setTimeout(() => { if (!(soundPrefs().music && scene === 'menu')) stopMusic(); }, 2500);
  if (crowdOn && !crowd) crowd = startCrowd();
  if (!crowdOn && crowd) {
    const c = crowd;
    setTimeout(() => { if (crowd === c && !(soundPrefs().crowd && scene === 'match')) { c.stop(); crowd = null; } }, 2500);
  }
}

// ---------------------------------------------------------------------------
// Music: 78 bpm, eighth-note grid with a little swing, two bars per chord.

const BPM = 78;
const BEAT = 60 / BPM;
const STEP = BEAT / 2;
const SWING = 0.07 * BEAT;
const LOOKAHEAD = 0.5;

// Voicings as MIDI notes (D3 = 50). Dmaj9, Bm9, Gmaj7(#11), A6sus, Em9, F#m7, Gmaj9, Asus→A.
const CHORDS: { root: number; pad: number[]; tones: number[] }[] = [
  { root: 38, pad: [54, 57, 61, 64], tones: [62, 66, 69, 73, 76] },
  { root: 35, pad: [50, 54, 57, 61], tones: [62, 66, 69, 71, 73] },
  { root: 43, pad: [54, 59, 61, 62], tones: [62, 66, 67, 71, 73] },
  { root: 45, pad: [52, 54, 57, 62], tones: [64, 66, 69, 71, 74] },
  { root: 40, pad: [50, 54, 55, 59], tones: [62, 66, 67, 71, 74] },
  { root: 42, pad: [52, 54, 57, 61], tones: [61, 64, 66, 69, 73] },
  { root: 43, pad: [54, 57, 59, 62], tones: [62, 66, 69, 71, 74] },
  { root: 45, pad: [52, 55, 57, 62], tones: [61, 64, 66, 69, 76] },
];
const PENTA = [74, 76, 78, 81, 83, 86]; // D major pentatonic, upper octave

let step = 0;
let nextAt = 0;
let keysPattern: boolean[] = [];
let keysIdx = 2;

function startMusic() {
  step = 0;
  nextAt = ctx!.currentTime + 0.15;
  timer = window.setInterval(tick, 100);
  tick();
}
function stopMusic() {
  clearInterval(timer);
  timer = 0;
}

function tick() {
  if (!ctx || ctx.state !== 'running') return;
  // After a long pause (tab hidden), skip ahead instead of firing a burst of notes.
  if (nextAt < ctx.currentTime - 0.2) nextAt = ctx.currentTime + 0.05;
  while (nextAt < ctx.currentTime + LOOKAHEAD) {
    const t = nextAt + (step % 2 ? SWING : 0);
    playStep(step, t);
    step++;
    nextAt += STEP;
  }
}

function playStep(s: number, t: number) {
  const inChord = s % 16; // 2 bars of eighths
  const inBar = s % 8;
  const ci = Math.floor(s / 16) % CHORDS.length;
  const phrase = Math.floor(s / (16 * CHORDS.length));
  const chord = CHORDS[ci];
  const intro = phrase === 0;
  const breakdown = phrase % 4 === 3;
  const drums = !intro && !breakdown;

  if (inChord === 0) {
    pad(chord.pad, t, STEP * 16);
    keysPattern = Array.from({ length: 16 }, (_, i) => i === 0 || Math.random() < (i % 2 ? 0.22 : 0.42));
    if (ci % 2 === 0 && !intro && Math.random() < 0.7) bell(pick(PENTA), t + STEP * pick([4, 6, 8]));
  }
  // Bass: root on the bar, a pickup on the and-of-three.
  if (!(intro && s < 32)) {
    if (inBar === 0) bass(chord.root, t, BEAT * 2.6, 1);
    else if (inBar === 5 && drums && Math.random() < 0.55) bass(chord.root + pick([0, 7, 12]), t, BEAT * 1.2, 0.6);
  }
  // Electric piano: a wandering arpeggio over the chord.
  if (keysPattern[inChord] && (!intro || s % 4 === 0)) {
    keysIdx = Math.max(0, Math.min(chord.tones.length - 1, keysIdx + pick([-1, -1, 1, 1, 2, -2, 0])));
    keys(chord.tones[keysIdx], t, rand(0.5, 1) * (inChord === 0 ? 1.15 : 1));
    if (inChord === 0) keys(chord.tones[0] - 12, t + 0.012, 0.6);
  }
  if (drums) {
    if (inBar === 0 || (inBar === 5 && Math.random() < 0.45) || (inBar === 3 && Math.random() < 0.12)) kick(t);
    if (inBar === 2 || inBar === 6) snare(t);
    if (Math.random() > 0.12) hat(t, s % 2 ? 0.5 : 1);
  } else if (breakdown && s % 2 === 0) {
    hat(t, 0.45);
  }
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.setTargetAtTime(0, t + attack + hold, release / 4);
}

function pad(notes: number[], t: number, dur: number) {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 0.7;
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(rand(1200, 1700), t + dur * 0.55);
  f.frequency.linearRampToValueAtTime(650, t + dur + 3);
  const g = gain(0);
  f.connect(g);
  g.connect(musicBus);
  g.connect(gain(0.6, verbIn));
  env(g, t, 0.05, 2.2, dur - 2.2, 3);
  const end = t + dur + 4;
  for (const n of notes) {
    for (const det of [-8, 7]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(n);
      o.detune.value = det + rand(-2, 2);
      const pan = c.createStereoPanner();
      pan.pan.value = det < 0 ? -0.35 : 0.35;
      o.connect(pan).connect(f);
      o.start(t);
      o.stop(end);
    }
  }
}

function keys(n: number, t: number, vel: number) {
  // Two-operator FM: a soft electric-piano tine.
  const c = ctx!;
  const f = hz(n);
  const car = c.createOscillator();
  const mod = c.createOscillator();
  const modG = c.createGain();
  car.frequency.value = f;
  mod.frequency.value = f;
  modG.gain.setValueAtTime(f * 1.6 * vel, t);
  modG.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.6);
  mod.connect(modG).connect(car.frequency);
  const g = gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 2.4);
  const pan = c.createStereoPanner();
  pan.pan.value = rand(-0.4, 0.4);
  car.connect(g).connect(pan);
  pan.connect(musicBus);
  pan.connect(gain(0.35, delayIn));
  pan.connect(gain(0.45, verbIn));
  for (const o of [car, mod]) { o.start(t); o.stop(t + 2.5); }
}

function bell(n: number, t: number) {
  const c = ctx!;
  const g = gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 4);
  g.connect(gain(0.6, delayIn));
  g.connect(gain(0.9, verbIn));
  g.connect(musicBus);
  for (const [ratio, amp] of [[1, 1], [2.01, 0.3], [3.98, 0.12]]) {
    const o = c.createOscillator();
    o.frequency.value = hz(n) * ratio;
    const a = gain(amp, g);
    o.connect(a);
    o.start(t);
    o.stop(t + 4.1);
  }
}

function bass(n: number, t: number, dur: number, vel: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const o2 = c.createOscillator();
  o.frequency.value = hz(n);
  o2.type = 'triangle';
  o2.frequency.value = hz(n);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const g = gain(0, musicBus);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.02);
  g.gain.setTargetAtTime(0.18 * vel, t + 0.03, 0.25);
  g.gain.setTargetAtTime(0, t + dur, 0.12);
  o.connect(f);
  o2.connect(gain(0.35, f));
  f.connect(g);
  for (const x of [o, o2]) { x.start(t); x.stop(t + dur + 0.8); }
}

function kick(t: number) {
  const c = ctx!;
  const o = c.createOscillator();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const g = gain(0, musicBus);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.45);
}

function noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, verb: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = white;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = gain(0);
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  src.connect(f).connect(g);
  g.connect(musicBus);
  if (verb) g.connect(gain(verb, verbIn));
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.05);
  return g;
}

function snare(t: number) {
  // A soft brushed rim: band-passed noise plus a short body tone.
  noiseHit(t, 'bandpass', 2200, 0.8, 0.12, 0.22, 0.35);
  const o = ctx!.createOscillator();
  o.frequency.setValueAtTime(210, t);
  o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
  const g = gain(0, musicBus);
  g.gain.setValueAtTime(0.07, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.14);
}

function hat(t: number, vel: number) {
  const g = noiseHit(t, 'highpass', 7500, 0.6, 0.035 * vel * rand(0.7, 1), rand(0.04, 0.07), 0.05);
  const pan = ctx!.createStereoPanner();
  pan.pan.value = 0.25;
  g.disconnect();
  g.connect(pan).connect(musicBus);
}

// ---------------------------------------------------------------------------
// Stadium crowd: pink-noise layers shaped into murmur, swells, chants and roars.

let crowd: { roar(): void; stop(): void } | null = null;

function startCrowd() {
  const c = ctx!;
  const nodes: AudioScheduledSourceNode[] = [];
  const loop = (pan: number) => {
    const s = c.createBufferSource();
    s.buffer = pink;
    s.loop = true;
    s.start(c.currentTime, Math.random() * 5);
    nodes.push(s);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(p);
    return p;
  };
  // Body of the crowd: a broad murmur in the voice range, left and right.
  const body = c.createBiquadFilter();
  body.type = 'bandpass';
  body.frequency.value = 480;
  body.Q.value = 0.6;
  const bodyG = gain(0.55, crowdBus);
  loop(-0.6).connect(body);
  loop(0.6).connect(body);
  body.connect(bodyG);
  // Air: distant hiss and chatter.
  const air = c.createBiquadFilter();
  air.type = 'highpass';
  air.frequency.value = 1800;
  const airG = gain(0.08, crowdBus);
  loop(0).connect(air).connect(airG);
  // Excitement layer, brighter, mostly silent until something happens.
  const hype = c.createBiquadFilter();
  hype.type = 'bandpass';
  hype.frequency.value = 900;
  hype.Q.value = 1.1;
  const hypeG = gain(0, crowdBus);
  loop(-0.2).connect(hype).connect(hypeG);

  let roaring = 0;
  let alive = true;
  const timers: number[] = [];
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(() => { if (alive) fn(); }, ms));

  // The murmur breathes, and every so often the stands rise (a chance, a big tackle).
  const breathe = () => {
    const t = c.currentTime;
    if (t > roaring) {
      bodyG.gain.setTargetAtTime(rand(0.42, 0.68), t, 1.2);
      body.frequency.setTargetAtTime(rand(420, 560), t, 1.5);
      if (Math.random() < 0.18) {
        hypeG.gain.setTargetAtTime(rand(0.2, 0.45), t, 0.5);
        hypeG.gain.setTargetAtTime(0, t + rand(1.5, 3), 0.8);
      }
    }
    later(rand(1400, 2600), breathe);
  };
  breathe();

  // Now and then a section claps along: clap-clap-clap, a few times over.
  const chant = () => {
    if (c.currentTime > roaring) {
      const t0 = c.currentTime + 0.1;
      const beat = 0.42;
      for (let bar = 0; bar < 4; bar++) {
        for (const k of [0, 1, 2]) clap(t0 + bar * beat * 4 + k * beat);
      }
    }
    later(rand(28000, 55000), chant);
  };
  later(rand(9000, 18000), chant);

  return {
    roar() {
      const t = c.currentTime;
      roaring = t + 7;
      hypeG.gain.cancelScheduledValues(t);
      hypeG.gain.setTargetAtTime(2.4, t, 0.15);
      hypeG.gain.setTargetAtTime(0.7, t + 2.2, 1);
      hypeG.gain.setTargetAtTime(0, t + 5, 1.2);
      hype.frequency.cancelScheduledValues(t);
      hype.frequency.setTargetAtTime(1300, t, 0.2);
      hype.frequency.setTargetAtTime(900, t + 3, 1.5);
      bodyG.gain.setTargetAtTime(1.3, t, 0.2);
      bodyG.gain.setTargetAtTime(0.55, t + 4, 1.5);
      airG.gain.setTargetAtTime(0.25, t, 0.2);
      airG.gain.setTargetAtTime(0.08, t + 4, 1.5);
      // A ragged round of applause as it settles.
      for (let i = 0; i < 36; i++) clap(t + 2 + Math.random() * 4.5, 0.5);
    },
    stop() {
      alive = false;
      timers.forEach(clearTimeout);
      for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } }
      for (const g of [bodyG, airG, hypeG]) g.disconnect();
    },
  };

  function clap(t: number, vel = 1) {
    // One clap is a dozen hands, slightly out of time.
    for (let i = 0; i < 12; i++) {
      const at = t + Math.random() * 0.05;
      const src = c.createBufferSource();
      src.buffer = white;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = rand(900, 1800);
      f.Q.value = 1.2;
      const g = gain(0);
      g.gain.setValueAtTime(0.05 * vel, at);
      g.gain.exponentialRampToValueAtTime(0.0005, at + 0.07);
      const p = c.createStereoPanner();
      p.pan.value = rand(-0.8, 0.8);
      src.connect(f).connect(g).connect(p).connect(crowdBus);
      src.start(at, Math.random() * 0.8);
      src.stop(at + 0.09);
    }
  }
}
