// Shot timer audio: pure detection core (tested) plus thin Web Audio helpers.

export type Sensitivity = 'low' | 'med' | 'high';

export interface DetectCfg {
  threshold: number; // peak amplitude 0..1 that counts as a shot
  deadMs: number; // ignore anything this soon after a detected shot
  beepMaskMs: number; // ignore anything this soon after our own beep
}

export interface DetectState {
  lastShotAt: number; // ms (performance.now domain); -Infinity when none
  lastBeepAt: number;
}

export const DEAD_MS = 120;
export const BEEP_MASK_MS = 350;

/** Peak threshold per sensitivity. Time-domain float samples are -1..1; a gunshot at arm's
 *  length clips a phone mic hard, so even "low" is well below full scale. */
export function thresholdFor(s: Sensitivity): number {
  switch (s) {
    case 'low': return 0.6;
    case 'high': return 0.18;
    default: return 0.35;
  }
}

export function cfgFor(s: Sensitivity): DetectCfg {
  return { threshold: thresholdFor(s), deadMs: DEAD_MS, beepMaskMs: BEEP_MASK_MS };
}

export const initialDetectState = (): DetectState => ({ lastShotAt: -Infinity, lastBeepAt: -Infinity });

export function markBeep(state: DetectState, now: number): DetectState {
  return { ...state, lastBeepAt: now };
}

/** Decide whether this analyser frame is a new shot. Pure: returns the next state. */
export function detectShot(peak: number, now: number, state: DetectState, cfg: DetectCfg): { shot: boolean; state: DetectState } {
  if (!(peak >= cfg.threshold)) return { shot: false, state };
  if (now - state.lastBeepAt < cfg.beepMaskMs) return { shot: false, state };
  if (now - state.lastShotAt < cfg.deadMs) return { shot: false, state };
  return { shot: true, state: { ...state, lastShotAt: now } };
}

/** Peak absolute amplitude and RMS of a time-domain buffer (floats -1..1). */
export function measure(buf: ArrayLike<number>): { peak: number; rms: number } {
  let peak = 0, sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { peak, rms: buf.length ? Math.sqrt(sum / buf.length) : 0 };
}

/** Consecutive differences (first entry is the first-shot time itself). */
export function splitsOf(timesS: number[]): number[] {
  return timesS.map((t, i) => (i === 0 ? t : t - timesS[i - 1]));
}

export interface RunSummary {
  shots: number;
  firstS: number | null;
  totalS: number | null;
  avgSplitS: number | null; // mean of shot-to-shot splits (excludes first shot)
}

export function summarize(timesS: number[]): RunSummary {
  if (!timesS.length) return { shots: 0, firstS: null, totalS: null, avgSplitS: null };
  const sp = splitsOf(timesS).slice(1);
  return {
    shots: timesS.length,
    firstS: timesS[0],
    totalS: timesS[timesS.length - 1],
    avgSplitS: sp.length ? sp.reduce((a, b) => a + b, 0) / sp.length : null,
  };
}

export function randomDelayMs(minS: number, maxS: number): number {
  const lo = Math.max(0, Math.min(minS, maxS));
  const hi = Math.max(lo, Math.max(minS, maxS));
  return (lo + Math.random() * (hi - lo)) * 1000;
}

// ---------- Web Audio (browser only) ----------

type Ctor = typeof AudioContext;
export function createAudioContext(): AudioContext | null {
  const C: Ctor | undefined = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  if (!C) return null;
  try { return new C(); } catch { return null; }
}

/** Loud square-ish tone. `pulses: 2` gives the par signal (two short pips). */
export function playBeep(ctx: AudioContext, opts: { freq?: number; durMs?: number; volume?: number; pulses?: 1 | 2 } = {}) {
  const { freq = 2000, durMs = 300, volume = 1, pulses = 1 } = opts;
  const t0 = ctx.currentTime + 0.005;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  osc.connect(gain);
  const v = Math.max(0, Math.min(1, volume)) * 0.6; // square waves are loud; headroom
  const pulse = pulses === 2 ? durMs / 1000 * 0.4 : durMs / 1000;
  const gap = pulses === 2 ? durMs / 1000 * 0.2 : 0;
  let t = t0;
  for (let i = 0; i < pulses; i++) {
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.004);
    gain.gain.setValueAtTime(v, t + pulse - 0.01);
    gain.gain.linearRampToValueAtTime(0, t + pulse);
    t += pulse + gap;
  }
  osc.start(t0);
  osc.stop(t + 0.02);
  osc.onended = () => { osc.disconnect(); gain.disconnect(); };
}

export interface MicGraph {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  buf: Float32Array<ArrayBuffer>;
  read(): { peak: number; rms: number };
  dispose(): void;
}

export function attachMic(ctx: AudioContext, stream: MediaStream): MicGraph {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
  const hasFloat = typeof (analyser as any).getFloatTimeDomainData === 'function';
  const bytes = hasFloat ? null : new Uint8Array(analyser.fftSize);
  return {
    analyser, source, buf,
    read() {
      if (hasFloat) analyser.getFloatTimeDomainData(buf);
      else {
        analyser.getByteTimeDomainData(bytes!);
        for (let i = 0; i < bytes!.length; i++) buf[i] = (bytes![i] - 128) / 128;
      }
      return measure(buf);
    },
    dispose() { try { source.disconnect(); analyser.disconnect(); } catch {} },
  };
}

export async function requestMic(): Promise<MediaStream | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    return null;
  }
}
