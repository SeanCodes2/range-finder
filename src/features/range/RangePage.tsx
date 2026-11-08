// Range tab: pick/create a range, set the firing line by GPS, walk out and drop stakes at
// target distances, then walk back to any stake with a compass arrow.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { averageFixes, bearingDeg, compassPoint, distanceM, fmtDistance } from '@/app/geo';
import { collectFixes, useGps, useWakeLock } from '@/app/useGps';
import { ConfirmButton, Field } from '@/app/ui';
import { create, put, remove, useCollection, useSettings } from '@/store/db';
import type { GeoPoint, Range, Stake } from '@/store/types';
import {
  accClass, arrivedRadiusM, arrowRotation, continuousAngle, courseFromFixes, defaultStakeLabel,
  fmtDelta, fmtDistanceValue, fromDisplay, targetHint, type DistUnit,
} from './rangeMath';
import { useDeviceHeading } from './useDeviceHeading';
import './range.css';

const LS_KEY = 'rf.currentRangeId';
const FIXES = 8;
const loadCurrent = () => { try { return localStorage.getItem(LS_KEY); } catch { return null; } };
const saveCurrent = (id: string | null) => { try { id ? localStorage.setItem(LS_KEY, id) : localStorage.removeItem(LS_KEY); } catch {} };

type Averaging = { what: 'firingLine' | 'stake'; have: number } | null;

export default function RangePage() {
  useWakeLock(true);
  const gps = useGps(true);
  const { distanceUnit: unit } = useSettings();
  const ranges = useCollection('ranges');
  const allStakes = useCollection('stakes');

  const [currentId, setCurrentId] = useState<string | null>(loadCurrent);
  useEffect(() => { saveCurrent(currentId); }, [currentId]);
  // If the remembered range vanished, fall back to the first one.
  useEffect(() => {
    if (!ranges.length) return;
    if (!currentId || !ranges.some(r => r.id === currentId)) setCurrentId(ranges[0].id);
  }, [ranges, currentId]);

  const range = ranges.find(r => r.id === currentId) ?? null;
  const stakes = useMemo(
    () => allStakes.filter(s => s.rangeId === range?.id).sort((a, b) => a.createdAt - b.createdAt),
    [allStakes, range?.id],
  );

  const [walkTo, setWalkTo] = useState<string | null>(null);
  const walkStake = stakes.find(s => s.id === walkTo) ?? null;
  useEffect(() => { if (walkTo && !walkStake) setWalkTo(null); }, [walkTo, walkStake]);

  if (walkStake) return <WalkTo stake={walkStake} fix={gps.fix} gpsError={gps.error} unit={unit} onBack={() => setWalkTo(null)} />;

  return (
    <>
      <h1 className="page-title">Range</h1>
      <RangePicker ranges={ranges} range={range} stakes={stakes} onSelect={setCurrentId} />
      {range && (
        <>
          <FiringLine range={range} fix={gps.fix} gpsError={gps.error} />
          {range.firingLine && (
            <LiveAndStake range={range} fix={gps.fix} unit={unit} />
          )}
          <StakeList range={range} stakes={stakes} unit={unit} onWalk={setWalkTo} />
        </>
      )}
    </>
  );
}

