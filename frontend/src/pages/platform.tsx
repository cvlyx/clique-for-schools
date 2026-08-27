import { useEffect, useState } from 'react';
import { Activity, BadgeCheck, Ban, Building2, Clock3, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  apiApproveSchool,
  apiDenySchool,
  apiPlatformSchools,
  apiProvisionSchool,
  type PlatformSchool,
} from '@/lib/api';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  provisional: { label: 'Pending approval', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-800' },
};

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (s: string) => void; placeholder: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-bold">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal outline-none placeholder:text-muted-foreground focus:border-accent"
      />
    </label>
  );
}

export default function PlatformAdmin() {
  const [schools, setSchools] = useState<PlatformSchool[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [headTeacher, setHeadTeacher] = useState('');
  const [email, setEmail] = useState('');
  const [contact, setContact] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const load = async () => {
    try {
      setError('');
      setSchools(await apiPlatformSchools());
    } catch (e) {
      setError((e as Error).message || 'Failed to load schools');
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
      setMsg(ok);
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
          school_name: name,
          district: district || undefined,
          head_teacher: headTeacher || undefined,
          email: email || undefined,
          contact_name: contact || undefined,
          admin_username: username,
          admin_password: password,
        }),
      'School provisioned and active. Share the admin credentials with them.',
    );
    setOpenForm(false);
    setName(''); setDistrict(''); setHeadTeacher(''); setEmail(''); setContact(''); setUsername(''); setPassword('');
  };

  const pending = schools.filter((s) => s.status === 'provisional');
  const active = schools.filter((s) => s.status === 'active');
  const rejected = schools.filter((s) => s.status === 'rejected');

  const renderSchool = (s: PlatformSchool) => {
    const meta = STATUS_META[s.status] || { label: s.status, cls: 'bg-muted text-muted-foreground' };
    return (
      <div key={s.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <Building2 size={18} className="shrink-0 text-accent" />
            <span className="truncate font-serif text-lg font-extrabold">{s.name}</span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.cls}`}>{meta.label}</span>
          </div>
          <div className="mt-1 pl-[30px] text-xs text-muted-foreground">
            Code {s.code}
            {s.district ? ` · ${s.district}` : ''}
            {s.contact_name ? ` · ${s.contact_name}` : ''}
            {s.email ? ` · ${s.email}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {s.status !== 'active' && (
            <Button size="sm" disabled={busy} onClick={() => act(() => apiApproveSchool(s.id), `Approved ${s.name}`)}>
              <BadgeCheck size={15} /> Approve
            </Button>
          )}
          {s.status === 'provisional' && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => apiDenySchool(s.id), `Rejected ${s.name}`)}>
              <Ban size={15} /> Deny
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background px-5 py-8 text-foreground md:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-accent">
              <ShieldCheck size={14} /> Clique platform
            </div>
            <h1 className="font-serif text-3xl font-extrabold tracking-[-.045em] md:text-[40px]">School administration</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
              Approve registrations, reject requests, or manually provision a school. Provisioned schools are active immediately.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
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
          <div className="mb-8 rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 font-serif text-xl font-extrabold">Manually provision a school</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="School name *" value={name} onChange={setName} placeholder="e.g. Likoma Girls School" />
              <Field label="District" value={district} onChange={setDistrict} placeholder="e.g. Likoma" />
              <Field label="Head teacher" value={headTeacher} onChange={setHeadTeacher} placeholder="Optional" />
              <Field label="Email" value={email} onChange={setEmail} placeholder="Optional" />
              <Field label="Contact name" value={contact} onChange={setContact} placeholder="Optional" />
              <Field label="Admin username *" value={username} onChange={setUsername} placeholder="e.g. likoma-admin" />
              <Field label="Admin password *" value={password} onChange={setPassword} placeholder="At least 8 characters" />
            </div>
            <div className="mt-4 flex justify-end">
              <Button disabled={busy || !name || !username || password.length < 6} onClick={provision}>
                <Building2 size={15} /> Provision school
              </Button>
            </div>
          </div>
        )}

        <Section icon={<Clock3 size={16} />} title={`Awaiting approval (${pending.length})`}>
          {pending.length ? pending.map(renderSchool) : <Empty>No schools waiting for approval.</Empty>}
        </Section>

        <Section icon={<BadgeCheck size={16} />} title={`Active schools (${active.length})`}>
          {active.length ? active.map(renderSchool) : <Empty>No active schools yet.</Empty>}
        </Section>

        {rejected.length > 0 && (
          <Section icon={<Ban size={16} />} title={`Rejected (${rejected.length})`}>
            {rejected.map(renderSchool)}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-extrabold">
        {icon} {title}
      </h2>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
      <Activity size={15} /> {children}
    </div>
  );
}
