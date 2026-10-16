import { getDb } from "@/lib/db.ts";
import { getLeague } from "@/lib/store.ts";

export const dynamic = "force-dynamic";

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const league = getLeague(getDb())?.name;
  return (
    <main className="page" style={{ maxWidth: 480, paddingTop: 64 }}>
      <div className="card">
        {reason === "setup" ? (
          <>
            <h1>Not set up yet</h1>
            <p className="muted">The league admin hasn&apos;t finished setting up Sixth Man. Check back soon.</p>
          </>
        ) : (
          <>
            <h1>Members only</h1>
            <p className="muted">
              This app is for managers in {league ? <strong>{league}</strong> : "one Yahoo Fantasy league"}. The Yahoo
              account you signed in with doesn&apos;t manage a team there.
            </p>
          </>
        )}
        <a className="button secondary" href="/login">Back to sign in</a>
      </div>
    </main>
  );
}