// ---------------- Range picker ----------------
function RangePicker({ ranges, range, stakes, onSelect }: { ranges: Range[]; range: Range | null; stakes: Stake[]; onSelect: (id: string) => void }) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(ranges.length === 0);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');

  useEffect(() => { if (ranges.length === 0) setCreating(true); }, [ranges.length]);

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await put('ranges', create<Range>({ name, firingLine: null }));
    setNewName(''); setCreating(false); onSelect(r.id);
  };
  const rename = async () => {
    if (!range) return;
    const name = renameVal.trim();
    if (name && name !== range.name) await put('ranges', { ...range, name });
    setRenaming(false);
  };
  const del = async () => {
    if (!range) return;
    await Promise.all(stakes.map(s => remove('stakes', s.id)));
    await remove('ranges', range.id);
  };

  return (
    <section className="panel">
      <div className="row">
        <h2>Range</h2><span className="spacer" />
        {!creating && <button className="btn btn-ghost btn-sm" onClick={() => setCreating(true)}>+ New</button>}
      </div>
      {creating && (
        <form className="row" onSubmit={e => { e.preventDefault(); add(); }}>
          <input className="input" style={{ flex: 1 }} placeholder="Range name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus aria-label="New range name" />
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>Add</button>
          {ranges.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>}
        </form>
      )}
      {ranges.length > 0 && !renaming && (
        <div className="row">
          <select className="input" style={{ flex: 1 }} value={range?.id ?? ''} onChange={e => onSelect(e.target.value)} aria-label="Current range">
            {ranges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {range && <button className="btn btn-ghost btn-sm" onClick={() => { setRenameVal(range.name); setRenaming(true); }}>Rename</button>}
          {range && <ConfirmButton label="Delete" confirmLabel={`Delete + ${stakes.length} stake${stakes.length === 1 ? '' : 's'}?`} onConfirm={del} />}
        </div>
      )}
      {renaming && range && (
        <form className="row" onSubmit={e => { e.preventDefault(); rename(); }}>
          <input className="input" style={{ flex: 1 }} value={renameVal} onChange={e => setRenameVal(e.target.value)} autoFocus aria-label="Rename range" />
          <button type="submit" className="btn btn-primary btn-sm">Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(false)}>Cancel</button>
        </form>
      )}
    </section>
  );
}

// ---------------- Firing line (point A) ----------------
function GpsStatus({ fix, error }: { fix: GeoPoint | null; error: string | null }) {
  return (
    <span className="row small muted" style={{ gap: 6 }}>
      <i className={`status-dot ${accClass(fix?.acc)}`} aria-hidden />
      {error ? <span className="bad">{error}</span> : fix ? <span className="num">GPS ±{fix.acc.toFixed(0)} m</span> : <span>Waiting for GPS…</span>}
    </span>
  );
}

function Coords({ p }: { p: GeoPoint }) {
  return <div className="range-coords">{p.lat.toFixed(6)}, {p.lon.toFixed(6)} · ±{p.acc.toFixed(1)} m{p.alt != null ? ` · ${Math.round(p.alt)} m alt` : ''}</div>;
}

/** Shared "collect 8 fixes" flow with a progress bar. */
function useAverager() {
  const [avg, setAvg] = useState<Averaging>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = useCallback(async (what: NonNullable<Averaging>['what']): Promise<GeoPoint | null> => {
    setAvg({ what, have: 0 });
    const pts = await collectFixes(FIXES, have => { if (alive.current) setAvg({ what, have }); });
    if (!alive.current) return null;
    setAvg(null);
    return averageFixes(pts);
  }, []);
  return { avg, run };
}

function Progress({ have }: { have: number }) {
  return (
    <div>
      <div className="progress" role="progressbar" aria-valuenow={have} aria-valuemax={FIXES}><i style={{ width: `${(have / FIXES) * 100}%` }} /></div>
      <div className="small muted" style={{ marginTop: 4 }}>Hold still — averaging fix {Math.min(have + 1, FIXES)} of {FIXES}</div>
    </div>
  );
}

function FiringLine({ range, fix, gpsError }: { range: Range; fix: GeoPoint | null; gpsError: string | null }) {
  const { avg, run } = useAverager();
  const set = async () => {
    const p = await run('firingLine');
    if (p) await put('ranges', { ...range, firingLine: p });
  };
  const busy = avg?.what === 'firingLine';
  return (
    <section className="panel">
      <div className="row"><h2>Firing line</h2><span className="spacer" /><GpsStatus fix={fix} error={gpsError} /></div>
      {range.firingLine ? <Coords p={range.firingLine} /> : <p className="empty">Stand at the firing line and hold the phone still while it averages {FIXES} GPS fixes.</p>}
      {busy && avg && <Progress have={avg.have} />}
      <button className={`btn btn-big ${range.firingLine ? '' : 'btn-primary'}`} disabled={!fix || !!avg} onClick={set}>
        {busy ? 'Averaging…' : range.firingLine ? 'Re-set firing line' : 'Set firing line'}
      </button>
    </section>
  );
}

