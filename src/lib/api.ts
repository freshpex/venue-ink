const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
export const apiBase = configured;
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'VenueWorkspace',
        ...options.headers,
      },
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new ApiError('The server could not be reached. Check the connection and try again.', 0);
  }
  if(!response.headers.get('content-type')?.includes('application/json'))throw new ApiError('The server is starting. Please keep this page open or try again shortly.',503);
  const data=await response.json().catch(()=>{throw new ApiError('The server response could not be read. Please try again.',503);});
  if (!response.ok)
    throw new ApiError(data.message || 'The request could not be completed.', response.status);
  return data as T;
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
        AbortSignal.any([
          signal,
          AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now()))),
        ]),
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
