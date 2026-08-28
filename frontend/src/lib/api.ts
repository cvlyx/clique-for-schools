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
  phone?: string | null;
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

export interface PlatformSchoolDetail extends PlatformSchool {
  billing_status?: string | null;
  plan_updated_at?: string | null;
  admin?: { id: number; username: string; name?: string | null; is_active: boolean } | null;
  student_count?: number;
  class_count?: number;
  report_count?: number;
}

export interface PlatformStats {
  total: number;
  provisional: number;
  active: number;
  rejected: number;
  suspended: number;
  students: number;
  reports: number;
  platformAdmins: number;
  byPlan: Record<string, number>;
  recentSchools: { id: number; name: string; code: string; status: string; plan?: string | null; district?: string | null; created_at?: string }[];
}

export interface PlatformActivityItem {
  id: number;
  actor: string;
  action: string;
  detail?: string | null;
  school_id?: number | null;
  created_at?: string;
}

export interface PlatformAdminUser {
  id: number;
  username: string;
  name?: string | null;
  is_active: boolean;
  created_at?: string;
}

export interface PlatformNoticeItem {
  id: number;
  title: string;
  body: string;
  audience?: string;
  school_id?: number | null;
  created_at?: string;
}

export function apiPlatformStats(): Promise<PlatformStats> {
  return request('/platform/stats');
}

export function apiPlatformSchoolDetail(id: number): Promise<PlatformSchoolDetail> {
  return request(`/platform/schools/${id}`);
}

export function apiSuspendSchool(id: number): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/suspend`, { method: 'POST' });
}

export function apiResumeSchool(id: number): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/resume`, { method: 'POST' });
}

export function apiReactivateSchool(id: number): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/reactivate`, { method: 'POST' });
}

export function apiDeleteSchool(id: number): Promise<{ ok: boolean }> {
  return request(`/platform/schools/${id}`, { method: 'DELETE' });
}

export function apiEditSchool(
  id: number,
  payload: { name?: string; district?: string; head_teacher?: string; email?: string; phone?: string; contact_name?: string },
): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function apiSetPlan(
  id: number,
  payload: { plan: string; billing_status?: string },
): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/plan`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function apiResetSchoolPassword(id: number, new_password: string): Promise<PlatformSchool> {
  return request(`/platform/schools/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ new_password }) });
}

export function apiPlatformAdmins(): Promise<PlatformAdminUser[]> {
  return request('/platform/admins');
}

export function apiCreatePlatformAdmin(payload: { username: string; password: string; name?: string }): Promise<{ ok: boolean }> {
  return request('/platform/admins', { method: 'POST', body: JSON.stringify(payload) });
}

export function apiTogglePlatformAdmin(id: number): Promise<{ ok: boolean; is_active: boolean }> {
  return request(`/platform/admins/${id}/toggle`, { method: 'POST' });
}

export function apiPlatformNotifications(): Promise<PlatformNoticeItem[]> {
  return request('/platform/notifications');
}

export function apiCreatePlatformNotification(payload: { title: string; body: string; audience?: string; school_id?: number }): Promise<{ ok: boolean }> {
  return request('/platform/notifications', { method: 'POST', body: JSON.stringify(payload) });
}

export function apiDeletePlatformNotification(id: number): Promise<{ ok: boolean }> {
  return request(`/platform/notifications/${id}`, { method: 'DELETE' });
}

export function apiPlatformActivity(): Promise<PlatformActivityItem[]> {
  return request('/platform/activity');
}
