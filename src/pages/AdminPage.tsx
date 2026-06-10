import { useState, useRef, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { useAuthStore } from "@/store/authStore";

// ─── Tauri invoke helper ──────────────────────────────────────────────────────

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

// ─── Types ───────────────────────────────────────────────────────────────────

type AdminTab = "stats" | "users" | "sync" | "logs";

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
}

interface AdminStats {
  totalUsers: number;
  activeUsersToday: number;
  totalMessagesToday: number;
  totalGroups: number;
}

interface AuditLogEntry {
  id: number;
  actorUsername: string | null;
  action: string;
  details: string | null;
  createdAt: string;
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

// ─── Mock fallbacks (web preview) ────────────────────────────────────────────

const MOCK_USERS: AdminUser[] = [
  { id: 1, username: "admin", displayName: "Admin Système", email: "admin@acme.fr", department: "IT", role: "system_admin", isActive: true, presenceStatus: "online", lastSeen: null },
  { id: 2, username: "alice.martin", displayName: "Alice Martin", email: "a.martin@acme.fr", department: "Développement", role: "user", isActive: true, presenceStatus: "online", lastSeen: null },
  { id: 3, username: "bob.dupont", displayName: "Bob Dupont", email: "b.dupont@acme.fr", department: "Commercial", role: "user", isActive: true, presenceStatus: "away", lastSeen: null },
];

const MOCK_STATS: AdminStats = { totalUsers: 8, activeUsersToday: 5, totalMessagesToday: 142, totalGroups: 4 };

function genMockLogs(): AuditLogEntry[] {
  return [
    { id: 1, actorUsername: "alice.martin", action: "login", details: null, createdAt: new Date().toISOString() },
    { id: 2, actorUsername: "admin", action: "update_role", details: '{"new_role":"system_admin"}', createdAt: subDays(new Date(), 0).toISOString() },
    { id: 3, actorUsername: "bob.dupont", action: "login", details: null, createdAt: subDays(new Date(), 1).toISOString() },
  ];
}

const MOCK_SYNC_HISTORY: SyncHistoryEntry[] = [
  { id: 1, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), usersAdded: 0, usersUpdated: 3, usersDisabled: 0, status: "success", errorMessage: null },
  { id: 2, startedAt: subDays(new Date(), 1).toISOString(), completedAt: subDays(new Date(), 1).toISOString(), usersAdded: 1, usersUpdated: 2, usersDisabled: 0, status: "success", errorMessage: null },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function actionLabel(action: string): { level: string; msg: string } {
  const map: Record<string, { level: string; msg: string }> = {
    login:         { level: "INFO",  msg: "Connexion réussie" },
    logout:        { level: "INFO",  msg: "Déconnexion" },
    update_role:   { level: "INFO",  msg: "Rôle mis à jour" },
    enable_user:   { level: "INFO",  msg: "Compte activé" },
    disable_user:  { level: "WARN",  msg: "Compte désactivé" },
    sync_ad:       { level: "INFO",  msg: "Synchronisation AD" },
  };
  return map[action] ?? { level: "INFO", msg: action };
}

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
  return `${Math.round(ms / 1000)}s`;
}

function genDailyStats(msgCount: number, userCount: number) {
  return Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i);
    const factor = i === 13 ? 1 : Math.random();
    return {
      date: format(d, "dd/MM", { locale: fr }),
      messages: i === 13 ? msgCount : Math.max(1, Math.floor(msgCount * factor * 0.8)),
      actifs: i === 13 ? userCount : Math.max(1, Math.floor(userCount * factor)),
    };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string }) {
  return (
      <div className="rounded-xl p-4 flex items-start gap-3" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: color ?? "var(--color-primary-500)", opacity: 0.9 }}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>{value}</div>
          <div className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
          {sub && <div className="text-xs mt-0.5" style={{ color: "var(--color-primary-500)" }}>{sub}</div>}
        </div>
      </div>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const styles: Record<string, React.CSSProperties> = {
    INFO:  { backgroundColor: "rgba(34,197,94,0.12)",  color: "#16a34a" },
    WARN:  { backgroundColor: "rgba(245,158,11,0.12)", color: "#d97706" },
    ERROR: { backgroundColor: "rgba(239,68,68,0.12)",  color: "#dc2626" },
  };
  return (
      <span className="px-1.5 py-0.5 rounded text-xs font-bold font-mono" style={styles[level] ?? {}}>
      {level}
    </span>
  );
}

function Spinner() {
  return (
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
  );
}

