import { useQuery, useQueryClient } from '@tanstack/react-query';
import { request, ApiError, apiBase } from './api';
import type { User } from './types';
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        return (await request<{ user: User }>('/auth/me')).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: (count, error) =>
      error instanceof ApiError && [0, 503].includes(error.status) && count < 8,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 8000),
    staleTime: 30000,
  });
}
export function useApi<T>(
  path: string,
  { enabled = true, interval = 0 }: { enabled?: boolean; interval?: number } = {},
) {
  return useQuery({
    queryKey: ['api', path],
    queryFn: () => request<T>(path),
    enabled,
    retry: (count, error) =>
      error instanceof ApiError && [0, 503].includes(error.status) && count < 8,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 8000),
    refetchInterval: interval || false,
    staleTime: 20000,
  });
}
export function useRefresh() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['api'] });
}
export function assetUrl(path: string | null | undefined) {
  return path?.startsWith('/api/') ? `${apiBase}${path}` : path || '';
}
export function money(amount: number | null | undefined, currency = 'USD') {
  return amount === null || amount === undefined
    ? 'Quoted individually'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}
export function dateTime(value: string, timeZone?: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}
