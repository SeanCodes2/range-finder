import { useCallback, useEffect, useMemo, useState } from 'react';
import { put, useCollection, useSettings } from '@/store/db';
import type { Ammo, ClickUnit, Conditions, Rifle, Stake } from '@/store/types';
import { bearingDeg, cToF, distanceM, fToC, fpsToMps, fmtDistance, mToYd, ydToM } from '@/app/geo';
import { Field, Seg, Sheet } from '@/app/ui';
import { atmosphereFrom, STANDARD_CONDITIONS } from './atmosphere';
import { solveTrajectory, toAmmoInput, toClicks, toRifleInput, trueMuzzleVelocity, windAngleFromBearings, type TrajectoryPoint } from './solver';
import './ballistics.css';

// ---------- localStorage helpers ----------
const LS = {
  rifle: 'rf.dopeRifleId', ammo: 'rf.dopeAmmoId', range: 'rf.currentRangeId',
  cond: 'rf.dopeConditions', lof: 'rf.dopeLineOfFire', max: 'rf.dopeMaxRange', unit: 'rf.dopeUnit',
};
function lsGet(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string | null) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } }
function lsJson<T>(k: string, fallback: T): T { try { const s = lsGet(k); return s ? { ...fallback, ...JSON.parse(s) } : fallback; } catch { return fallback; } }

type UnitMode = 'rifle' | ClickUnit;
type View = 'table' | 'card';

interface Row { rangeM: number; label?: string; stake?: boolean; p?: TrajectoryPoint }

// ---------- small numeric input that tolerates partial typing ----------
function NumInput({ value, onChange, step, placeholder, id, className = 'input mono' }: { value: number | undefined; onChange: (v: number | undefined) => void; step?: number; placeholder?: string; id?: string; className?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { setText(t => (value == null ? (t.trim() === '' || t === '-' ? t : '') : (Number(t) === value ? t : String(value)))); }, [value]);
  return (
    <input id={id} className={className} type="number" inputMode="decimal" step={step ?? 'any'} placeholder={placeholder} value={text}
      onChange={e => { const t = e.target.value; setText(t); const n = parseFloat(t); onChange(t.trim() === '' || Number.isNaN(n) ? undefined : n); }} />
  );
}

