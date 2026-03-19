import { useEffect, useMemo, useState } from "react";
import { api } from "./api/index.js";
import InspectFlowDemo from "./legacy/InspectFlowDemo.jsx";

function LoginView({
  users,
  selectedUserId,
  onSelectUser,
  password,
  onPasswordChange,
  onSubmit,
  busy,
  error
}) {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(160deg, #f3f7fb 0%, #e2ebf5 55%, #d9e6f3 100%)",
      padding: "1rem"
    }}>
      <section style={{
        width: "min(460px, 100%)",
        border: "1px solid #b9c8d8",
        background: "#ffffff",
        borderRadius: "10px",
        boxShadow: "0 12px 35px rgba(18, 32, 48, 0.16)",
        padding: "1.2rem 1.1rem"
      }}>
        <h1 style={{ margin: 0, fontSize: "1.4rem", color: "#13263b" }}>InspectFlow Login</h1>
        <p style={{ marginTop: ".45rem", marginBottom: "1rem", color: "#3f5268", fontSize: ".92rem" }}>
          Authenticate with a local account to open protected production workflows.
        </p>
        <form
          onSubmit={onSubmit}
          style={{ display: "grid", gap: ".72rem" }}
        >
          <label style={{ display: "grid", gap: ".35rem", color: "#1f3248", fontWeight: 600, fontSize: ".88rem" }}>
            User
            <select
              value={selectedUserId}
              onChange={(event) => onSelectUser(event.target.value)}
              disabled={busy}
              style={{ minHeight: "2.2rem", border: "1px solid #9eb2c6", borderRadius: "7px", padding: ".2rem .5rem" }}
            >
              <option value="">Select user...</option>
              {users.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.name} - {user.role}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: ".35rem", color: "#1f3248", fontWeight: 600, fontSize: ".88rem" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              disabled={busy}
              placeholder="Enter password"
              style={{ minHeight: "2.2rem", border: "1px solid #9eb2c6", borderRadius: "7px", padding: ".2rem .5rem" }}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !selectedUserId || !password}
            style={{
              minHeight: "2.25rem",
              border: "none",
              borderRadius: "7px",
              background: busy ? "#8ea5ba" : "#20456d",
              color: "#fff",
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer"
            }}
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
          {error ? (
            <div style={{ color: "#a02020", fontSize: ".85rem", fontWeight: 600 }}>{error}</div>
          ) : null}
          <div style={{ color: "#52667c", fontSize: ".78rem" }}>
            Default local password can be set with `INSPECTFLOW_DEFAULT_PASSWORD` (fallback: `inspectflow`).
          </div>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [status, setStatus] = useState("loading");
  const [authUser, setAuthUser] = useState(null);
  const [seatUsage, setSeatUsage] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [sessionRes, usersRes] = await Promise.all([
          api.auth.session().catch(() => ({ valid: false })),
          api.auth.users().catch(() => [])
        ]);
        if (!active) return;
        setUsers(Array.isArray(usersRes) ? usersRes : []);
        if (sessionRes?.valid && sessionRes.user) {
          setAuthUser(sessionRes.user);
          setSeatUsage(sessionRes.seatUsage || null);
          setStatus("authenticated");
          return;
        }
        setSeatUsage(null);
        setStatus("unauthenticated");
      } catch {
        if (!active) return;
        setSeatUsage(null);
        setStatus("unauthenticated");
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const resolvedSelectedUser = useMemo(
    () => users.find((user) => String(user.id) === String(selectedUserId)),
    [users, selectedUserId]
  );

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await api.auth.login({
        userId: Number(selectedUserId),
        username: resolvedSelectedUser?.name || undefined,
        password
      });
      setAuthUser(response.user);
      setSeatUsage(response.seatUsage || null);
      setPassword("");
      setStatus("authenticated");
    } catch (err) {
      setError(err?.message || "login_failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await api.auth.logout().catch(() => {});
    setAuthUser(null);
    setSeatUsage(null);
    setStatus("unauthenticated");
    setError("");
    setPassword("");
  }

  if (status === "loading") {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Loading...</main>;
  }

  if (status !== "authenticated" || !authUser) {
    return (
      <LoginView
        users={users}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        busy={busy}
        error={error}
      />
    );
  }

  return <InspectFlowDemo authUser={authUser} seatUsage={seatUsage} onLogout={handleLogout} />;
}
