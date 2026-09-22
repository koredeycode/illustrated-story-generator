import { useState } from "react";
import { api } from "../api.js";

function SceneStatus({ status }) {
  if (status === "done" || status === "preview") return null;
  const label =
    status === "queued"
      ? "Queued"
      : status === "writing"
        ? "Writing…"
        : status === "drawing"
          ? "Drawing…"
          : null;
  return (
    <div className="flex aspect-[3/2] w-full items-center justify-center gap-2 bg-stone-100 text-stone-500">
      {label ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-amber-600 motion-safe:animate-pulse"
          />
          {label}
        </>
      ) : (
        <span className="px-4 text-center">⚠️ {String(status)}</span>
      )}
    </div>
  );
}

export default function ChapterCard({ bookId, chapter, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [regenError, setRegenError] = useState("");
  const status = chapter.status;

  const act = async (fn) => {
    setBusy(true);
    setRegenError("");
    try {
      await fn();
      onChanged(await api.getStory(bookId));
    } catch (err) {
      setRegenError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const regen = () => act(() => api.regenerate(bookId, chapter.idx));
  const approve = () => act(() => api.approveChapter(bookId, chapter.idx));
  const newPreview = () => act(() => api.previewChapter(bookId, chapter.idx));

  return (
    <article
      aria-labelledby={`ch-${chapter.idx}-heading`}
      className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"
    >
      {status === "done" && chapter.image_url ? (
        <img
          src={chapter.image_url}
          alt={`Chapter ${chapter.idx + 1} illustration`}
          className="aspect-[3/2] w-full object-cover"
          loading="lazy"
        />
      ) : status === "preview" && chapter.preview_url ? (
        <div>
          <img
            src={chapter.preview_url}
            alt={`Chapter ${chapter.idx + 1} preview`}
            className="aspect-[3/2] w-full object-cover"
            loading="lazy"
          />
          <div className="flex flex-wrap gap-2 bg-amber-50 p-3">
            <button
              onClick={approve}
              disabled={busy}
              aria-busy={busy}
              className="rounded-xl bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-50"
            >
              {busy ? "Rendering…" : "Approve — full render"}
            </button>
            <button
              onClick={newPreview}
              disabled={busy}
              className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
            >
              New preview
            </button>
          </div>
        </div>
      ) : (
        <SceneStatus status={status} />
      )}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={`ch-${chapter.idx}-heading`} className="font-display text-lg font-bold">
            Chapter {chapter.idx + 1}
          </h3>
          {chapter.score != null && (
            <span
              aria-label={`Hero match ${Math.round(chapter.score * 100)} percent`}
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900"
            >
              hero match {Math.round(chapter.score * 100)}%
            </span>
          )}
          {status === "preview" && (
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-900">
              awaiting approval
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap font-display leading-relaxed text-stone-800">
          {chapter.text || <em>…</em>}
        </p>
        {status === "done" && (
          <button
            onClick={regen}
            disabled={busy}
            aria-busy={busy}
            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50"
          >
            {busy ? "Redrawing…" : "Redraw this picture"}
          </button>
        )}
        {regenError && (
          <p role="alert" className="text-sm text-red-700">
            {regenError}
          </p>
        )}
      </div>
    </article>
  );
}
