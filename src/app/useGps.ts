// Single shared GPS watcher. Any feature can call useGps(); the watch runs only while at
// least one subscriber is mounted and `enabled` is true somewhere.
import { useEffect, useState } from 'react';
import type { GeoPoint } from '@/store/types';

type State = { fix: GeoPoint | null; error: string | null; watching: boolean };
let state: State = { fix: null, error: null, watching: false };
const subs = new Set<(s: State) => void>();
let watchId: number | null = null;
let enabledCount = 0;
const emit = () => subs.forEach(fn => fn(state));

function start() {
  if (watchId != null) return;
  if (!navigator.geolocation) { state = { ...state, error: 'No GPS in this browser' }; emit(); return; }
  state = { ...state, watching: true, error: null }; emit();
  watchId = navigator.geolocation.watchPosition(
    p => {
      state = { fix: { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude ?? undefined, t: p.timestamp }, error: null, watching: true };
      emit();
    },
    e => { state = { ...state, error: e.code === 1 ? 'Location denied — allow it in Settings' : 'No fix' }; emit(); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
  );
}
function stop() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  state = { fix: null, error: null, watching: false }; emit();
}

/** Subscribe to the shared GPS fix. Pass enabled=true to keep the watch running. */
export function useGps(enabled = true): State {
  const [s, setS] = useState(state);
  useEffect(() => { subs.add(setS); setS(state); return () => { subs.delete(setS); }; }, []);
  useEffect(() => {
    if (!enabled) return;
    enabledCount++; start();
    return () => { enabledCount--; if (enabledCount <= 0) { enabledCount = 0; stop(); } };
  }, [enabled]);
  return s;
}

/** Collect `n` fixes and resolve with them (for point averaging). */
export function collectFixes(n: number, onProgress?: (have: number) => void): Promise<GeoPoint[]> {
  return new Promise(resolve => {
    const pts: GeoPoint[] = [];
    let lastT = 0;
    const fn = (s: State) => {
      if (!s.fix || s.fix.t === lastT) return;
      lastT = s.fix.t; pts.push(s.fix); onProgress?.(pts.length);
      if (pts.length >= n) { subs.delete(fn); resolve(pts); }
    };
    subs.add(fn);
    if (state.fix) fn(state);
  });
}

/** Keep the screen awake while the component is mounted (best effort). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: any = null, alive = true;
    const req = async () => { try { lock = await (navigator as any).wakeLock.request('screen'); } catch {} };
    req();
    const vis = () => { if (document.visibilityState === 'visible' && alive) req(); };
    document.addEventListener('visibilitychange', vis);
    return () => { alive = false; document.removeEventListener('visibilitychange', vis); lock?.release?.(); };
  }, [active]);
}
