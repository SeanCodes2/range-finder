// Logbook tab: sessions → shot groups, with conditions, target photos, inventory hooks and CSV export.
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { create, newId, put, remove, useCollection, useDoc, useSettings } from '@/store/db';
import type { Ammo, Conditions, Range, Rifle, Session, Settings, ShotGroup, Stake } from '@/store/types';
import { ConfirmButton, Field, Sheet } from '@/app/ui';
import { useGps } from '@/app/useGps';
import { cToF, distanceM as geoDistanceM, fToC, fmtDistance, mToYd, ydToM } from '@/app/geo';
import { fetchConditions, fmtConditions } from './weather';
import { applyMoves, inventoryMoves } from './inventory';
import { fmtGroupAngle, groupMoa } from './moa';
import { toCsv, type CsvValue } from './csv';
import { downscaleImage, useObjectUrl } from './photos';
import { fmtDate, fromLocalInput, num, str, toLocalInput } from './fmt';
import './logbook.css';

type Named = { id: string; name: string };
const index = <T extends { id: string }>(rows: T[]) => new Map(rows.map(r => [r.id, r]));
const nameOf = (m: Map<string, Named>, id?: string, fallback = '—') => (id ? m.get(id)?.name ?? '(deleted)' : fallback);
const toDisplayDist = (m: number, u: Settings['distanceUnit']) => (u === 'yd' ? mToYd(m) : m);
const fromDisplayDist = (v: number, u: Settings['distanceUnit']) => (u === 'yd' ? ydToM(v) : v);

