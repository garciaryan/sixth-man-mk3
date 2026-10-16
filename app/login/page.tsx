const ERRORS: Record<string, string> = {
  declined: "Yahoo sign-in was cancelled.",
  state: "That sign-in link expired. Please try again.",
  exchange: "Yahoo didn't accept the sign-in. Please try again.",
  userinfo: "Yahoo didn't say who you are. Please try again.",
  leagues: "Couldn't read your Yahoo leagues. Please try again in a minute.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next ? `?next=${encodeURIComponent(sp.next)}` : "";
  return (
    <main className="page" style={{ maxWidth: 420, paddingTop: 64 }}>
      <div className="card">
        <h1>Sixth Man</h1>
        <p className="muted">Compare players with your league&apos;s scoring. For members of the league only.</p>
        {sp.error && <p className="banner" role="alert">{ERRORS[sp.error] ?? "Sign-in failed. Please try again."}</p>}
        {sp.signedOut && <p className="muted">You&apos;re signed out.</p>}
        <a className="button" href={`/api/auth/start${next}`}>Sign in with Yahoo</a>
      </div>
    </main>
  );
}
