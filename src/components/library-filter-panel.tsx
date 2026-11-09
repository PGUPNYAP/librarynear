"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Loader2, SlidersHorizontal, X } from "lucide-react";

export type FilterPanelState = {
  q?: string;
  locality?: string;
  amenities: string[];
  price?: string;
  open24: boolean;
  verified: boolean;
  rating?: string;
  sort?: string;
};

type Option = { value: string; label: string };

type Props = {
  state: FilterPanelState;
  amenityOptions: string[];
  priceOptions: Option[];
  ratingOptions: Option[];
  sortOptions: Option[];
  localities: Array<{ name: string; count: number }>;
  totalCount: number;
};

function toQuery(state: FilterPanelState) {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.locality) params.set("locality", state.locality);
  if (state.amenities.length) params.set("amenities", state.amenities.join(","));
  if (state.price) params.set("price", state.price);
  if (state.open24) params.set("open24", "1");
  if (state.verified) params.set("verified", "1");
  if (state.rating) params.set("rating", state.rating);
  if (state.sort) params.set("sort", state.sort);
  return params.toString();
}

function countActive(state: FilterPanelState) {
  return (
    state.amenities.length +
    (state.locality ? 1 : 0) +
    (state.price ? 1 : 0) +
    (state.open24 ? 1 : 0) +
    (state.verified ? 1 : 0) +
    (state.rating ? 1 : 0)
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active ? "border-black bg-black text-white" : "border-border text-black hover:border-black"
      }`}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

function FilterBody({
  draft,
  setDraft,
  amenityOptions,
  priceOptions,
  ratingOptions,
  localities,
}: {
  draft: FilterPanelState;
  setDraft: (next: FilterPanelState) => void;
  amenityOptions: string[];
  priceOptions: Option[];
  ratingOptions: Option[];
  localities: Array<{ name: string; count: number }>;
}) {
  const [localityFilter, setLocalityFilter] = useState("");
  const visibleLocalities = useMemo(() => {
    const query = localityFilter.trim().toLowerCase();
    const list = query ? localities.filter((item) => item.name.toLowerCase().includes(query)) : localities;
    return list.slice(0, 40);
  }, [localities, localityFilter]);

  const toggleAmenity = (label: string) =>
    setDraft({
      ...draft,
      amenities: draft.amenities.includes(label)
        ? draft.amenities.filter((item) => item !== label)
        : [...draft.amenities, label],
    });

  return (
    <div className="space-y-7">
      <section>
        <h3 className="mb-3 text-sm font-bold text-black">Amenities</h3>
        <div className="flex flex-wrap gap-2">
          {amenityOptions.map((label) => (
            <Chip key={label} active={draft.amenities.includes(label)} onClick={() => toggleAmenity(label)}>
              {label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-black">Monthly fee</h3>
        <div className="flex flex-wrap gap-2">
          {priceOptions.map((option) => (
            <Chip
              key={option.value}
              active={draft.price === option.value}
              onClick={() => setDraft({ ...draft, price: draft.price === option.value ? undefined : option.value })}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-black">Hours, trust and rating</h3>
        <div className="flex flex-wrap gap-2">
          <Chip active={draft.open24} onClick={() => setDraft({ ...draft, open24: !draft.open24 })}>
            Open 24 hours
          </Chip>
          <Chip active={draft.verified} onClick={() => setDraft({ ...draft, verified: !draft.verified })}>
            Verified only
          </Chip>
          {ratingOptions.map((option) => (
            <Chip
              key={option.value}
              active={draft.rating === option.value}
              onClick={() => setDraft({ ...draft, rating: draft.rating === option.value ? undefined : option.value })}
            >
              ★ {option.label}
            </Chip>
          ))}
        </div>
      </section>

      {localities.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-bold text-black">Locality</h3>
          <input
            value={localityFilter}
            onChange={(event) => setLocalityFilter(event.target.value)}
            placeholder="Search localities"
            aria-label="Search localities"
            className="mb-2 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-black"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setDraft({ ...draft, locality: undefined })}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                !draft.locality ? "bg-muted font-semibold text-black" : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              All localities
            </button>
            {visibleLocalities.map((item) => (
              <button
                type="button"
                key={item.name}
                onClick={() => setDraft({ ...draft, locality: draft.locality === item.name ? undefined : item.name })}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  draft.locality === item.name ? "bg-muted font-semibold text-black" : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <span className="truncate">{item.name}</span>
                <span className="ml-2 shrink-0 text-xs">{item.count}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Filters for the libraries listing. Desktop: a sidebar that applies each
 * change immediately. Mobile: a bottom sheet with "Show N libraries".
 */
export function LibraryFilterPanel(props: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<FilterPanelState>(props.state);

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [sheetOpen]);

  const apply = (next: FilterPanelState) => {
    const query = toQuery(next);
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const applyNow = (next: FilterPanelState) => {
    setDraft(next);
    apply(next);
  };

  const cleared: FilterPanelState = { q: props.state.q, amenities: [], open24: false, verified: false, sort: props.state.sort };
  const active = countActive(props.state);

  return (
    <>
      {/* Mobile / tablet bar */}
      <div className="mb-5 flex items-center gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => {
            setDraft(props.state);
            setSheetOpen(true);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-black"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {active ? <span className="ml-1 rounded-full bg-black px-1.5 text-xs text-white">{active}</span> : null}
        </button>
        <select
          aria-label="Sort libraries"
          value={props.state.sort ?? ""}
          onChange={(event) => applyNow({ ...props.state, sort: event.target.value || undefined })}
          className="min-w-0 rounded-full border border-border bg-white px-3 py-2 text-sm"
        >
          {props.sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-black">{props.totalCount.toLocaleString("en-IN")}</span> libraries
          </p>
          {active ? (
            <button type="button" onClick={() => applyNow(cleared)} className="text-sm font-semibold text-primary hover:underline">
              Clear all
            </button>
          ) : null}
        </div>
        <label className="mb-6 block">
          <span className="mb-2 block text-sm font-bold text-black">Sort by</span>
          <select
            value={props.state.sort ?? ""}
            onChange={(event) => applyNow({ ...props.state, sort: event.target.value || undefined })}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm"
          >
            {props.sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className={isPending ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
          <FilterBody
            draft={props.state}
            setDraft={applyNow}
            amenityOptions={props.amenityOptions}
            priceOptions={props.priceOptions}
            ratingOptions={props.ratingOptions}
            localities={props.localities}
          />
        </div>
      </div>

      {/* Mobile sheet */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button type="button" aria-label="Close filters" className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl bg-white">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
              <p className="text-base font-bold text-black">Filters</p>
              <span className="w-8" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <FilterBody
                draft={draft}
                setDraft={setDraft}
                amenityOptions={props.amenityOptions}
                priceOptions={props.priceOptions}
                ratingOptions={props.ratingOptions}
                localities={props.localities}
              />
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <button type="button" onClick={() => setDraft(cleared)} className="text-sm font-semibold text-black underline">
                Clear all
              </button>
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  apply(draft);
                }}
                className="rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white"
              >
                Show libraries
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
