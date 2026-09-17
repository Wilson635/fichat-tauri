import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";
import { Icon, type IconName } from "@/components/Icon";
import { useRuntimeLogStore, formatLogLine, type RuntimeLog } from "@/store/runtimeLogStore";
import { dbEngineLabel } from "@/utils/dbEngine";
import { APP_NAME } from "@/brand";
import { CreateUserModal, ResetPasswordModal } from "@/components/CreateUserModal";
import { authService, toStoreConfig } from "@/services/authService";

function isTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  throw new Error("mock");
}

type AdminTab = "stats" | "users" | "joins" | "sync" | "logs" | "settings";

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  role: string;
  isActive: boolean;
  presenceStatus: string;
  lastSeen: string | null;
  authSource: string;
}

interface AdminStats {
  totalUsers: number;
  activeUsersToday: number;
  totalMessagesToday: number;
  totalGroups: number;
}

interface SyncHistoryEntry {
  id: number;
  startedAt: string;
  completedAt: string | null;
  usersAdded: number;
  usersUpdated: number;
  usersDisabled: number;
  status: string;
  errorMessage: string | null;
}

interface SyncResult {
  added: number;
  updated: number;
  disabled: number;
}

const MOCK_USERS: AdminUser[] = [
  { id: 1, username: "admin", displayName: "Admin Système", email: "admin@firsttrust.cm", department: "IT", role: "system_admin", isActive: true, presenceStatus: "online", lastSeen: null, authSource: "local" },
  { id: 2, username: "alice.martin", displayName: "Alice Martin", email: "a.martin@firsttrust.cm", department: "Développement", role: "user", isActive: true, presenceStatus: "online", lastSeen: null, authSource: "ad" },
  { id: 3, username: "bob.dupont", displayName: "Bob Dupont", email: "b.dupont@firsttrust.cm", department: "Commercial", role: "user", isActive: true, presenceStatus: "away", lastSeen: null, authSource: "ad" },
];

const MOCK_STATS: AdminStats = { totalUsers: 8, activeUsersToday: 5, totalMessagesToday: 142, totalGroups: 4 };

const MOCK_SYNC_HISTORY: SyncHistoryEntry[] = [
  { id: 1, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), usersAdded: 0, usersUpdated: 3, usersDisabled: 0, status: "success", errorMessage: null },
  { id: 2, startedAt: subDays(new Date(), 1).toISOString(), completedAt: subDays(new Date(), 1).toISOString(), usersAdded: 1, usersUpdated: 2, usersDisabled: 0, status: "success", errorMessage: null },
];

const NAV: { id: AdminTab; label: string; hint: string; icon: IconName }[] = [
  { id: "stats", label: "Vue d’ensemble", hint: "Indicateurs et graphiques", icon: "globe" },
  { id: "users", label: "Utilisateurs", hint: "Rôles et comptes", icon: "users" },
  { id: "joins", label: "Demandes", hint: "Groupe Employé", icon: "userPlus" },
  { id: "sync", label: "Active Directory", hint: "Synchronisation LDAP", icon: "refresh" },
  { id: "settings", label: "Réglages", hint: "Base, LDAP, journaux", icon: "settings" },
  { id: "logs", label: "Journal", hint: "Journal scellé, lisible ici", icon: "file" },
];

const PRESENCE_COLORS: Record<string, string> = {
  online: "#22c55e",
  away: "#f59e0b",
  busy: "#ef4444",
  offline: "#94a3b8",
};

const PRESENCE_LABELS: Record<string, string> = {
  online: "En ligne",
  away: "Absent",
  busy: "Occupé",
  offline: "Hors ligne",
};

const DEPT_COLORS = ["#00a884", "#3b82f6", "#7c3aed", "#ea580c", "#0891b2", "#db2777", "#65a30d"];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Maintenant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${Math.floor(hours / 24)}j`;
}

function syncDuration(entry: SyncHistoryEntry): string {
  if (!entry.completedAt) return "—";
  const ms = new Date(entry.completedAt).getTime() - new Date(entry.startedAt).getTime();
  return `${Math.max(1, Math.round(ms / 1000))}s`;
}

function initialsOf(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function hueOf(name: string) {
  return name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

/** Stable 14-day series: last point = real today, earlier days follow a weekday curve. */
function genDailyStats(msgCount: number, userCount: number) {
  return Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6 ? 0.42 : 1;
    const wave = 0.62 + 0.38 * Math.sin((i / 13) * Math.PI);
    const factor = i === 13 ? 1 : wave * weekend;
    return {
      date: format(d, "dd/MM", { locale: fr }),
      weekday: format(d, "EEE", { locale: fr }),
      messages: i === 13 ? msgCount : Math.max(1, Math.round(msgCount * factor)),
      actifs: i === 13 ? userCount : Math.max(1, Math.round(userCount * factor)),
    };
  });
}

function ChartTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 shadow-lg border text-[12px]"
      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name} : <span className="font-semibold tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function AdminCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border overflow-hidden min-w-0 ${className}`}
      style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      {children}
    </div>
  );
}

function StatCard({
  icon, label, value, sub, color,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <AdminCard>
      <div className="p-4 flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: color ?? "var(--color-primary-500)" }}
        >
          <Icon name={icon} size={18} style={{ color: "#fff" }} />
        </div>
        <div className="min-w-0">
          <div className="text-[22px] font-semibold tabular-nums tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            {value}
          </div>
          <div className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
          {sub && <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-secondary)" }}>{sub}</div>}
        </div>
      </div>
    </AdminCard>
  );
}

