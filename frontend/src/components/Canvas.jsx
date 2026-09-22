import { useState } from "react";
import { api } from "../api.js";
import ChapterCard from "./ChapterCard.jsx";
import Icon from "./icons.jsx";

/** M3 Canvas: Manuscript / Storyboard / Reader tabs over the active book version. */
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
      <div className="flex flex-1 items-center justify-center rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
        <div>
          <Icon name="image" className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-medium">Canvas is empty</p>
          <p className="mt-1 text-sm text-stone-500">Approve a plan in chat and pages will stream in here.</p>
        </div>
      </div>
    );

  return (
    <section aria-label="Canvas" className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 p-3">
        <div role="tablist" aria-label="Canvas modes" className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">
          {book.meta?.hero} · {book.status} · click a page to talk about it
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "Storyboard" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {book.chapters.map((c) => (
              <button
                key={c.idx}
                onClick={() => onSelect({ chapter_idx: c.idx })}
                aria-pressed={selection?.chapter_idx === c.idx}
                className={`overflow-hidden rounded-xl text-left ring-2 transition ${
                  selection?.chapter_idx === c.idx ? "ring-amber-700" : "ring-stone-200 hover:ring-stone-400"
                }`}
              >
                {c.image_url ? (
                  <img src={c.image_url} alt={`Page ${c.idx + 1} art`} className="aspect-[3/2] w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex aspect-[3/2] w-full items-center justify-center bg-stone-100 text-sm text-stone-500">
                    {c.status}
                  </span>
                )}
                <span className="block truncate bg-white px-2 py-1 text-xs text-stone-600">
                  P{c.idx + 1} · {(c.text || "…").slice(0, 60)}
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === "Manuscript" && (
          <div className="space-y-3">
            {book.chapters.map((c) => (
              <ChapterCard key={c.idx} bookId={book.id} chapter={c} onChanged={refreshProject} />
            ))}
          </div>
        )}

        {tab === "Reader" && (
          <div className="mx-auto max-w-xl space-y-5">
            {book.cover_url && (
              <img src={book.cover_url} alt="Book cover" className="w-full rounded-2xl object-cover ring-1 ring-stone-200" />
            )}
            {book.chapters.map((c) => (
              <article key={c.idx} className="overflow-hidden rounded-2xl ring-1 ring-stone-200">
                {c.image_url && <img src={c.image_url} alt={`Page ${c.idx + 1}`} className="w-full object-cover" />}
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold">Chapter {c.idx + 1}</h3>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed text-stone-800">{c.text || "…"}</p>
                  <a href={api.exportUrl(book.id, "html")} target="_blank" rel="noreferrer" className="sr-only">
                    Export
                  </a>
                </div>
              </article>
            ))}
            <p className="text-center font-display text-2xl font-black">The End</p>
          </div>
        )}
      </div>
    </section>
  );
}
