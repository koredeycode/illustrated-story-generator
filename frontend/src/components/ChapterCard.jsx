import { useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

export function fmtDuration(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

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
    <div className="flex aspect-[3/2] w-full items-center justify-center gap-2 bg-white/5 text-zinc-500">
      {label ? (
        <>
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-amber-600 motion-safe:animate-pulse"
          />
          {label}
        </>
      ) : (
        <span className="flex items-center gap-1.5 px-4 text-center">
          <Icon name="alert" /> {String(status)}
        </span>
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
      className="overflow-hidden rounded-2xl border border-white/10 bg-panel"
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
          <div className="flex flex-wrap gap-2 border-t border-white/10 bg-violet-400/10 p-3">
            <button
              onClick={approve}
              disabled={busy}
              aria-busy={busy}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-1.5 text-sm font-medium text-black transition hover:bg-white disabled:opacity-50"
            >
              <Icon name="check" />
              {busy ? "Rendering…" : "Approve — full render"}
            </button>
            <button
              onClick={newPreview}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              <Icon name="refresh" /> New preview
            </button>
          </div>
        </div>
      ) : (
        <SceneStatus status={status} />
      )}
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={`ch-${chapter.idx}-heading`} className="font-display text-lg font-bold text-white">
            Chapter {chapter.idx + 1}
          </h3>
          {chapter.match && (
            <span
              aria-label={`Hero match ${chapter.match}, score ${Math.round(chapter.score * 100)} percent of the CLIP scale`}
              title="CLIP likeness grade: weak < good < strong (raw scores top out ~35%)"
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                chapter.match === "strong"
                  ? "bg-green-400/20 text-green-300"
                  : chapter.match === "good"
                    ? "bg-amber-400/20 text-amber-300"
                    : "bg-white/10 text-zinc-400"
              }`}
            >
              {chapter.match} match
            </span>
          )}
          {chapter.timings && (chapter.timings.writing_s != null || chapter.timings.drawing_s != null) && (
            <span className="flex items-center gap-1 text-xs text-zinc-500" title="Time spent writing and illustrating this chapter">
              <Icon name="clock" className="h-3 w-3" />
              {[
                chapter.timings.writing_s != null && `wrote ${fmtDuration(chapter.timings.writing_s)}`,
                chapter.timings.drawing_s != null && `drew ${fmtDuration(chapter.timings.drawing_s)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {status === "preview" && (
            <span className="rounded-full bg-sky-400/20 px-2.5 py-0.5 text-xs font-medium text-sky-300">
              awaiting approval
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap font-display leading-relaxed text-zinc-300">
          {chapter.text || <em>…</em>}
        </p>
        {status === "done" && (
          <button
            onClick={regen}
            disabled={busy}
            aria-busy={busy}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <Icon name="refresh" />
            {busy ? "Redrawing…" : "Redraw this picture"}
          </button>
        )}
        {regenError && (
          <p role="alert" className="flex items-start gap-1.5 text-sm text-red-400">
            <Icon name="alert" /> {regenError}
          </p>
        )}
      </div>
    </article>
  );
}
