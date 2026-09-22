import { useState } from "react";
import { api } from "../api.js";
import ChapterCard from "./ChapterCard.jsx";
import Icon from "./icons.jsx";

/** Dotted dark canvas: page frames (Storyboard) / Manuscript / Reader. */
const TABS = ["Storyboard", "Manuscript", "Reader"];

export default function Canvas({ project, selection, onSelect, onChanged }) {
  const [tab, setTab] = useState("Storyboard");
  const book = project?.active;

  const refreshProject = async () => {
    try {
      if (project && onChanged) onChanged(await api.getProject(project.id));
    } catch {
      /* poll/SSE will catch up */
    }
  };

  if (!book)
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
        <div className="text-center">
          <Icon name="image" className="mx-auto h-10 w-10 text-zinc-700" />
          <p className="mt-3 font-medium text-zinc-300">Canvas is empty</p>
          <p className="mt-1 text-sm text-zinc-500">Approve a plan in chat and pages will stream in here.</p>
        </div>
      </div>
    );

  return (
    <section aria-label="Canvas" className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 p-3">
        <div role="tablist" aria-label="Canvas modes" className="flex gap-1 rounded-xl bg-white/5 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t ? "bg-zinc-100 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {book.meta?.hero} · {book.status} · click a frame to talk about it
        </p>
      </div>

      <div className="bg-dots-faint min-h-0 flex-1 overflow-y-auto p-4">
        {book.status === "missing" && (
          <p role="alert" className="mx-auto mb-3 max-w-2xl rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-300">
            Book files aren't on this machine — it may live in cloud storage or another session.
            Re-open it from the Library once its files are here.
          </p>
        )}
        {tab === "Storyboard" && (
          <div className="grid grid-cols-1 gap-4 pb-24 sm:grid-cols-2 xl:grid-cols-3">
            {(book.chapters || []).map((c) => (
              <figure
                key={c.idx}
                className={`overflow-hidden rounded-xl border bg-panel transition ${
                  selection?.chapter_idx === c.idx
                    ? "border-accent/70 shadow-[0_0_24px_rgba(167,139,250,0.25)]"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <button onClick={() => onSelect({ chapter_idx: c.idx })} className="block w-full text-left" aria-pressed={selection?.chapter_idx === c.idx}>
                  {c.image_url ? (
                    <img src={c.image_url} alt={`Page ${c.idx + 1} art`} className="aspect-[3/2] w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex aspect-[3/2] w-full items-center justify-center bg-white/5 text-sm text-zinc-500">
                      {c.status}
                    </span>
                  )}
                </button>
                <figcaption className="flex items-center justify-between gap-2 border-t border-white/10 px-2.5 py-1.5">
                  <span className="truncate text-xs text-zinc-400">
                    P{c.idx + 1} · {(c.text || "…").slice(0, 48)}
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      c.status === "done"
                        ? "bg-green-400"
                        : String(c.status).startsWith("error")
                          ? "bg-red-400"
                          : "bg-amber-400 motion-safe:animate-pulse"
                    }`}
                    title={c.status}
                  />
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {tab === "Manuscript" && (
          <div className="mx-auto max-w-2xl space-y-3 pb-24">
            {(book.chapters || []).map((c) => (
              <ChapterCard key={c.idx} bookId={book.id} chapter={c} onChanged={refreshProject} />
            ))}
          </div>
        )}

        {tab === "Reader" && (
          <div className="mx-auto max-w-xl space-y-5 pb-24">
            {book.cover_url && (
              <img src={book.cover_url} alt="Book cover" className="w-full rounded-2xl border border-white/10 object-cover" />
            )}
            {(book.chapters || []).map((c) => (
              <article key={c.idx} className="overflow-hidden rounded-2xl border border-white/10 bg-panel">
                {c.image_url && <img src={c.image_url} alt={`Page ${c.idx + 1}`} className="w-full object-cover" />}
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold text-white">Chapter {c.idx + 1}</h3>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed text-zinc-300">{c.text || "…"}</p>
                </div>
              </article>
            ))}
            <p className="text-center font-display text-2xl font-black text-white">The End</p>
          </div>
        )}
      </div>
    </section>
  );
}