// ─── Stats tab ────────────────────────────────────────────────────────────────

function StatsTab() {
  const { token } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<AdminStats>("cmd_admin_get_stats", { token })
        .then(setStats)
        .catch(() => setStats(MOCK_STATS))
        .finally(() => setLoading(false));
  }, [token]);

  const s = stats ?? MOCK_STATS;
  const daily = useRef(genDailyStats(s.totalMessagesToday, s.activeUsersToday)).current;

  if (loading) {
    return (
        <div className="flex items-center justify-center h-40 gap-2" style={{ color: "var(--color-text-muted)" }}>
          <Spinner /> Chargement…
        </div>
    );
  }

  return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
              label="Utilisateurs actifs"
              value={s.totalUsers}
          />
          <StatCard
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
              label="Messages aujourd'hui"
              value={s.totalMessagesToday}
              color="#7c3aed"
          />
          <StatCard
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              label="Groupes actifs"
              value={s.totalGroups}
              color="#ea580c"
          />
          <StatCard
              icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
              label="Actifs aujourd'hui"
              value={s.activeUsersToday}
              color="#0891b2"
          />
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
            Messages envoyés — 14 derniers jours
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--color-text-primary)" }} />
              <Area type="monotone" dataKey="messages" name="Messages" stroke="var(--color-primary-500)" fill="url(#msgGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--color-text-primary)" }}>
            Utilisateurs actifs par jour
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={daily} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "var(--color-text-primary)" }} />
              <Bar dataKey="actifs" name="Actifs" fill="var(--color-primary-500)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const { token, user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("Tous");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    invoke<AdminUser[]>("cmd_admin_list_users", { token })
        .then(setUsers)
        .catch(() => setUsers(MOCK_USERS))
        .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const departments = ["Tous", ...Array.from(new Set(users.map((u) => u.department).filter(Boolean) as string[]))];

  const filtered = users.filter((u) =>
      (dept === "Tous" || u.department === dept) &&
      (
          u.displayName.toLowerCase().includes(search.toLowerCase()) ||
          (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
          u.username.toLowerCase().includes(search.toLowerCase())
      )
  );

  const toggleRole = async (u: AdminUser) => {
    const newRole = u.role === "system_admin" ? "user" : "system_admin";
    setActionLoading(u.id);
    setError(null);
    try {
      await invoke("cmd_admin_update_role", { token, userId: u.id, newRole });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x));
    } catch (e: any) {
      setError(e?.message ?? String(e));
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
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setActionLoading(null);
    }
  };

  return (
      <div className="space-y-4">
        {error && (
            <div className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
              {error}
            </div>
        )}

        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-40 flex items-center gap-2 rounded-lg px-3 py-2 border"
               style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un utilisateur…"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--color-text-primary)" }}
            />
          </div>
          <select value={dept} onChange={(e) => setDept(e.target.value)}
                  className="px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)", color: "var(--color-text-primary)" }}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={load} className="px-3 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            ↺ Actualiser
          </button>
        </div>

        {loading ? (
            <div className="flex items-center justify-center h-32 gap-2" style={{ color: "var(--color-text-muted)" }}>
              <Spinner /> Chargement depuis l'AD…
            </div>
        ) : (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
              <table className="w-full text-sm">
                <thead>
                <tr style={{ backgroundColor: "var(--color-surface-secondary)" }}>
                  {["Utilisateur", "Département", "Rôle", "Statut", "Dernière activité", "Actions"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                          style={{ color: "var(--color-text-muted)" }}>{h}</th>
                  ))}
                </tr>
                </thead>
                <tbody>
                {filtered.map((u, i) => (
                    <tr key={u.id} style={{ borderTop: i > 0 ? "1px solid var(--color-border)" : "none" }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                 style={{ backgroundColor: `hsl(${u.displayName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360}, 55%, 45%)` }}>
                              {u.displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                                 style={{ backgroundColor: u.presenceStatus === "online" ? "#22c55e" : u.presenceStatus === "away" ? "#f59e0b" : "#94a3b8" }} />
                          </div>
                          <div>
                            <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>{u.displayName}</div>
                            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>{u.email ?? u.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text-muted)" }}>{u.department ?? "—"}</td>
                      <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={u.role === "system_admin"
                              ? { backgroundColor: "rgba(124,58,237,0.12)", color: "#7c3aed" }
                              : { backgroundColor: "var(--color-surface-secondary)", color: "var(--color-text-muted)" }}>
                      {u.role === "system_admin" ? "Admin" : "Utilisateur"}
                    </span>
                      </td>
                      <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={u.isActive
                              ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#16a34a" }
                              : { backgroundColor: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
                      {u.isActive ? "Actif" : "Inactif"}
                    </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {timeAgo(u.lastSeen)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                              onClick={() => toggleRole(u)}
                              disabled={u.id === currentUser?.id || actionLoading === u.id}
                              className="text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-30 flex items-center gap-1"
                              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)", backgroundColor: "transparent" }}
                              title={u.role === "system_admin" ? "Retirer admin" : "Promouvoir admin"}>
                            {actionLoading === u.id ? <Spinner /> : null}
                            {u.role === "system_admin" ? "Retirer admin" : "Admin"}
                          </button>
                          <button
                              onClick={() => toggleStatus(u)}
                              disabled={u.id === currentUser?.id || actionLoading === u.id}
                              className="text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-30"
                              style={{
                                borderColor: u.isActive ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)",
                                color: u.isActive ? "#dc2626" : "#16a34a",
                                backgroundColor: "transparent",
                              }}>
                            {u.isActive ? "Désactiver" : "Activer"}
                          </button>
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
        )}

        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {filtered.length} utilisateur{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
          {users.length > 0 && ` · ${users.length} en base`}
        </p>
      </div>
  );
}

// ─── Sync tab ─────────────────────────────────────────────────────────────────

function SyncTab() {
  const { token } = useAuthStore();
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
    } catch (e: any) {
      setSyncError(e?.message ?? String(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
      <div className="space-y-4 max-w-2xl">
        <div className="rounded-xl p-5" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
          <h3 className="font-semibold mb-1" style={{ color: "var(--color-text-primary)" }}>
            Synchronisation Active Directory
          </h3>
          <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
            Importe les comptes utilisateurs depuis l'AD LDAP et met à jour les profils existants.
          </p>

          <label className="flex items-center gap-2 cursor-pointer select-none text-sm mb-4" style={{ color: "var(--color-text-secondary)" }}>
            <div onClick={() => setDryRun((v) => !v)}
                 className="w-9 h-5 rounded-full relative transition-colors cursor-pointer"
                 style={{ backgroundColor: dryRun ? "var(--color-primary-500)" : "var(--color-border)" }}>
              <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm"
                   style={{ transform: dryRun ? "translateX(17px)" : "translateX(2px)" }} />
            </div>
            Mode simulation (dry run)
          </label>

          {dryRun && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(245,158,11,0.1)", color: "#d97706" }}>
                ⚠️ Mode simulation : aucune modification ne sera appliquée en base de données.
              </p>
          )}

          {syncError && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#dc2626" }}>
                ✗ {syncError}
              </p>
          )}

          <button onClick={handleSync} disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-60"
                  style={{ backgroundColor: "var(--color-primary-500)" }}>
            {syncing ? (
                <><Spinner /> Synchronisation en cours…</>
            ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {dryRun ? "Simuler la synchronisation" : "Lancer la synchronisation"}
                </>
            )}
          </button>

          {lastResult && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: "Ajoutés",    value: lastResult.added,    color: "#16a34a" },
                  { label: "Mis à jour", value: lastResult.updated,  color: "var(--color-primary-500)" },
                  { label: "Désactivés", value: lastResult.disabled, color: "#dc2626" },
                ].map((r) => (
                    <div key={r.label} className="rounded-lg p-3 text-center border" style={{ borderColor: "var(--color-border)" }}>
                      <div className="text-2xl font-bold" style={{ color: r.color }}>{r.value}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>{r.label}</div>
                    </div>
                ))}
              </div>
          )}
        </div>

        <div className="rounded-xl p-5" style={{ backgroundColor: "var(--color-surface-secondary)" }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Historique des synchronisations
            </h3>
            <button onClick={loadHistory} className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
              ↺ Rafraîchir
            </button>
          </div>
          <div className="space-y-2">
            {history.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: "var(--color-text-muted)" }}>
                  Aucune synchronisation enregistrée
                </p>
            )}
            {history.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border"
                     style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                  <div className="w-2 h-2 rounded-full shrink-0"
                       style={{ backgroundColor: s.status === "success" ? "#22c55e" : "#ef4444" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {format(new Date(s.startedAt), "dd/MM/yyyy HH:mm", { locale: fr })}
                    </div>
                    {s.status === "success" ? (
                        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                          {s.usersAdded > 0 && `+${s.usersAdded} ajoutés · `}
                          {s.usersUpdated} mis à jour
                          {s.usersDisabled > 0 && ` · ${s.usersDisabled} désactivés`}
                          {` · ${syncDuration(s)}`}
                        </div>
                    ) : (
                        <div className="text-xs" style={{ color: "#dc2626" }}>
                          {s.errorMessage ?? "Erreur de connexion LDAP"}
                        </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={s.status === "success"
                            ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#16a34a" }
                            : { backgroundColor: "rgba(239,68,68,0.12)", color: "#dc2626" }}>
                {s.status === "success" ? "Succès" : "Échec"}
              </span>
                </div>
            ))}
          </div>
        </div>
      </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

function LogsTab() {
  const { token } = useAuthStore();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "INFO" | "WARN" | "ERROR">("ALL");
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    invoke<AuditLogEntry[]>("cmd_admin_get_logs", { token })
        .then(setLogs)
        .catch(() => setLogs(genMockLogs()))
        .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const enriched = logs.map((l) => {
    const { level, msg } = actionLabel(l.action);
    return { ...l, level, msg };
  });

  const filtered = enriched.filter((l) =>
      (filter === "ALL" || l.level === filter) &&
      (
          l.msg.toLowerCase().includes(search.toLowerCase()) ||
          (l.actorUsername ?? "").toLowerCase().includes(search.toLowerCase()) ||
          l.action.toLowerCase().includes(search.toLowerCase())
      )
  );

  return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-lg px-3 py-2 border flex-1 min-w-40"
               style={{ backgroundColor: "var(--color-input-bg)", borderColor: "var(--color-border)" }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--color-text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder="Filtrer les logs…"
                   className="flex-1 bg-transparent text-sm outline-none"
                   style={{ color: "var(--color-text-primary)" }} />
          </div>
          <div className="flex gap-1">
            {(["ALL", "INFO", "WARN", "ERROR"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold border transition-colors"
                        style={{
                          backgroundColor: filter === f ? "var(--color-primary-500)" : "transparent",
                          borderColor: filter === f ? "var(--color-primary-500)" : "var(--color-border)",
                          color: filter === f ? "#fff" : "var(--color-text-muted)",
                        }}>
                  {f}
                </button>
            ))}
          </div>
          <button onClick={load} className="px-3 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
            ↺
          </button>
        </div>

        {loading ? (
            <div className="flex items-center justify-center h-32 gap-2" style={{ color: "var(--color-text-muted)" }}>
              <Spinner /> Chargement des logs…
            </div>
        ) : (
            <div className="rounded-xl font-mono text-xs overflow-auto" style={{ backgroundColor: "#0d1117", maxHeight: 400 }}>
              <div className="p-3 space-y-1">
                {filtered.map((l) => (
                    <div key={l.id} className="flex items-start gap-2 leading-relaxed">
                <span className="shrink-0 opacity-50" style={{ color: "#8b949e" }}>
                  {format(new Date(l.createdAt), "HH:mm:ss")}
                </span>
                      <LogLevelBadge level={l.level} />
                      <span className="shrink-0" style={{ color: "#58a6ff" }}>
                  [{l.actorUsername ?? "system"}]
                </span>
                      <span style={{ color: l.level === "ERROR" ? "#ff7b72" : l.level === "WARN" ? "#e3b341" : "#e6edf3" }}>
                  {l.msg}
                        {l.details && (
                            <span className="opacity-60 ml-1">{l.details}</span>
                        )}
                </span>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <span style={{ color: "#8b949e" }}>Aucun log correspondant.</span>
                )}
                <div ref={bottomRef} />
              </div>
            </div>
        )}

        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {filtered.length} entrée{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}
          {logs.length > 0 && ` · ${logs.length} total`}
        </p>
      </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("stats");

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "stats", label: "Statistiques",
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
    },
    {
      id: "users", label: "Utilisateurs",
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
    },
    {
      id: "sync", label: "Sync AD",
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
    },
    {
      id: "logs", label: "Logs",
      icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
    },
  ];

  return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b shrink-0" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-header-bg)" }}>
          <h1 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>Administration</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            Gestion des utilisateurs, synchronisation AD et journaux d'activité
          </p>
        </div>

        <div className="flex gap-1 px-6 py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          {tabs.map((tab) => (
              <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: activeTab === tab.id ? "var(--color-primary-500)" : "transparent",
                    color: activeTab === tab.id ? "#fff" : "var(--color-text-muted)",
                  }}
              >
                {tab.icon}
                {tab.label}
              </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "stats" && <StatsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "sync" && <SyncTab />}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>
  );
}
