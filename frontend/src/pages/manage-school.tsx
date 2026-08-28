import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  Library,
  Plus,
  Save,
  Search,
  Settings as SettingsIcon,
  Trash2,
  Users,
  Bell,
  X,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  apiPlatformSchoolDetail,
  apiSchoolAddClass,
  apiSchoolAddGrade,
  apiSchoolAddNotice,
  apiSchoolAddStudent,
  apiSchoolBulkAddStudents,
  apiSchoolClasses,
  apiSchoolDeleteClass,
  apiSchoolDeleteNotice,
  apiSchoolDeleteStudent,
  apiSchoolGrades,
  apiSchoolNotices,
  apiSchoolReports,
  apiSchoolReportDetail,
  apiSchoolSaveSettings,
  apiSchoolSettings,
  apiSchoolStudents,
  apiSchoolUpdateClass,
  apiSchoolUpdateStudent,
  type PlatformSchoolDetail,
  type ManagedStudent,
  type ManagedGrade,
  type ManagedReport,
  type ManagedClass,
  type ManagedNotice,
  type ManagedSettings,
} from '@/lib/api';

const CLASS_OPTIONS = ['FORM 1', 'FORM 2', 'FORM 3', 'FORM 4'];
const SUBJECTS = ['Mathematics', 'English', 'Physics', 'Biology', 'Chemistry', 'Chichewa'];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  provisional: { label: 'Pending approval', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800' },
  suspended: { label: 'Suspended', cls: 'bg-slate-200 text-slate-700' },
};

