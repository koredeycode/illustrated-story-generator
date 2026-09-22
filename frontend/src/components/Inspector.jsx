import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Dark inspector: book-type templates, BOOK.md editor, versions. */
export default function Inspector({ project, onChanged }) {
  const [types, setTypes] = useState([]);
  const [bible, setBible] = useState("");
  const [bibleDirty, setBibleDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.bookTypes().then((d) => setTypes(d.types || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setBible(project?.bible || "");
    setBibleDirty(false);
  }, [project?.id, project?.bible]);

  if (!project)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-500">
        Inspector — select a project.
      </div>
    );

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await api.saveBible(project.id, bible);
      setBibleDirty(false);
      setMsg("Bible saved — agent uses the new locks.");
      onChanged(await api.getProject(project.id));
    } catch (err) {
      setMsg(String(err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="Book type" className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
          <Icon name="book" className="h-4 w-4 text-accent" /> Book type
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {types.map((t) => (
            <div
              key={t.id}
              title={t.blurb}
              className={`rounded-xl border px-2 py-1.5 text-xs ${
                (project.meta?.book_type || "picture") === t.id
                  ? "border-accent/60 bg-accent/15 font-bold text-violet-200"
                  : "border-white/10 text-zinc-400"
              }`}
            >
              {t.label}
              <span className="block text-[10px] font-normal text-zinc-600">{t.layout}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">Type locks at plan time — new projects can pick any.</p>
      </section>

      <section aria-label="Book bible" className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
          <Icon name="fileText" className="h-4 w-4 text-accent" /> BOOK.md
          {bibleDirty && <span className="rounded-full bg-accent/20 px-2 py-px text-[10px] text-violet-200">edited</span>}
        </h3>
        <textarea
          value={bible}
          onChange={(e) => {
            setBible(e.target.value);
            setBibleDirty(true);
          }}
          rows={12}
          spellCheck={false}
          aria-label="Book bible markdown"
          placeholder="Approve a plan and the bible appears here."
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 p-2 font-mono text-[11px] leading-relaxed text-zinc-300 placeholder:text-zinc-600 focus:border-accent/60 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving || !bibleDirty}
          className="mt-2 w-full rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save bible"}
        </button>
        {msg && <p className="mt-1 text-[11px] text-zinc-500">{msg}</p>}
      </section>

      <section aria-label="Versions" className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-bold text-white">Versions</h3>
        {(project.versions || []).length === 0 && (
          <p className="mt-1 text-xs text-zinc-500">No versions yet.</p>
        )}
        <ol className="mt-1 space-y-1">
          {(project.versions || []).map((v) => (
            <li
              key={v.n}
              className={`rounded-lg px-2 py-1 text-xs ${
                project.active_book === v.book_id ? "bg-green-400/15 font-bold text-green-300" : "text-zinc-500"
              }`}
            >
              v{v.n} · {v.label} {project.active_book === v.book_id && "● active"}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
