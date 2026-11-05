import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../src/lib/api';
import { createVenueQueryClient, finishSignIn, readSession } from '../src/lib/session';

afterEach(() => vi.unstubAllGlobals());
const user = { id: 'test-user', name: 'Test artist', role: 'artist' };
function reply(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
it('distinguishes an expired session from a server connection failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(reply(401, {}))
      .mockResolvedValueOnce(reply(503, { message: 'Starting' })),
  );
  await expect(readSession()).resolves.toBeNull();
  await expect(readSession()).rejects.toMatchObject({ status: 503 });
});
it('does not accept a successful login response when the browser rejected its cookie', async () => {
  const client = createVenueQueryClient();
  client.setQueryData(['api', '/profile'], { private: true });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(401, {})));
  await expect(finishSignIn(client)).rejects.toThrow('sign-in could not be verified');
  expect(client.getQueryData(['session'])).toBeNull();
  expect(client.getQueryData(['api', '/profile'])).toBeUndefined();
  client.clear();
});
it('cancels an anonymous session check before verifying the new account', async () => {
  const client = createVenueQueryClient();
  let resolveAnonymous!: (value: null) => void;
  let previousSignal!: AbortSignal;
  const pending = client
    .fetchQuery({
      queryKey: ['session'],
      queryFn: ({ signal }) => {
        previousSignal = signal;
        return new Promise<null>((resolve) => {
          resolveAnonymous = resolve;
        });
      },
    })
    .catch(() => {});
  client.setQueryData(['api', '/profile'], { name: 'Previous account' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { user })));
  await expect(finishSignIn(client)).resolves.toEqual(user);
  expect(previousSignal.aborted).toBe(true);
  resolveAnonymous(null);
  await pending;
  expect(client.getQueryData(['session'])).toEqual(user);
  expect(client.getQueryData(['api', '/profile'])).toBeUndefined();
  client.clear();
});
it.each([401, 403, 503])(
  'only a private API 401 clears the signed-in account (status %i)',
  async (status) => {
    const client = createVenueQueryClient();
    client.setQueryData(['session'], user);
    await expect(
      client.fetchQuery({
        queryKey: ['api', '/private'],
        retry: false,
        queryFn: () => Promise.reject(new ApiError('failed', status)),
      }),
    ).rejects.toThrow('failed');
    expect(client.getQueryData(['session'])).toEqual(status === 401 ? null : user);
    client.clear();
  },
);
