import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";

export default function ReaderView({ bookId, onBack }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState("right");
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    api
      .getStory(bookId)
      .then(setBook)
      .catch((err) => setError(String(err.message || err)));
  }, [bookId]);

  const pages = book
    ? [
        { kind: "cover" },
        ...book.chapters.map((c) => ({ kind: "chapter", chapter: c })),
        { kind: "end" },
      ]
    : [];
  const total = pages.length;

  const go = useCallback(
    (next) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      setDir(clamped >= page ? "right" : "left");
      setPage(clamped);
    },
    [page, total]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(page + 1);
      else if (e.key === "ArrowLeft") go(page - 1);
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, page, onBack]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
      setFullscreen(true);
    }
  };

  if (error)
    return (
      <p role="alert" className="mx-auto max-w-2xl text-red-700">
        {error}
      </p>
    );
  if (!book) return <p className="mx-auto max-w-2xl text-stone-500">Opening book…</p>;

  const current = pages[page];
  const label =
    current.kind === "cover"
      ? "Cover"
      : current.kind === "end"
        ? "The End"
        : `Chapter ${current.chapter.idx + 1}`;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 hover:text-ink"
        >
          ← Back to book
        </button>
        <p aria-live="polite" className="text-sm text-stone-500">
          {label} · {page + 1} of {total}
        </p>
        <button
          onClick={toggleFullscreen}
          className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          {fullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>

      <div
        key={page}
        className={dir === "right" ? "page-turn-right" : "page-turn-left"}
        role="region"
        aria-label={`${label}, page ${page + 1} of ${total}`}
      >
        {current.kind === "cover" && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
            {book.cover_url ? (
              <img src={book.cover_url} alt={`${book.meta.hero} book cover`} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 p-8 text-center">
                <p className="font-display text-4xl font-black">{book.meta.hero}</p>
                <p className="text-stone-500">{book.meta.theme}</p>
              </div>
            )}
          </div>
        )}
        {current.kind === "chapter" && (
          <div className="grid gap-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 md:grid-cols-2">
            {current.chapter.image_url ? (
              <img
                src={current.chapter.image_url}
                alt={`Chapter ${current.chapter.idx + 1} illustration`}
                className="aspect-[3/2] h-full w-full object-cover md:aspect-auto"
              />
            ) : (
              <div className="flex min-h-64 items-center justify-center bg-stone-100 text-stone-500">
                (image pending)
              </div>
            )}
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <h2 className="font-display text-2xl font-bold">
                Chapter {current.chapter.idx + 1}
              </h2>
              <p className="mt-3 whitespace-pre-wrap font-display leading-relaxed text-stone-800">
                {current.chapter.text || <em>…</em>}
              </p>
            </div>
          </div>
        )}
        {current.kind === "end" && (
          <div className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-stone-200">
            <p className="font-display text-4xl font-black">The End</p>
            {book.meta.dedication && (
              <p className="font-display italic text-stone-600">{book.meta.dedication}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => go(page - 1)}
          disabled={page === 0}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
        >
          ← Previous
        </button>
        <div className="flex gap-1.5" role="tablist" aria-label="Pages">
          {pages.map((p, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === page}
              aria-label={`Go to page ${i + 1}`}
              onClick={() => go(i)}
              className={`h-2 rounded-full transition ${
                i === page ? "w-6 bg-amber-700" : "w-2 bg-stone-300 hover:bg-stone-400"
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => go(page + 1)}
          disabled={page === total - 1}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
