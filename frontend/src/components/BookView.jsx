import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ChapterCard from "./ChapterCard.jsx";

export default function BookView({ bookId, onBack, onRead }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
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
  const audio = book.audio || { status: "idle" };

  const newCover = async () => {
    setCoverBusy(true);
    try {
      await api.makeCover(bookId, "banner");
      await refresh();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setCoverBusy(false);
    }
  };

  const makeAudio = async () => {
    setAudioBusy(true);
    try {
      await api.startAudiobook(bookId);
      await refresh();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setAudioBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="rounded-lg px-2 py-1 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 hover:text-ink"
        >
          ← Library
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => onRead(bookId)}
            className="rounded-xl bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            📖 Read
          </button>
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
      {book.cover_url && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
          <img src={book.cover_url} alt={`${book.meta.hero} book cover`} className="aspect-square w-full object-cover" />
        </div>
      )}
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
        <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
          <button
            onClick={newCover}
            disabled={coverBusy || running}
            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
          >
            {coverBusy ? "Making cover…" : book.cover_url ? "New cover" : "Make cover"}
          </button>
          {audio.status === "done" && audio.url ? (
            <a
              href={audio.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              🎧 Listen (MP4)
            </a>
          ) : (
            <button
              onClick={makeAudio}
              disabled={audioBusy || running || audio.status === "working"}
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              {audio.status === "working"
                ? `Narrating… ${audio.progress ?? 0}%`
                : audioBusy
                  ? "Starting…"
                  : "🎧 Make audiobook"}
            </button>
          )}
        </div>
        {String(audio.status).startsWith("error") && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {audio.status}
          </p>
        )}
      </div>
      {book.chapters.map((c) => (
        <ChapterCard key={c.idx} bookId={bookId} chapter={c} onChanged={setBook} />
      ))}
    </div>
  );
}
