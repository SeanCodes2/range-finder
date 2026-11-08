// Compass heading from DeviceOrientationEvent. iOS 13+ needs a permission request from a tap;
// Android Chrome gives absolute alpha via `deviceorientationabsolute`. Returns null when
// nothing usable arrives (caller falls back to GPS course).
import { useCallback, useEffect, useRef, useState } from 'react';
import { headingFromOrientation, norm180 } from './rangeMath';

export interface DeviceHeading {
  heading: number | null;
  /** True on iOS until the user grants motion access via `request()`. */
  needsPermission: boolean;
  denied: boolean;
  supported: boolean;
  request: () => Promise<void>;
}

const DOE: any = typeof window !== 'undefined' ? (window as any).DeviceOrientationEvent : undefined;
const needsRequest = () => !!DOE && typeof DOE.requestPermission === 'function';

export function useDeviceHeading(active: boolean): DeviceHeading {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(() => !!DOE && !needsRequest());
  const [denied, setDenied] = useState(false);
  const last = useRef<number | null>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    if (!active || !granted || !DOE) return;
    const onEvt = (e: DeviceOrientationEvent) => {
      const angle = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : 0;
      const h = headingFromOrientation(e as any, angle);
      if (h == null) return;
      lastAt.current = Date.now();
      if (last.current != null && Math.abs(norm180(h - last.current)) < 1) return; // de-jitter
      last.current = h; setHeading(h);
    };
    // Prefer the absolute event where it exists (Android); iOS only has deviceorientation + webkitCompassHeading.
    const evName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evName, onEvt as EventListener, true);
    // Drop a stale heading if the sensor goes quiet (page hidden, sensor off).
    const iv = setInterval(() => {
      if (last.current != null && Date.now() - lastAt.current > 3000) { last.current = null; setHeading(null); }
    }, 1000);
    return () => { window.removeEventListener(evName, onEvt as EventListener, true); clearInterval(iv); last.current = null; setHeading(null); };
  }, [active, granted]);

  const request = useCallback(async () => {
    if (!DOE) return;
    if (!needsRequest()) { setGranted(true); return; }
    try {
      const r = await DOE.requestPermission();
      if (r === 'granted') { setGranted(true); setDenied(false); } else setDenied(true);
    } catch { setDenied(true); }
  }, []);

  return { heading, needsPermission: !!DOE && !granted && !denied, denied, supported: !!DOE, request };
}
