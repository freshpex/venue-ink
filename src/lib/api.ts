import { configuredApiBase } from './runtime';
import { saveSessionCredential, sessionHeaders } from './credentials';
const configured = configuredApiBase.replace(/\/$/, '');
export const apiBase = configured;
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
function requestSignal(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener('abort', cancel);
    },
  };
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
  timeoutMs = 20000,
): Promise<T> {
  const deadline = requestSignal(timeoutMs, signal);
  try {
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api${path}`, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'VenueWorkspace',
          ...sessionHeaders(apiBase),
          ...options.headers,
        },
        signal: deadline.signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new ApiError('The server could not be reached. Check the connection and try again.', 0);
    }
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new ApiError(
        'The server is starting. Please keep this page open or try again shortly.',
        503,
      );
    const data = await response.json().catch(() => {
      throw new ApiError('The server response could not be read. Please try again.', 503);
    });
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') saveSessionCredential(null);
      throw new ApiError(data.message || 'The request could not be completed.', response.status);
    }
    const credential = response.headers.get('X-Venue-Session');
    if (credential) saveSessionCredential(credential);
    if (path === '/auth/logout' || path === '/security/revoke-all') saveSessionCredential(null);
    return data as T;
  } finally {
    deadline.dispose();
  }
}
export async function waitForServer(
  onState: (state: string) => void,
  signal: AbortSignal,
  options = { timeoutMs: 150000, pollMs: 3000 },
) {
  const deadline = Date.now() + options.timeoutMs;
  onState('Connecting to server…');
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const result = await request<{ ready: boolean }>(
        '/health',
        {},
        signal,
        Math.max(1, Math.min(8000, deadline - Date.now())),
      );
      if (result.ready) {
        onState('Signing you in…');
        return;
      }
    } catch {
      signal.throwIfAborted();
    }
    onState('Server is waking up. Connecting…');
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const timer = setTimeout(
        finish,
        Math.min(options.pollMs, Math.max(0, deadline - Date.now())),
      );
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  throw new ApiError(
    'The server is taking longer than expected. Your details are still here; try connecting again.',
    503,
  );
}

export async function download(path: string, filename: string) {
  const deadline = requestSignal(30000);
  try {
    const response = await fetch(apiBase + '/api' + path, {
      credentials: 'include',
      headers: sessionHeaders(apiBase),
      signal: deadline.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: 'Download failed. Try again.' }));
      throw new ApiError(data.message, response.status);
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    deadline.dispose();
  }
}

export async function assetBlob(path: string, signal: AbortSignal): Promise<Blob> {
  if (!/^\/api\/assets\/[a-f0-9-]+$/i.test(path)) throw new Error('Invalid image path.');
  const deadline = requestSignal(30000, signal);
  try {
    const response = await fetch(apiBase + path, {
      credentials: 'include',
      headers: sessionHeaders(apiBase),
      signal: deadline.signal,
    });
    if (!response.ok) throw new ApiError('The image could not be loaded.', response.status);
    return await response.blob();
  } finally {
    deadline.dispose();
  }
}
