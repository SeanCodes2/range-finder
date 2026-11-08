/**
 * Invite-only access check, done in the app rather than by SWA route rules (same pattern as
 * Pond Tracker). Static files stay public so a background service-worker update never caches
 * the login page as the app shell; the app checks /.auth/me on launch, and any future API is
 * enforced server-side by the `shooter` role in staticwebapp.config.json.
 */
export const REQUIRED_ROLE = 'shooter';
const KEY = 'rf.access';

export type AccessResult = 'allowed' | 'signed-out' | 'not-invited' | 'offline';

interface ClientPrincipal { userRoles?: string[]; userDetails?: string }

export function accessCheckDisabled(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

export async function checkAccess(): Promise<AccessResult> {
  if (accessCheckDisabled()) return 'allowed';
  let principal: ClientPrincipal | null;
  try {
    const res = await fetch('/.auth/me', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return 'offline';
    principal = ((await res.json()) as { clientPrincipal: ClientPrincipal | null }).clientPrincipal;
  } catch {
    return 'offline';
  }
  if (!principal) { remember(false); return 'signed-out'; }
  const ok = (principal.userRoles ?? []).includes(REQUIRED_ROLE);
  remember(ok);
  return ok ? 'allowed' : 'not-invited';
}

/** Whether this device was approved before (open instantly; allow offline use). */
export function previouslyAllowed(): boolean {
  if (accessCheckDisabled()) return true;
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

function remember(ok: boolean) {
  try { if (ok) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch {}
}

/** Gate the app: resolves true to render, or navigates away. */
export async function gate(): Promise<boolean> {
  const wasAllowed = previouslyAllowed();
  const result = await checkAccess();
  switch (result) {
    case 'allowed': return true;
    case 'offline': return wasAllowed; // keep working at the range with no signal
    case 'signed-out': location.replace('/login.html'); return false;
    case 'not-invited': location.replace('/denied.html'); return false;
  }
}
