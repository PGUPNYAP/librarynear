"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Pause, Play, RotateCcw } from "lucide-react";

type City = { name: string; slug: string };
type Row = { city: string; locality: string; minutes: number; sessions: number };
type Board = { available: boolean; rows: Row[] };

const PRESETS = [25, 50, 90];
const STORE = "study-room:v1";
const MIN_TO_COUNT = 5;

type Saved = { city: string; locality: string; days: Record<string, number> };

function readSaved(): Saved {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE) ?? "null") as Saved | null;
    if (parsed?.days) return parsed;
  } catch {
    // Private browsing or corrupt data: start fresh.
  }
  return { city: "delhi", locality: "", days: {} };
}

function writeSaved(saved: Saved) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(saved));
  } catch {
    // The timer still works without storage.
  }
}

const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function streakOf(days: Record<string, number>) {
  let streak = 0;
  const cursor = new Date();
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (days[dayKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const hoursLabel = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);

export function StudyRoomClient({ cities, initialBoard }: { cities: City[]; initialBoard: Board }) {
  const [duration, setDuration] = useState(50);
  const [custom, setCustom] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [remaining, setRemaining] = useState(50 * 60);
  const [saved, setSaved] = useState<Saved>({ city: "delhi", locality: "", days: {} });
  const [localities, setLocalities] = useState<string[]>([]);
  const [board, setBoard] = useState(initialBoard);
  const [message, setMessage] = useState<string | null>(null);

  const endsAt = useRef<number | null>(null);
  const token = useRef<string | null>(null);
  const studied = useRef(0);
  const lastTick = useRef<number | null>(null);
  const finishing = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readSaved());
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/localities?city=${saved.city}`)
      .then((response) => (response.ok ? response.json() : { localities: [] }))
      .then((json: { localities: string[] }) => active && setLocalities(json.localities))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [saved.city]);

  const update = (patch: Partial<Saved>) =>
    setSaved((current) => {
      const next = { ...current, ...patch };
      writeSaved(next);
      return next;
    });

  const refreshBoard = useCallback(() => {
    fetch("/api/study-room")
      .then((response) => (response.ok ? response.json() : null))
      .then((json: Board | null) => json && setBoard(json))
      .catch(() => undefined);
  }, []);

  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    const minutes = Math.floor(studied.current / 60);
    setPhase("done");
    endsAt.current = null;
    lastTick.current = null;
    studied.current = 0;

    if (minutes > 0) {
      setSaved((current) => {
        const today = dayKey();
        const next = { ...current, days: { ...current.days, [today]: (current.days[today] ?? 0) + minutes } };
        writeSaved(next);
        return next;
      });
    }

    if (minutes < MIN_TO_COUNT) {
      setMessage(`Logged ${minutes} min on this device. Sessions of ${MIN_TO_COUNT} minutes or more count for your area.`);
    } else if (!saved.locality || !localities.some((name) => name.toLowerCase() === saved.locality.toLowerCase())) {
      setMessage(`${minutes} minutes logged on this device. Pick your area to add them to the leaderboard next time.`);
    } else {
      const response = await fetch("/api/study-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finish", token: token.current, minutes, city: saved.city, locality: saved.locality }),
      }).catch(() => null);
      const json = (await response?.json().catch(() => null)) as { ok?: boolean; credited?: number } | null;
      setMessage(json?.ok ? `${json.credited} minutes added to ${saved.locality}.` : `${minutes} minutes logged on this device.`);
      if (json?.ok) refreshBoard();
    }
    token.current = null;
    finishing.current = false;
  }, [localities, refreshBoard, saved.city, saved.locality]);

  // Based on the clock, so the time stays right when a phone locks or the tab sleeps.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const now = Date.now();
      if (lastTick.current) studied.current += Math.min((now - lastTick.current) / 1000, Math.max(0, ((endsAt.current ?? now) - lastTick.current) / 1000));
      lastTick.current = now;
      const left = Math.max(0, Math.ceil(((endsAt.current ?? now) - now) / 1000));
      setRemaining(left);
      if (left <= 0) void finish();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [finish, phase]);

  useEffect(() => {
    if (phase !== "running" && phase !== "paused") return;
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, "0");
    const previous = document.title;
    document.title = `${minutes}:${seconds} · Study room`;
    return () => {
      document.title = previous;
    };
  }, [phase, remaining]);

  const start = () => {
    setMessage(null);
    if (phase === "paused") {
      endsAt.current = Date.now() + remaining * 1000;
      lastTick.current = Date.now();
      setPhase("running");
      return;
    }
    const seconds = duration * 60;
    setRemaining(seconds);
    endsAt.current = Date.now() + seconds * 1000;
    lastTick.current = Date.now();
    studied.current = 0;
    setPhase("running");
    fetch("/api/study-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) })
      .then((response) => response.json())
      .then((json: { token?: string }) => {
        token.current = json.token ?? null;
      })
      .catch(() => undefined);
  };

  const pause = () => {
    endsAt.current = null;
    lastTick.current = null;
    setPhase("paused");
  };

  const reset = () => {
    setPhase("idle");
    setRemaining(duration * 60);
    endsAt.current = null;
    lastTick.current = null;
    studied.current = 0;
    token.current = null;
    setMessage(null);
  };

  const choose = (minutes: number) => {
    setDuration(minutes);
    setRemaining(minutes * 60);
    if (phase === "done") setPhase("idle");
  };

  const active = phase === "running" || phase === "paused";
  const total = duration * 60;
  const progress = active ? 1 - remaining / total : phase === "done" ? 1 : 0;
  const today = saved.days[dayKey()] ?? 0;
  const week = useMemo(() => {
    let sum = 0;
    const cursor = new Date();
    for (let i = 0; i < 7; i += 1) {
      sum += saved.days[dayKey(cursor)] ?? 0;
      cursor.setDate(cursor.getDate() - 1);
    }
    return sum;
  }, [saved.days]);
  const streak = streakOf(saved.days);
  const radius = 112;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-border p-5 sm:p-8">
        <div className="relative mx-auto h-64 w-64">
          <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="120" cy="120" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle cx="120" cy="120" r={radius} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" className="text-primary transition-[stroke-dashoffset] duration-1000 ease-linear" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p role="timer" className="text-5xl font-bold tabular-nums text-black">
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{phase === "running" ? "Focus" : phase === "paused" ? "Paused" : phase === "done" ? "Done" : "Ready"}</p>
          </div>
        </div>

        {!active ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {PRESETS.map((minutes) => (
              <button key={minutes} type="button" aria-pressed={duration === minutes} onClick={() => { setCustom(""); choose(minutes); }} className={`min-h-11 rounded-full border px-4 text-sm font-medium ${duration === minutes && !custom ? "border-black bg-black text-white" : "border-border text-black"}`}>{minutes} min</button>
            ))}
            <input
              value={custom}
              inputMode="numeric"
              aria-label="Custom minutes"
              placeholder="Custom"
              onChange={(event) => {
                const text = event.target.value.replace(/\D/g, "").slice(0, 3);
                setCustom(text);
                const minutes = Math.min(Number(text), 180);
                if (minutes >= 1) choose(minutes);
              }}
              className="h-11 w-24 rounded-full border border-border px-3 text-center text-[16px] outline-none focus:border-primary md:text-sm"
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-center gap-3">
          {phase === "running" ? (
            <button type="button" onClick={pause} className="inline-flex h-12 items-center gap-2 rounded-xl bg-black px-8 text-sm font-semibold text-white"><Pause className="h-4 w-4" /> Pause</button>
          ) : (
            <button type="button" onClick={start} className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-8 text-sm font-semibold text-white"><Play className="h-4 w-4" /> {phase === "paused" ? "Resume" : phase === "done" ? "Study again" : "Start"}</button>
          )}
          {active ? (
            <>
              <button type="button" onClick={() => void finish()} className="h-12 rounded-xl border border-border px-5 text-sm font-semibold text-black">Finish</button>
              <button type="button" onClick={reset} aria-label="Discard this session" className="flex h-12 w-12 items-center justify-center rounded-xl border border-border text-muted-foreground"><RotateCcw className="h-4 w-4" /></button>
            </>
          ) : null}
        </div>
        {message ? <p role="status" className="mt-4 text-center text-sm text-black">{message}</p> : null}

        <dl className="mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-muted/50 py-3"><dt className="text-xs text-muted-foreground">Today</dt><dd className="font-bold text-black">{hoursLabel(today)}</dd></div>
          <div className="rounded-xl bg-muted/50 py-3"><dt className="text-xs text-muted-foreground">7 days</dt><dd className="font-bold text-black">{hoursLabel(week)}</dd></div>
          <div className="rounded-xl bg-muted/50 py-3"><dt className="text-xs text-muted-foreground">Streak</dt><dd className="flex items-center justify-center gap-1 font-bold text-black"><Flame className="h-4 w-4 text-orange-500" aria-hidden /> {streak}</dd></div>
        </dl>
      </section>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-border p-5">
          <h2 className="font-bold text-black">Study for your area</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your minutes join your area&apos;s weekly total. No account needed, and your name is never shown.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="min-w-0 space-y-1">
              <span className="text-xs text-muted-foreground">City</span>
              <select value={saved.city} disabled={active} onChange={(event) => update({ city: event.target.value, locality: "" })} className="h-11 w-full min-w-0 rounded-xl border border-border bg-white px-2 text-[16px] md:text-sm">
                {cities.map((city) => <option key={city.slug} value={city.slug}>{city.name}</option>)}
              </select>
            </label>
            <label className="min-w-0 space-y-1">
              <span className="text-xs text-muted-foreground">Area</span>
              <input list="study-localities" value={saved.locality} disabled={active} placeholder="Laxmi Nagar" autoComplete="off" onChange={(event) => update({ locality: event.target.value })} className="h-11 w-full min-w-0 rounded-xl border border-border bg-white px-3 text-[16px] md:text-sm" />
              <datalist id="study-localities">{localities.slice(0, 400).map((name) => <option key={name} value={name} />)}</datalist>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-border p-5">
          <h2 className="font-bold text-black">Top areas this week</h2>
          {board.rows.length ? (
            <ol className="mt-3 divide-y divide-border/60">
              {board.rows.map((row, index) => (
                <li key={`${row.city}-${row.locality}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-black"><span className="mr-2 inline-block w-5 text-muted-foreground tabular-nums">{index + 1}</span>{row.locality}<span className="text-muted-foreground">, {row.city}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums text-black">{hoursLabel(row.minutes)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No sessions yet this week. Finish one and put your area on the board.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
