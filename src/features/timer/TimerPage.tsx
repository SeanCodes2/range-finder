import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmButton, Field, Seg } from '@/app/ui';
import { useWakeLock } from '@/app/useGps';
import { create, put, remove, useCollection } from '@/store/db';
import type { TimerRun } from '@/store/types';
import {
  attachMic, cfgFor, createAudioContext, detectShot, initialDetectState, markBeep, playBeep,
  randomDelayMs, requestMic, splitsOf, summarize, type DetectState, type MicGraph, type Sensitivity,
} from './audio';
import './timer.css';

// ---------- settings (localStorage) ----------
interface TimerSettings {
  delayMinS: number;
  delayMaxS: number;
  parOn: boolean;
  parS: number;
  sensitivity: Sensitivity;
  volume: number; // 0..1
  autoStopS: number; // 0 = off
}
const DEFAULTS: TimerSettings = { delayMinS: 1, delayMaxS: 4, parOn: false, parS: 2, sensitivity: 'med', volume: 1, autoStopS: 0 };
const LS_KEY = 'rf.timer';
function loadSettings(): TimerSettings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}
function saveSettings(s: TimerSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

type Phase = 'idle' | 'standby' | 'running' | 'done';

const fmt = (s: number | null | undefined, d = 2) => (s == null || !isFinite(s) ? '—' : s.toFixed(d));
const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TimerPage() {
  const [settings, setSettingsState] = useState<TimerSettings>(loadSettings);
  const setSettings = (patch: Partial<TimerSettings>) => setSettingsState(s => { const n = { ...s, ...patch }; saveSettings(n); return n; });

  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsedS, setElapsedS] = useState(0);
  const [shots, setShots] = useState<number[]>([]); // seconds from start beep
  const [level, setLevel] = useState(0); // live mic peak 0..1 for the meter
  const [micState, setMicState] = useState<'unknown' | 'ok' | 'denied'>('unknown');
  const [notes, setNotes] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const runs = useCollection('timerRuns');
  const history = [...runs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);

  // Mutable run state lives in refs so the rAF loop never reads stale closures.
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MicGraph | null>(null);
  const startAtRef = useRef(0);
  const shotsRef = useRef<number[]>([]);
  const detRef = useRef<DetectState>(initialDetectState());
  const phaseRef = useRef<Phase>('idle');
  const rafRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useWakeLock(phase === 'standby' || phase === 'running');

  const clearTimers = () => { timersRef.current.forEach(t => clearTimeout(t)); timersRef.current = []; };
  const after = (ms: number, fn: () => void) => { timersRef.current.push(window.setTimeout(fn, ms)); };

  const stop = useCallback(() => {
    if (phaseRef.current !== 'running' && phaseRef.current !== 'standby') return;
    clearTimers();
    cancelAnimationFrame(rafRef.current);
    const wasRunning = phaseRef.current === 'running';
    phaseRef.current = wasRunning ? 'done' : 'idle';
    setPhase(phaseRef.current);
    if (wasRunning) setElapsedS((performance.now() - startAtRef.current) / 1000);
    setLevel(0);
  }, []);

  const registerShot = useCallback((now: number) => {
    const t = (now - startAtRef.current) / 1000;
    shotsRef.current = [...shotsRef.current, t];
    setShots(shotsRef.current);
    try { navigator.vibrate?.(30); } catch {}
  }, []);

  const loop = useCallback(() => {
    if (phaseRef.current !== 'running') return;
    const now = performance.now();
    setElapsedS((now - startAtRef.current) / 1000);
    const mic = micRef.current;
    if (mic) {
      const { peak } = mic.read();
      setLevel(peak);
      const r = detectShot(peak, now, detRef.current, cfgFor(settingsRef.current.sensitivity));
      detRef.current = r.state;
      if (r.shot) registerShot(now);
    }
    const auto = settingsRef.current.autoStopS;
    const last = shotsRef.current[shotsRef.current.length - 1];
    if (auto > 0 && last != null && now - startAtRef.current - last * 1000 > auto * 1000) { stop(); return; }
    rafRef.current = requestAnimationFrame(loop);
  }, [registerShot, stop]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') return;
    const s = settingsRef.current;
    // Audio unlock must happen inside the tap handler.
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    const ctx = ctxRef.current;
    if (ctx && ctx.state === 'suspended') { try { await ctx.resume(); } catch {} }

    if (ctx && !micRef.current) {
      if (!streamRef.current) streamRef.current = await requestMic();
      if (streamRef.current) { micRef.current = attachMic(ctx, streamRef.current); setMicState('ok'); }
      else setMicState('denied');
    } else if (!ctx) setMicState('denied');

    shotsRef.current = [];
    setShots([]);
    setElapsedS(0);
    setNotes('');
    setSavedFlash(false);
    detRef.current = initialDetectState();
    phaseRef.current = 'standby';
    setPhase('standby');

    after(randomDelayMs(s.delayMinS, s.delayMaxS), () => {
      if (phaseRef.current !== 'standby') return;
      const now = performance.now();
      if (ctx) playBeep(ctx, { freq: 2000, durMs: 300, volume: s.volume });
      startAtRef.current = now;
      detRef.current = markBeep(detRef.current, now);
      phaseRef.current = 'running';
      setPhase('running');
      if (s.parOn && s.parS > 0) {
        after(s.parS * 1000, () => {
          if (phaseRef.current !== 'running') return;
          if (ctx) playBeep(ctx, { freq: 1400, durMs: 260, volume: s.volume, pulses: 2 });
          detRef.current = markBeep(detRef.current, performance.now());
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    });
  }, [loop]);

  const cancelStandby = () => { if (phaseRef.current === 'standby') stop(); };

  // Release mic + audio on unmount.
  useEffect(() => () => {
    clearTimers();
    cancelAnimationFrame(rafRef.current);
    micRef.current?.dispose();
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close().catch(() => {});
  }, []);

  const saveRun = async () => {
    const s = settingsRef.current;
    await put('timerRuns', create<TimerRun>({
      parTimeS: s.parOn ? s.parS : undefined,
      splitsS: shotsRef.current,
      notes: notes.trim() || undefined,
    }));
    setSavedFlash(true);
    phaseRef.current = 'idle';
    setPhase('idle');
  };
  const discard = () => { phaseRef.current = 'idle'; setPhase('idle'); shotsRef.current = []; setShots([]); setElapsedS(0); };

  const par = settings.parOn ? settings.parS : null;
  const splits = splitsOf(shots);
  const sum = summarize(shots);
  const running = phase === 'running';
  const busy = running || phase === 'standby';
  const shown = phase === 'done' ? (sum.totalS ?? elapsedS) : elapsedS;

  return (
    <>
      <h1 className="page-title">Shot timer</h1>

      <section className={`panel timer-main ${running ? 'is-running' : ''} ${phase === 'standby' ? 'is-standby' : ''}`}>
        <div className="big-readout">
          <div className="label">{phase === 'standby' ? 'Standby…' : phase === 'done' ? 'Last shot' : running ? 'Running' : 'Ready'}</div>
          <div className="value">{phase === 'standby' ? '0.00' : fmt(shown)}<small>s</small></div>
          <div className="timer-stats mono">
            <span><b>{shots.length}</b> <span className="muted">shots</span></span>
            <span><b>{fmt(sum.firstS)}</b> <span className="muted">first</span></span>
            <span><b>{fmt(shots.length > 1 ? splits[splits.length - 1] : null)}</b> <span className="muted">split</span></span>
            {par != null && <span><b>{fmt(par)}</b> <span className="muted">par</span></span>}
          </div>
          {micState === 'ok' && (
            <div className="progress timer-level" aria-hidden="true">
              <i style={{ width: `${Math.min(100, level * 100)}%`, background: level >= cfgFor(settings.sensitivity).threshold ? 'var(--bad)' : undefined }} />
            </div>
          )}
        </div>

        {!busy && (
          <button className="btn btn-primary btn-big timer-start" onClick={() => { void start(); }}>
            {phase === 'done' ? 'Start new run' : 'Start'}
          </button>
        )}
        {phase === 'standby' && (
          <button className="btn btn-big timer-start" onClick={cancelStandby}>Cancel</button>
        )}
        {running && (
          <div className="timer-controls">
            {micState !== 'ok' && (
              <button className="btn btn-primary btn-big timer-tap" onClick={() => registerShot(performance.now())}>Tap = shot</button>
            )}
            <button className="btn btn-big" onClick={stop}>Stop</button>
          </div>
        )}
        {micState === 'denied' && (
          <p className="empty">Microphone unavailable — running as a par timer. Tap the big button for each shot, or allow mic access in your browser settings.</p>
        )}
      </section>

      {phase === 'done' && (
        <section className="panel">
          <h2>Summary</h2>
          <div className="timer-summary mono">
            <div><span className="muted small">First shot</span><b>{fmt(sum.firstS)}</b></div>
            <div><span className="muted small">Total</span><b>{fmt(sum.totalS)}</b></div>
            <div><span className="muted small">Avg split</span><b>{fmt(sum.avgSplitS)}</b></div>
            <div><span className="muted small">Shots</span><b>{sum.shots}</b></div>
          </div>
          <Field label="Notes" id="timer-notes">
            <input id="timer-notes" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Drill, gun, distance…" />
          </Field>
          <div className="row">
            <button className="btn btn-primary" onClick={() => { void saveRun(); }} disabled={!shots.length}>Save run</button>
            <button className="btn btn-ghost" onClick={discard}>Discard</button>
          </div>
        </section>
      )}
      {savedFlash && phase === 'idle' && <p className="small good">Run saved.</p>}

      {shots.length > 0 && (
        <section className="panel">
          <h2>Shots</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>#</th><th>Time</th><th>Split</th></tr></thead>
              <tbody>
                {shots.map((t, i) => {
                  const late = par != null && t > par;
                  return (
                    <tr key={i} className={late ? 'timer-late' : undefined}>
                      <td>{i + 1}{late && <span className="timer-flag" title="After par"> ●</span>}</td>
                      <td className="mono">{fmt(t)}</td>
                      <td className="mono">{i === 0 ? '—' : `+${fmt(splits[i])}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Par drill</h2>
        <div className="row">
          {[1.5, 2, 3].map(p => (
            <button key={p} type="button" className={`pill timer-chip ${settings.parOn && settings.parS === p ? 'accent' : ''}`} disabled={busy}
              onClick={() => setSettings({ parOn: true, parS: p })}>{p} s</button>
          ))}
          <button type="button" className={`pill timer-chip ${!settings.parOn ? 'accent' : ''}`} disabled={busy} onClick={() => setSettings({ parOn: false })}>Off</button>
        </div>
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <div className="grid-2">
          <Field label="Delay min (s)" id="t-dmin">
            <input id="t-dmin" className="input mono" type="number" inputMode="decimal" min={0} step={0.5} value={settings.delayMinS} disabled={busy}
              onChange={e => setSettings({ delayMinS: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="Delay max (s)" id="t-dmax">
            <input id="t-dmax" className="input mono" type="number" inputMode="decimal" min={0} step={0.5} value={settings.delayMaxS} disabled={busy}
              onChange={e => setSettings({ delayMaxS: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
          <Field label="Par time (s)" id="t-par">
            <div className="row timer-par-row">
              <input id="t-par" className="input mono" type="number" inputMode="decimal" min={0.1} step={0.1} value={settings.parS} disabled={busy || !settings.parOn}
                onChange={e => setSettings({ parS: Math.max(0, Number(e.target.value) || 0) })} />
              <Seg<'on' | 'off'> value={settings.parOn ? 'on' : 'off'} options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} onChange={v => !busy && setSettings({ parOn: v === 'on' })} label="Par" />
            </div>
          </Field>
          <Field label="Auto-stop after last shot (s, 0 = off)" id="t-auto">
            <input id="t-auto" className="input mono" type="number" inputMode="decimal" min={0} step={1} value={settings.autoStopS} disabled={busy}
              onChange={e => setSettings({ autoStopS: Math.max(0, Number(e.target.value) || 0) })} />
          </Field>
        </div>
        <Field label="Mic sensitivity">
          <Seg<Sensitivity> value={settings.sensitivity} options={[{ value: 'low', label: 'Low' }, { value: 'med', label: 'Med' }, { value: 'high', label: 'High' }]} onChange={v => setSettings({ sensitivity: v })} label="Sensitivity" />
        </Field>
        <Field label={`Beep volume ${Math.round(settings.volume * 100)}%`} id="t-vol">
          <div className="row">
            <input id="t-vol" className="timer-range" type="range" min={0.1} max={1} step={0.05} value={settings.volume}
              onChange={e => setSettings({ volume: Number(e.target.value) })} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              if (!ctxRef.current) ctxRef.current = createAudioContext();
              const ctx = ctxRef.current; if (!ctx) return;
              ctx.resume().catch(() => {}); playBeep(ctx, { volume: settings.volume });
            }}>Test</button>
          </div>
        </Field>
      </section>

      <section className="panel">
        <h2>History</h2>
        {history.length === 0 ? <p className="empty">No saved runs yet.</p> : (
          <ul className="list">
            {history.map(r => {
              const s = summarize(r.splitsS);
              return (
                <li key={r.id}>
                  <div className="grow">
                    <div className="title mono">
                      {s.shots} shot{s.shots === 1 ? '' : 's'} · {fmt(s.totalS)} s
                      {r.parTimeS != null && <span className="pill" style={{ marginLeft: 8 }}>par {fmt(r.parTimeS, 1)}</span>}
                    </div>
                    <div className="sub">
                      {fmtDate(r.createdAt)} · first {fmt(s.firstS)} · avg split {fmt(s.avgSplitS)}
                      {r.notes && <> · {r.notes}</>}
                    </div>
                  </div>
                  <ConfirmButton label="Delete" onConfirm={() => { void remove('timerRuns', r.id); }} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