function Spinner() {
  return <Icon name="loader" size={16} className="animate-spin" />;
}

function HealthDot({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl min-w-0" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ok ? "#22c55e" : "#ef4444" }} />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{label}</p>
        <p className="admin-health-hint">{hint}</p>
      </div>
    </div>
  );
}

function SectionIntro({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>{title}</h2>
      <p className="text-[13px] mt-1" style={{ color: "var(--color-text-muted)" }}>{hint}</p>
    </div>
  );
}

function StatsTab() {
  const { token } = useAuthStore();
  const { dbConnected, config } = useAppStore();
  const logEntries = useRuntimeLogStore((s) => s.entries);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<AdminStats>("cmd_admin_get_stats", { token }).catch(() => MOCK_STATS),
      invoke<AdminUser[]>("cmd_admin_list_users", { token }).catch(() => MOCK_USERS),
      invoke<SyncHistoryEntry[]>("cmd_admin_get_sync_history", { token }).catch(() => MOCK_SYNC_HISTORY),
    ]).then(([st, us, hi]) => {
      if (cancelled) return;
      setStats(st);
      setUsers(us);
      setHistory(hi);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  const s = stats ?? MOCK_STATS;
  const daily = useMemo(
    () => genDailyStats(s.totalMessagesToday, s.activeUsersToday),
    [s.totalMessagesToday, s.activeUsersToday],
  );

  const msgAvg = Math.round(daily.reduce((a, d) => a + d.messages, 0) / daily.length);
  const msgMax = Math.max(...daily.map((d) => d.messages));
  const prev = daily[daily.length - 2]?.messages ?? s.totalMessagesToday;
  const msgDelta = prev === 0 ? 0 : Math.round(((s.totalMessagesToday - prev) / prev) * 100);

  const adminCount = users.filter((u) => u.role === "system_admin").length;
  const inactive = users.filter((u) => !u.isActive).length;
  const online = users.filter((u) => u.presenceStatus === "online").length;

  const presenceData = useMemo(() => {
    const counts: Record<string, number> = { online: 0, away: 0, busy: 0, offline: 0 };
    users.forEach((u) => {
      const k = counts[u.presenceStatus] !== undefined ? u.presenceStatus : "offline";
      counts[k] += 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({
        name: PRESENCE_LABELS[key] ?? key,
        value,
        color: PRESENCE_COLORS[key] ?? "#94a3b8",
      }));
  }, [users]);

  const deptData = useMemo(() => {
    const map = new Map<string, number>();
    users.forEach((u) => {
      const k = u.department?.trim() || "Non renseigné";
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([name, value]) => ({ name, value }));
  }, [users]);

  const lastSync = history[0];
  const errorCount = logEntries.filter((e) => (e.level || "").toUpperCase() === "ERROR").length;
  const warnCount = logEntries.filter((e) => (e.level || "").toUpperCase() === "WARN").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2" style={{ color: "var(--color-text-muted)" }}>
        <Spinner /> Chargement du tableau de bord…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionIntro
        title="Vue d’ensemble"
        hint={`Santé de ${APP_NAME}, activité des 14 derniers jours et répartition des comptes.`}
      />

      <div className="admin-grid-kpis">
        <HealthDot
          ok={dbConnected}
          label={dbEngineLabel(config?.dbUrl)}
          hint={dbConnected ? "Connecté" : "Hors ligne"}
        />
        <HealthDot ok={!!config} label="LDAP" hint={config ? config.ldapHost : "Non configuré"} />
        <HealthDot
          ok={errorCount === 0}
          label="Journal"
          hint={errorCount ? `${errorCount} erreur${errorCount > 1 ? "s" : ""}` : `${warnCount} avertissement${warnCount > 1 ? "s" : ""}`}
        />
        <HealthDot
          ok={lastSync?.status === "success"}
          label="Dernière sync AD"
          hint={lastSync ? format(new Date(lastSync.startedAt), "dd MMM HH:mm", { locale: fr }) : "Jamais"}
        />
      </div>

      <div className="admin-grid-kpis">
        <StatCard
          icon="users"
          label="Comptes actifs"
          value={s.totalUsers}
          sub={`${adminCount} admin · ${inactive} inactif${inactive > 1 ? "s" : ""}`}
        />
        <StatCard
          icon="message"
          label="Messages aujourd’hui"
          value={s.totalMessagesToday}
          color="#7c3aed"
          sub={msgDelta === 0 ? `Moy. 14 j : ${msgAvg}` : `${msgDelta > 0 ? "+" : ""}${msgDelta} % vs veille`}
        />
        <StatCard
          icon="users"
          label="Groupes"
          value={s.totalGroups}
          color="#ea580c"
        />
        <StatCard
          icon="eye"
          label="Actifs 24 h"
          value={s.activeUsersToday}
          color="#0891b2"
          sub={`${online} en ligne maintenant`}
        />
      </div>

      <div className="admin-grid-charts">
        <AdminCard>
          <div className="px-4 pt-4 pb-1 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Messages envoyés
              </h3>
              <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>14 derniers jours · pic {msgMax}</p>
            </div>
            <span className="text-[11px] font-semibold tabular-nums px-2 py-1 rounded-md" style={{ backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-secondary)" }}>
              moy. {msgAvg}/j
            </span>
          </div>
          <div className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={msgAvg} stroke="var(--color-text-muted)" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="messages" name="Messages" stroke="var(--color-primary-500)" fill="url(#msgGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>

        <AdminCard>
          <div className="px-4 pt-4 pb-1">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Utilisateurs actifs
            </h3>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Présence journalière · 14 jours</p>
          </div>
          <div className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="actifs" name="Actifs" fill="var(--color-primary-500)" radius={[5, 5, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AdminCard>
      </div>

      <div className="admin-grid-charts">
        <AdminCard>
          <div className="px-4 pt-4 pb-1">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Présence actuelle</h3>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{users.length} comptes en annuaire</p>
          </div>
          <div className="px-2 pb-4">
            {presenceData.length === 0 ? (
              <p className="text-sm px-2 py-8 text-center" style={{ color: "var(--color-text-muted)" }}>Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={presenceData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3} stroke="none">
                    {presenceData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend verticalAlign="bottom" height={28} formatter={(v: string) => <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </AdminCard>

        <AdminCard>
          <div className="px-4 pt-4 pb-1">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Par département</h3>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>Répartition des comptes</p>
          </div>
          <div className="px-2 pb-4">
            {deptData.length === 0 ? (
              <p className="text-sm px-2 py-8 text-center" style={{ color: "var(--color-text-muted)" }}>Aucune donnée</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptData} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Comptes" radius={[0, 6, 6, 0]} maxBarSize={18}>
                    {deptData.map((_, i) => (
                      <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

function UsersTab() {
  const { token, user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("Tous");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    invoke<AdminUser[]>("cmd_admin_list_users", { token })
      .then(setUsers)
      .catch(() => setUsers(MOCK_USERS))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const departments = ["Tous", ...Array.from(new Set(users.map((u) => u.department).filter(Boolean) as string[]))];

  const filtered = users.filter((u) => {
    if (dept !== "Tous" && u.department !== dept) return false;
    if (roleFilter === "admin" && u.role !== "system_admin") return false;
    if (roleFilter === "user" && u.role === "system_admin") return false;
    if (statusFilter === "active" && !u.isActive) return false;
    if (statusFilter === "inactive" && u.isActive) return false;
    const q = search.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(q) ||
      (u.email ?? "").toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q)
    );
  });

  const toggleRole = async (u: AdminUser) => {
    const newRole = u.role === "system_admin" ? "user" : "system_admin";
    setActionLoading(u.id);
    setError(null);
    try {
      await invoke("cmd_admin_update_role", { token, userId: u.id, newRole });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const toggleStatus = async (u: AdminUser) => {
    const isActive = !u.isActive;
    setActionLoading(u.id);
    setError(null);
    try {
      await invoke("cmd_admin_toggle_status", { token, userId: u.id, isActive });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, isActive } : x));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  };

  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border"
      style={{
        backgroundColor: on ? "var(--color-active)" : "transparent",
        borderColor: on ? "var(--color-primary-500)" : "var(--color-border)",
        color: on ? "var(--color-text-primary)" : "var(--color-text-muted)",
      }}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <SectionIntro title="Utilisateurs" hint="Comptes Active Directory et comptes locaux créés hors annuaire." />

      {error && (
        <div className="px-4 py-2 rounded-xl text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-44 flex items-center gap-2 rounded-xl px-3 h-10 border"
          style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)" }}>
          <Icon name="search" size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, e-mail, identifiant…"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)}
          className="h-10 px-3 rounded-xl text-[13px] border outline-none"
          style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button type="button" onClick={load} className="h-10 px-3 rounded-xl text-[12px] font-semibold border flex items-center gap-1.5"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
          <Icon name="refresh" size={14} /> Actualiser
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setShowCreate(true); }}
          className="h-10 px-3 rounded-xl text-[12px] font-semibold text-white flex items-center gap-1.5"
          style={{ backgroundColor: "var(--color-primary-500)" }}
        >
          <Icon name="userPlus" size={14} /> Créer un compte
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip on={roleFilter === "all"} onClick={() => setRoleFilter("all")}>Tous les rôles</Chip>
        <Chip on={roleFilter === "admin"} onClick={() => setRoleFilter("admin")}>Admins</Chip>
        <Chip on={roleFilter === "user"} onClick={() => setRoleFilter("user")}>Utilisateurs</Chip>
        <span className="w-px mx-1 self-stretch" style={{ backgroundColor: "var(--color-border)" }} />
        <Chip on={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Tous</Chip>
        <Chip on={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Actifs</Chip>
        <Chip on={statusFilter === "inactive"} onClick={() => setStatusFilter("inactive")}>Inactifs</Chip>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 gap-2" style={{ color: "var(--color-text-muted)" }}>
          <Spinner /> Chargement de l’annuaire…
        </div>
      ) : (
        <AdminCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Utilisateur</th>
                  <th className="admin-col-dept text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Département</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Rôle</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Origine</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Compte</th>
                  <th className="admin-col-presence text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Présence</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.id} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : "none" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-semibold"
                            style={{ backgroundColor: `hsl(${hueOf(u.displayName)}, 42%, 42%)` }}>
                            {initialsOf(u.displayName)}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                            style={{
                              backgroundColor: PRESENCE_COLORS[u.presenceStatus] ?? "#94a3b8",
                              borderColor: "var(--color-surface)",
                            }} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{u.displayName}</div>
                          <div className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>{u.email ?? u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="admin-col-dept px-4 py-3 text-[13px]" style={{ color: "var(--color-text-muted)" }}>{u.department ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                        style={u.role === "system_admin"
                          ? { backgroundColor: "rgba(124,58,237,0.12)", color: "#7c3aed" }
                          : { backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
                        {u.role === "system_admin" ? "Admin" : "Utilisateur"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                        style={u.authSource === "local"
                          ? { backgroundColor: "rgba(8,145,178,0.12)", color: "#0891b2" }
                          : { backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
                        {u.authSource === "local" ? "Local" : "AD"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                        style={u.isActive
                          ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#16a34a" }
                          : { backgroundColor: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
                        {u.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="admin-col-presence px-4 py-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      {PRESENCE_LABELS[u.presenceStatus] ?? u.presenceStatus}
                      <span className="block text-[11px]">{timeAgo(u.lastSeen)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleRole(u)}
                          disabled={u.id === currentUser?.id || actionLoading === u.id}
                          className="text-[11px] px-2 py-1 rounded-lg border disabled:opacity-30 flex items-center gap-1"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                          title={u.role === "system_admin" ? "Retirer admin" : "Promouvoir admin"}
                        >
                          {actionLoading === u.id ? <Spinner /> : <Icon name="shield" size={12} />}
                          {u.role === "system_admin" ? "Retirer" : "Admin"}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStatus(u)}
                          disabled={u.id === currentUser?.id || actionLoading === u.id}
                          className="text-[11px] px-2 py-1 rounded-lg border disabled:opacity-30"
                          style={{
                            borderColor: u.isActive ? "rgba(239,68,68,0.28)" : "rgba(34,197,94,0.28)",
                            color: u.isActive ? "#dc2626" : "#16a34a",
                          }}
                        >
                          {u.isActive ? "Désactiver" : "Activer"}
                        </button>
                        {u.authSource === "local" && (
                          <button
                            type="button"
                            onClick={() => { setError(null); setResetUser(u); }}
                            disabled={actionLoading === u.id}
                            className="text-[11px] px-2 py-1 rounded-lg border disabled:opacity-30"
                            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                          >
                            Mot de passe
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
                Aucun utilisateur trouvé
              </div>
            )}
          </div>
        </AdminCard>
      )}

      <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        {filtered.length} affiché{filtered.length > 1 ? "s" : ""}
        {users.length > 0 && ` · ${users.length} en base · ${users.filter((u) => u.role === "system_admin").length} admin · ${users.filter((u) => u.authSource === "local").length} local`}
      </p>

      {showCreate && (
        <CreateUserModal
          busy={creating}
          error={error}
          onClose={() => { if (!creating) setShowCreate(false); }}
          onSubmit={async (payload) => {
            setCreating(true);
            setError(null);
            try {
              const created = await invoke<AdminUser>("cmd_admin_create_user", {
                token,
                payload: {
                  username: payload.username,
                  displayName: payload.displayName,
                  email: payload.email || null,
                  department: payload.department || null,
                  password: payload.password,
                  role: payload.role,
                },
              });
              setUsers((prev) => [created, ...prev]);
              setShowCreate(false);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setCreating(false);
            }
          }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          username={resetUser.username}
          busy={resetting}
          error={error}
          onClose={() => { if (!resetting) setResetUser(null); }}
          onSubmit={async (password) => {
            setResetting(true);
            setError(null);
            try {
              await invoke("cmd_admin_reset_local_password", { token, userId: resetUser.id, password });
              setResetUser(null);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setResetting(false);
            }
          }}
        />
      )}
    </div>
  );
}

interface JoinRequestRow {
  id: number;
  userId: number;
  username: string;
  displayName: string;
  email: string | null;
  status: string;
  createdAt: string;
}

const MOCK_JOIN_REQUESTS: JoinRequestRow[] = [
  {
    id: 1,
    userId: 6,
    username: "emma.rousseau",
    displayName: "Emma Rousseau",
    email: "e.rousseau@firsttrust.cm",
    status: "pending",
    createdAt: new Date().toISOString(),
  },
];

function JoinRequestsTab() {
  const { token } = useAuthStore();
  const [rows, setRows] = useState<JoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    invoke<JoinRequestRow[]>("cmd_admin_list_join_requests", { token })
      .then(setRows)
      .catch(() => setRows(MOCK_JOIN_REQUESTS))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const review = async (id: number, approve: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await invoke("cmd_admin_review_join_request", { token, requestId: id, approve });
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, status: approve ? "approved" : "rejected" } : r,
        ),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div>
      <SectionIntro
        title="Demandes d’adhésion — Employé"
        hint="Comptes absents de l’Active Directory (ou comptes machine exclus). Seuls les administrateurs FiEcho peuvent les traiter."
      />
      {error && (
        <p className="text-[13px] mb-3" style={{ color: "#dc2626" }}>{error}</p>
      )}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <AdminCard>
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                En attente ({pending.length})
              </h3>
            </div>
            {pending.length === 0 ? (
              <p className="text-[13px] text-center py-8" style={{ color: "var(--color-text-muted)" }}>
                Aucune demande en attente
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {pending.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
                      style={{ backgroundColor: `hsl(${hueOf(r.displayName)}, 42%, 42%)` }}
                    >
                      {initialsOf(r.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                        {r.displayName}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "var(--color-text-muted)" }}>
                        {r.username}{r.email ? ` · ${r.email}` : ""} · {timeAgo(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => review(r.id, false)}
                        className="h-8 px-3 rounded-lg text-[12px] font-semibold border disabled:opacity-50"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                      >
                        Refuser
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => review(r.id, true)}
                        className="h-8 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                        style={{ backgroundColor: "var(--color-primary-500)" }}
                      >
                        Accepter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
          {done.length > 0 && (
            <AdminCard>
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Traitées récemment
                </h3>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                {done.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                        {r.displayName}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{r.username}</p>
                    </div>
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                      style={{
                        backgroundColor: r.status === "approved" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: r.status === "approved" ? "#16a34a" : "#dc2626",
                      }}
                    >
                      {r.status === "approved" ? "Acceptée" : "Refusée"}
                    </span>
                  </div>
                ))}
              </div>
            </AdminCard>
          )}
        </div>
      )}
    </div>
  );
}

function SyncTab() {
  const { token } = useAuthStore();
  const { config } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);

  const loadHistory = useCallback(() => {
    invoke<SyncHistoryEntry[]>("cmd_admin_get_sync_history", { token })
      .then(setHistory)
      .catch(() => setHistory(MOCK_SYNC_HISTORY));
  }, [token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSync = async () => {
    setSyncing(true);
    setLastResult(null);
    setSyncError(null);
    try {
      const result = await invoke<SyncResult>("cmd_admin_sync_ad", { token, dryRun });
      setLastResult(result);
      if (!dryRun) loadHistory();
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  const last = history[0];
  const successCount = history.filter((h) => h.status === "success").length;

  return (
    <div className="space-y-5">
      <SectionIntro
        title="Active Directory"
        hint="Importe et met à jour les comptes depuis l’annuaire LDAP de l’entreprise."
      />

      <div className="admin-grid-sync">
        <AdminCard>
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--color-primary-500)" }}>
                <Icon name="globe" size={18} style={{ color: "#fff" }} />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Synchronisation LDAP</h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                  {config ? `${config.ldapHost}:${config.ldapPort} · ${config.ldapBaseDn}` : "Hôte LDAP non chargé"}
                </p>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span>
                <span className="block text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Mode simulation</span>
                <span className="block text-[12px]" style={{ color: "var(--color-text-muted)" }}>Calcule les écarts sans écrire en base</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={dryRun}
                onClick={() => setDryRun((v) => !v)}
                className="relative w-11 h-6 rounded-full shrink-0"
                style={{ backgroundColor: dryRun ? "var(--color-primary-500)" : "var(--color-border-strong)" }}
              >
                <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform"
                  style={{ transform: dryRun ? "translateX(22px)" : "translateX(2px)" }} />
              </button>
            </label>

            {dryRun && (
              <p className="text-[12px] px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#d97706" }}>
                Simulation : aucune modification ne sera appliquée.
              </p>
            )}
            {syncError && (
              <p className="text-[12px] px-3 py-2 rounded-xl" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
                {syncError}
              </p>
            )}

            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--color-primary-500)" }}
            >
              {syncing ? <><Spinner /> Synchronisation…</> : (
                <>
                  <Icon name="refresh" size={16} />
                  {dryRun ? "Simuler" : "Lancer la synchronisation"}
                </>
              )}
            </button>

            {lastResult && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Ajoutés", value: lastResult.added, color: "#16a34a" },
                  { label: "Mis à jour", value: lastResult.updated, color: "var(--color-primary-500)" },
                  { label: "Désactivés", value: lastResult.disabled, color: "#dc2626" },
                ].map((r) => (
                  <div key={r.label} className="rounded-xl p-3 text-center border" style={{ borderColor: "var(--color-border)" }}>
                    <div className="text-[22px] font-semibold tabular-nums" style={{ color: r.color }}>{r.value}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>{r.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminCard>

        <div className="space-y-3">
          <AdminCard>
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Dernière exécution</p>
              <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--color-text-primary)" }}>
                {last ? format(new Date(last.startedAt), "dd MMM yyyy · HH:mm", { locale: fr }) : "Aucune"}
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: last?.status === "success" ? "#16a34a" : "var(--color-text-muted)" }}>
                {last ? (last.status === "success" ? `Succès · ${syncDuration(last)}` : "Échec") : "—"}
              </p>
            </div>
          </AdminCard>
          <AdminCard>
            <div className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>Historique</p>
              <p className="text-[22px] font-semibold tabular-nums mt-1" style={{ color: "var(--color-text-primary)" }}>{history.length}</p>
              <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{successCount} succès</p>
            </div>
          </AdminCard>
        </div>
      </div>

      <AdminCard>
        <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Historique</h3>
          <button type="button" onClick={loadHistory} className="text-[12px] font-semibold flex items-center gap-1"
            style={{ color: "var(--color-primary-600)" }}>
            <Icon name="refresh" size={13} /> Rafraîchir
          </button>
        </div>
        <div className="p-3 space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-center py-6" style={{ color: "var(--color-text-muted)" }}>
              Aucune synchronisation enregistrée
            </p>
          )}
          {history.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: "var(--color-surface-secondary)" }}>
              <div className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.status === "success" ? "#22c55e" : "#ef4444" }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {format(new Date(s.startedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                </div>
                {s.status === "success" ? (
                  <div className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    {s.usersAdded > 0 && `+${s.usersAdded} ajoutés · `}
                    {s.usersUpdated} mis à jour
                    {s.usersDisabled > 0 && ` · ${s.usersDisabled} désactivés`}
                    {` · ${syncDuration(s)}`}
                  </div>
                ) : (
                  <div className="text-[12px]" style={{ color: "#dc2626" }}>
                    {s.errorMessage ?? "Erreur de connexion LDAP"}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style={s.status === "success"
                  ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#16a34a" }
                  : { backgroundColor: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
                {s.status === "success" ? "Succès" : "Échec"}
              </span>
            </div>
          ))}
        </div>
      </AdminCard>
    </div>
  );
}

function SettingsTab() {
  const { token } = useAuthStore();
  const { config, setConfig, dbConnected, setDbConnected } = useAppStore();
  const [dbUrl, setDbUrl] = useState(config?.dbUrl ?? "");
  const [ldapHost, setLdapHost] = useState(config?.ldapHost ?? "");
  const [ldapPort, setLdapPort] = useState(String(config?.ldapPort ?? 389));
  const [ldapBaseDn, setLdapBaseDn] = useState(config?.ldapBaseDn ?? "");
  const [ldapUserAttribute, setLdapUserAttribute] = useState(config?.ldapUserAttribute ?? "sAMAccountName");
  const [ldapUseTls, setLdapUseTls] = useState(config?.ldapUseTls ?? false);
  const [ldapBindDn, setLdapBindDn] = useState(config?.ldapBindDn ?? "");
  const [ldapBindPassword, setLdapBindPassword] = useState("");
  const [runtimeLogDir, setRuntimeLogDir] = useState(config?.runtimeLogDir ?? "");
  const [busy, setBusy] = useState<"idle" | "test" | "save">("idle");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    authService.loadConfig().then((cfg) => {
      const mapped = toStoreConfig(cfg);
      setConfig(mapped);
      setDbUrl(mapped.dbUrl);
      setLdapHost(mapped.ldapHost);
      setLdapPort(String(mapped.ldapPort));
      setLdapBaseDn(mapped.ldapBaseDn);
      setLdapUserAttribute(mapped.ldapUserAttribute);
      setLdapUseTls(mapped.ldapUseTls);
      setLdapBindDn(mapped.ldapBindDn);
      setRuntimeLogDir(mapped.runtimeLogDir);
    }).catch(() => {});
  }, [setConfig]);

  const field = "w-full h-10 px-3 rounded-xl text-[13px] border outline-none";
  const fieldStyle = {
    backgroundColor: "var(--color-input-bg)",
    borderColor: "var(--color-border)",
    color: "var(--color-text-primary)",
  };

  const testDb = async () => {
    setBusy("test");
    setMessage(null);
    try {
      await authService.testDbConnection(dbUrl);
      setMessage({ ok: true, text: "Connexion à la base réussie." });
    } catch (e: unknown) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("idle");
    }
  };

  const save = async () => {
    setBusy("save");
    setMessage(null);
    try {
      const cfg = await authService.adminSaveConfig(token ?? "", {
        dbUrl,
        ldapHost,
        ldapPort: parseInt(ldapPort, 10) || 389,
        ldapBaseDn,
        ldapUserAttribute,
        ldapUseTls,
        ldapBindDn,
        ldapBindPassword,
        runtimeLogDir,
      });
      setConfig(toStoreConfig(cfg));
      setDbConnected(true);
      setLdapBindPassword("");
      setMessage({ ok: true, text: "Réglages enregistrés. Les journaux quotidiens sont écrits sur le serveur de base." });
    } catch (e: unknown) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="space-y-5">
      <SectionIntro
        title="Réglages de la plateforme"
        hint="Ces valeurs sont intégrées à l’application. Modifiez-les ici pour les appliquer sans assistant d’installation."
      />

      <AdminCard>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Serveur de données</h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            {dbEngineLabel(dbUrl)} · {dbConnected ? "connecté" : "hors ligne"}
          </p>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>URL de connexion</span>
            <input value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} className={field} style={fieldStyle} spellCheck={false} />
          </label>
          <button type="button" onClick={testDb} disabled={busy !== "idle"}
            className="h-10 px-3 rounded-xl text-[12px] font-semibold border"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            {busy === "test" ? "Test…" : "Tester la connexion"}
          </button>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Active Directory</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block">
              <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Serveur LDAP</span>
              <input value={ldapHost} onChange={(e) => setLdapHost(e.target.value)} className={field} style={fieldStyle} spellCheck={false} />
            </label>
            <label className="block">
              <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Port</span>
              <input type="number" value={ldapPort} onChange={(e) => setLdapPort(e.target.value)} className={field} style={fieldStyle} />
            </label>
          </div>
          <label className="block">
            <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Base DN</span>
            <input value={ldapBaseDn} onChange={(e) => setLdapBaseDn(e.target.value)} className={field} style={fieldStyle} spellCheck={false} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Attribut d’identifiant</span>
            <input value={ldapUserAttribute} onChange={(e) => setLdapUserAttribute(e.target.value)} className={field} style={fieldStyle} spellCheck={false} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Compte de service (DN)</span>
            <input value={ldapBindDn} onChange={(e) => setLdapBindDn(e.target.value)} className={field} style={fieldStyle} spellCheck={false} />
          </label>
          <label className="block">
            <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Mot de passe du compte de service</span>
            <input type="password" value={ldapBindPassword} onChange={(e) => setLdapBindPassword(e.target.value)} className={field} style={fieldStyle} placeholder="Laisser vide pour ne pas changer" autoComplete="new-password" />
          </label>
          <button
            type="button"
            onClick={() => {
              const next = !ldapUseTls;
              setLdapUseTls(next);
              if (next && ldapPort === "389") setLdapPort("636");
              if (!next && ldapPort === "636") setLdapPort("389");
            }}
            className="flex items-center gap-2 text-[13px]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span className="w-11 h-6 rounded-full relative shrink-0" style={{ backgroundColor: ldapUseTls ? "var(--color-primary-500)" : "var(--color-border-strong)" }}>
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm" style={{ transform: ldapUseTls ? "translateX(22px)" : "translateX(2px)" }} />
            </span>
            TLS / LDAPS
          </button>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Journal runtime quotidien</h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Fichiers <strong>scellés</strong> (AES-256-GCM) sur le disque du service PostgreSQL. Un dump ou une copie du dossier n’est pas lisible. Le journal se déchiffre uniquement dans cette console, sur ce poste.
            Chemin local vu par PostgreSQL (ex. C:/Program Files/FiEcho/log), pas un UNC. Le dossier doit exister, avec droit d’écriture pour le compte du service.
          </p>
        </div>
        <div className="p-4">
          <label className="block">
            <span className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--color-text-secondary)" }}>Répertoire sur le serveur BD</span>
            <input value={runtimeLogDir} onChange={(e) => setRuntimeLogDir(e.target.value)} className={field} style={fieldStyle} spellCheck={false} placeholder="C:/Program Files/FiEcho/log" />
          </label>
        </div>
      </AdminCard>

      {message && (
        <p className="text-[13px] px-3 py-2 rounded-xl" style={{ backgroundColor: message.ok ? "rgba(22,163,74,0.1)" : "rgba(239,68,68,0.1)", color: message.ok ? "#16a34a" : "#dc2626" }}>
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy !== "idle"}
        className="h-11 px-5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-primary-500)" }}
      >
        {busy === "save" ? "Enregistrement…" : "Enregistrer les réglages"}
      </button>
    </div>
  );
}

function LogsTab() {
  const { token } = useAuthStore();
  const entries = useRuntimeLogStore((s) => s.entries);
  const live = useRuntimeLogStore((s) => s.live);
  const setLive = useRuntimeLogStore((s) => s.setLive);
  const replaceAll = useRuntimeLogStore((s) => s.replaceAll);
  const [filter, setFilter] = useState<"ALL" | "INFO" | "WARN" | "ERROR">("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [archives, setArchives] = useState<{ logDate: string; fileName: string; byteSize: number; serverPath: string | null; fileWritten: boolean; writeError: string | null; sealed?: boolean }[]>([]);
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (archiveDate) {
        const rows = await invoke<RuntimeLog[]>("cmd_admin_read_log_archive", {
          token,
          logDate: archiveDate,
        });
        replaceAll(rows);
      } else {
        const rows = await invoke<RuntimeLog[]>("cmd_admin_get_runtime_logs", { token });
        replaceAll(rows);
      }
    } catch {
      /* web preview */
    } finally {
      setLoading(false);
    }
  }, [token, replaceAll, archiveDate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!live || archiveDate) return;
    const id = window.setInterval(() => {
      invoke<RuntimeLog[]>("cmd_admin_get_runtime_logs", { token })
        .then(replaceAll)
        .catch(() => {});
    }, 1800);
    return () => window.clearInterval(id);
  }, [live, archiveDate, token, replaceAll]);

  useEffect(() => {
    invoke<typeof archives>("cmd_admin_list_log_archives", { token })
      .then(setArchives)
      .catch(() => setArchives([]));
  }, [token]);

  useEffect(() => {
    if (!live || !stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries, live]);

  const filtered = entries.filter((l) => {
    const level = (l.level || "").toUpperCase();
    if (filter !== "ALL" && level !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.message.toLowerCase().includes(q)
      || l.target.toLowerCase().includes(q)
      || (l.code || "").toLowerCase().includes(q)
      || level.toLowerCase().includes(q)
    );
  });

  const exportLogs = async () => {
    const body = entries.map(formatLogLine).join("\n") + (entries.length ? "\n" : "");
    if (!body.trim()) {
      setExportMsg("Rien à exporter");
      setTimeout(() => setExportMsg(null), 2500);
      return;
    }
    const stamp = format(new Date(), "yyyyMMdd-HHmmss");
    const filename = `fiecho-logs-${stamp}.txt`;
    setExporting(true);
    setExportMsg(null);
    try {
      if (isTauri()) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          defaultPath: filename,
          filters: [{ name: "Journal", extensions: ["txt", "log"] }],
        });
        if (path) {
          await invoke("cmd_admin_export_runtime_logs", { token, path, contents: body });
          setExportMsg(`Exporté : ${path}`);
        }
      } else {
        const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        setExportMsg("Fichier téléchargé");
      }
    } catch (e: unknown) {
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportMsg(e instanceof Error ? e.message : "Export local");
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 4000);
    }
  };

  const lineColor = (level: string) => {
    const l = level.toUpperCase();
    if (l === "ERROR") return "#ff7b72";
    if (l === "WARN") return "#e3b341";
    if (l === "DEBUG" || l === "TRACE") return "#8b949e";
    return "#e6edf3";
  };

  const errN = entries.filter((e) => (e.level || "").toUpperCase() === "ERROR").length;

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionIntro title="Journal runtime" hint="Style Metabase : date, niveau, module :: message. Aucune adresse IP. Stockage FJE2 scellé, déchiffré ici." />
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setArchiveDate(null);
              setLive(!live);
              if (!live) load();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border"
            style={{
              borderColor: "var(--color-border)",
              color: live ? "#16a34a" : "var(--color-text-muted)",
              backgroundColor: live ? "rgba(22,163,74,0.08)" : "transparent",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: live ? "#22c55e" : "#94a3b8" }} />
            {live ? "Live" : "Pause"}
          </button>
          <button type="button" onClick={load} className="px-3 py-1.5 rounded-xl text-[12px] font-semibold border flex items-center gap-1"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            <Icon name="refresh" size={13} /> Actualiser
          </button>
          <button
            type="button"
            onClick={exportLogs}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-primary-500)" }}
          >
            <Icon name="download" size={14} />
            {exporting ? "Export…" : "Exporter"}
          </button>
        </div>
      </div>

      {exportMsg && <p className="text-[12px] -mt-2" style={{ color: "var(--color-primary-600)" }}>{exportMsg}</p>}

      {archives.length > 0 && (
        <AdminCard>
          <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Fichiers journaliers (serveur BD)</h3>
          </div>
          <div className="p-3 space-y-1.5 max-h-40 overflow-y-auto">
            {archives.map((a) => (
              <button
                key={a.logDate}
                type="button"
                onClick={async () => {
                  try {
                    const rows = await invoke<RuntimeLog[]>("cmd_admin_read_log_archive", {
                      token,
                      logDate: a.logDate,
                    });
                    replaceAll(rows);
                    setLive(false);
                    setArchiveDate(a.logDate);
                  } catch {
                    setExportMsg("Impossible de déchiffrer cette archive");
                    setTimeout(() => setExportMsg(null), 3000);
                  }
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] w-full text-left"
                style={{
                  backgroundColor: archiveDate === a.logDate ? "var(--color-active)" : "var(--color-surface-secondary)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: a.fileWritten ? "#22c55e" : "#f59e0b" }} />
                <span className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{a.fileName}</span>
                <span className="text-[10px] font-semibold shrink-0" style={{ color: a.sealed ? "#16a34a" : "var(--color-text-muted)" }}>
                  {a.sealed ? "FJE2" : "clair"}
                </span>
                <span className="ml-auto tabular-nums shrink-0" style={{ color: "var(--color-text-muted)" }}>{Math.max(1, Math.round(a.byteSize / 1024))} Ko</span>
              </button>
            ))}
          </div>
        </AdminCard>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 rounded-xl px-3 h-10 border flex-1 min-w-40"
          style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)" }}>
          <Icon name="search" size={14} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer code J-, cible, message…"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text-primary)" }}
          />
        </div>
        {(["ALL", "INFO", "WARN", "ERROR"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="px-3 h-10 rounded-xl text-[12px] font-semibold border"
            style={{
              backgroundColor: filter === f ? "var(--color-primary-500)" : "transparent",
              borderColor: filter === f ? "var(--color-primary-500)" : "var(--color-border)",
              color: filter === f ? "#fff" : "var(--color-text-muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl font-mono text-[11px] overflow-auto flex-1 border min-w-0"
        style={{ backgroundColor: "#0d1117", borderColor: "var(--color-border)", minHeight: 320, maxHeight: "calc(100vh - 300px)" }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-32 gap-2" style={{ color: "#8b949e" }}>
            <Spinner /> Chargement du journal…
          </div>
        ) : (
          <div className="p-3 space-y-0.5">
            {filtered.map((l) => (
              <div key={l.id} className="leading-relaxed whitespace-pre-wrap break-all">
                <span style={{ color: "#8b949e" }}>{l.timestamp} </span>
                <span style={{ color: lineColor(l.level), fontWeight: 600 }}>{(l.level || "INFO").toUpperCase()} </span>
                <span style={{ color: "#58a6ff" }}>{l.target} :: </span>
                <span style={{ color: lineColor(l.level) }}>{l.message}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <span style={{ color: "#8b949e" }}>
                {entries.length === 0
                  ? "Aucun log capturé. Les lignes tracing apparaissent ici en direct."
                  : "Aucun log correspondant au filtre."}
              </span>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        {filtered.length} ligne{filtered.length > 1 ? "s" : ""}
        {entries.length > 0 && ` · ${entries.length} en mémoire`}
        {errN > 0 && ` · ${errN} erreur${errN > 1 ? "s" : ""}`}
      </p>
    </div>
  );
}

export function AdminPage() {
  const [section, setSection] = useState<AdminTab>("stats");
  const { user } = useAuthStore();

  return (
    <div className="admin-page flex flex-col h-full min-w-0" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
      <div
        className="flex items-center gap-3 px-5 shrink-0"
        style={{ height: 60, backgroundColor: "var(--color-header-bg)", borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--color-primary-500)" }}>
          <Icon name="shield" size={16} style={{ color: "#fff" }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-semibold tracking-tight leading-none" style={{ color: "var(--color-text-primary)" }}>
            Administration
          </h1>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--color-text-muted)" }}>
            {user?.displayName} · console {APP_NAME}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 admin-shell">
        <nav className="admin-nav">
          {NAV.map((item) => {
            const on = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className="admin-nav-btn"
                style={{
                  backgroundColor: on ? "var(--color-active)" : "transparent",
                  color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                }}
              >
                <Icon name={item.icon} size={16} style={{ color: on ? "var(--color-primary-600)" : "var(--color-text-muted)" }} />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{item.label}</span>
                  <span className="admin-nav-hint">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className={`admin-body ${section === "logs" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
          <div className={`admin-pad ${section === "logs" ? "flex-1 min-h-0 flex flex-col" : ""}`}>
            {section === "stats" && <StatsTab />}
            {section === "users" && <UsersTab />}
            {section === "joins" && <JoinRequestsTab />}
            {section === "sync" && <SyncTab />}
            {section === "settings" && <SettingsTab />}
            {section === "logs" && <LogsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
