import React from "react";
import { Breadcrumbs } from "./feedback.jsx";
import { ShortcutHelpOverlay } from "./shortcutHelp.jsx";
import { ToastStack } from "./toast.jsx";
import { TransitionBanner } from "./TransitionBanner.jsx";
import { TrustIndicators } from "./TrustIndicators.jsx";

function ShellNavButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      className={`nav-btn ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function ShellFrame({
  authUser,
  onLogout,
  signedInUserName,
  currentUserId,
  currentRole,
  users,
  onCurrentUserChange,
  userLoadErr,
  dataErr,
  dataChipLabel,
  dataChipClass,
  roleThemeClass,
  roleAccentLabel,
  navItems = [],
  trustIndicators,
  trustLoading = false,
  trustSourceLabel,
  crumbs,
  transitionState,
  showShortcutHelp,
  onCloseShortcutHelp,
  toasts,
  dismissToast,
  children
}) {
  return (
    <>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ShortcutHelpOverlay open={showShortcutHelp} onClose={onCloseShortcutHelp} />
      <header className={`app-header ${roleThemeClass}`}>
        <div className="logo"><div className="logo-icon" />InspectFlow</div>
        <div className="header-sep" />
        <div className="header-brand-copy">
          <div className="header-sub">Manufacturing Inspection System</div>
          <div className="role-accent">{roleAccentLabel}</div>
        </div>
        <div className="header-right">
          <div className="user-ctrl">
            {authUser?.id ? (
              <div className="user-ctrl-identity">{signedInUserName}</div>
            ) : (
              <>
                <div className="user-ctrl-label">Current User</div>
                <div className="user-ctrl-row">
                  <select value={currentUserId} onChange={(event) => onCurrentUserChange?.(event.target.value)}>
                    <option value="">Select user…</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} — {user.role}</option>
                    ))}
                  </select>
                  <span className={`role-chip role-${(currentRole || "").toLowerCase()}`}>{currentRole || "Unknown"}</span>
                </div>
              </>
            )}
            {authUser?.id ? <div className="user-ctrl-hint">Authenticated session user is fixed for protected actions.</div> : null}
            {authUser?.seatWarning ? (
              <div className="user-ctrl-hint" style={{ color: authUser.seatWarning.status === "over_capacity" ? "#8a2d1f" : "#8a5d00" }}>
                Seat visibility notice: {authUser.seatWarning.activeSessionCount}/{authUser.seatWarning.seatPack} active sessions. {authUser.seatWarning.message}
              </div>
            ) : null}
            {userLoadErr ? <div className="user-ctrl-hint">{userLoadErr}</div> : null}
            {dataErr ? <div className="user-ctrl-hint">{dataErr}</div> : null}
          </div>
          <span className={`data-chip ${dataChipClass}`}>{dataChipLabel}</span>
          {onLogout ? <button type="button" className="nav-btn" onClick={onLogout}>Sign Out</button> : null}
          <nav className="nav" aria-label="Primary navigation">
            {navItems.filter((item) => item.visible !== false).map((item) => (
              <ShellNavButton
                key={item.key}
                active={Boolean(item.active)}
                label={item.label}
                onClick={item.onClick}
              />
            ))}
          </nav>
        </div>
      </header>
      <TrustIndicators items={trustIndicators} loading={trustLoading} sourceLabel={trustSourceLabel} />
      <main className="page">
        <Breadcrumbs items={crumbs} />
        <TransitionBanner state={transitionState} />
        {children}
      </main>
    </>
  );
}
