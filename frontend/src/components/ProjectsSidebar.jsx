import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Compact dark project switcher for the sidebar header. */
export default function ProjectsSidebar({ activeId, onSelect, refreshKey, onNew }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setError("");
    api
      .listProjects()
      .then(setData)
      .catch((err) => setError(String(err.message || err)));
  }, [refreshKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  const active = data?.projects?.find((p) => p.id === activeId);
  const count = (data?.projects || []).length;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-100">
              {active?.title || (data ? "Projects" : "Loading…")}
            </span>
            <span className="block text-[11px] text-zinc-500">
              {error ? "couldn't load projects" : `${count} project${count === 1 ? "" : "s"}`}
            </span>
          </span>
          <Icon name="chevronDown" className="h-4 w-4 text-zinc-500" />
        </button>
        <button
          onClick={onNew}
          aria-label="New project"
          title="New project"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-black transition hover:bg-white"
        >
          <Icon name="plus" className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 text-[11px] text-red-400">
          {error}
        </p>
      )}
      {open && (
        <>
          <button
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default bg-transparent"
          />
          <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-panel2 p-1 shadow-2xl">
            {(data?.projects || []).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setOpen(false);
                  onSelect(p.id);
                }}
                className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition ${
                  p.id === activeId ? "bg-violet-400/20 text-white" : "text-zinc-300 hover:bg-white/5"
                }`}
              >
                {p.title}
                <span className="block text-[11px] text-zinc-500">
                  {p.book_type} · {p.versions} version{p.versions === 1 ? "" : "s"}
                </span>
              </button>
            ))}
            {count === 0 && !error && (
              <p className="px-3 py-2 text-xs text-zinc-500">
                {data ? "No projects yet." : "Loading…"}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
