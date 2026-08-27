// API bootstrap for the combined Clique for Schools app.
//
// The generated client (`@workspace/api-client-react`) calls relative `/api/*`
// paths. We point it at the backend and attach the school's JWT automatically.
import { setBaseUrl, setAuthTokenGetter } from '@workspace/api-client-react';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

export const TOKEN_KEY = 'clique-token';

export function getToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

setBaseUrl(API_URL);
setAuthTokenGetter(() => getToken());

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') detail = data.detail;
      else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        detail = String(data.detail[0].msg);
      }
    } catch {
      /* ignore */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface LoginResult {
  access_token: string;
  role: string;
  school_id: number | null;
  school?: { name: string; status: string; code: string } | null;
}

export interface RegisterResult {
  id: number;
  name: string;
  code: string;
  status: string;
}

export function apiLogin(username: string, password: string): Promise<LoginResult> {
  const body = new URLSearchParams();
  body.set('username', username);
  body.set('password', password);
  return request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

export function apiRegister(payload: Record<string, unknown>): Promise<RegisterResult> {
  return request('/register', { method: 'POST', body: JSON.stringify(payload) });
}

export function apiMe(): Promise<{ username: string; role: string; name?: string | null; school?: unknown }> {
  return request('/me');
}

export interface PlatformSchool {
  id: number;
  name: string;
  code: string;
  district?: string | null;
  head_teacher?: string | null;
  email?: string | null;
  contact_name?: string | null;
  status: string;
  plan?: string | null;
  created_at?: string | null;
  approved_at?: string | null;
}

export function apiPlatformSchools(): Promise<PlatformSchool[]> {
  return request('/platform/schools');
}

export function apiApproveSchool(id: number): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/approve`, { method: 'POST' });
}

export function apiDenySchool(id: number): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/deny`, { method: 'POST' });
}

export function apiProvisionSchool(payload: {
  school_name: string;
  district?: string;
  head_teacher?: string;
  email?: string;
  contact_name?: string;
  admin_username: string;
  admin_password: string;
}): Promise<PlatformSchool> {
  return request('/platform/schools/manual', { method: 'POST', body: JSON.stringify(payload) });
}
