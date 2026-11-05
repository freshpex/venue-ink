import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, request } from './api';
import type { User } from './types';

export async function readSession(signal?: AbortSignal): Promise<User | null> {
  try {
    return (await request<{ user: User }>('/auth/me', {}, signal)).user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function createVenueQueryClient() {
  const client = new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        if (error instanceof ApiError && error.status === 401 && query.queryKey[0] === 'api') {
          client.setQueryData(['session'], null);
          void client.cancelQueries({ queryKey: ['api'] });
          client.removeQueries({ queryKey: ['api'], type: 'inactive' });
        }
      },
    }),
    defaultOptions: {
      queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
    },
  });
  return client;
}

export async function finishSignIn(client: QueryClient, signal?: AbortSignal): Promise<User> {
  // An older anonymous request must not overwrite the newly authenticated session.
  await Promise.all([
    client.cancelQueries({ queryKey: ['session'] }),
    client.cancelQueries({ queryKey: ['api'] }),
  ]);
  client.removeQueries({ queryKey: ['api'] });
  const user = await readSession(signal);
  if (!user) {
    client.setQueryData(['session'], null);
    throw new ApiError(
      'Your sign-in could not be verified. Allow cookies for this site, open it in your browser, and try again.',
      401,
    );
  }
  client.setQueryData(['session'], user);
  return user;
}
