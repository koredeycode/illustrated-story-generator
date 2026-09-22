import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** M4 Inspector: book-type templates, BOOK.md bible editor, art controls, versions. */
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
      <div className="rounded-2xl bg-white p-4 text-xs text-stone-500 ring-1 ring-stone-200">
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
    <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
      <section aria-label="Book type" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Icon name="book" className="h-4 w-4 text-amber-700" /> Book type
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {types.map((t) => (
            <div
              key={t.id}
              title={t.blurb}
              className={`rounded-xl border px-2 py-1.5 text-xs ${
                (project.meta?.book_type || "picture") === t.id
                  ? "border-amber-700 bg-amber-50 font-bold text-amber-900"
                  : "border-stone-200 text-stone-600"
              }`}
            >
              {t.label}
              <span className="block text-[10px] font-normal text-stone-400">{t.layout}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-stone-400">Type locks at plan time — new projects can pick any.</p>
      </section>

      <section aria-label="Book bible" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <Icon name="fileText" className="h-4 w-4 text-amber-700" /> BOOK.md
          {bibleDirty && <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] text-amber-900">edited</span>}
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
          className="mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 p-2 font-mono text-[11px] leading-relaxed focus:border-amber-700 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving || !bibleDirty}
          className="mt-2 w-full rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save bible"}
        </button>
        {msg && <p className="mt-1 text-[11px] text-stone-500">{msg}</p>}
      </section>

      <section aria-label="Versions" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <h3 className="text-sm font-bold">Versions</h3>
        {(project.versions || []).length === 0 && (
          <p className="mt-1 text-xs text-stone-500">No versions yet.</p>
        )}
        <ol className="mt-1 space-y-1">
          {(project.versions || []).map((v) => (
            <li
              key={v.n}
              className={`rounded-lg px-2 py-1 text-xs ${
                project.active_book === v.book_id ? "bg-green-50 font-bold text-green-900" : "text-stone-600"
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
