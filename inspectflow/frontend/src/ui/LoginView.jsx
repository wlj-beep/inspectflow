import React from "react";

function AuthHint({ title, message, actionLabel, actionUrl, mode }) {
  if (!title && !message && !actionUrl) return null;
  return (
    <div className={`login-hint ${mode === "sso" ? "login-hint--sso" : "login-hint--local"}`}>
      {title ? <div className="login-hint__title">{title}</div> : null}
      {message ? <div className="login-hint__message">{message}</div> : null}
      {actionUrl ? (
        <div className="login-hint__action">
          <a href={actionUrl} className="btn btn-primary btn-sm">
            {actionLabel || "Continue with SSO"}
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function LoginView({
  authProfile,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onSubmit,
  busy,
  error
}) {
  const guidance = (() => {
    if (!authProfile) return null;
    const profile = Array.isArray(authProfile) ? authProfile[0] : authProfile;
    if (!profile || typeof profile !== "object") return null;
    const mode = String(profile.mode || profile.type || "").trim().toLowerCase() || "local";
    const title = profile.title || profile.label || (mode === "sso" ? "Enterprise sign-in available" : null);
    const message = profile.message || profile.summary || profile.description || profile.instructions || null;
    const action = profile.action && typeof profile.action === "object" ? profile.action : null;
    const actionLabel = profile.actionLabel || action?.label || null;
    const actionUrl = profile.actionUrl || action?.url || null;
    if (!title && !message && !actionUrl) return null;
    return { mode, title, message, actionLabel, actionUrl };
  })();

  return (
    <main className="login-shell">
      <section className="card login-card" aria-labelledby="login-title">
        <div className="card-head">
          <div className="card-title">InspectFlow Login</div>
        </div>
        <div className="card-body login-card__body">
          <div className="login-card__lead">
            <h1 id="login-title" className="login-card__title">Sign in to the inspection workflow.</h1>
            <p className="login-card__summary">
              Use your assigned username and password to open protected production workflows, then move into the customer proof center or operator surfaces.
            </p>
          </div>
          <AuthHint {...guidance} />
          <div className="login-callout">
            New to the system? The home screen includes a guided sample workspace tour so you can walk the setup, operator, and proof flows right after sign-in.
          </div>
          <form className="login-form" onSubmit={onSubmit}>
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                disabled={busy}
                placeholder="Enter your assigned username"
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                disabled={busy}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary login-form__submit"
              disabled={busy || !username.trim() || !password}
            >
              {busy ? "Signing in..." : "Sign In"}
            </button>
            {error ? <div className="err-text login-form__error">{error}</div> : null}
            <div className="login-form__footnote">
              Default local password can be set with `INSPECTFLOW_DEFAULT_PASSWORD` (fallback: `inspectflow`).
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
