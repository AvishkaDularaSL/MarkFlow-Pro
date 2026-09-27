export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

// 2 Days Session Duration in Milliseconds (48 Hours = 172,800,000 ms)
export const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export function isSessionExpired(): boolean {
  const expiry = localStorage.getItem('watermark_session_expires_at');
  if (!expiry) return false;
  const expiryTimestamp = parseInt(expiry, 10);
  return !isNaN(expiryTimestamp) && Date.now() > expiryTimestamp;
}

export function getSessionExpiry(): number | null {
  const expiry = localStorage.getItem('watermark_session_expires_at');
  if (!expiry) return null;
  const timestamp = parseInt(expiry, 10);
  return isNaN(timestamp) ? null : timestamp;
}

export function getAuthToken(): string | null {
  // If session expired past 2 days, automatically clear and return null
  if (isSessionExpired()) {
    setAuthToken(null);
    return null;
  }
  return localStorage.getItem('watermark_token');
}

export function setAuthToken(token: string | null, customExpiresAt?: string | number) {
  if (token) {
    localStorage.setItem('watermark_token', token);
    const expiresAt = customExpiresAt
      ? typeof customExpiresAt === 'string'
        ? new Date(customExpiresAt).getTime()
        : customExpiresAt
      : Date.now() + TWO_DAYS_MS;
    localStorage.setItem('watermark_session_expires_at', String(expiresAt));
  } else {
    localStorage.removeItem('watermark_token');
    localStorage.removeItem('watermark_session_expires_at');
  }
}

export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // If unauthorized or token expired, invalidate local token
    if (response.status === 401) {
      setAuthToken(null);
    }
    const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
    throw new ApiError(errorMsg, response.status);
  }

  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T>(url: string, body?: any) =>
    request<T>(url, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T>(url: string, body?: any) =>
    request<T>(url, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  patch: <T>(url: string, body?: any) =>
    request<T>(url, {
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
};