export default function LogbookPage() {
  const sessions = useCollection('sessions');
  const groups = useCollection('groups');
  const ranges = useCollection('ranges');
  const stakes = useCollection('stakes');
  const rifles = useCollection('rifles');
  const ammo = useCollection('ammo');
  const settings = useSettings();

  const [openId, setOpenId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<{ session?: Session } | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const rangeMap = useMemo(() => index(ranges), [ranges]);
  const rifleMap = useMemo(() => index(rifles), [rifles]);
  const ammoMap = useMemo(() => index(ammo), [ammo]);
  const stakeMap = useMemo(() => index(stakes), [stakes]);
  const sorted = useMemo(() => [...sessions].sort((a, b) => b.date - a.date), [sessions]);
  const groupsBySession = useMemo(() => {
    const m = new Map<string, ShotGroup[]>();
    for (const g of groups) { const arr = m.get(g.sessionId) ?? []; arr.push(g); m.set(g.sessionId, arr); }
    for (const arr of m.values()) arr.sort((a, b) => a.createdAt - b.createdAt);
    return m;
  }, [groups]);

  const open = openId ? sessions.find(s => s.id === openId) : undefined;
  useEffect(() => { if (openId && sessions.length && !sessions.some(s => s.id === openId)) setOpenId(null); }, [openId, sessions]);

  async function saveSession(s: Session, prev?: Session) {
    await put('sessions', s);
    if (prev && (prev.rifleId !== s.rifleId || prev.ammoId !== s.ammoId)) {
      const total = (groupsBySession.get(s.id) ?? []).reduce((a, g) => a + (g.rounds || 0), 0);
      if (total) await applyMoves(inventoryMoves({ rifleId: prev.rifleId, ammoId: prev.ammoId, rounds: total }, { rifleId: s.rifleId, ammoId: s.ammoId, rounds: total }));
    }
    setSessionForm(null);
    if (!prev) setOpenId(s.id);
  }

  async function deleteSession(s: Session) {
    const gs = groupsBySession.get(s.id) ?? [];
    for (const g of gs) { if (g.photoId) await remove('photos', g.photoId); await remove('groups', g.id); }
    const total = gs.reduce((a, g) => a + (g.rounds || 0), 0);
    if (total) await applyMoves(inventoryMoves({ rifleId: s.rifleId, ammoId: s.ammoId, rounds: total }, null));
    await remove('sessions', s.id);
    setOpenId(null);
  }

  function exportCsv() {
    const sMap = index(sessions);
    const du = settings.distanceUnit;
    const rows: Record<string, CsvValue>[] = [...groups]
      .map(g => ({ g, s: sMap.get(g.sessionId) }))
      .sort((a, b) => (a.s?.date ?? 0) - (b.s?.date ?? 0) || a.g.createdAt - b.g.createdAt)
      .map(({ g, s }) => {
        const c = s?.conditions ?? {};
        const dist = toDisplayDist(g.distanceM, du);
        return {
          date: s ? new Date(s.date).toISOString() : '',
          range: nameOf(rangeMap, s?.rangeId, ''),
          rifle: nameOf(rifleMap, s?.rifleId, ''),
          ammo: nameOf(ammoMap, s?.ammoId, ''),
          stake: g.stakeId ? stakeMap.get(g.stakeId)?.label ?? '' : '',
          [`distance_${du}`]: Number(dist.toFixed(1)),
          distance_m: Number(g.distanceM.toFixed(2)),
          rounds: g.rounds,
          group_in: g.groupSizeIn,
          group_moa: (() => { const m = groupMoa(g.groupSizeIn, g.distanceM); return m == null ? undefined : Number(m.toFixed(3)); })(),
          elevation_hold: g.elevationHold,
          wind_hold: g.windHold,
          temp_f: c.tempF, pressure_inhg: c.pressureInHg, humidity_pct: c.humidityPct,
          wind_mph: c.windMph, wind_from_deg: c.windDirDeg, altitude_ft: c.altitudeFt, conditions_source: c.source,
          has_photo: !!g.photoId,
          group_notes: g.notes, session_notes: s?.notes,
        };
      });
    if (!rows.length) { setExportNote('Nothing to export yet.'); return; }
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'range-log.csv'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setExportNote(`Exported ${rows.length} group${rows.length === 1 ? '' : 's'}.`);
  }

  useEffect(() => { if (!exportNote) return; const t = setTimeout(() => setExportNote(null), 4000); return () => clearTimeout(t); }, [exportNote]);

  if (open) {
    return (
      <SessionDetail
        session={open} groups={groupsBySession.get(open.id) ?? []} settings={settings}
        range={open.rangeId ? rangeMap.get(open.rangeId) : undefined}
        rifle={open.rifleId ? rifleMap.get(open.rifleId) : undefined}
        ammo={open.ammoId ? ammoMap.get(open.ammoId) : undefined}
        stakes={stakes.filter(st => st.rangeId === open.rangeId)}
        onBack={() => setOpenId(null)}
        onEdit={() => setSessionForm({ session: open })}
        onDelete={() => deleteSession(open)}
        sessionForm={sessionForm && (
          <SessionForm initial={sessionForm.session} ranges={ranges} rifles={rifles} ammo={ammo} settings={settings}
            onSave={s => saveSession(s, sessionForm.session)} onClose={() => setSessionForm(null)} />
        )}
      />
    );
  }

  return (
    <>
      <h1 className="page-title">Log</h1>
      <section className="panel">
        <div className="row">
          <button className="btn btn-primary" onClick={() => setSessionForm({})}>New session</button>
          <span className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!groups.length}>Export CSV</button>
        </div>
        {exportNote && <p className="small muted">{exportNote}</p>}
        {!sorted.length ? (
          <p className="empty">No sessions yet. Start one, grab conditions from GPS, then log each group as you shoot it.</p>
        ) : (
          <ul className="list">
            {sorted.map(s => {
              const n = groupsBySession.get(s.id)?.length ?? 0;
              const cond = fmtConditions(s.conditions, settings.tempUnit);
              return (
                <li key={s.id} role="button" tabIndex={0} onClick={() => setOpenId(s.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(s.id); } }}>
                  <div className="grow">
                    <div className="title">{fmtDate(s.date)}{s.rangeId && <span className="muted"> · {nameOf(rangeMap, s.rangeId)}</span>}</div>
                    <div className="sub">{[nameOf(rifleMap, s.rifleId, ''), nameOf(ammoMap, s.ammoId, '')].filter(Boolean).join(' · ') || 'No rifle / ammo'}</div>
                    {cond && <div className="log-cond">{cond}</div>}
                  </div>
                  <span className="pill">{n} {n === 1 ? 'group' : 'groups'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {sessionForm && (
        <SessionForm initial={sessionForm.session} ranges={ranges} rifles={rifles} ammo={ammo} settings={settings}
          onSave={s => saveSession(s, sessionForm.session)} onClose={() => setSessionForm(null)} />
      )}
    </>
  );
}

// ---------------- Session detail ----------------

function SessionDetail({ session, groups, settings, range, rifle, ammo, stakes, onBack, onEdit, onDelete, sessionForm }: {
  session: Session; groups: ShotGroup[]; settings: Settings; range?: Range; rifle?: Rifle; ammo?: Ammo; stakes: Stake[];
  onBack: () => void; onEdit: () => void; onDelete: () => void; sessionForm: ReactNode;
}) {
  const [groupForm, setGroupForm] = useState<{ group?: ShotGroup } | null>(null);
  const [photoView, setPhotoView] = useState<string | null>(null);
  const cond = fmtConditions(session.conditions, settings.tempUnit);
  const totalRounds = groups.reduce((a, g) => a + (g.rounds || 0), 0);

  async function saveGroup(g: ShotGroup, photo: { blob: Blob } | 'remove' | null, prev?: ShotGroup) {
    let photoId = prev?.photoId;
    if (photo === 'remove' || (photo && prev?.photoId)) { if (prev?.photoId) await remove('photos', prev.photoId); photoId = undefined; }
    if (photo && photo !== 'remove') {
      photoId = newId();
      await put('photos', { id: photoId, blob: photo.blob, createdAt: Date.now() });
    }
    await put('groups', { ...g, photoId });
    await applyMoves(inventoryMoves(
      prev ? { rifleId: session.rifleId, ammoId: session.ammoId, rounds: prev.rounds } : null,
      { rifleId: session.rifleId, ammoId: session.ammoId, rounds: g.rounds },
    ));
    setGroupForm(null);
  }

  async function deleteGroup(g: ShotGroup) {
    if (g.photoId) await remove('photos', g.photoId);
    await remove('groups', g.id);
    await applyMoves(inventoryMoves({ rifleId: session.rifleId, ammoId: session.ammoId, rounds: g.rounds }, null));
    setGroupForm(null);
  }

  const unit = rifle?.clickUnit ?? 'MOA';
  return (
    <>
      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>‹ Sessions</button>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
        <ConfirmButton label="Delete" confirmLabel="Delete session?" onConfirm={onDelete} />
      </div>
      <section className="panel log-session-head">
        <h2>{fmtDate(session.date)}</h2>
        <div className="log-meta">
          <span>Range <b>{range?.name ?? (session.rangeId ? '(deleted)' : '—')}</b></span>
          <span>Rifle <b>{rifle?.name ?? (session.rifleId ? '(deleted)' : '—')}</b></span>
          <span>Ammo <b>{ammo?.name ?? (session.ammoId ? '(deleted)' : '—')}</b></span>
          <span>Rounds <b className="num">{totalRounds}</b></span>
        </div>
        <ConditionsView c={session.conditions} summary={cond} tempUnit={settings.tempUnit} />
        {session.notes && <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{session.notes}</p>}
      </section>

      <section className="panel">
        <div className="row"><h2>Groups</h2><span className="spacer" /><button className="btn btn-primary btn-sm" onClick={() => setGroupForm({})}>Add group</button></div>
        {!groups.length ? <p className="empty">No groups yet.</p> : (
          <ul className="list">
            {groups.map((g, i) => {
              const stake = g.stakeId ? stakes.find(s => s.id === g.stakeId) : undefined;
              const angle = fmtGroupAngle(g.groupSizeIn, g.distanceM);
              const holds = [g.elevationHold != null ? `E ${fmtHold(g.elevationHold)} ${unit}` : '', g.windHold != null ? `W ${fmtHold(g.windHold)} ${unit}` : ''].filter(Boolean).join(' · ');
              return (
                <li key={g.id} className="log-group">
                  <div className="grow" role="button" tabIndex={0} onClick={() => setGroupForm({ group: g })} onKeyDown={e => { if (e.key === 'Enter') setGroupForm({ group: g }); }}>
                    <div className="title">
                      <span className="muted small">#{i + 1}</span>
                      <span className="mono">{fmtDistance(g.distanceM, settings.distanceUnit)}</span>
                      {stake && <span className="muted small">{stake.label}</span>}
                      <span className="spacer" />
                      <span className="pill">{g.rounds} rds</span>
                    </div>
                    <div className="sub">
                      {g.groupSizeIn != null ? <>{g.groupSizeIn.toFixed(2)} in{angle && <> · {angle}</>}</> : 'No group size'}
                      {holds && <> · {holds}</>}
                    </div>
                    {g.notes && <div className="notes">{g.notes}</div>}
                  </div>
                  {g.photoId && <PhotoThumb photoId={g.photoId} onOpen={() => setPhotoView(g.photoId!)} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {groupForm && (
        <GroupForm initial={groupForm.group} range={range} stakes={stakes} settings={settings} clickUnit={unit} sessionId={session.id}
          onSave={(g, photo) => saveGroup(g, photo, groupForm.group)}
          onDelete={groupForm.group ? () => deleteGroup(groupForm.group!) : undefined}
          onClose={() => setGroupForm(null)} />
      )}
      {photoView && <PhotoSheet photoId={photoView} onClose={() => setPhotoView(null)} />}
      {sessionForm}
    </>
  );
}

const fmtHold = (v: number) => (v > 0 ? `+${v}` : String(v));

function ConditionsView({ c, summary, tempUnit }: { c: Conditions; summary: string; tempUnit: 'F' | 'C' }) {
  if (!summary && c.humidityPct == null && c.altitudeFt == null) return <p className="log-cond">No conditions recorded.</p>;
  const temp = c.tempF != null ? `${Math.round(tempUnit === 'C' ? fToC(c.tempF) : c.tempF)}°${tempUnit}` : '—';
  return (
    <div>
      <div className="log-meta">
        <span>Temp <b>{temp}</b></span>
        <span>Pressure <b>{c.pressureInHg != null ? `${c.pressureInHg.toFixed(2)} inHg` : '—'}</b></span>
        <span>Humidity <b>{c.humidityPct != null ? `${Math.round(c.humidityPct)}%` : '—'}</b></span>
        <span>Wind <b>{c.windMph != null ? `${Math.round(c.windMph)} mph${c.windDirDeg != null ? ` from ${Math.round(c.windDirDeg)}°` : ''}` : '—'}</b></span>
        <span>Alt <b>{c.altitudeFt != null ? `${Math.round(c.altitudeFt)} ft` : '—'}</b></span>
      </div>
      {c.source === 'open-meteo' && c.fetchedAt && <div className="log-cond">Open-Meteo · {fmtDate(c.fetchedAt)}</div>}
    </div>
  );
}

// ---------------- Photos ----------------

function PhotoThumb({ photoId, onOpen, large }: { photoId: string; onOpen: () => void; large?: boolean }) {
  const photo = useDoc('photos', photoId);
  const url = useObjectUrl(photo?.blob);
  return (
    <button type="button" className={'log-thumb' + (large ? ' lg' : '')} onClick={onOpen} aria-label="View target photo">
      {url && <img src={url} alt="Target" />}
    </button>
  );
}

function PhotoSheet({ photoId, onClose }: { photoId: string; onClose: () => void }) {
  const photo = useDoc('photos', photoId);
  const url = useObjectUrl(photo?.blob);
  return (
    <Sheet title="Target photo" onClose={onClose}>
      <div className="log-photo-full">{url ? <img src={url} alt="Target, full size" /> : <p className="empty">Loading…</p>}</div>
    </Sheet>
  );
}

// ---------------- Session form ----------------

type CondStrings = { temp: string; pressure: string; humidity: string; wind: string; windDir: string; alt: string };
function condToStrings(c: Conditions | undefined, tempUnit: 'F' | 'C'): CondStrings {
  return {
    temp: c?.tempF != null ? str(tempUnit === 'C' ? fToC(c.tempF) : c.tempF, 1) : '',
    pressure: str(c?.pressureInHg, 2), humidity: str(c?.humidityPct, 0),
    wind: str(c?.windMph, 1), windDir: str(c?.windDirDeg, 0), alt: str(c?.altitudeFt, 0),
  };
}

function SessionForm({ initial, ranges, rifles, ammo, settings, onSave, onClose }: {
  initial?: Session; ranges: Range[]; rifles: Rifle[]; ammo: Ammo[]; settings: Settings;
  onSave: (s: Session) => void | Promise<void>; onClose: () => void;
}) {
  const [date, setDate] = useState(toLocalInput(initial?.date ?? Date.now()));
  const [rangeId, setRangeId] = useState(initial?.rangeId ?? '');
  const [rifleId, setRifleId] = useState(initial?.rifleId ?? '');
  const [ammoId, setAmmoId] = useState(initial?.ammoId ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [cs, setCs] = useState<CondStrings>(() => condToStrings(initial?.conditions, settings.tempUnit));
  const [meta, setMeta] = useState<Pick<Conditions, 'source' | 'fetchedAt'>>({ source: initial?.conditions?.source, fetchedAt: initial?.conditions?.fetchedAt });
  const [wx, setWx] = useState<'idle' | 'gps' | 'fetching' | 'done' | 'error'>('idle');
  const [wxErr, setWxErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const gps = useGps(wx === 'gps');
  useEffect(() => {
    if (wx !== 'gps') return;
    if (gps.error) { setWxErr(gps.error); setWx('error'); return; }
    if (!gps.fix) return;
    const { lat, lon } = gps.fix;
    setWx('fetching');
    let alive = true;
    fetchConditions(lat, lon).then(c => {
      if (!alive) return;
      setCs(condToStrings(c, settings.tempUnit));
      setMeta({ source: 'open-meteo', fetchedAt: c.fetchedAt });
      setWx('done');
    }).catch(e => { if (!alive) return; setWxErr((e as Error).message || 'Weather fetch failed'); setWx('error'); });
    return () => { alive = false; };
  }, [wx, gps.fix, gps.error, settings.tempUnit]);

  const edit = (k: keyof CondStrings) => (v: string) => {
    setCs(p => ({ ...p, [k]: v }));
    setMeta({ source: 'manual', fetchedAt: undefined });
    if (wx === 'done' || wx === 'error') setWx('idle');
  };

  async function submit() {
    const d = fromLocalInput(date);
    if (d == null) { setErr('Enter a valid date and time.'); return; }
    const t = num(cs.temp);
    const conditions: Conditions = {
      tempF: t == null ? undefined : settings.tempUnit === 'C' ? cToF(t) : t,
      pressureInHg: num(cs.pressure), humidityPct: num(cs.humidity),
      windMph: num(cs.wind), windDirDeg: num(cs.windDir), altitudeFt: num(cs.alt),
      source: meta.source, fetchedAt: meta.fetchedAt,
    };
    const fields = { date: d, rangeId: rangeId || undefined, rifleId: rifleId || undefined, ammoId: ammoId || undefined, conditions, notes: notes.trim() || undefined };
    const s: Session = initial ? { ...initial, ...fields } : create<Session>(fields);
    setSaving(true);
    try { await onSave(s); } catch (e) { setErr((e as Error).message || 'Could not save'); setSaving(false); }
  }

  const tu = settings.tempUnit;
  return (
    <Sheet title={initial ? 'Edit session' : 'New session'} onClose={onClose}>
      <Field label="Date & time" id="s-date"><input id="s-date" className="input" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <Field label="Range" id="s-range">
        <select id="s-range" value={rangeId} onChange={e => setRangeId(e.target.value)}>
          <option value="">{ranges.length ? '— none —' : 'No ranges yet (add one on the Range tab)'}</option>
          {ranges.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <div className="grid-2">
        <Field label="Rifle" id="s-rifle">
          <select id="s-rifle" value={rifleId} onChange={e => setRifleId(e.target.value)}>
            <option value="">{rifles.length ? '— none —' : 'No rifles yet'}</option>
            {rifles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Ammo" id="s-ammo">
          <select id="s-ammo" value={ammoId} onChange={e => setAmmoId(e.target.value)}>
            <option value="">{ammo.length ? '— none —' : 'No ammo yet'}</option>
            {ammo.map(a => <option key={a.id} value={a.id}>{a.name}{a.lot ? ` (${a.lot})` : ''}</option>)}
          </select>
        </Field>
      </div>

      <div className="row">
        <h2 className="log-subhead">Conditions</h2>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" disabled={wx === 'gps' || wx === 'fetching'} onClick={() => { setWxErr(''); setWx('gps'); }}>
          {wx === 'gps' ? 'Getting fix…' : wx === 'fetching' ? 'Fetching…' : 'Fetch from GPS'}
        </button>
      </div>
      {wx === 'error' && <p className="log-err">{wxErr}</p>}
      {wx === 'done' && <p className="log-ok">Conditions from Open-Meteo{meta.fetchedAt ? ` · ${fmtDate(meta.fetchedAt)}` : ''}</p>}
      {wx === 'idle' && meta.source === 'open-meteo' && meta.fetchedAt && <p className="log-cond">Open-Meteo · {fmtDate(meta.fetchedAt)}</p>}
      <div className="log-grid-3">
        <Field label={`Temp (°${tu})`} id="c-temp"><input id="c-temp" className="input mono" type="number" step="any" inputMode="decimal" value={cs.temp} onChange={e => edit('temp')(e.target.value)} /></Field>
        <Field label="Pressure (inHg)" id="c-press"><input id="c-press" className="input mono" type="number" step="any" inputMode="decimal" value={cs.pressure} onChange={e => edit('pressure')(e.target.value)} /></Field>
        <Field label="Humidity (%)" id="c-hum"><input id="c-hum" className="input mono" type="number" step="any" inputMode="decimal" value={cs.humidity} onChange={e => edit('humidity')(e.target.value)} /></Field>
        <Field label="Wind (mph)" id="c-wind"><input id="c-wind" className="input mono" type="number" step="any" inputMode="decimal" value={cs.wind} onChange={e => edit('wind')(e.target.value)} /></Field>
        <Field label="Wind from (°)" id="c-dir"><input id="c-dir" className="input mono" type="number" step="any" inputMode="decimal" min={0} max={360} value={cs.windDir} onChange={e => edit('windDir')(e.target.value)} /></Field>
        <Field label="Altitude (ft)" id="c-alt"><input id="c-alt" className="input mono" type="number" step="any" inputMode="decimal" value={cs.alt} onChange={e => edit('alt')(e.target.value)} /></Field>
      </div>

      <Field label="Notes" id="s-notes"><textarea id="s-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Light, mirage, how it went…" /></Field>
      {err && <p className="log-err">{err}</p>}
      <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Start session'}</button>
    </Sheet>
  );
}

// ---------------- Group form ----------------

function GroupForm({ initial, range, stakes, settings, clickUnit, sessionId, onSave, onDelete, onClose }: {
  initial?: ShotGroup; range?: Range; stakes: Stake[]; settings: Settings; clickUnit: string; sessionId: string;
  onSave: (g: ShotGroup, photo: { blob: Blob } | 'remove' | null) => void | Promise<void>; onDelete?: () => void | Promise<void>; onClose: () => void;
}) {
  const du = settings.distanceUnit;
  const [stakeId, setStakeId] = useState(initial?.stakeId ?? '');
  const [distM, setDistM] = useState<number | undefined>(initial?.distanceM);
  const [distStr, setDistStr] = useState(initial ? str(toDisplayDist(initial.distanceM, du), 1) : '');
  const [rounds, setRounds] = useState(initial ? String(initial.rounds) : '5');
  const [size, setSize] = useState(str(initial?.groupSizeIn));
  const [elev, setElev] = useState(str(initial?.elevationHold));
  const [wind, setWind] = useState(str(initial?.windHold));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [photo, setPhoto] = useState<{ blob: Blob } | 'remove' | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewExisting, setViewExisting] = useState(false);
  const previewUrl = useObjectUrl(photo && photo !== 'remove' ? photo.blob : undefined);

  function pickStake(id: string) {
    setStakeId(id);
    const st = stakes.find(s => s.id === id);
    if (!st) return;
    const d = range?.firingLine ? geoDistanceM(range.firingLine, st.point) : st.intendedDistanceM;
    if (d != null) { setDistM(d); setDistStr(str(toDisplayDist(d, du), 1)); }
  }
  function editDist(s: string) {
    setDistStr(s);
    const v = num(s);
    setDistM(v == null ? undefined : fromDisplayDist(v, du));
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPhotoBusy(true); setErr('');
    try { setPhoto({ blob: await downscaleImage(f, 1600, 0.8) }); }
    catch (ex) { setErr((ex as Error).message || 'Could not process photo'); }
    finally { setPhotoBusy(false); }
  }

  async function submit() {
    const r = num(rounds);
    if (distM == null || !(distM > 0)) { setErr('Enter a distance or pick a stake.'); return; }
    if (r == null || !(r >= 0) || !Number.isInteger(r)) { setErr('Rounds must be a whole number.'); return; }
    const sz = num(size);
    if (sz != null && sz < 0) { setErr('Group size cannot be negative.'); return; }
    const fields = {
      sessionId, stakeId: stakeId || undefined, distanceM: distM, rounds: r,
      groupSizeIn: sz, elevationHold: num(elev), windHold: num(wind), notes: notes.trim() || undefined,
      photoId: initial?.photoId,
    };
    const g: ShotGroup = initial ? { ...initial, ...fields } : create<ShotGroup>(fields);
    setSaving(true);
    try { await onSave(g, photo); } catch (ex) { setErr((ex as Error).message || 'Could not save'); setSaving(false); }
  }

  const angle = fmtGroupAngle(num(size), distM);
  const showExisting = initial?.photoId && photo === null;
  return (
    <Sheet title={initial ? 'Edit group' : 'Add group'} onClose={onClose}>
      <div className="grid-2">
        <Field label="Stake" id="g-stake">
          <select id="g-stake" value={stakeId} onChange={e => pickStake(e.target.value)} disabled={!stakes.length}>
            <option value="">{stakes.length ? '— manual —' : range ? 'No stakes on this range' : 'No range on session'}</option>
            {stakes.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label={`Distance (${du})`} id="g-dist"><input id="g-dist" className="input mono" type="number" step="any" inputMode="decimal" value={distStr} onChange={e => editDist(e.target.value)} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Rounds" id="g-rounds"><input id="g-rounds" className="input mono" type="number" step="1" inputMode="numeric" value={rounds} onChange={e => setRounds(e.target.value)} /></Field>
        <Field label="Group size (in)" id="g-size"><input id="g-size" className="input mono" type="number" step="any" inputMode="decimal" value={size} onChange={e => setSize(e.target.value)} /></Field>
      </div>
      {angle && <p className="log-hint">Group: <b>{angle}</b>{distM ? ` at ${fmtDistance(distM, du)}` : ''}</p>}
      <div className="grid-2">
        <Field label={`Elevation hold (${clickUnit})`} id="g-elev"><input id="g-elev" className="input mono" type="number" step="any" inputMode="decimal" value={elev} onChange={e => setElev(e.target.value)} placeholder="+ up" /></Field>
        <Field label={`Wind hold (${clickUnit})`} id="g-wind"><input id="g-wind" className="input mono" type="number" step="any" inputMode="decimal" value={wind} onChange={e => setWind(e.target.value)} placeholder="+ right" /></Field>
      </div>
      <Field label="Notes" id="g-notes"><textarea id="g-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Called shots, flyers, wind calls…" /></Field>

      <div className="field">
        <label>Target photo</label>
        {previewUrl && <img src={previewUrl} alt="New target photo" className="log-thumb lg" style={{ objectFit: 'cover' }} />}
        {showExisting && <PhotoThumb photoId={initial!.photoId!} onOpen={() => setViewExisting(true)} large />}
        <div className="row">
          <label className="btn btn-ghost btn-sm log-file">
            {photoBusy ? 'Processing…' : showExisting || previewUrl ? 'Replace photo' : 'Take / choose photo'}
            <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={photoBusy} aria-label="Target photo" />
          </label>
          {(showExisting || previewUrl) && <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => setPhoto(initial?.photoId ? 'remove' : null)}>Remove</button>}
        </div>
      </div>

      {err && <p className="log-err">{err}</p>}
      <div className="row">
        {onDelete && <ConfirmButton label="Delete group" confirmLabel="Delete group?" onConfirm={() => { onDelete(); }} />}
        <span className="spacer" />
        <button className="btn btn-primary" onClick={submit} disabled={saving || photoBusy}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Add group'}</button>
      </div>
      {viewExisting && initial?.photoId && <PhotoSheet photoId={initial.photoId} onClose={() => setViewExisting(false)} />}
    </Sheet>
  );
}
