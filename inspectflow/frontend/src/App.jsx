import { useEffect, useState } from "react";
import { api } from "./api/index.js";
import AppShell from "./AppShell.jsx";
import { LoginView } from "./ui/LoginView.jsx";

export default function App() {
  const [status, setStatus] = useState("loading");
  const [authUser, setAuthUser] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const sessionRes = await api.auth.session().catch(() => ({ valid: false }));
        if (!active) return;
        if (sessionRes?.valid && sessionRes.user) {
          setAuthUser({
            ...sessionRes.user,
            seatAssignment: sessionRes.seatAssignment || null,
            seatWarning: sessionRes.seatWarning || null
          });
          if (sessionRes?.authProfile) {
            setAuthProfile(sessionRes.authProfile);
          }
          setStatus("authenticated");
          return;
        }
        try {
          const profile = await api.auth.profile();
          if (active) setAuthProfile(profile);
        } catch {
          if (active) setAuthProfile(null);
        }
        setStatus("unauthenticated");
      } catch {
        if (!active) return;
        setStatus("unauthenticated");
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const trimmedUsername = username.trim();
      const response = await api.auth.login({
        username: trimmedUsername,
        password
      });
      setAuthUser({
        ...response.user,
        seatAssignment: response.seatAssignment || null,
        seatWarning: response.seatWarning || null
      });
      if (response?.authProfile) {
        setAuthProfile(response.authProfile);
      }
      setUsername("");
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
    setStatus("unauthenticated");
    setError("");
    setUsername("");
    setPassword("");
  }

  if (status === "loading") {
    return <main className="login-shell login-shell--loading">Loading...</main>;
  }

  if (status !== "authenticated" || !authUser) {
    return (
      <LoginView
        authProfile={authProfile}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={handleLogin}
        busy={busy}
        error={error}
      />
    );
  }

  return <AppShell authUser={authUser} onLogout={handleLogout} />;
}
