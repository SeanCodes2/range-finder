import { useState } from 'react';
import { ConfirmButton, Field, Seg, Sheet } from '@/app/ui';
import { create, put, remove, useCollection } from '@/store/db';
import type { Ammo, Base } from '@/store/types';
import { fmtBc, fmtMoney, inventoryTotals, inventoryValue, isLowStock, num, optNum } from './gearLogic';
import { AMMO_PRESETS, findPreset, presetKey } from './presets';

type View = null | { kind: 'detail'; id: string } | { kind: 'edit'; ammo?: Ammo; returnTo?: string };

export default function AmmoTab() {
  const ammo = useCollection('ammo');
  const [view, setView] = useState<View>(null);
  const totals = inventoryTotals(ammo);
  const sorted = [...ammo].sort((a, b) => a.caliber.localeCompare(b.caliber) || a.name.localeCompare(b.name));
  const detail = view?.kind === 'detail' ? ammo.find(a => a.id === view.id) : undefined;

  return (
    <>
      <section className="panel gear-summary">
        <div className="gear-summary-cell">
          <div className="label">Rounds on hand</div>
          <div className="value mono">{totals.rounds.toLocaleString()}</div>
        </div>
        <div className="gear-summary-cell">
          <div className="label">Inventory value</div>
          <div className="value mono">{fmtMoney(totals.value)}</div>
          {totals.priced < ammo.length && <div className="small muted">{ammo.length - totals.priced} unpriced</div>}
        </div>
      </section>

      <section className="panel">
        <div className="row">
          <h2>Ammo</h2><span className="spacer" />
          <button className="btn btn-sm btn-primary" onClick={() => setView({ kind: 'edit' })}>Add ammo</button>
        </div>
        {sorted.length === 0 && <p className="empty">No ammo yet. Add a load (or pick a factory preset) so Ballistics has a BC and MV to work with.</p>}
        <ul className="list">
          {sorted.map(a => {
            const val = inventoryValue(a);
            return (
              <li key={a.id} className="gear-item" onClick={() => setView({ kind: 'detail', id: a.id })}>
                <div className="grow">
                  <div className="title">{a.name}</div>
                  <div className="sub">{a.caliber} · {a.bulletWeightGr} gr · {a.dragModel} {fmtBc(a.bc)} · {a.muzzleVelocityFps} fps{a.lot ? ` · lot ${a.lot}` : ''}</div>
                  {(a.costPerRound != null) && <div className="sub num">{fmtMoney(a.costPerRound)}/rd{val != null ? ` · ${fmtMoney(val)} on hand` : ''}</div>}
                </div>
                <span className={'pill gear-onhand' + (isLowStock(a) ? ' low' : '')}>{a.onHand} rds</span>
              </li>
            );
          })}
        </ul>
      </section>

      {view?.kind === 'edit' && (
        <AmmoForm ammo={view.ammo}
          onClose={() => setView(view.returnTo ? { kind: 'detail', id: view.returnTo } : null)}
          onSaved={id => setView({ kind: 'detail', id })} />
      )}
      {view?.kind === 'detail' && detail && (
        <AmmoDetail ammo={detail} onClose={() => setView(null)}
          onEdit={() => setView({ kind: 'edit', ammo: detail, returnTo: detail.id })}
          onDeleted={() => setView(null)} />
      )}
    </>
  );
}