/** Circular mean of bearings (deg). */
function meanBearing(bs: number[]): number | null {
  if (!bs.length) return null;
  let x = 0, y = 0;
  for (const b of bs) { x += Math.cos(b * Math.PI / 180); y += Math.sin(b * Math.PI / 180); }
  if (Math.hypot(x, y) < 1e-6) return null;
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const fmtAngle = (v: number, u: ClickUnit) => fmt(v, u === 'MOA' ? 1 : 2);

export default function BallisticsPage() {
  const settings = useSettings();
  const rifles = useCollection('rifles');
  const ammos = useCollection('ammo');
  const ranges = useCollection('ranges');
  const stakes = useCollection('stakes');
  const sessions = useCollection('sessions');

  const [rifleId, setRifleId] = useState<string>(() => lsGet(LS.rifle) ?? '');
  const [ammoId, setAmmoId] = useState<string>(() => lsGet(LS.ammo) ?? '');
  const [cond, setCond] = useState<Conditions>(() => lsJson<Conditions>(LS.cond, { ...STANDARD_CONDITIONS }));
  const [manualLof, setManualLof] = useState<number | undefined>(() => { const s = lsGet(LS.lof); return s ? Number(s) : undefined; });
  const [maxRange, setMaxRange] = useState<number>(() => Number(lsGet(LS.max)) || 600);
  const [unitMode, setUnitMode] = useState<UnitMode>(() => (lsGet(LS.unit) as UnitMode) || 'rifle');
  const [view, setView] = useState<View>('table');
  const [truing, setTruing] = useState(false);

  useEffect(() => lsSet(LS.rifle, rifleId || null), [rifleId]);
  useEffect(() => lsSet(LS.ammo, ammoId || null), [ammoId]);
  useEffect(() => lsSet(LS.cond, JSON.stringify(cond)), [cond]);
  useEffect(() => lsSet(LS.lof, manualLof == null ? null : String(manualLof)), [manualLof]);
  useEffect(() => lsSet(LS.max, String(maxRange)), [maxRange]);
  useEffect(() => lsSet(LS.unit, unitMode), [unitMode]);

  // Fall back to the first rifle/ammo if the remembered one is gone.
  const rifle: Rifle | undefined = rifles.find(r => r.id === rifleId) ?? rifles[0];
  const ammo: Ammo | undefined = ammos.find(a => a.id === ammoId) ?? ammos[0];
  useEffect(() => { if (rifle && rifle.id !== rifleId) setRifleId(rifle.id); }, [rifle, rifleId]);
  useEffect(() => { if (ammo && ammo.id !== ammoId) setAmmoId(ammo.id); }, [ammo, ammoId]);

  // Current range + its stakes
  const currentRangeId = lsGet(LS.range);
  const range = ranges.find(r => r.id === currentRangeId);
  const rangeStakes: (Stake & { distM: number; bearing?: number })[] = useMemo(() => {
    if (!range) return [];
    return stakes.filter(s => s.rangeId === range.id).flatMap(s => {
      const distM = range.firingLine ? distanceM(range.firingLine, s.point) : s.intendedDistanceM;
      if (distM == null || distM <= 0) return [];
      return [{ ...s, distM, bearing: range.firingLine ? bearingDeg(range.firingLine, s.point) : undefined }];
    }).sort((a, b) => a.distM - b.distM);
  }, [range, stakes]);
  const autoLof = useMemo(() => meanBearing(rangeStakes.map(s => s.bearing).filter((b): b is number => b != null)), [rangeStakes]);
  const lof = autoLof ?? manualLof;
  const windAngle = lof != null && cond.windDirDeg != null ? windAngleFromBearings(cond.windDirDeg, lof) : 90;

  // Units
  const du = settings.distanceUnit; // 'yd' | 'm'
  const toDisp = (m: number) => (du === 'yd' ? mToYd(m) : m);
  const fromDisp = (v: number) => (du === 'yd' ? ydToM(v) : v);
  const dispUnit: ClickUnit = unitMode === 'rifle' ? (rifle?.clickUnit ?? 'MOA') : unitMode;
  const fmtVel = (fps: number) => (settings.speedUnit === 'fps' ? `${Math.round(fps)}` : `${Math.round(fpsToMps(fps))}`);
  const velLabel = settings.speedUnit === 'fps' ? 'fps' : 'm/s';

  // Rows: stakes + ladder
  const rows: Row[] = useMemo(() => {
    const step = 50;
    const out: Row[] = rangeStakes.map(s => ({ rangeM: s.distM, label: s.label, stake: true }));
    for (let d = step; d <= Math.max(step, maxRange); d += step) {
      const m = fromDisp(d);
      if (out.some(r => r.stake && Math.abs(toDisp(r.rangeM) - d) < step * 0.1)) continue;
      out.push({ rangeM: m });
    }
    return out.sort((a, b) => a.rangeM - b.rangeM);
  }, [rangeStakes, maxRange, du]);

  const atm = useMemo(() => atmosphereFrom(cond), [cond]);
  const solved = useMemo(() => {
    if (!rifle || !ammo) return null;
    const res = solveTrajectory({ ammo: toAmmoInput(ammo), rifle: toRifleInput(rifle), atmosphere: atm, wind: { speedMph: cond.windMph ?? 0, angleDeg: windAngle }, rangesM: rows.map(r => r.rangeM) });
    const byRange = new Map(res.points.map(p => [p.rangeM, p]));
    return { ...res, rows: rows.map(r => ({ ...r, p: byRange.get(r.rangeM) })) };
  }, [rifle, ammo, atm, cond.windMph, windAngle, rows]);

  // Last session with conditions
  const lastSession = useMemo(() => [...sessions].filter(s => s.conditions?.source).sort((a, b) => b.date - a.date)[0], [sessions]);
  const useLastSession = () => { if (lastSession) setCond({ ...STANDARD_CONDITIONS, ...lastSession.conditions }); };
  const setC = useCallback(<K extends keyof Conditions>(k: K, v: Conditions[K]) => setCond(c => ({ ...c, [k]: v, source: 'manual' })), []);

  const tempDisp = cond.tempF == null ? undefined : settings.tempUnit === 'F' ? cond.tempF : Math.round(fToC(cond.tempF) * 10) / 10;
  const setTempDisp = (v: number | undefined) => setC('tempF', v == null ? undefined : settings.tempUnit === 'F' ? v : cToF(v));

  // ---------- render ----------
  if (!rifles.length || !ammos.length) {
    return (
      <>
        <h1 className="page-title">Dope</h1>
        <section className="panel">
          <h2>Nothing to solve yet</h2>
          <p className="empty">
            {!rifles.length && !ammos.length ? 'Add a rifle and an ammo load in the Gear tab, then come back here for a drop table.'
              : !rifles.length ? 'Add a rifle in the Gear tab (sight height, zero distance, click unit) to build a dope table.'
              : 'Add an ammo load in the Gear tab (BC, drag model, muzzle velocity) to build a dope table.'}
          </p>
          <button className="btn" onClick={() => { location.hash = 'gear'; }}>Open Gear</button>
        </section>
      </>
    );
  }

  const header = (
    <section className="panel no-print">
      <div className="dope-head">
        <Field label="Rifle" id="dope-rifle">
          <select id="dope-rifle" value={rifle?.id ?? ''} onChange={e => setRifleId(e.target.value)}>
            {rifles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Ammo" id="dope-ammo">
          <select id="dope-ammo" value={ammo?.id ?? ''} onChange={e => setAmmoId(e.target.value)}>
            {ammos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      {rifle && ammo && (
        <p className="small muted">
          Zero {fmtDistance(rifle.zeroDistanceM, du)} · sight {rifle.scopeHeightIn}" · {rifle.clickValue} {rifle.clickUnit}/click · {ammo.bulletWeightGr} gr {ammo.dragModel} {ammo.bc} @ {fmtVel(ammo.muzzleVelocityFps)} {velLabel}
        </p>
      )}
    </section>
  );

  const conditions = (
    <section className="panel no-print">
      <div className="row">
        <h2>Conditions</h2><span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={useLastSession} disabled={!lastSession} title={lastSession ? new Date(lastSession.date).toLocaleDateString() : 'No logged session with conditions'}>Last session</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setCond({ ...STANDARD_CONDITIONS })}>Standard</button>
      </div>
      <div className="cond-grid">
        <Field label={`Temp °${settings.tempUnit}`} id="c-temp"><NumInput id="c-temp" value={tempDisp} onChange={setTempDisp} /></Field>
        <Field label="Pressure inHg" id="c-press"><NumInput id="c-press" value={cond.pressureInHg} onChange={v => setC('pressureInHg', v)} step={0.01} placeholder="station" /></Field>
        <Field label="Humidity %" id="c-hum"><NumInput id="c-hum" value={cond.humidityPct} onChange={v => setC('humidityPct', v)} /></Field>
        <Field label="Wind mph" id="c-wind"><NumInput id="c-wind" value={cond.windMph} onChange={v => setC('windMph', v)} /></Field>
        <Field label="Wind from °" id="c-wdir"><NumInput id="c-wdir" value={cond.windDirDeg} onChange={v => setC('windDirDeg', v)} /></Field>
        <Field label="Altitude ft" id="c-alt"><NumInput id="c-alt" value={cond.altitudeFt} onChange={v => setC('altitudeFt', v)} /></Field>
      </div>
      <div className="row">
        <Field label={autoLof != null ? `Line of fire (from ${range?.name ?? 'range'} stakes)` : 'Line of fire bearing °'} id="c-lof">
          {autoLof != null
            ? <div className="input mono" aria-readonly="true">{Math.round(autoLof)}°</div>
            : <NumInput id="c-lof" value={manualLof} onChange={setManualLof} placeholder="e.g. 270" />}
        </Field>
        <Field label={`Max ${du}`} id="c-max"><NumInput id="c-max" value={maxRange} onChange={v => setMaxRange(v && v > 0 ? Math.min(v, 3000) : 600)} step={50} /></Field>
      </div>
      <div className="cond-meta">
        <span>DA {Math.round(atm.densityAltitudeFt)} ft</span>
        <span>ρ {atm.densityRatio.toFixed(3)}</span>
        <span>Mach 1 = {Math.round(atm.speedOfSoundFps)} fps</span>
        <span>wind angle {Math.round(windAngle)}° {lof == null ? '(no bearing: full value)' : ''}</span>
        {cond.source === 'open-meteo' && <span>from Open-Meteo</span>}
      </div>
    </section>
  );

  const windCell = (p: TrajectoryPoint) => {
    const v = dispUnit === 'MOA' ? p.windMoa : p.windMrad;
    if (Math.abs(v) < 0.005) return { text: '0', cls: '' };
    return { text: `${fmtAngle(Math.abs(v), dispUnit)} ${v > 0 ? 'R' : 'L'}`, cls: v > 0 ? 'right' : 'left' };
  };
  const elevVal = (p: TrajectoryPoint) => (dispUnit === 'MOA' ? p.elevMoa : p.elevMrad);
  const clicks = (p: TrajectoryPoint) => (rifle ? toClicks(rifle.clickUnit === 'MOA' ? p.elevMoa : p.elevMrad, rifle.clickValue) : 0);

  const controls = (
    <div className="row no-print">
      <Seg<UnitMode> value={unitMode} onChange={setUnitMode} label="Angle unit" options={[{ value: 'rifle', label: rifle ? `Rifle (${rifle.clickUnit})` : 'Rifle' }, { value: 'MOA', label: 'MOA' }, { value: 'MRAD', label: 'MRAD' }]} />
      <span className="spacer" />
      <button className="btn btn-ghost btn-sm" onClick={() => setTruing(true)}>True MV</button>
      <Seg<View> value={view} onChange={setView} label="View" options={[{ value: 'table', label: 'Table' }, { value: 'card', label: 'Card' }]} />
    </div>
  );

  const table = solved && (
    <section className="panel">
      {controls}
      <div className="table-wrap">
        <table className="data dope">
          <thead>
            <tr><th>Range</th><th>Drop in</th><th>Elev {dispUnit}</th><th>Wind {dispUnit}</th><th>Vel {velLabel}</th><th>TOF s</th><th>Energy</th></tr>
          </thead>
          <tbody>
            {solved.rows.map((r, i) => (
              <tr key={i} className={r.stake ? 'stake' : undefined}>
                <td>{Math.round(toDisp(r.rangeM))}{r.label && <span className="sub">{r.label}</span>}</td>
                {r.p ? (<>
                  <td>{fmt(r.p.dropIn, 1)}</td>
                  <td className="elev">{fmtAngle(elevVal(r.p), dispUnit)}<span className="sub">{clicks(r.p)} clicks</span></td>
                  <td className={`wind ${windCell(r.p).cls}`}>{windCell(r.p).text}</td>
                  <td>{fmtVel(r.p.velocityFps)}<span className="sub">M {r.p.mach.toFixed(2)}</span></td>
                  <td>{r.p.tofS.toFixed(2)}</td>
                  <td>{Math.round(r.p.energyFtLb)}</td>
                </>) : <td colSpan={6} className="muted">beyond solver range</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Elev positive = come up. Wind hold R/L for {cond.windMph ?? 0} mph at {Math.round(windAngle)}°. Point-mass solver; no spin drift or Coriolis.</p>
    </section>
  );

  const card = solved && rifle && ammo && (
    <>
      <section className="panel no-print">{controls}<button className="btn btn-ghost" onClick={() => window.print()}>Print</button></section>
      <section className="dope-card">
        <h2>{rifle.name} · {ammo.name}</h2>
        <div className="dope-card-meta">
          <span>Zero {fmtDistance(rifle.zeroDistanceM, du)} · {rifle.clickValue} {rifle.clickUnit}/click</span>
          <span>{ammo.bulletWeightGr} gr {ammo.dragModel} {ammo.bc} · MV {fmtVel(ammo.muzzleVelocityFps)} {velLabel}</span>
          <span>{Math.round(cond.tempF ?? 59)}°F {fmt(cond.pressureInHg ?? 29.92, 2)} inHg {Math.round(cond.humidityPct ?? 0)}% · DA {Math.round(atm.densityAltitudeFt)} ft</span>
          <span>Wind {cond.windMph ?? 0} mph @ {Math.round(windAngle)}° · {new Date().toLocaleDateString()}</span>
        </div>
        <table>
          <thead><tr><th>{du}</th><th>Elev {dispUnit}</th><th>Clicks</th><th>Wind {dispUnit}</th><th>{velLabel}</th></tr></thead>
          <tbody>
            {solved.rows.filter(r => r.p).map((r, i) => (
              <tr key={i} className={r.stake ? 'stake' : undefined}>
                <td>{Math.round(toDisp(r.rangeM))}{r.label ? ` ${r.label}` : ''}</td>
                <td className="elev">{fmtAngle(elevVal(r.p!), dispUnit)}</td>
                <td>{clicks(r.p!)}</td>
                <td>{windCell(r.p!).text}</td>
                <td>{fmtVel(r.p!.velocityFps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dope-card-foot">Elev = come up. Wind = hold direction for the listed full wind. Range Finder point-mass solver.</p>
      </section>
    </>
  );

  return (
    <>
      <h1 className="page-title no-print">Dope</h1>
      {header}
      {view === 'table' && conditions}
      {view === 'table' ? table : card}
      {truing && rifle && ammo && (
        <TruingSheet rifle={rifle} ammo={ammo} cond={cond} rows={solved?.rows ?? []} du={du} fmtVel={fmtVel} velLabel={velLabel} onClose={() => setTruing(false)} />
      )}
    </>
  );
}

// ---------- Truing sheet ----------
function TruingSheet({ rifle, ammo, cond, rows, du, fmtVel, velLabel, onClose }: {
  rifle: Rifle; ammo: Ammo; cond: Conditions; rows: Row[]; du: 'yd' | 'm'; fmtVel: (fps: number) => string; velLabel: string; onClose: () => void;
}) {
  const toDisp = (m: number) => (du === 'yd' ? mToYd(m) : m);
  const fromDisp = (v: number) => (du === 'yd' ? ydToM(v) : v);
  const defaultDist = rows.filter(r => r.p).map(r => r.rangeM).find(m => toDisp(m) >= 500) ?? rows.filter(r => r.p).at(-1)?.rangeM ?? fromDisp(500);
  const [distDisp, setDistDisp] = useState<number | undefined>(Math.round(toDisp(defaultDist)));
  const [unit, setUnit] = useState<ClickUnit | 'in'>(rifle.clickUnit);
  const [observed, setObserved] = useState<number | undefined>(undefined);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const atm = useMemo(() => atmosphereFrom(cond), [cond]);
  const distM = distDisp && distDisp > 0 ? fromDisp(distDisp) : undefined;
  const predicted = useMemo(() => {
    if (!distM) return undefined;
    const p = solveTrajectory({ ammo: toAmmoInput(ammo), rifle: toRifleInput(rifle), atmosphere: atm, rangesM: [distM] }).points[0];
    if (!p) return undefined;
    return unit === 'MOA' ? p.elevMoa : unit === 'MRAD' ? p.elevMrad : p.dropIn;
  }, [ammo, rifle, atm, distM, unit]);
  const result = useMemo(() => {
    if (!distM || observed == null) return undefined;
    return trueMuzzleVelocity({ ammo: toAmmoInput(ammo), rifle: toRifleInput(rifle), atmosphere: atm, distanceM: distM, observed, observedUnit: unit });
  }, [ammo, rifle, atm, distM, observed, unit]);

  const save = async () => {
    if (!result?.converged || !distM) return;
    setBusy(true);
    const line = `Trued ${new Date().toISOString().slice(0, 10)} at ${Math.round(toDisp(distM))} ${du}: ${ammo.muzzleVelocityFps}→${result.mvFps} fps`;
    await put('ammo', { ...ammo, muzzleVelocityFps: result.mvFps, notes: ammo.notes ? `${ammo.notes}\n${line}` : line });
    setBusy(false);
    setSaved(line);
  };

  const unitLabel = unit === 'in' ? 'in' : unit;
  return (
    <Sheet title="True muzzle velocity" onClose={onClose}>
      <p className="small muted">Shoot a known distance, dial the predicted elevation, then enter the hold that actually centred the group. The solver back-solves the MV that produces it in today's conditions.</p>
      <div className="grid-2">
        <Field label={`Distance ${du}`} id="t-dist">
          <NumInput id="t-dist" value={distDisp} onChange={setDistDisp} />
        </Field>
        <Field label="Hold unit" id="t-unit">
          <select id="t-unit" value={unit} onChange={e => setUnit(e.target.value as ClickUnit | 'in')}>
            <option value="MOA">MOA</option><option value="MRAD">MRAD</option><option value="in">inches of drop</option>
          </select>
        </Field>
      </div>
      {rows.some(r => r.stake) && (
        <div className="row">
          {rows.filter(r => r.stake && r.p).map((r, i) => (
            <button key={i} type="button" className="btn btn-ghost btn-sm" onClick={() => setDistDisp(Math.round(toDisp(r.rangeM)))}>{r.label} · {Math.round(toDisp(r.rangeM))}</button>
          ))}
        </div>
      )}
      <Field label={`Observed elevation that hit (${unitLabel}, up = positive)`} id="t-obs">
        <NumInput id="t-obs" value={observed} onChange={setObserved} placeholder={predicted != null ? `predicted ${predicted.toFixed(unit === 'MRAD' ? 2 : 1)}` : ''} />
      </Field>
      {predicted != null && <p className="small muted">Predicted at {fmtVel(ammo.muzzleVelocityFps)} {velLabel}: <span className="mono">{predicted.toFixed(unit === 'MRAD' ? 2 : 1)} {unitLabel}</span></p>}
      {result && (
        result.converged ? (
          <div className="card">
            <div className="grow">
              <div className="title">MV {fmtVel(ammo.muzzleVelocityFps)} → <span className={result.mvFps === ammo.muzzleVelocityFps ? '' : result.mvFps > ammo.muzzleVelocityFps ? 'good' : 'warn'}>{fmtVel(result.mvFps)}</span> {velLabel}</div>
              <div className="sub">{result.mvFps - ammo.muzzleVelocityFps >= 0 ? '+' : ''}{result.mvFps - ammo.muzzleVelocityFps} fps · predicted with new MV {result.predicted.toFixed(unit === 'MRAD' ? 2 : 1)} {unitLabel}</div>
            </div>
          </div>
        ) : <p className="bad small">That hold is outside what any plausible muzzle velocity (400–6000 fps) produces at this distance. Check distance, unit and sign.</p>
      )}
      {saved ? <p className="good small">{saved}. Saved to {ammo.name}.</p> : (
        <button className="btn btn-primary" disabled={!result?.converged || busy || result.mvFps === ammo.muzzleVelocityFps} onClick={save}>Save to ammo</button>
      )}
      <p className="small muted">Best trued at 60–80 % of your max range where drop is sensitive to MV but the bullet is still well supersonic. Truing at transonic ranges blames BC error on MV.</p>
    </Sheet>
  );
}