// ---------------- Live readout + target helper + drop stake (point B) ----------------
function LiveAndStake({ range, fix, unit }: { range: Range; fix: GeoPoint | null; unit: DistUnit }) {
  const fl = range.firingLine!;
  const [targetStr, setTargetStr] = useState('');
  const targetVal = parseFloat(targetStr);
  const targetM = Number.isFinite(targetVal) && targetVal > 0 ? fromDisplay(targetVal, unit) : null;
  const { avg, run } = useAverager();

  const dist = fix ? distanceM(fl, fix) : null;
  const brg = fix ? bearingDeg(fl, fix) : null;
  const hint = dist != null && targetM != null ? targetHint(dist, targetM, unit) : null;

  const drop = async () => {
    const p = await run('stake');
    if (!p) return;
    const d = distanceM(fl, p);
    const label = targetM != null ? defaultStakeLabel(targetM, unit) : defaultStakeLabel(d, unit);
    await put('stakes', create<Stake>({ rangeId: range.id, label, point: p, ...(targetM != null ? { intendedDistanceM: targetM } : {}) }));
  };
  const busy = avg?.what === 'stake';

  return (
    <section className="panel">
      <div className="big-readout">
        <div className="label">From firing line</div>
        <div className="value">{dist != null ? fmtDistanceValue(dist, unit) : '—'}<small>{unit}</small></div>
        <div className="range-sub">
          <span>{brg != null ? `${Math.round(brg)}° ${compassPoint(brg)}` : 'bearing —'}</span>
          <span className={accClass(fix?.acc)}>{fix ? `±${fix.acc.toFixed(0)} m` : 'no fix'}</span>
        </div>
      </div>
      <Field label={`Target distance (${unit})`} id="rf-target">
        <input id="rf-target" className="input mono" type="number" inputMode="decimal" min={0} step={unit === 'yd' ? 5 : 5} placeholder={unit === 'yd' ? 'e.g. 100' : 'e.g. 100'} value={targetStr} onChange={e => setTargetStr(e.target.value)} />
      </Field>
      <div className={`range-hint ${hint?.tone ?? ''}`} aria-live="polite">{hint?.text ?? (targetM == null ? <span className="muted small" style={{ fontWeight: 500 }}>Enter a target distance for walking hints</span> : '')}</div>
      {busy && avg && <Progress have={avg.have} />}
      <button className="btn btn-big btn-primary" disabled={!fix || !!avg} onClick={drop}>
        {busy ? 'Averaging…' : `Drop stake${dist != null ? ` at ${fmtDistance(dist, unit)}` : ''}`}
      </button>
    </section>
  );
}

// ---------------- Stake list ----------------
function StakeList({ range, stakes, unit, onWalk }: { range: Range; stakes: Stake[]; unit: DistUnit; onWalk: (id: string) => void }) {
  const fl = range.firingLine;
  return (
    <section className="panel">
      <div className="row"><h2>Stakes</h2><span className="spacer" /><span className="pill">{stakes.length}</span></div>
      {stakes.length === 0 ? (
        <p className="empty">{fl ? 'No stakes yet. Walk out to a target distance and drop one.' : 'Set the firing line first, then drop stakes.'}</p>
      ) : (
        <ul className="list">
          {stakes.map(s => <StakeRow key={s.id} stake={s} fl={fl} unit={unit} onWalk={() => onWalk(s.id)} />)}
        </ul>
      )}
    </section>
  );
}

