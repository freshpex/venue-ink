import type { APIRequestContext, Route } from '@playwright/test';

export async function forwardWithoutCookies(route: Route, request: APIRequestContext) {
  // Use the isolated request fixture instead of route.fetch, whose cookie jar is
  // shared with the browser. An explicit empty Cookie header also prevents the
  // request fixture's own jar from authenticating subsequent API requests.
  const response = await request.fetch(route.request(), {
    headers: { ...route.request().headers(), cookie: '' },
  });
  try {
    const headers = response.headers();
    delete headers['set-cookie'];
    const status = response.status();
    const body = await response.body();
    await route.fulfill({ status, headers, body });
    return status;
  } finally {
    await response.dispose();
  }
}
