import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import ChapterCard from "./ChapterCard.jsx";
import Icon from "./icons.jsx";

export default function BookView({ bookId, onBack, onRead }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
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
    setActionError("");
    try {
      await api.makeCover(bookId, "banner");
      await refresh();
    } catch (err) {
      setActionError(String(err.message || err));
    } finally {
      setCoverBusy(false);
    }
  };

  const makeAudio = async () => {
    setAudioBusy(true);
    setActionError("");
    try {
      await api.startAudiobook(bookId);
      await refresh();
    } catch (err) {
      setActionError(String(err.message || err));
    } finally {
      setAudioBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* top bar: back + primary action */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-stone-600 transition hover:bg-stone-200/60 hover:text-ink"
        >
          <Icon name="arrowLeft" /> Library
        </button>
        <button
          onClick={() => onRead(bookId)}
          disabled={running}
          className="flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          <Icon name="book" /> {running ? "Read so far" : "Read"}
        </button>
      </div>

      {/* hero: cover art + title block */}
      {book.cover_url ? (
        <div className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-stone-200">
          <img src={book.cover_url} alt={`${book.meta.hero} book cover`} className="aspect-square w-full object-cover sm:aspect-[16/10]" />
          <div className="bg-stone-900 px-5 py-4 text-white">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-2xl font-black focus:outline-none"
            >
              {book.meta.hero}
            </h2>
            <p className="mt-0.5 text-sm text-stone-300">{book.meta.theme}</p>
            {book.meta.dedication && (
              <p className="mt-1 font-display text-sm italic text-amber-200">
                {book.meta.dedication}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-3xl font-black focus:outline-none"
          >
            {book.meta.hero}
          </h2>
          <p className="mt-1 text-stone-500">{book.meta.theme}</p>
          {book.meta.dedication && (
            <p className="mt-1 font-display text-sm italic text-stone-500">
              {book.meta.dedication}
            </p>
          )}
        </div>
      )}

      {/* progress */}
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
          <span className="text-stone-500">
            {book.meta.art_style}
            {book.meta.lora ? ` + ${book.meta.lora}` : ""}
          </span>
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

      {/* chapters */}
      {book.chapters.map((c) => (
        <ChapterCard key={c.idx} bookId={bookId} chapter={c} onChanged={setBook} />
      ))}

      {/* finishing touches */}
      <section
        aria-label="Finishing touches"
        className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200"
      >
        <h3 className="font-display text-lg font-bold">Finishing touches</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={newCover}
            disabled={coverBusy || running}
            className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
          >
            <Icon name="image" />
            {coverBusy ? "Making cover…" : book.cover_url ? "New cover" : "Make cover"}
          </button>
          {!(audio.status === "done" && audio.url) && (
            <button
              onClick={makeAudio}
              disabled={audioBusy || running || audio.status === "working"}
              className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              <Icon name="music" />
              {audio.status === "working"
                ? `Narrating… ${audio.progress ?? 0}%`
                : audioBusy
                  ? "Starting…"
                  : "Make audiobook"}
            </button>
          )}
          <a
            href={api.exportUrl(bookId, "html")}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-100"
          >
            <Icon name="fileText" /> Web page
          </a>
          <a
            href={api.exportUrl(bookId, "pdf")}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-800"
          >
            <Icon name="download" /> PDF book
          </a>
        </div>
        {actionError && (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700">
            <Icon name="alert" /> {actionError}
          </p>
        )}
        {String(audio.status).startsWith("error") && (
          <p role="alert" className="text-xs text-red-700">
            {audio.status}
          </p>
        )}
        {audio.status === "done" && audio.url && (
          <video
            controls
            preload="metadata"
            src={audio.url}
            className="w-full rounded-xl bg-stone-900"
            aria-label="Audiobook player with captions"
          >
            {audio.captions && (
              <track kind="captions" src={audio.captions} srcLang="en" label="English" default />
            )}
          </video>
        )}
      </section>
    </div>
  );
}