function StakeRow({ stake, fl, unit, onWalk }: { stake: Stake; fl: GeoPoint | null; unit: DistUnit; onWalk: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(stake.label);
  const save = async () => {
    const label = val.trim();
    if (label && label !== stake.label) await put('stakes', { ...stake, label });
    else setVal(stake.label);
    setEditing(false);
  };
  const d = fl ? distanceM(fl, stake.point) : null;
  const b = fl ? bearingDeg(fl, stake.point) : null;
  return (
    <li>
      <div className="grow">
        {editing ? (
          <form className="row" onSubmit={e => { e.preventDefault(); save(); }}>
            <input className="input" style={{ flex: 1 }} value={val} onChange={e => setVal(e.target.value)} onBlur={save} autoFocus aria-label="Stake label" />
          </form>
        ) : (
          <button type="button" className="stake-label-btn" onClick={() => { setVal(stake.label); setEditing(true); }} title="Tap to rename">{stake.label}</button>
        )}
        <div className="stake-meta">
          <span><b>{d != null ? fmtDistance(d, unit) : '—'}</b></span>
          {b != null && <span>{Math.round(b)}° {compassPoint(b)}</span>}
          {stake.intendedDistanceM != null && d != null && (
            <span className={Math.abs(d - stake.intendedDistanceM) <= 1 ? 'good' : Math.abs(d - stake.intendedDistanceM) <= 3 ? 'warn' : 'bad'}>
              {fmtDelta(d, stake.intendedDistanceM, unit)} vs {fmtDistance(stake.intendedDistanceM, unit)}
            </span>
          )}
          <span>±{stake.point.acc.toFixed(0)} m</span>
        </div>
      </div>
      <div className="stake-actions">
        <button className="btn btn-sm" onClick={onWalk}>Walk to</button>
        <ConfirmButton label="Delete" onConfirm={() => remove('stakes', stake.id)} />
      </div>
    </li>
  );
}

// ---------------- Walk-to mode ----------------
function WalkTo({ stake, fix, gpsError, unit, onBack }: { stake: Stake; fix: GeoPoint | null; gpsError: string | null; unit: DistUnit; onBack: () => void }) {
  const compass = useDeviceHeading(true);

  // GPS course fallback: bearing between the last two fixes while moving; hold it 5 s.
  const prevFix = useRef<GeoPoint | null>(null);
  const [course, setCourse] = useState<{ deg: number; at: number } | null>(null);
  useEffect(() => {
    if (!fix) return;
    const c = courseFromFixes(prevFix.current, fix);
    if (prevFix.current?.t !== fix.t) prevFix.current = fix;
    if (c != null) setCourse({ deg: c, at: fix.t });
  }, [fix]);
  const courseFresh = course && fix && fix.t - course.at <= 5000 ? course.deg : null;

  const heading = compass.heading ?? courseFresh;
  const source: 'compass' | 'course' | 'none' = compass.heading != null ? 'compass' : courseFresh != null ? 'course' : 'none';

  const dist = fix ? distanceM(fix, stake.point) : null;
  const brg = fix ? bearingDeg(fix, stake.point) : null;
  const arrived = dist != null && fix != null && dist <= arrivedRadiusM(fix.acc);

  // Continuous rotation so the CSS transition takes the short way round.
  const shown = useRef(0);
  if (brg != null) shown.current = continuousAngle(shown.current, arrowRotation(brg, heading));

  return (
    <>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>‹ Back</button>
        <span className="spacer" />
        <GpsStatus fix={fix} error={gpsError} />
      </div>
      <section className="panel walk">
        <div className="row"><h2>Walk to</h2><span className="spacer" /><span className="pill accent">{stake.label}</span></div>
        <div className="walk-stage">
          <div className={`walk-arrow ${arrived ? 'arrived' : ''} ${source === 'none' ? 'northup' : ''}`} style={{ transform: `rotate(${shown.current}deg)` }} aria-hidden>
            <svg viewBox="0 0 100 100"><path className="shaft" d="M50 6 L82 58 L58 50 L58 94 L42 94 L42 50 L18 58 Z" /></svg>
          </div>
          {arrived && <div className="walk-arrived" role="status">Arrived</div>}
        </div>
        <div className="big-readout">
          <div className="label">To stake</div>
          <div className="value">{dist != null ? fmtDistanceValue(dist, unit) : '—'}<small>{unit}</small></div>
          <div className="range-sub">
            <span>{brg != null ? `${Math.round(brg)}° ${compassPoint(brg)}` : 'bearing —'}</span>
            {heading != null && <span>facing {Math.round(heading)}°</span>}
            <span className={accClass(fix?.acc)}>{fix ? `±${fix.acc.toFixed(0)} m` : 'no fix'}</span>
          </div>
        </div>
        {compass.needsPermission && (
          <button className="btn btn-big" onClick={compass.request}>Enable compass</button>
        )}
        <p className="walk-note">
          {source === 'compass' && 'Arrow points toward the stake.'}
          {source === 'course' && 'Rotate until the arrow points up; heading from movement.'}
          {source === 'none' && (compass.needsPermission
            ? 'Enable the compass so the arrow follows the phone. Without it the arrow shows direction with north up.'
            : compass.denied
              ? 'Compass access denied — arrow is north-up. Start walking (>1 m/s) and heading will come from movement.'
              : 'No compass heading yet — arrow is north-up. Start walking and heading will come from movement.')}
        </p>
      </section>
    </>
  );
}
