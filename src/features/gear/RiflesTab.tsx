import { useEffect, useState } from 'react';
import { fmtDistance, mToYd, ydToM } from '@/app/geo';
import { ConfirmButton, Field, Seg, Sheet } from '@/app/ui';
import { create, put, remove, useCollection, useSettings } from '@/store/db';
import type { Ammo, Base, CleaningEvent, Rifle, ZeroEvent } from '@/store/types';
import { barrelLifeFor, barrelLifeFraction } from './barrelLife';
import { CLICK_PRESETS, cleaningsFor, currentZeroM, matchClickPreset, num, optNum, roundsSinceCleaning, zerosFor } from './gearLogic';

type View = null | { kind: 'detail'; id: string } | { kind: 'edit'; rifle?: Rifle; returnTo?: string };

const fmtDate = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });

export default function RiflesTab() {
  const rifles = useCollection('rifles');
  const zeros = useCollection('zeroEvents');
  const cleanings = useCollection('cleaningEvents');
  const ammo = useCollection('ammo');
  const { distanceUnit } = useSettings();
  const [view, setView] = useState<View>(null);

  const sorted = [...rifles].sort((a, b) => a.name.localeCompare(b.name));
  const detail = view?.kind === 'detail' ? rifles.find(r => r.id === view.id) : undefined;

  return (
    <>
      <section className="panel">
        <div className="row">
          <h2>Rifles</h2><span className="spacer" />
          <button className="btn btn-sm btn-primary" onClick={() => setView({ kind: 'edit' })}>Add rifle</button>
        </div>
        {sorted.length === 0 && <p className="empty">No rifles yet. Add one so Ballistics and the Logbook can use its zero and click values.</p>}
        <ul className="list">
          {sorted.map(r => {
            const since = roundsSinceCleaning(r, cleanings);
            const life = barrelLifeFor(r.caliber);
            return (
              <li key={r.id} className="gear-item" onClick={() => setView({ kind: 'detail', id: r.id })}>
                <div className="grow">
                  <div className="title">{r.name}</div>
                  <div className="sub">{r.caliber} · {r.roundCount} rds · {since} since clean · zero {fmtDistance(currentZeroM(r, zeros), distanceUnit)}</div>
                  {life && <BarrelBar rounds={r.roundCount} life={life.rounds} compact />}
                </div>
                <span className="pill">{r.clickValue} {r.clickUnit}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {view?.kind === 'edit' && (
        <RifleForm
          rifle={view.rifle}
          distanceUnit={distanceUnit}
          onClose={() => setView(view.returnTo ? { kind: 'detail', id: view.returnTo } : null)}
          onSaved={id => setView({ kind: 'detail', id })}
        />
      )}
      {view?.kind === 'detail' && detail && (
        <RifleDetail
          rifle={detail}
          zeros={zerosFor(detail.id, zeros)}
          cleanings={cleaningsFor(detail.id, cleanings)}
          ammo={ammo}
          distanceUnit={distanceUnit}
          onClose={() => setView(null)}
          onEdit={() => setView({ kind: 'edit', rifle: detail, returnTo: detail.id })}
          onDeleted={() => setView(null)}
        />
      )}
    </>
  );
}

function BarrelBar({ rounds, life, compact }: { rounds: number; life: number; compact?: boolean }) {
  const f = barrelLifeFraction(rounds, life);
  const cls = f >= 1 ? 'bad' : f >= 0.8 ? 'warn' : '';
  return (
    <div className={'barrel' + (compact ? ' compact' : '')}>
      <div className={'progress ' + cls}><i style={{ width: `${Math.round(f * 100)}%` }} /></div>
      {!compact && <div className="small muted num">{rounds.toLocaleString()} / ~{life.toLocaleString()} rds typical · {Math.round(f * 100)}%</div>}
    </div>
  );
}

// ---------------- Add / edit ----------------
function RifleForm({ rifle, distanceUnit, onClose, onSaved }: { rifle?: Rifle; distanceUnit: 'yd' | 'm'; onClose: () => void; onSaved: (id: string) => void }) {
  const toDisp = (m: number) => distanceUnit === 'yd' ? mToYd(m) : m;
  const toM = (d: number) => distanceUnit === 'yd' ? ydToM(d) : d;
  const fmtNum = (v: number) => (Math.round(v * 100) / 100).toString();

  const [name, setName] = useState(rifle?.name ?? '');
  const [caliber, setCaliber] = useState(rifle?.caliber ?? '');
  const [barrelLen, setBarrelLen] = useState(rifle?.barrelLengthIn != null ? String(rifle.barrelLengthIn) : '');
  const [twist, setTwist] = useState(rifle?.twistRate ?? '');
  const [scope, setScope] = useState(rifle?.scope ?? '');
  const [scopeH, setScopeH] = useState(rifle ? String(rifle.scopeHeightIn) : '1.8');
  const [clickUnit, setClickUnit] = useState<Rifle['clickUnit']>(rifle?.clickUnit ?? 'MRAD');
  const [clickValue, setClickValue] = useState(rifle ? String(rifle.clickValue) : '0.1');
  const [zeroDist, setZeroDist] = useState(rifle ? fmtNum(toDisp(rifle.zeroDistanceM)) : '100');
  const [rounds, setRounds] = useState(rifle ? String(rifle.roundCount) : '0');
  const [notes, setNotes] = useState(rifle?.notes ?? '');

  const preset = matchClickPreset(clickUnit, num(clickValue));
  const valid = name.trim() && caliber.trim() && num(scopeH, NaN) > 0 && num(clickValue, NaN) > 0 && num(zeroDist, NaN) > 0;

  async function save() {
    if (!valid) return;
    const fields: Omit<Rifle, keyof Base> = {
      name: name.trim(), caliber: caliber.trim(),
      barrelLengthIn: optNum(barrelLen), twistRate: twist.trim() || undefined, scope: scope.trim() || undefined,
      scopeHeightIn: num(scopeH), clickUnit, clickValue: num(clickValue),
      zeroDistanceM: toM(num(zeroDist)), roundCount: Math.max(0, Math.round(num(rounds))),
      notes: notes.trim() || undefined,
    };
    const rec: Rifle = rifle ? { ...rifle, ...fields } : create<Rifle>(fields);
    await put('rifles', rec);
    onSaved(rec.id);
  }

  return (
    <Sheet title={rifle ? 'Edit rifle' : 'New rifle'} onClose={onClose}>
      <Field label="Name" id="rf-name"><input id="rf-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Tikka T3x" autoFocus /></Field>
      <div className="grid-2">
        <Field label="Caliber" id="rf-cal"><input id="rf-cal" className="input" value={caliber} onChange={e => setCaliber(e.target.value)} placeholder="6.5 Creedmoor" /></Field>
        <Field label="Twist rate" id="rf-twist"><input id="rf-twist" className="input" value={twist} onChange={e => setTwist(e.target.value)} placeholder="1:8" /></Field>
      </div>
      <div className="grid-2">
        <Field label="Barrel length (in)" id="rf-bl"><input id="rf-bl" className="input mono" inputMode="decimal" value={barrelLen} onChange={e => setBarrelLen(e.target.value)} placeholder="24" /></Field>
        <Field label="Scope height (in)" id="rf-sh"><input id="rf-sh" className="input mono" inputMode="decimal" value={scopeH} onChange={e => setScopeH(e.target.value)} /></Field>
      </div>
      <Field label="Scope" id="rf-scope"><input id="rf-scope" className="input" value={scope} onChange={e => setScope(e.target.value)} placeholder="Vortex Viper PST 5-25" /></Field>

      <Field label="Click value">
        <div className="row">
          {CLICK_PRESETS.map(p => (
            <button key={p.label} type="button" className="btn btn-ghost btn-sm gear-chip" aria-pressed={preset?.label === p.label}
              onClick={() => { setClickUnit(p.unit); setClickValue(String(p.value)); }}>{p.label}</button>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label="Unit"><Seg value={clickUnit} options={[{ value: 'MOA', label: 'MOA' }, { value: 'MRAD', label: 'MRAD' }]} onChange={setClickUnit} label="Click unit" /></Field>
        <Field label={`Per click (${clickUnit})`} id="rf-cv"><input id="rf-cv" className="input mono" inputMode="decimal" value={clickValue} onChange={e => setClickValue(e.target.value)} /></Field>
      </div>
      <div className="grid-2">
        <Field label={`Zero distance (${distanceUnit})`} id="rf-zero"><input id="rf-zero" className="input mono" inputMode="decimal" value={zeroDist} onChange={e => setZeroDist(e.target.value)} /></Field>
        <Field label="Round count" id="rf-rc"><input id="rf-rc" className="input mono" inputMode="numeric" value={rounds} onChange={e => setRounds(e.target.value)} /></Field>
      </div>
      <Field label="Notes" id="rf-notes"><textarea id="rf-notes" value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      <button className="btn btn-primary btn-big" disabled={!valid} onClick={save}>{rifle ? 'Save' : 'Add rifle'}</button>
    </Sheet>
  );
}

// ---------------- Detail ----------------
function RifleDetail({ rifle, zeros, cleanings, ammo, distanceUnit, onClose, onEdit, onDeleted }: {
  rifle: Rifle; zeros: ZeroEvent[]; cleanings: CleaningEvent[]; ammo: Ammo[]; distanceUnit: 'yd' | 'm';
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
}) {
  const [addRounds, setAddRounds] = useState('');
  const [logging, setLogging] = useState<null | 'clean' | 'zero'>(null);
  const life = barrelLifeFor(rifle.caliber);
  const since = roundsSinceCleaning(rifle, cleanings);
  const ammoName = (id?: string) => (id && ammo.find(a => a.id === id)?.name) || undefined;

  const bump = (n: number) => put('rifles', { ...rifle, roundCount: Math.max(0, rifle.roundCount + n) });

  async function del() {
    for (const z of zeros) await remove('zeroEvents', z.id);
    for (const c of cleanings) await remove('cleaningEvents', c.id);
    await remove('rifles', rifle.id);
    onDeleted();
  }

  return (
    <Sheet title={rifle.name} onClose={onClose}>
      <div className="row small muted">
        <span>{rifle.caliber}</span>
        {rifle.barrelLengthIn != null && <span>· {rifle.barrelLengthIn}"</span>}
        {rifle.twistRate && <span>· {rifle.twistRate}</span>}
        {rifle.scope && <span>· {rifle.scope}</span>}
        <span>· {rifle.clickValue} {rifle.clickUnit}</span>
        <span>· SH {rifle.scopeHeightIn}"</span>
      </div>

      <div className="card gear-stat">
        <div className="grow">
          <div className="label">Round count</div>
          <div className="value mono">{rifle.roundCount.toLocaleString()}</div>
          <div className="small muted">{since.toLocaleString()} since last cleaning</div>
        </div>
        <div className="gear-steppers">
          <button className="btn btn-sm" onClick={() => bump(-1)} disabled={rifle.roundCount <= 0} aria-label="minus one">−1</button>
          <button className="btn btn-sm" onClick={() => bump(1)} aria-label="plus one">+1</button>
          <button className="btn btn-sm" onClick={() => bump(5)}>+5</button>
          <button className="btn btn-sm" onClick={() => bump(10)}>+10</button>
        </div>
      </div>
      <div className="row">
        <input className="input mono" inputMode="numeric" placeholder="Add rounds" value={addRounds} onChange={e => setAddRounds(e.target.value)} style={{ flex: 1 }} aria-label="Rounds to add" />
        <button className="btn" disabled={!(num(addRounds, NaN) > 0)} onClick={() => { bump(Math.round(num(addRounds))); setAddRounds(''); }}>Add</button>
      </div>
      {life && <BarrelBar rounds={rifle.roundCount} life={life.rounds} />}

      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => setLogging(logging === 'zero' ? null : 'zero')} aria-pressed={logging === 'zero'}>Log zero</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => setLogging(logging === 'clean' ? null : 'clean')} aria-pressed={logging === 'clean'}>Log cleaning</button>
      </div>
      {logging === 'zero' && <ZeroForm rifle={rifle} ammo={ammo} distanceUnit={distanceUnit} zeros={zeros} onDone={() => setLogging(null)} />}
      {logging === 'clean' && <CleanForm rifle={rifle} onDone={() => setLogging(null)} />}

      <h2>Zero history</h2>
      {zeros.length === 0 ? <p className="empty">No zeros logged. Current zero from setup: {fmtDistance(rifle.zeroDistanceM, distanceUnit)}.</p> : (
        <ul className="list">
          {zeros.map(z => (
            <li key={z.id}>
              <div className="grow">
                <div className="title">{fmtDistance(z.distanceM, distanceUnit)}{ammoName(z.ammoId) ? <span className="muted small"> · {ammoName(z.ammoId)}</span> : null}</div>
                {z.notes && <div className="sub">{z.notes}</div>}
              </div>
              <span className="small muted num">{fmtDate(z.createdAt)}</span>
              <ConfirmButton label="×" confirmLabel="Delete" onConfirm={() => remove('zeroEvents', z.id)} />
            </li>
          ))}
        </ul>
      )}

      <h2>Cleaning history</h2>
      {cleanings.length === 0 ? <p className="empty">Never cleaned (or never logged).</p> : (
        <ul className="list">
          {cleanings.map(c => (
            <li key={c.id}>
              <div className="grow">
                <div className="title">at {c.roundCountAt.toLocaleString()} rds</div>
                {c.notes && <div className="sub">{c.notes}</div>}
              </div>
              <span className="small muted num">{fmtDate(c.createdAt)}</span>
              <ConfirmButton label="×" confirmLabel="Delete" onConfirm={() => remove('cleaningEvents', c.id)} />
            </li>
          ))}
        </ul>
      )}

      {rifle.notes && (<><h2>Notes</h2><p className="small gear-notes">{rifle.notes}</p></>)}

      <div className="row">
        <button className="btn btn-ghost" onClick={onEdit}>Edit</button>
        <span className="spacer" />
        <ConfirmButton label="Delete rifle" confirmLabel="Delete rifle + history?" onConfirm={del} className="btn btn-ghost btn-danger" />
      </div>
    </Sheet>
  );
}

function ZeroForm({ rifle, ammo, distanceUnit, zeros, onDone }: { rifle: Rifle; ammo: Ammo[]; distanceUnit: 'yd' | 'm'; zeros: ZeroEvent[]; onDone: () => void }) {
  const cur = currentZeroM(rifle, zeros);
  const [dist, setDist] = useState(String(Math.round(distanceUnit === 'yd' ? mToYd(cur) : cur)));
  const [ammoId, setAmmoId] = useState(zeros[0]?.ammoId ?? '');
  const [notes, setNotes] = useState('');
  const sameCal = ammo.filter(a => a.caliber.trim().toLowerCase() === rifle.caliber.trim().toLowerCase());
  const options = sameCal.length ? sameCal : ammo;
  useEffect(() => { if (ammoId && !ammo.some(a => a.id === ammoId)) setAmmoId(''); }, [ammo, ammoId]);

  async function save() {
    const d = num(dist, NaN); if (!(d > 0)) return;
    const distanceM = distanceUnit === 'yd' ? ydToM(d) : d;
    await put('zeroEvents', create<ZeroEvent>({ rifleId: rifle.id, distanceM, ammoId: ammoId || undefined, notes: notes.trim() || undefined }));
    // keep the rifle's own zero in step so Ballistics reads the latest without needing events
    await put('rifles', { ...rifle, zeroDistanceM: distanceM });
    onDone();
  }
  return (
    <div className="card gear-inline-form">
      <div className="grid-2">
        <Field label={`Distance (${distanceUnit})`} id="zf-d"><input id="zf-d" className="input mono" inputMode="decimal" value={dist} onChange={e => setDist(e.target.value)} autoFocus /></Field>
        <Field label="Ammo" id="zf-a">
          <select id="zf-a" value={ammoId} onChange={e => setAmmoId(e.target.value)}>
            <option value="">—</option>
            {options.map(a => <option key={a.id} value={a.id}>{a.name}{a.lot ? ` (${a.lot})` : ''}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes" id="zf-n"><input id="zf-n" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Dialed 0.2 up, confirmed 5-shot group" /></Field>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button><span className="spacer" />
        <button className="btn btn-primary btn-sm" disabled={!(num(dist, NaN) > 0)} onClick={save}>Save zero</button>
      </div>
    </div>
  );
}

function CleanForm({ rifle, onDone }: { rifle: Rifle; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  async function save() {
    await put('cleaningEvents', create<CleaningEvent>({ rifleId: rifle.id, roundCountAt: rifle.roundCount, notes: notes.trim() || undefined }));
    onDone();
  }
  return (
    <div className="card gear-inline-form">
      <p className="small muted">Logs a cleaning at the current count of <b className="mono">{rifle.roundCount.toLocaleString()}</b> rounds.</p>
      <Field label="Notes" id="cf-n"><input id="cf-n" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Bore Tech Eliminator, 10 patches" autoFocus /></Field>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button><span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={save}>Log cleaning</button>
      </div>
    </div>
  );
}
