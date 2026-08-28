import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Ban,
  Bell,
  Building2,
  Clock3,
  CreditCard,
  Edit3,
  KeyRound,
  LayoutDashboard,
  Lock,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  apiApproveSchool,
  apiCreatePlatformAdmin,
  apiCreatePlatformNotification,
  apiDeletePlatformNotification,
  apiDeleteSchool,
  apiDenySchool,
  apiEditSchool,
  apiPlatformActivity,
  apiPlatformAdmins,
  apiPlatformNotifications,
  apiPlatformSchoolDetail,
  apiPlatformSchools,
  apiPlatformStats,
  apiProvisionSchool,
  apiReactivateSchool,
  apiResetSchoolPassword,
  apiResumeSchool,
  apiSetPlan,
  apiSuspendSchool,
  apiTogglePlatformAdmin,
  type PlatformSchool,
  type PlatformSchoolDetail,
  type PlatformStats,
  type PlatformActivityItem,
  type PlatformAdminUser,
  type PlatformNoticeItem,
} from '@/lib/api';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  provisional: { label: 'Pending approval', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800' },
  suspended: { label: 'Suspended', cls: 'bg-slate-200 text-slate-700' },
};

const PLANS = ['Free', 'Standard', 'Premium', 'Enterprise'];
const BILLING = ['free', 'trial', 'on_plan', 'overdue', 'past_due'];

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (s: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      {label} {required && <span className="text-destructive">*</span>}
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function statusBadge(status?: string) {
  const meta = STATUS_META[status || ''] || { label: status || 'unknown', cls: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>;
}

function StatCard({ label, value, icon: Icon, tone = 'bg-secondary text-primary' }: { label: string; value: string | number; icon: typeof Activity; tone?: string }) {
  return (
    <Card className="transition-transform hover:-translate-y-0.5">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <div className="text-xs font-bold text-muted-foreground">{label}</div>
          <div className="mt-2 font-serif text-3xl font-extrabold tracking-[-.04em]">{value}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}>
          <Icon size={19} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlatformAdmin() {
  const [tab, setTab] = useState('overview');
  const [schools, setSchools] = useState<PlatformSchool[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [openForm, setOpenForm] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [sName, setSName] = useState('');
  const [sDistrict, setSDistrict] = useState('');
  const [sHead, setSHead] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [sContact, setSContact] = useState('');
  const [sUser, setSUser] = useState('');
  const [sPass, setSPass] = useState('');

  const notify = (m: string) => setMsg(m);

  const load = async () => {
    try {
      setError('');
      const [s, st] = await Promise.all([apiPlatformSchools(), apiPlatformStats()]);
      setSchools(s);
      setStats(st);
    } catch (e) {
      setError((e as Error).message || 'Failed to load data');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await fn();
      notify(ok);
      await load();
    } catch (e) {
      setError((e as Error).message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const provision = async () => {
    await act(
      () =>
        apiProvisionSchool({
          school_name: sName,
          district: sDistrict || undefined,
          head_teacher: sHead || undefined,
          email: sEmail || undefined,
          contact_name: sContact || undefined,
          admin_username: sUser,
          admin_password: sPass,
        }),
      'School provisioned and active. Share the admin credentials with them.',
    );
    setOpenForm(false);
    setSName(''); setSDistrict(''); setSHead(''); setSEmail(''); setSContact(''); setSUser(''); setSPass('');
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) => {
      const okStatus = statusFilter === 'all' || s.status === statusFilter;
      const okQ =
        !q ||
        [s.name, s.code, s.district, s.contact_name, s.head_teacher, s.plan]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      return okStatus && okQ;
    });
  }, [schools, search, statusFilter]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setError('');
  };

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-8 text-foreground md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-accent">
              <ShieldCheck size={14} /> Clique platform
            </div>
            <h1 className="font-serif text-3xl font-extrabold tracking-[-.045em] md:text-[40px]">Platform control center</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              Approve and manage every school on the network, control access, plans and alerts — all in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={busy}>
              <RefreshCw size={15} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setOpenForm((v) => !v)}>
              {openForm ? <><X size={15} /> Close</> : <><Plus size={15} /> Provision school</>}
            </Button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
        {msg && <div className="mb-4 rounded-xl border border-emerald-600/40 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800">{msg}</div>}

        {openForm && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="font-serif text-xl font-extrabold">Manually provision a school</CardTitle>
              <CardDescription>Creates the school and an active admin account immediately.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="School name" required value={sName} onChange={setSName} placeholder="e.g. Likoma Girls School" />
                <Field label="District" value={sDistrict} onChange={setSDistrict} placeholder="e.g. Likoma" />
                <Field label="Head teacher" value={sHead} onChange={setSHead} placeholder="Optional" />
                <Field label="Email" value={sEmail} onChange={setSEmail} placeholder="Optional" />
                <Field label="Contact name" value={sContact} onChange={setSContact} placeholder="Optional" />
                <Field label="Admin username" required value={sUser} onChange={setSUser} placeholder="e.g. likoma-admin" />
                <Field label="Admin password" required value={sPass} onChange={setSPass} placeholder="At least 6 characters" />
              </div>
              <div className="mt-4 flex justify-end">
                <Button disabled={busy || !sName || !sUser || sPass.length < 6} onClick={provision}>
                  <Building2 size={15} /> Provision school
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 flex-wrap">
            <TabsTrigger value="overview"><LayoutDashboard size={15} /> Overview</TabsTrigger>
            <TabsTrigger value="schools"><Building2 size={15} /> Schools ({schools.length})</TabsTrigger>
            <TabsTrigger value="admins"><Users size={15} /> Admins</TabsTrigger>
            <TabsTrigger value="notifications"><Bell size={15} /> Notifications</TabsTrigger>
            <TabsTrigger value="activity"><Activity size={15} /> Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab stats={stats} schools={schools} onOpenSchool={openDetail} />
          </TabsContent>

          <TabsContent value="schools">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code, district, plan..." className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="provisional">Pending approval</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3">
              {filtered.length ? (
                filtered.map((s) => (
                  <SchoolRow key={s.id} school={s} busy={busy} onAct={act} onOpen={() => openDetail(s.id)} />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  No schools match your search.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="admins">
            <AdminsTab busy={busy} onAct={act} notify={notify} />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsTab schools={schools} busy={busy} onAct={act} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab />
          </TabsContent>
        </Tabs>
      </div>

      {detailId != null && <SchoolDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: typeof Activity; title: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-extrabold">
      <Icon size={16} /> {title}
    </h2>
  );
}

function OverviewTab({
  stats,
  schools,
  onOpenSchool,
}: {
  stats: PlatformStats | null;
  schools: PlatformSchool[];
  onOpenSchool: (id: number) => void;
}) {
  const byPlan = stats?.byPlan || {};
  const pending = schools.filter((s) => s.status === 'provisional');
  const active = schools.filter((s) => s.status === 'active');
  const recent = (stats?.recentSchools || []).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total schools" value={stats?.total ?? schools.length} icon={Building2} />
        <StatCard label="Active" value={active.length} icon={BadgeCheck} tone="bg-emerald-100 text-emerald-800" />
        <StatCard label="Pending approval" value={pending.length} icon={Clock3} tone="bg-amber-100 text-amber-800" />
        <StatCard label="Suspended" value={stats?.suspended ?? 0} icon={Pause} tone="bg-slate-200 text-slate-700" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Rejected" value={stats?.rejected ?? 0} icon={Ban} tone="bg-rose-100 text-rose-800" />
        <StatCard label="Learners on network" value={stats?.students ?? 0} icon={Users} />
        <StatCard label="Reports generated" value={stats?.reports ?? 0} icon={Activity} />
        <StatCard label="Platform admins" value={stats?.platformAdmins ?? 0} icon={ShieldCheck} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg font-extrabold">Plan distribution</CardTitle>
            <CardDescription>How schools are subscribed across the network.</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(byPlan).length ? (
              <div className="space-y-3">
                {Object.entries(byPlan).map(([plan, count]) => {
                  const pct = stats?.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <div key={plan}>
                      <div className="mb-1 flex justify-between text-xs font-bold">
                        <span className="capitalize">{plan}</span>
                        <span className="text-muted-foreground">{count} · {pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No plans assigned yet. Set a plan from a school's detail view.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg font-extrabold">Recent registrations</CardTitle>
            <CardDescription>Latest schools to join the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <div className="divide-y divide-border/70">
                {recent.map((s) => (
                  <button key={s.id} onClick={() => onOpenSchool(s.id)} className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.code}{s.district ? ` · ${s.district}` : ''}</div>
                    </div>
                    {statusBadge(s.status)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent registrations.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SchoolRow({
  school: s,
  busy,
  onAct,
  onOpen,
}: {
  school: PlatformSchool;
  busy: boolean;
  onAct: (fn: () => Promise<unknown>, ok: string) => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2.5">
          <Building2 size={18} className="shrink-0 text-accent" />
          <span className="truncate font-serif text-lg font-extrabold">{s.name}</span>
          {statusBadge(s.status)}
        </div>
        <div className="mt-1 pl-[30px] text-xs text-muted-foreground">
          Code {s.code}
          {s.plan ? ` · ${s.plan}` : ''}
          {s.district ? ` · ${s.district}` : ''}
          {s.contact_name ? ` · ${s.contact_name}` : ''}
        </div>
      </button>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {s.status === 'provisional' && (
          <>
            <Button size="sm" disabled={busy} onClick={() => onAct(() => apiApproveSchool(s.id), `Approved ${s.name}`)}>
              <BadgeCheck size={15} /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(() => apiDenySchool(s.id), `Rejected ${s.name}`)}>
              <Ban size={15} /> Deny
            </Button>
          </>
        )}
        {s.status === 'active' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(() => apiSuspendSchool(s.id), `Suspended ${s.name}`)}>
            <Pause size={15} /> Suspend
          </Button>
        )}
        {s.status === 'suspended' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(() => apiResumeSchool(s.id), `Resumed ${s.name}`)}>
            <Play size={15} /> Resume
          </Button>
        )}
        {s.status === 'rejected' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(() => apiReactivateSchool(s.id), `Reactivated ${s.name}`)}>
            <BadgeCheck size={15} /> Reactivate
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onOpen}>
          <Edit3 size={15} /> Details
        </Button>
      </div>
    </div>
  );
}

function SchoolDetailModal({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PlatformSchoolDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg2, setMsg2] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [pwMode, setPwMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [eName, setEName] = useState('');
  const [eDistrict, setEDistrict] = useState('');
  const [eHead, setEHead] = useState('');
  const [eEmail, setEEmail] = useState('');
  const [ePhone, setEPhone] = useState('');
  const [eContact, setEContact] = useState('');

  const [plan, setPlan] = useState('Free');
  const [billing, setBilling] = useState('free');
  const [newPw, setNewPw] = useState('');

  const load = async () => {
    try {
      const d = await apiPlatformSchoolDetail(id);
      setDetail(d);
      setEName(d.name || '');
      setEDistrict(d.district || '');
      setEHead(d.head_teacher || '');
      setEEmail(d.email || '');
      setEPhone(d.phone || '');
      setEContact(d.contact_name || '');
      setPlan(d.plan || 'Free');
      setBilling(d.billing_status || 'free');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const local = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(''); setMsg2('');
    try { await fn(); setMsg2(ok); await load(); setEditMode(false); setPlanMode(false); setPwMode(false); setConfirmDelete(false); }
    catch (e) { setErr((e as Error).message || 'Action failed'); }
    finally { setBusy(false); }
  };

  if (!detail) return <ModalShell title="School" onClose={onClose}>{err || 'Loading...'}</ModalShell>;

  return (
    <ModalShell title={detail.name} onClose={onClose}>
      <div className="space-y-5">
        {msg2 && <div className="rounded-xl border border-emerald-600/40 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800">{msg2}</div>}
        {err && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{err}</div>}

        <div className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-2xl font-extrabold">{detail.name}</h3>
              {statusBadge(detail.status)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {detail.code}
              {detail.plan ? ` · Plan: ${detail.plan}` : ''}
              {detail.billing_status ? ` · Billing: ${detail.billing_status}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditMode((v) => !v); setPlanMode(false); setPwMode(false); }}>
              <Edit3 size={15} /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPlanMode((v) => !v); setEditMode(false); setPwMode(false); }}>
              <CreditCard size={15} /> Plan
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPwMode((v) => !v); setEditMode(false); setPlanMode(false); }}>
              <KeyRound size={15} /> Reset password
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Learners" value={String(detail.student_count ?? 0)} />
          <MiniStat label="Classes" value={String(detail.class_count ?? 0)} />
          <MiniStat label="Reports" value={String(detail.report_count ?? 0)} />
          <MiniStat label="Type" value="School" />
        </div>

        {editMode && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h4 className="mb-3 font-serif text-lg font-extrabold">Edit profile</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="School name" value={eName} onChange={setEName} />
              <Field label="District" value={eDistrict} onChange={setEDistrict} />
              <Field label="Head teacher" value={eHead} onChange={setEHead} />
              <Field label="Email" value={eEmail} onChange={setEEmail} />
              <Field label="Phone" value={ePhone} onChange={setEPhone} />
              <Field label="Contact name" value={eContact} onChange={setEContact} />
            </div>
            <Button className="mt-3" disabled={busy} onClick={() => local(() => apiEditSchool(id, {
              name: eName || undefined, district: eDistrict || undefined, head_teacher: eHead || undefined,
              email: eEmail || undefined, phone: ePhone || undefined, contact_name: eContact || undefined,
            }), 'School profile updated')}>Save changes</Button>
          </div>
        )}

        {planMode && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h4 className="mb-3 font-serif text-lg font-extrabold">Subscription &amp; billing</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold">Plan
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLANS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-1.5 text-sm font-bold">Billing status
                <Select value={billing} onValueChange={setBilling}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING.map((b) => <SelectItem key={b} value={b}>{b.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <Button className="mt-3" disabled={busy} onClick={() => local(() => apiSetPlan(id, { plan, billing_status: billing }), 'Plan updated')}>Set plan</Button>
          </div>
        )}

        {pwMode && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h4 className="mb-3 font-serif text-lg font-extrabold">Reset school admin password</h4>
            <p className="mb-3 text-sm text-muted-foreground">
              {detail.admin ? `Applies to ${detail.admin.username} (${detail.admin.name || 'school admin'}).` : 'No school admin account found.'}
            </p>
            <Field label="New password" value={newPw} onChange={setNewPw} placeholder="At least 6 characters" />
            <Button className="mt-3" disabled={busy || newPw.length < 6 || !detail.admin} onClick={() => local(() => apiResetSchoolPassword(id, newPw), 'Password reset — share with the school')}>Reset password</Button>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-4">
          <h4 className="mb-3 font-serif text-lg font-extrabold">Contact &amp; admin</h4>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between"><dt className="text-muted-foreground">Head teacher</dt><dd className="font-bold">{detail.head_teacher || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">District</dt><dd className="font-bold">{detail.district || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd className="font-bold">{detail.email || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Phone</dt><dd className="font-bold">{detail.phone || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Contact</dt><dd className="font-bold">{detail.contact_name || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Admin user</dt><dd className="font-bold">{detail.admin?.username || '—'}</dd></div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
          <span className="text-sm font-bold">Actions:</span>
          {detail.status !== 'active' && detail.status !== 'suspended' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => local(() => apiApproveSchool(id), 'School approved')}>
              <BadgeCheck size={15} /> Approve
            </Button>
          )}
          {detail.status === 'active' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => local(() => apiSuspendSchool(id), 'School suspended')}>
              <Pause size={15} /> Suspend
            </Button>
          )}
          {detail.status === 'suspended' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => local(() => apiResumeSchool(id), 'School resumed')}>
              <Play size={15} /> Resume
            </Button>
          )}
          {detail.status === 'rejected' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => local(() => apiReactivateSchool(id), 'School reactivated')}>
              <BadgeCheck size={15} /> Reactivate
            </Button>
          )}
          {!confirmDelete ? (
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> Delete
            </Button>
          ) : (
            <>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => local(() => apiDeleteSchool(id), 'School deleted')}>
                <Trash2 size={15} /> Confirm delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="font-serif text-2xl font-extrabold text-primary">{value}</div>
      <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-extrabold">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function AdminsTab({
  busy,
  onAct,
  notify,
}: {
  busy: boolean;
  onAct: (fn: () => Promise<unknown>, ok: string) => void;
  notify: (m: string) => void;
}) {
  const [admins, setAdmins] = useState<PlatformAdminUser[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const load = async () => {
    try { setError(''); setAdmins(await apiPlatformAdmins()); }
    catch (e) { setError((e as Error).message || 'Failed to load admins'); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError('');
    try {
      await apiCreatePlatformAdmin({ username, password, name: name || undefined });
      notify(`Admin ${username} created`);
      setShow(false); setUsername(''); setName(''); setPassword('');
      await load();
    } catch (e) { setError((e as Error).message || 'Create failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShow((v) => !v)}>{show ? <><X size={15} /> Close</> : <><UserPlus size={15} /> Add admin</>}</Button>
      </div>
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}

      {show && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg font-extrabold">New platform admin</CardTitle>
            <CardDescription>This person can sign in and manage every school.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Username" required value={username} onChange={setUsername} placeholder="e.g. admin2" />
              <Field label="Name" value={name} onChange={setName} placeholder="Optional" />
              <Field label="Password" required value={password} onChange={setPassword} placeholder="At least 6 characters" />
            </div>
            <Button className="mt-3" disabled={!username || password.length < 6} onClick={create}>
              <UserPlus size={15} /> Create admin
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg font-extrabold">Platform administrators</CardTitle>
          <CardDescription>Admins who can access the platform control center.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/70">
            {admins.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{a.name || a.username}</span>
                    <span className="text-xs text-muted-foreground">@{a.username}</span>
                    {!a.is_active && <Badge variant="secondary">Disabled</Badge>}
                  </div>
                  {a.created_at && <div className="text-xs text-muted-foreground">Created {a.created_at.slice(0, 10)}</div>}
                </div>
                <Button size="sm" variant={a.is_active ? 'outline' : 'default'} disabled={busy} onClick={() => onAct(() => apiTogglePlatformAdmin(a.id), `${a.is_active ? 'Disabled' : 'Enabled'} ${a.username}`)}>
                  {a.is_active ? <><Lock size={15} /> Disable</> : <><Play size={15} /> Enable</>}
                </Button>
              </div>
            ))}
            {!admins.length && <p className="py-4 text-sm text-muted-foreground">No admins yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab({
  schools,
  busy,
  onAct,
}: {
  schools: PlatformSchool[];
  busy: boolean;
  onAct: (fn: () => Promise<unknown>, ok: string) => void;
}) {
  const [items, setItems] = useState<PlatformNoticeItem[]>([]);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [schoolId, setSchoolId] = useState('all');

  const load = async () => {
    try { setError(''); setItems(await apiPlatformNotifications()); }
    catch (e) { setError((e as Error).message || 'Failed to load'); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError('');
    try {
      await apiCreatePlatformNotification({
        title, body, audience,
        school_id: schoolId === 'all' ? undefined : Number(schoolId),
      });
      setShow(false); setTitle(''); setBody(''); setSchoolId('all');
      await load();
    } catch (e) { setError((e as Error).message || 'Create failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShow((v) => !v)}>{show ? <><X size={15} /> Close</> : <><Bell size={15} /> New notification</>}</Button>
      </div>
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}

      {show && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg font-extrabold">Send a notification</CardTitle>
            <CardDescription>Reach all schools or a single school about maintenance, news or updates.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <Field label="Title" required value={title} onChange={setTitle} placeholder="e.g. Scheduled maintenance" />
              <label className="grid gap-1.5 text-sm font-bold">Message
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Write the important part first..." />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-bold">Audience
                  <Select value={audience} onValueChange={setAudience}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All schools</SelectItem>
                      <SelectItem value="admins">School admins</SelectItem>
                      <SelectItem value="teachers">Teachers</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid gap-1.5 text-sm font-bold">Target school
                  <Select value={schoolId} onValueChange={setSchoolId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All schools</SelectItem>
                      {schools.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </div>
            <Button className="mt-3" disabled={!title || !body} onClick={create}>
              <Bell size={15} /> Send notification
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg font-extrabold">Sent notifications</CardTitle>
          <CardDescription>Broadcasts and targeted messages to schools.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/70">
            {items.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{n.title}</span>
                    <Badge variant="secondary">{n.audience}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  {n.created_at && <div className="mt-1 text-xs text-muted-foreground">{n.created_at.slice(0, 16).replace('T', ' ')}</div>}
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAct(() => apiDeletePlatformNotification(n.id), 'Notification deleted')}>
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            {!items.length && <p className="py-4 text-sm text-muted-foreground">No notifications sent yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab() {
  const [items, setItems] = useState<PlatformActivityItem[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try { setError(''); setItems(await apiPlatformActivity()); }
    catch (e) { setError((e as Error).message || 'Failed to load activity'); }
  };
  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? items : items.filter((i) => i.action.startsWith(`${filter}.`));

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm font-semibold text-destructive">{error}</div>}
      <div className="flex justify-end">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All activity</SelectItem>
            <SelectItem value="school">Schools</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="notification">Notifications</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent>
          {filtered.length ? (
            <div className="divide-y divide-border/70">
              {filtered.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold capitalize">{a.action.replace(/[._]/g, ' ')}</div>
                    {a.detail && <div className="text-sm text-muted-foreground">{a.detail}</div>}
                    <div className="mt-0.5 text-xs text-muted-foreground">by {a.actor}{a.created_at ? ` · ${a.created_at.slice(0, 16).replace('T', ' ')}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">No activity recorded yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