function statusBadge(status?: string) {
  const meta = STATUS_META[status || ''] || { label: status || 'unknown', cls: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>;
}

function MiniInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export default function ManageSchool() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = Number(params.schoolId);
  const [school, setSchool] = useState<PlatformSchoolDetail | null>(null);
  const [tab, setTab] = useState('students');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setSchool(await apiPlatformSchoolDetail(schoolId));
    } catch (e) {
      setError((e as Error).message || 'Failed to load school');
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  const notify = (m: string) => setMsg(m);
  const report = () => setMsg('');

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-8 text-foreground md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/platform" className="rounded-xl border border-border bg-card p-2.5 hover:bg-muted">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-accent">
                <ShieldCheckIcon /> Platform · Manage school
              </div>
              <h1 className="mt-0.5 flex items-center gap-2 font-serif text-2xl font-extrabold tracking-[-.045em] md:text-3xl">
                {school?.name || 'School'} {statusBadge(school?.status)}
              </h1>
              {school && (
                <div className="text-xs text-muted-foreground">
                  {school.code}{school.plan ? ` · ${school.plan}` : ''}{school.district ? ` · ${school.district}` : ''}
                </div>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
        {msg && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-600/40 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800">
            {msg}<button onClick={report}><X size={16} /></button>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="students"><Users size={15} /> Students</TabsTrigger>
            <TabsTrigger value="grades"><ClipboardList size={15} /> Grades</TabsTrigger>
            <TabsTrigger value="reports"><FileBarChart size={15} /> Reports</TabsTrigger>
            <TabsTrigger value="classes"><Library size={15} /> Classes</TabsTrigger>
            <TabsTrigger value="notices"><Bell size={15} /> Notices</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon size={15} /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="students">
            <StudentsTab schoolId={schoolId} notify={notify} onError={setError} />
          </TabsContent>
          <TabsContent value="grades">
            <GradesTab schoolId={schoolId} notify={notify} />
          </TabsContent>
          <TabsContent value="reports">
            <ReportsTab schoolId={schoolId} />
          </TabsContent>
          <TabsContent value="classes">
            <ClassesTab schoolId={schoolId} notify={notify} />
          </TabsContent>
          <TabsContent value="notices">
            <NoticesTab schoolId={schoolId} notify={notify} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab schoolId={schoolId} notify={notify} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ShieldCheckIcon() {
  return <Building2 size={13} />;
}

function TabShell({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="font-serif text-lg font-extrabold">{title}</CardTitle>
          <CardDescription>{body}</CardDescription>
        </div>
        {action}
      </CardHeader>
    </Card>
  );
}

// ---------------- Students ----------------

function StudentsTab({ schoolId, notify, onError }: { schoolId: number; notify: (m: string) => void; onError: (m: string) => void }) {
  const [students, setStudents] = useState<ManagedStudent[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState<ManagedStudent | null>(null);

  const [name, setName] = useState('');
  const [cls, setCls] = useState('FORM 1');
  const [admission, setAdmission] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkClass, setBulkClass] = useState('FORM 1');
  const [saveBusy, setSaveBusy] = useState(false);

  const load = useCallback(async () => {
    try { onError(''); setStudents(await apiSchoolStudents(schoolId)); }
    catch (e) { onError((e as Error).message || 'Failed to load students'); }
  }, [schoolId, onError]);

  useEffect(() => { load(); }, [load]);

  const filtered = students.filter((s) => !search.trim() || (s.name + ' ' + s.admissionNumber + ' ' + s.className).toLowerCase().includes(search.toLowerCase()));

  const addOne = async () => {
    setSaveBusy(true);
    try {
      await apiSchoolAddStudent(schoolId, { name, student_class: cls, admission_number: admission || undefined });
      notify(`Added ${name}`); setShowAdd(false); setName(''); setAdmission(''); await load();
    } catch (e) { onError((e as Error).message || 'Add failed'); }
    finally { setSaveBusy(false); }
  };

  const bulkAdd = async () => {
    setSaveBusy(true);
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    const payload = lines.map((l) => {
      const [n, ...rest] = l.split(',');
      return { name: n?.trim() || l, student_class: rest[0]?.trim().toUpperCase().startsWith('FORM') ? rest[0].trim().toUpperCase() : bulkClass };
    });
    try {
      const res = await apiSchoolBulkAddStudents(schoolId, payload);
      notify(`Added ${res.added.length} students${res.errors.length ? `, ${res.errors.length} skipped` : ''}`);
      setShowBulk(false); setBulkText(''); await load();
    } catch (e) { onError((e as Error).message || 'Bulk add failed'); }
    finally { setSaveBusy(false); }
  };

  const update = async () => {
    if (!editing) return;
    setSaveBusy(true);
    try {
      await apiSchoolUpdateStudent(schoolId, editing.admissionNumber, { name, student_class: cls });
      notify('Student updated'); setEditing(null); await load();
    } catch (e) { onError((e as Error).message || 'Update failed'); }
    finally { setSaveBusy(false); }
  };

  const remove = async (s: ManagedStudent) => {
    setSaveBusy(true);
    try { await apiSchoolDeleteStudent(schoolId, s.admissionNumber); notify(`Deleted ${s.name}`); await load(); }
    catch (e) { onError((e as Error).message || 'Delete failed'); }
    finally { setSaveBusy(false); }
  };

  return (
    <div className="space-y-4">
      <TabShell
        title="Student register"
        body="Add, edit or remove learners, or bulk-import to quickly fix a school's register."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowBulk((v) => !v)}><Plus size={15} /> Bulk add</Button>
            <Button size="sm" onClick={() => { setEditing(null); setName(''); setCls('FORM 1'); setAdmission(''); setShowAdd((v) => !v); }}><Plus size={15} /> Add student</Button>
          </div>
        }
      />

      {showAdd && (
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
            <MiniInput label="Full name" value={name} onChange={setName} placeholder="e.g. Thoko Banda" />
            <MiniInput label="Class" value={cls} onChange={setCls} placeholder="FORM 4" />
            <MiniInput label="Admission number (optional)" value={admission} onChange={setAdmission} placeholder="Auto if blank" />
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" disabled={!name.trim() || saveBusy} onClick={addOne}><GraduationCap size={15} /> Save learner</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showBulk && (
        <Card>
          <CardContent className="grid gap-3 p-5">
            <label className="grid gap-1.5 text-sm font-bold">Paste learners (one per line, optionally `Name, Form`)
              <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={5} placeholder={'Thoko Banda, FORM 4\nMadalitso Phiri\nChifundo Mbewe, FORM 3'} />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-1.5 text-sm font-bold">Default class
                <Select value={bulkClass} onValueChange={setBulkClass}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c.replace('FORM ', 'Form ')}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <div className="flex items-end gap-2">
                <Button size="sm" disabled={!bulkText.trim() || saveBusy} onClick={bulkAdd}><Plus size={15} /> Import</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowBulk(false)}>Cancel</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-3">
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search learners..." className="pl-9" />
          </div>
          {filtered.length ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-left">
                <thead className="bg-muted/60 text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Learner</th>
                    <th className="px-4 py-3">Admission</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Average</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {filtered.map((s) => (
                    <tr key={s.admissionNumber}>
                      <td className="px-4 py-3 text-sm font-bold">{s.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.admissionNumber}</td>
                      <td className="px-4 py-3 text-sm">{s.className}</td>
                      <td className="px-4 py-3 text-sm font-bold text-primary">{s.average || '—'}{s.average ? '%' : ''}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setName(s.name); setCls(s.className.toUpperCase().startsWith('FORM') ? s.className.toUpperCase() : 'FORM 1'); setShowAdd(false); }}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(s)}><Trash2 size={14} /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">No learners matched.</div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle className="font-serif text-xl font-extrabold">Edit {editing.name}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <MiniInput label="Full name" value={name} onChange={setName} />
              <label className="grid gap-1.5 text-sm font-bold">Class
                <Select value={cls} onValueChange={setCls}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CLASS_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" disabled={!name.trim() || saveBusy} onClick={update}><Save size={15} /> Save</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ---------------- Grades ----------------

function GradesTab({ schoolId, notify }: { schoolId: number; notify: (m: string) => void }) {
  const [grades, setGrades] = useState<ManagedGrade[]>([]);
  const [students, setStudents] = useState<ManagedStudent[]>([]);
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [score, setScore] = useState('0');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setError(''); const [g, s] = await Promise.all([apiSchoolGrades(schoolId), apiSchoolStudents(schoolId)]); setGrades(g); setStudents(s); }
    catch (e) { setError((e as Error).message || 'Failed to load'); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setBusy(true); setError('');
    try {
      await apiSchoolAddGrade(schoolId, { student_id: studentId, subject, score: Number(score), teacher_comment: comment || undefined });
      notify('Grade saved'); setComment(''); await load();
    } catch (e) { setError((e as Error).message || 'Add grade failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg font-extrabold">Enter a grade</CardTitle>
          <CardDescription>Record or update a mark for a learner. Reports update automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-bold">Student
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select learner" /></SelectTrigger>
                <SelectContent>{students.map((s) => <SelectItem key={s.admissionNumber} value={s.admissionNumber}>{s.name} · {s.admissionNumber}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">Subject
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUBJECTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">Score (0–100)
              <Input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">Comment
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional" />
            </label>
          </div>
          {error && <div className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</div>}
          <Button className="mt-3" size="sm" disabled={!studentId || busy || Number(score) < 0 || Number(score) > 100} onClick={add}><Save size={15} /> Save grade</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="mb-2 px-1 text-sm font-bold">All grades · {grades.length}</div>
          {grades.length ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left">
                <thead className="bg-muted/60 text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                  <tr><th className="px-4 py-3">Learner</th><th className="px-4 py-3">Class</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Result</th></tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {grades.map((g, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm font-bold">{g.student_name}</td>
                      <td className="px-4 py-3 text-sm">{g.student_class.replace('FORM ', 'Form ')}</td>
                      <td className="px-4 py-3 text-sm">{g.subject}</td>
                      <td className="px-4 py-3 text-sm font-bold text-primary">{g.score}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{g.grade}</Badge></td>
                      <td className="px-4 py-3 text-sm">{g.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">No grades recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Reports ----------------

function ReportsTab({ schoolId }: { schoolId: number }) {
  const [reports, setReports] = useState<ManagedReport[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setError(''); setReports(await apiSchoolReports(schoolId)); }
    catch (e) { setError((e as Error).message || 'Failed to load reports'); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <TabShell title="Report cards" body="Every generated progress report for this school, with full subject breakdowns." />
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
      <Card>
        <CardContent className="p-3">
          {reports.length ? (
            <div className="divide-y divide-border/70">
              {reports.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 px-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-serif text-lg font-extrabold">{r.student_name}</div>
                    <div className="text-xs text-muted-foreground">{r.student_class.replace('FORM ', 'Form ')} · {r.term} · {r.academic_year} · {r.total_subjects} subjects</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-serif text-xl font-extrabold text-primary">{Math.round(r.average_score)}%</div>
                      <div className="text-[11px] text-muted-foreground">average</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setDetail(r)}><FileBarChart size={15} /> View</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">No reports generated yet. Enter grades to create them.</div>
          )}
        </CardContent>
      </Card>

      {detail && (
        <Dialog open onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <ReportDetail schoolId={schoolId} report={detail} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ReportDetail({ schoolId, report }: { schoolId: number; report: ManagedReport }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiSchoolReportDetail(schoolId, report.id).then(setData).catch((e) => setError((e as Error).message));
  }, [schoolId, report.id]);
  if (error) return <div className="text-sm font-semibold text-destructive">{error}</div>;
  if (!data) return <div className="text-sm text-muted-foreground">Loading report...</div>;
  const rd = data.report_data || {};
  return (
    <div className="space-y-4">
      <DialogTitle className="font-serif text-2xl font-extrabold">{data.student_name}</DialogTitle>
      <div className="text-sm text-muted-foreground">{data.student_class.replace('FORM ', 'Form ')} · {data.term} · {data.academic_year}</div>
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Average" value={`${Math.round(rd.average_score || 0)}%`} />
        <MiniStat label="Aggregate" value={rd.aggregate?.toString() ?? '—'} />
        <MiniStat label="Subjects" value={String(rd.subjects?.length || 0)} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[440px] text-left">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-[.14em] text-muted-foreground">
            <tr><th className="px-4 py-3">Subject</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Comment</th></tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {(rd.subjects || []).map((s: any, i: number) => (
              <tr key={i}>
                <td className="px-4 py-3 text-sm font-bold">{s.subject}</td>
                <td className="px-4 py-3 text-sm">{s.score}</td>
                <td className="px-4 py-3"><Badge variant="secondary">{s.grade}</Badge></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{s.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
      <div className="font-serif text-2xl font-extrabold text-primary">{value}</div>
      <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}

// ---------------- Classes ----------------

function ClassesTab({ schoolId, notify }: { schoolId: number; notify: (m: string) => void }) {
  const [classes, setClasses] = useState<ManagedClass[]>([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [stream, setStream] = useState('');
  const [teacher, setTeacher] = useState('');

  const load = useCallback(async () => {
    try { setError(''); setClasses(await apiSchoolClasses(schoolId)); }
    catch (e) { setError((e as Error).message || 'Failed to load classes'); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    try {
      await apiSchoolAddClass(schoolId, { name, stream: stream || undefined, teacher: teacher || undefined });
      notify(`Added class ${name}`); setShowAdd(false); setName(''); setStream(''); setTeacher(''); await load();
    } catch (e) { setError((e as Error).message || 'Add failed'); }
  };

  const rename = async (cId: number, next: string, field: 'stream' | 'teacher') => {
    try { await apiSchoolUpdateClass(schoolId, cId, { [field]: next }); await load(); }
    catch (e) { setError((e as Error).message || 'Update failed'); }
  };

  const remove = async (cId: number) => {
    try { await apiSchoolDeleteClass(schoolId, cId); notify('Class deleted'); await load(); }
    catch (e) { setError((e as Error).message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <TabShell
        title="School classes"
        body="Manage classes/streams. Add, rename or remove them as the school needs."
        action={<Button size="sm" onClick={() => setShowAdd((v) => !v)}>{showAdd ? <><X size={15} /> Close</> : <><Plus size={15} /> Add class</>}</Button>}
      />
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
      {showAdd && (
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
            <MiniInput label="Class name" value={name} onChange={setName} placeholder="e.g. Form 1" />
            <MiniInput label="Stream" value={stream} onChange={setStream} placeholder="e.g. A" />
            <MiniInput label="Teacher" value={teacher} onChange={setTeacher} placeholder="e.g. Mrs Manda" />
            <div className="sm:col-span-3 flex justify-end"><Button size="sm" disabled={!name.trim()} onClick={add}><Plus size={15} /> Save class</Button></div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {classes.map((c, i) => (
          <Card key={c.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary font-serif text-lg font-extrabold text-primary">{String(i + 1).padStart(2, '0')}</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 size={14} /></Button>
                </div>
              </div>
              <div className="mt-4 text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">{c.name}</div>
              <div className="mt-1 font-serif text-2xl font-extrabold">{c.stream || '—'}</div>
              <MiniInput label="Teacher" value={c.teacher === 'Not assigned' ? '' : c.teacher} onChange={(v) => {}} />
              <div className="mt-4 flex items-end justify-between border-t border-border/70 pt-3">
                <div><div className="font-serif text-lg font-extrabold">{c.studentCount}</div><div className="text-[11px] text-muted-foreground">learners</div></div>
                <div className="text-right"><div className="font-serif text-lg font-extrabold text-primary">{c.average ? `${c.average}%` : '—'}</div><div className="text-[11px] text-muted-foreground">average</div></div>
              </div>
            </CardContent>
          </Card>
        ))}
        {!classes.length && <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">No classes yet.</div>}
      </div>
    </div>
  );
}

// ---------------- Notices ----------------

function NoticesTab({ schoolId, notify }: { schoolId: number; notify: (m: string) => void }) {
  const [notices, setNotices] = useState<ManagedNotice[]>([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('All staff');

  const load = useCallback(async () => {
    try { setError(''); setNotices(await apiSchoolNotices(schoolId)); }
    catch (e) { setError((e as Error).message || 'Failed to load notices'); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    try {
      await apiSchoolAddNotice(schoolId, { title, body, audience });
      notify('Notice posted'); setShowAdd(false); setTitle(''); setBody(''); await load();
    } catch (e) { setError((e as Error).message || 'Add failed'); }
  };

  const remove = async (nId: number) => {
    try { await apiSchoolDeleteNotice(schoolId, nId); await load(); }
    catch (e) { setError((e as Error).message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <TabShell
        title="School notices"
        body="Post announcements on behalf of the school's staff and parents."
        action={<Button size="sm" onClick={() => setShowAdd((v) => !v)}>{showAdd ? <><X size={15} /> Close</> : <><Plus size={15} /> New notice</>}</Button>}
      />
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
      {showAdd && (
        <Card>
          <CardContent className="grid gap-3 p-5">
            <MiniInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Mid-term assessment window" />
            <label className="grid gap-1.5 text-sm font-bold">Message<Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write the important part first..." /></label>
            <label className="grid gap-1.5 text-sm font-bold">Audience
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="All staff">All staff</SelectItem><SelectItem value="Teachers">Teachers</SelectItem><SelectItem value="Parents & guardians">Parents & guardians</SelectItem><SelectItem value="Learners">Learners</SelectItem></SelectContent>
              </Select>
            </label>
            <div className="flex justify-end"><Button size="sm" disabled={!title.trim() || !body.trim()} onClick={add}><Bell size={15} /> Post notice</Button></div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {notices.map((n, i) => (
          <article key={n.id} className={`rounded-2xl border border-border bg-card p-5 ${i === 0 ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <Badge variant="secondary">{n.audience}</Badge>
              <span className="text-[11px] font-bold text-muted-foreground">{n.date}</span>
            </div>
            <h2 className="mt-3 font-serif text-xl font-extrabold">{n.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{n.body}</p>
            <div className="mt-3"><Button size="sm" variant="ghost" onClick={() => remove(n.id)}><Trash2 size={14} /> Remove</Button></div>
          </article>
        ))}
        {!notices.length && <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">No notices yet.</div>}
      </div>
    </div>
  );
}

// ---------------- Settings ----------------

function SettingsTab({ schoolId, notify }: { schoolId: number; notify: (m: string) => void }) {
  const [settings, setSettings] = useState<ManagedSettings>({});
  const [schoolName, setSchoolName] = useState('');
  const [year, setYear] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const s = await apiSchoolSettings(schoolId);
      setSettings(s); setSchoolName(s.school_name || ''); setYear(s.academic_year || ''); setReportTitle(s.report_title || '');
    } catch (e) { setError((e as Error).message || 'Failed to load settings'); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const next = await apiSchoolSaveSettings(schoolId, { school_name: schoolName || undefined, academic_year: year || undefined, report_title: reportTitle || undefined });
      setSettings(next); notify('Settings saved');
    } catch (e) { setError((e as Error).message || 'Save failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <TabShell title="School settings" body="Update how the school presents itself on reports and records." />
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
          <MiniInput label="School name" value={schoolName} onChange={setSchoolName} placeholder={settings.school_name || ''} />
          <MiniInput label="Academic year" value={year} onChange={setYear} placeholder="e.g. 2026 academic year" />
          <MiniInput label="Report title" value={reportTitle} onChange={setReportTitle} placeholder="e.g. School Report" />
          <div className="sm:col-span-3 flex justify-end"><Button size="sm" disabled={busy} onClick={save}><Save size={15} /> Save settings</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
