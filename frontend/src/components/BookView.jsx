import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ChapterCard from "./ChapterCard.jsx";

export default function BookView({ bookId, onBack }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const headingRef = useRef(null);
  const focusedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setBook(await api.getStory(bookId));
    } catch (err) {
      setError(String(err.message || err));
    }
  }, [bookId]);

  useEffect(() => {
    refresh();
    const es = new EventSource(api.eventsUrl(bookId));
    es.onmessage = () => refresh();
    es.onerror = () => {};
    const poll = setInterval(refresh, 10000); // fallback if SSE drops
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [bookId, refresh]);

  useEffect(() => {
    if (book && !focusedRef.current) {
      focusedRef.current = true;
      headingRef.current?.focus();
    }
  }, [book]);

  if (error)
    return (
      <p role="alert" className="mx-auto max-w-2xl text-red-700">
        {error}
      </p>
    );
  if (!book) return <p className="mx-auto max-w-2xl text-stone-500">Loading…</p>;

  const done = book.chapters.filter((c) => c.status === "done").length;
  const total = book.chapters.length;
  const running = book.status !== "complete";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 hover:text-ink"
        >
          ← New story
        </button>
        <div className="flex gap-2">
          <a
            href={api.exportUrl(bookId, "html")}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-100"
          >
            Web page
          </a>
          <a
            href={api.exportUrl(bookId, "pdf")}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-amber-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
          >
            PDF book
          </a>
        </div>
      </div>
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-3xl font-black focus:outline-none"
        >
          {book.meta.hero}
        </h2>
        <p className="mt-1 text-stone-500">{book.meta.theme}</p>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {running ? (
              <>
                Generating… {done}/{total} scenes done
              </>
            ) : (
              <>Complete — {total} scenes</>
            )}
          </span>
          <span className="text-stone-500">{book.meta.art_style}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Generation progress"
          className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200"
        >
          <div
            className="h-full rounded-full bg-amber-700 transition-all"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
        {running && (
          <p className="mt-2 text-xs text-stone-500">
            Keep this tab open — pictures arrive as they finish.
          </p>
        )}
      </div>
      {book.chapters.map((c) => (
        <ChapterCard key={c.idx} bookId={bookId} chapter={c} onChanged={setBook} />
      ))}
    </div>
  );
}
