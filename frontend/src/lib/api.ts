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

// ----- School data CRUD (platform admin operating inside any school) -----

export interface ManagedStudent {
  id: number;
  name: string;
  admissionNumber: string;
  className: string;
  status: string;
  average: number;
}

export interface ManagedGrade {
  subject: string;
  student_id: string;
  student_name: string;
  student_class: string;
  score: number;
  grade: string;
  result: string;
  teacher_comment?: string | null;
  term: string;
  academic_year: string;
}

export interface ManagedReport {
  id: number;
  student_id: string;
  student_name: string;
  student_class: string;
  term: string;
  academic_year: string;
  total_subjects: number;
  average_score: number;
  aggregate_points: number;
  position?: number | null;
  updated_at: string;
}

export interface ManagedClass {
  id: number;
  name: string;
  stream: string;
  studentCount: number;
  teacher: string;
  average: number;
}

export interface ManagedNotice {
  id: number;
  title: string;
  body: string;
  date: string;
  audience: string;
}

export interface ManagedSettings {
  school_name?: string | null;
  academic_year?: string | null;
  report_title?: string | null;
}

const sd = (schoolId: number) => `/platform/schools/${schoolId}`;

export function apiSchoolStudents(schoolId: number): Promise<ManagedStudent[]> {
  return request(`${sd(schoolId)}/students`);
}

export function apiSchoolAddStudent(schoolId: number, payload: { name: string; student_class: string; admission_number?: string }): Promise<{ student_id: string; name: string; student_class: string }> {
  return request(`${sd(schoolId)}/students`, { method: 'POST', body: JSON.stringify(payload) });
}

export function apiSchoolBulkAddStudents(schoolId: number, students: { name: string; student_class: string; admission_number?: string }[]): Promise<{ added: { student_id: string; name: string; student_class: string }[]; errors: { name: string; error: string }[] }> {
  return request(`${sd(schoolId)}/students/bulk`, { method: 'POST', body: JSON.stringify(students) });
}

export function apiSchoolUpdateStudent(schoolId: number, studentId: string, payload: { name: string; student_class: string }): Promise<{ student_id: string; name: string; student_class: string }> {
  return request(`${sd(schoolId)}/students/${encodeURIComponent(studentId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function apiSchoolDeleteStudent(schoolId: number, studentId: string): Promise<{ ok: boolean }> {
  return request(`${sd(schoolId)}/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
}

export function apiSchoolGrades(schoolId: number): Promise<ManagedGrade[]> {
  return request(`${sd(schoolId)}/grades`);
}

export function apiSchoolAddGrade(schoolId: number, payload: { student_id: string; subject: string; score: number; term?: string; academic_year?: string; teacher_comment?: string }): Promise<{ ok: boolean }> {
  return request(`${sd(schoolId)}/grades`, { method: 'POST', body: JSON.stringify(payload) });
}

export function apiSchoolReports(schoolId: number): Promise<ManagedReport[]> {
  return request(`${sd(schoolId)}/reports`);
}

export function apiSchoolReportDetail(schoolId: number, reportId: number): Promise<{ id: number; student_name: string; student_class: string; term: string; academic_year: string; report_data: any }> {
  return request(`${sd(schoolId)}/reports/${reportId}`);
}

export function apiSchoolClasses(schoolId: number): Promise<ManagedClass[]> {
  return request(`${sd(schoolId)}/classes`);
}

export function apiSchoolAddClass(schoolId: number, payload: { name: string; stream?: string; teacher?: string }): Promise<{ id: number; name: string; stream: string; teacher: string | null }> {
  return request(`${sd(schoolId)}/classes`, { method: 'POST', body: JSON.stringify(payload) });
}

export function apiSchoolUpdateClass(schoolId: number, classId: number, payload: { name?: string; stream?: string; teacher?: string }): Promise<{ id: number; name: string; stream: string; teacher: string | null }> {
  return request(`${sd(schoolId)}/classes/${classId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function apiSchoolDeleteClass(schoolId: number, classId: number): Promise<{ ok: boolean }> {
  return request(`${sd(schoolId)}/classes/${classId}`, { method: 'DELETE' });
}

export function apiSchoolNotices(schoolId: number): Promise<ManagedNotice[]> {
  return request(`${sd(schoolId)}/notices`);
}

export function apiSchoolAddNotice(schoolId: number, payload: { title: string; body: string; audience?: string }): Promise<ManagedNotice> {
  return request(`${sd(schoolId)}/notices`, { method: 'POST', body: JSON.stringify(payload) });
}

export function apiSchoolDeleteNotice(schoolId: number, noticeId: number): Promise<{ ok: boolean }> {
  return request(`${sd(schoolId)}/notices/${noticeId}`, { method: 'DELETE' });
}

export function apiSchoolSettings(schoolId: number): Promise<ManagedSettings> {
  return request(`${sd(schoolId)}/settings`);
}

export function apiSchoolSaveSettings(schoolId: number, payload: Partial<ManagedSettings>): Promise<ManagedSettings> {
  return request(`${sd(schoolId)}/settings`, { method: 'PUT', body: JSON.stringify(payload) });
}
