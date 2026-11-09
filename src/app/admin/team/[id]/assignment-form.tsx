"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { FormSubmitButton } from "@/components/form-submit-button";
import { listAssignableLocalities } from "../actions";

type Locality = {
  locality_id: string;
  city: string;
  name: string;
  library_count: number;
  unverified_count: number;
  assignee_count: number;
};

type AssignmentFormProps = {
  userId: string;
  cities: string[];
  existingAssignmentLocalityIds: string[];
  action: (formData: FormData) => void;
};

/** Pick a city, then tick any number of localities and assign them in one go. */
export function AssignmentForm({ userId, cities, existingAssignmentLocalityIds, action }: AssignmentFormProps) {
  const [city, setCity] = useState(cities[0] ?? "");
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();
  const existing = useMemo(() => new Set(existingAssignmentLocalityIds), [existingAssignmentLocalityIds]);

  useEffect(() => {
    if (!city) return;
    let active = true;
    startLoading(async () => {
      const result = await listAssignableLocalities(city);
      if (!active) return;
      setLocalities(result.localities);
      setError(result.ok ? null : result.error);
      setSelected(new Set());
    });
    return () => {
      active = false;
    };
  }, [city]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return localities.filter(
      (locality) =>
        !existing.has(locality.locality_id) &&
        (!onlyUnassigned || Number(locality.assignee_count) === 0) &&
        (!query || locality.name.toLowerCase().includes(query)),
    );
  }, [localities, existing, onlyUnassigned, filter]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedLibraries = localities
    .filter((locality) => selected.has(locality.locality_id))
    .reduce((sum, locality) => sum + Number(locality.library_count), 0);

  return (
    <form action={action} className="mb-6 space-y-3">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="return_to" value={`/admin/team/${userId}`} />
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="locality_id" value={id} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="min-w-[180px] rounded-md border border-border bg-white px-3 py-2 text-sm"
          aria-label="City"
        >
          {cities.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter localities"
          aria-label="Filter localities"
          className="min-w-[180px] flex-1 rounded-md border border-border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={onlyUnassigned} onChange={(event) => setOnlyUnassigned(event.target.checked)} />
          Only unassigned
        </label>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading localities…</p>
        ) : error ? (
          <p className="p-4 text-sm text-rose-600">{error}</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No localities to show.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={visible.length > 0 && visible.every((locality) => selected.has(locality.locality_id))}
                    onChange={(event) =>
                      setSelected(event.target.checked ? new Set(visible.map((locality) => locality.locality_id)) : new Set())
                    }
                  />
                </th>
                <th className="px-3 py-2 text-left">Locality</th>
                <th className="px-3 py-2 text-right">Libraries</th>
                <th className="px-3 py-2 text-right">Unverified</th>
                <th className="px-3 py-2 text-right">Assignees</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((locality) => (
                <tr key={locality.locality_id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${locality.name}`}
                      checked={selected.has(locality.locality_id)}
                      onChange={() => toggle(locality.locality_id)}
                    />
                  </td>
                  <td className="px-3 py-2 text-black">{locality.name}</td>
                  <td className="px-3 py-2 text-right">{locality.library_count}</td>
                  <td className="px-3 py-2 text-right">{locality.unverified_count}</td>
                  <td className="px-3 py-2 text-right">{locality.assignee_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {selected.size
            ? `${selected.size} localities selected · ${selectedLibraries} libraries`
            : "Tick localities to assign. Several people can share a locality."}
        </p>
        <FormSubmitButton
          className="bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          pendingLabel="Assigning..."
        >
          Assign {selected.size || ""}
        </FormSubmitButton>
      </div>
    </form>
  );
}
