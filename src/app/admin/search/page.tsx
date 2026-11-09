import { FormSubmitButton } from "@/components/form-submit-button";
import { requireApprovedStaff } from "@/lib/staff-access";
import { supabaseServer } from "@/lib/supabase-server";
import { getActiveCities } from "@/lib/cities-server";
import { addAlias, setAliasStatus } from "./actions";

type AliasRow = {
  id: string;
  alias_text: string;
  canonical_name: string;
  city: string | null;
  target_type: string | null;
  place_type: string;
  status: string;
  source: string | null;
  sessions: number | null;
  updated_at: string | null;
};

export default async function SearchLearningPage() {
  await requireApprovedStaff(["admin"]);

  const [aliasesResult, unmatchedResult, cities] = await Promise.all([
    supabaseServer
      .from("place_aliases")
      .select("id, alias_text, canonical_name, city, target_type, place_type, status, source, sessions, updated_at")
      .order("updated_at", { ascending: false })
      .limit(300),
    supabaseServer.rpc("top_unmatched_searches" as never, { p_days: 30, p_limit: 40 } as never),
    getActiveCities(),
  ]);

  const migrationMissing = Boolean(aliasesResult.error) || Boolean(unmatchedResult.error);
  const aliases = ((aliasesResult.data ?? []) as unknown as AliasRow[]).map((row) => ({ ...row, status: row.status ?? "approved" }));
  const pending = aliases.filter((row) => row.status === "pending");
  const active = aliases.filter((row) => row.status === "approved");
  const unmatched = (unmatchedResult.data ?? []) as Array<{ city: string | null; query: string; searches: number }>;

  return (
    <div className="space-y-8 p-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-black">Search learning</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every night the site looks at what people typed and which result they picked. When several different people type
          something that isn&apos;t the place&apos;s name (like “orn” for Old Rajinder Nagar), it becomes an alias. Five or more
          people: approved automatically. Two to four: waiting for you below.
        </p>
      </div>

      {migrationMissing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This page needs the search-learning migration (20261107000200_search_learning.sql).
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-black">Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review right now.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold text-black">“{row.alias_text}”</span> → {row.canonical_name}
                  <span className="text-muted-foreground"> · {row.target_type ?? row.place_type} · {row.city ?? "all cities"} · {row.sessions ?? 0} people</span>
                </span>
                <span className="flex gap-2">
                  {(["approved", "rejected"] as const).map((status) => (
                    <form key={status} action={setAliasStatus}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="status" value={status} />
                      <button
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${
                          status === "approved" ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                        }`}
                      >
                        {status === "approved" ? "Approve" : "Reject"}
                      </button>
                    </form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-black">Add an alias</h2>
          <form action={addAlias} className="grid gap-3 sm:grid-cols-2">
            <select name="city" defaultValue="delhi" className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="City">
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}
                </option>
              ))}
            </select>
            <select name="type" defaultValue="locality" className="rounded-md border border-border bg-white px-3 py-2 text-sm" aria-label="Type">
              <option value="locality">Locality</option>
              <option value="metro">Metro station</option>
            </select>
            <input name="alias" placeholder="What people type, e.g. orn" aria-label="Alias" className="rounded-md border border-border px-3 py-2 text-sm" required />
            <input name="target" placeholder="Exact place name, e.g. Old Rajinder Nagar" aria-label="Target place" className="rounded-md border border-border px-3 py-2 text-sm" required />
            <FormSubmitButton className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white sm:col-span-2" pendingLabel="Adding...">
              Add alias
            </FormSubmitButton>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-white p-6">
          <h2 className="mb-1 text-lg font-bold text-black">Searches that found nothing (30 days)</h2>
          <p className="mb-4 text-xs text-muted-foreground">Good candidates for a new alias, or a missing listing.</p>
          {unmatched.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {unmatched.map((row) => (
                <li key={`${row.city}-${row.query}`} className="flex justify-between gap-3 rounded-md px-2 py-1 hover:bg-muted/50">
                  <span className="truncate text-black">“{row.query}” <span className="text-muted-foreground">· {row.city ?? "?"}</span></span>
                  <span className="shrink-0 text-muted-foreground">{row.searches}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-black">Active aliases ({active.length})</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {active.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
              <span className="truncate">
                <span className="font-medium text-black">{row.alias_text}</span> → {row.canonical_name}
                <span className="text-muted-foreground"> · {row.source ?? "manual"}</span>
              </span>
              <form action={setAliasStatus}>
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="status" value="rejected" />
                <button className="text-xs text-rose-600 hover:underline">Remove</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