// ---------------- Add / edit ----------------
function AmmoForm({ ammo, onClose, onSaved }: { ammo?: Ammo; onClose: () => void; onSaved: (id: string) => void }) {
  const [preset, setPreset] = useState('');
  const [name, setName] = useState(ammo?.name ?? '');
  const [caliber, setCaliber] = useState(ammo?.caliber ?? '');
  const [weight, setWeight] = useState(ammo ? String(ammo.bulletWeightGr) : '');
  const [bc, setBc] = useState(ammo ? String(ammo.bc) : '');
  const [drag, setDrag] = useState<Ammo['dragModel']>(ammo?.dragModel ?? 'G7');
  const [mv, setMv] = useState(ammo ? String(ammo.muzzleVelocityFps) : '');
  const [lot, setLot] = useState(ammo?.lot ?? '');
  const [onHand, setOnHand] = useState(ammo ? String(ammo.onHand) : '0');
  const [cost, setCost] = useState(ammo?.costPerRound != null ? String(ammo.costPerRound) : '');
  const [notes, setNotes] = useState(ammo?.notes ?? '');

  function applyPreset(key: string) {
    setPreset(key);
    const p = findPreset(key); if (!p) return;
    setName(p.name); setCaliber(p.caliber); setWeight(String(p.bulletWeightGr));
    setBc(String(p.bc)); setDrag(p.dragModel); setMv(String(p.muzzleVelocityFps));
  }

  const valid = name.trim() && caliber.trim() && num(weight, NaN) > 0 && num(bc, NaN) > 0 && num(mv, NaN) > 0;

  async function save() {
    if (!valid) return;
    const fields: Omit<Ammo, keyof Base> = {
      name: name.trim(), caliber: caliber.trim(), bulletWeightGr: num(weight), bc: num(bc), dragModel: drag,
      muzzleVelocityFps: num(mv), lot: lot.trim() || undefined, onHand: Math.max(0, Math.round(num(onHand))),
      costPerRound: optNum(cost), notes: notes.trim() || undefined,
    };
    const rec: Ammo = ammo ? { ...ammo, ...fields } : create<Ammo>(fields);
    await put('ammo', rec);
    onSaved(rec.id);
  }

  // Group presets by caliber for a shorter-feeling picker.
  const calibers = [...new Set(AMMO_PRESETS.map(p => p.caliber))];

  return (
    <Sheet title={ammo ? 'Edit ammo' : 'New ammo'} onClose={onClose}>
      {!ammo && (
        <Field label="Start from a factory load (optional)" id="af-preset">
          <select id="af-preset" value={preset} onChange={e => applyPreset(e.target.value)}>
            <option value="">— custom —</option>
            {calibers.map(c => (
              <optgroup key={c} label={c}>
                {AMMO_PRESETS.filter(p => p.caliber === c).map(p => (
                  <option key={presetKey(p)} value={presetKey(p)}>{p.name} · {p.dragModel} {fmtBc(p.bc)} · {p.muzzleVelocityFps} fps</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
      <Field label="Name" id="af-name"><input id="af-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Hornady 140 ELD-M" autoFocus={!!ammo} /></Field>
      <div className="grid-2">
        <Field label="Caliber" id="af-cal"><input id="af-cal" className="input" value={caliber} onChange={e => setCaliber(e.target.value)} placeholder="6.5 Creedmoor" /></Field>
        <Field label="Bullet weight (gr)" id="af-w"><input id="af-w" className="input mono" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Drag model"><Seg value={drag} options={[{ value: 'G1', label: 'G1' }, { value: 'G7', label: 'G7' }]} onChange={setDrag} label="Drag model" /></Field>
        <Field label={`BC (${drag})`} id="af-bc"><input id="af-bc" className="input mono" inputMode="decimal" value={bc} onChange={e => setBc(e.target.value)} placeholder={drag === 'G7' ? '0.326' : '0.646'} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Muzzle velocity (fps)" id="af-mv"><input id="af-mv" className="input mono" inputMode="numeric" value={mv} onChange={e => setMv(e.target.value)} /></Field>
        <Field label="Lot" id="af-lot"><input id="af-lot" className="input" value={lot} onChange={e => setLot(e.target.value)} placeholder="3221046" /></Field>
      </div>
      <div className="grid-2">
        <Field label="On hand (rds)" id="af-oh"><input id="af-oh" className="input mono" inputMode="numeric" value={onHand} onChange={e => setOnHand(e.target.value)} /></Field>
        <Field label="Cost per round ($)" id="af-cost"><input id="af-cost" className="input mono" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} placeholder="1.75" /></Field>
      </div>
      <Field label="Notes" id="af-notes"><textarea id="af-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Factory MV 2710; trued to 2680 in 24&quot; barrel" /></Field>
      <button className="btn btn-primary btn-big" disabled={!valid} onClick={save}>{ammo ? 'Save' : 'Add ammo'}</button>
    </Sheet>
  );
}

// ---------------- Detail ----------------
function AmmoDetail({ ammo, onClose, onEdit, onDeleted }: { ammo: Ammo; onClose: () => void; onEdit: () => void; onDeleted: () => void }) {
  const [custom, setCustom] = useState('');
  const [used, setUsed] = useState('');
  const val = inventoryValue(ammo);
  const adjust = (n: number) => put('ammo', { ...ammo, onHand: Math.max(0, ammo.onHand + Math.round(n)) });

  return (
    <Sheet title={ammo.name} onClose={onClose}>
      <div className="row small muted">
        <span>{ammo.caliber}</span><span>· {ammo.bulletWeightGr} gr</span><span>· {ammo.dragModel} {fmtBc(ammo.bc)}</span><span>· {ammo.muzzleVelocityFps} fps</span>
        {ammo.lot && <span>· lot {ammo.lot}</span>}
      </div>

      <div className="card gear-stat">
        <div className="grow">
          <div className="label">On hand</div>
          <div className={'value mono' + (isLowStock(ammo) ? ' bad' : '')}>{ammo.onHand.toLocaleString()}</div>
          <div className="small muted num">
            {ammo.costPerRound != null ? `${fmtMoney(ammo.costPerRound)}/rd` : 'no cost set'}{val != null ? ` · ${fmtMoney(val)} total` : ''}
          </div>
        </div>
      </div>

      <h2>Add box</h2>
      <div className="row">
        <button className="btn" style={{ flex: 1 }} onClick={() => adjust(20)}>+20</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => adjust(50)}>+50</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => adjust(100)}>+100</button>
      </div>
      <div className="row">
        <input className="input mono" inputMode="numeric" placeholder="Custom" value={custom} onChange={e => setCustom(e.target.value)} style={{ flex: 1 }} aria-label="Custom rounds to add" />
        <button className="btn" disabled={!(num(custom, NaN) > 0)} onClick={() => { adjust(num(custom)); setCustom(''); }}>Add</button>
      </div>

      <h2>Used</h2>
      <div className="row">
        <input className="input mono" inputMode="numeric" placeholder="Rounds fired" value={used} onChange={e => setUsed(e.target.value)} style={{ flex: 1 }} aria-label="Rounds used" />
        <button className="btn" disabled={!(num(used, NaN) > 0) || ammo.onHand <= 0} onClick={() => { adjust(-num(used)); setUsed(''); }}>−{used && num(used, NaN) > 0 ? Math.round(num(used)) : 'n'}</button>
      </div>

      {ammo.notes && (<><h2>Notes</h2><p className="small gear-notes">{ammo.notes}</p></>)}

      <div className="row">
        <button className="btn btn-ghost" onClick={onEdit}>Edit</button>
        <span className="spacer" />
        <ConfirmButton label="Delete ammo" confirmLabel="Delete this load?" onConfirm={async () => { await remove('ammo', ammo.id); onDeleted(); }} className="btn btn-ghost btn-danger" />
      </div>
    </Sheet>
  );
}
