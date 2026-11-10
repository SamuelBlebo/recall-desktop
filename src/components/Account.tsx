import { useState } from "react";
import { cloudConfigured } from "../lib/cloud/config";
import { syncLabel, useSync } from "../lib/cloud/status";
import { isDesktop } from "../lib/persist";
import { toast } from "../lib/toast";

const auth = () => import("../lib/cloud/auth");

/** Email/password sign-in (plus Google on the web). Signing in turns on sync. */
export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = (f: (a: Awaited<ReturnType<typeof auth>>) => Promise<unknown>) => async () => {
    setBusy(true);
    setErr("");
    const a = await auth();
    try {
      await f(a);
    } catch (e) {
      setErr(a.authError(e));
    } finally {
      setBusy(false);
    }
  };
  const ok = /\S+@\S+/.test(email) && password.length >= 6;

  return (
    <form onSubmit={(e) => (e.preventDefault(), ok && run((a) => a.signInEmail(email.trim(), password))())}>
      <label className="f">Email</label>
      <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="f">Password</label>
      <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {err && <p className="psub small" style={{ color: "var(--again)" }}>{err}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn pri" type="submit" disabled={busy || !ok}>Sign in</button>
        <button className="btn" type="button" disabled={busy || !ok} onClick={run((a) => a.signUpEmail(email.trim(), password))}>Create account</button>
        {!isDesktop() && <button className="btn ghost" type="button" disabled={busy} onClick={run((a) => a.signInGoogle())}>Continue with Google</button>}
      </div>
      <button className="btn sm ghost" type="button" style={{ marginTop: 10 }} disabled={busy || !/\S+@\S+/.test(email)}
        onClick={run(async (a) => (await a.resetPassword(email.trim()), toast("Password reset email sent")))}>
        Forgot password?
      </button>
    </form>
  );
}

/** Settings card: who you're signed in as and whether sync is working. */
export function SyncCard() {
  const s = useSync();
  if (!cloudConfigured()) return null;
  return (
    <div className="card pad mt">
      <p className="ptitle" style={{ fontSize: 15 }}>Cloud sync</p>
      {s.state === "signedOut" || s.state === "off" ? (
        <>
          <p className="psub small">Sign in to keep your cards in sync between this {isDesktop() ? "PC" : "browser"}, the desktop app and the web version. Each person gets their own account. Cards already on this {isDesktop() ? "PC" : "browser"} go into the first account that signs in here.</p>
          <SignInForm />
        </>
      ) : (
        <>
          <p className="psub small">Signed in as <b>{s.email}</b> · {syncLabel(s)}</p>
          <p className="psub small">Signing out saves your changes to your account and removes your cards from this {isDesktop() ? "PC" : "browser"}, so someone else can sign in here. They come back when you sign in again.</p>
          {s.error && <p className="psub small" style={{ color: "var(--again)" }}>{s.error}</p>}
          <div className="row" style={{ marginTop: 8 }}>
            <SignOutButton />
          </div>
        </>
      )}
    </div>
  );
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    setBusy(true);
    try {
      await (await auth()).signOut(); // reloads the app once this device is cleared
    } catch (e) {
      toast(String((e as Error)?.message || e), 6000);
      setBusy(false);
    }
  };
  return <button className="btn" disabled={busy} onClick={leave}>{busy ? "Saving and signing out…" : "Sign out"}</button>;
}

/** Full-screen sign-in shown on the web version until you sign in (or choose to stay local). */
export function WebSignIn({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="loading" style={{ padding: 16 }}>
      <div className="card pad" style={{ width: "min(420px, 100%)" }}>
        <p className="ptitle">Sign in to Recall</p>
        <p className="psub small">Your decks and reviews are private to your account and sync to any device you sign in on. New here? Enter your email and a password (6+ characters) and press <b>Create account</b>, or continue with Google.</p>
        <SignInForm />
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={onSkip}>Use without an account (this browser only)</button>
      </div>
    </div>
  );
}
