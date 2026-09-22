import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Left rail: projects + versions, replaces the old Library page. */
export default function ProjectsSidebar({ activeId, onSelect, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setData(await api.listProjects());
    } catch (err) {
      setError(String(err.message || err));
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const create = async () => {
    setCreating(true);
    try {
      const { id } = await api.createProject("", "picture");
      await load();
      onSelect(id);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <aside aria-label="Projects" className="flex w-60 shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">Projects</h2>
        <button
          onClick={create}
          disabled={creating}
          className="flex items-center gap-1 rounded-lg bg-stone-900 px-2 py-1 text-xs font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
        >
          <Icon name="sparkles" className="h-3 w-3" /> {creating ? "…" : "New"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {!data && <p className="text-xs text-stone-500">Loading…</p>}
        {data?.projects?.length === 0 && (
          <p className="rounded-xl bg-white p-3 text-xs text-stone-500 ring-1 ring-stone-200">
            No projects yet — hit New and describe your book in chat.
          </p>
        )}
        {(data?.projects || []).map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            aria-current={p.id === activeId ? "true" : undefined}
            className={`rounded-xl px-3 py-2 text-left transition ${
              p.id === activeId
                ? "bg-stone-900 text-white"
                : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            <span className="block truncate text-sm font-medium">{p.title}</span>
            <span
              className={`mt-0.5 block text-[11px] ${p.id === activeId ? "text-stone-300" : "text-stone-500"}`}
            >
              {p.book_type} · {p.versions} version{p.versions === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </div>
      {data && (
        <p className="mt-auto flex items-center gap-1 text-[11px] text-stone-400">
          <Icon name={data.storage === "r2" ? "cloud" : "clock"} className="h-3 w-3" />
          {data.storage === "r2" ? "projects back up to cloud" : "local only"}
        </p>
      )}
    </aside>
  );
}
