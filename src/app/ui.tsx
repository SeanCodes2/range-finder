// Tiny shared UI bits. Keep this file small; feature-specific components live in the feature.
import { type ReactNode, useEffect } from 'react';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="row"><h2>{title}</h2><span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, id }: { label: string; children: ReactNode; id?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/** Two-step inline confirm (no window.confirm). */
export function ConfirmButton({ label, confirmLabel = 'Really?', onConfirm, className = 'btn btn-ghost btn-sm btn-danger' }: { label: string; confirmLabel?: string; onConfirm: () => void; className?: string }) {
  return <ArmedButton label={label} confirmLabel={confirmLabel} onConfirm={onConfirm} className={className} />;
}
import { useState } from 'react';
function ArmedButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return <button type="button" className={className} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>{armed ? confirmLabel : label}</button>;
}
