import { useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** M6 Export bar: web page / PDF / cover refresh / audiobook over the active book. */
export default function ExportBar({ project, onChanged }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const book = project?.active;
  const audio = book?.audio || { status: "idle" };

  if (!book) return null;

  const run = async (kind, fn) => {
    setBusy(kind);
    setError("");
    try {
      await fn();
      if (project) onChanged(await api.getProject(project.id));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200" aria-label="Export">
      <a
        href={api.exportUrl(book.id, "html")}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
      >
        <Icon name="fileText" /> Web page
      </a>
      <a
        href={api.exportUrl(book.id, "pdf")}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
      >
        <Icon name="download" /> PDF book
      </a>
      <button
        onClick={() => run("cover", () => api.makeCover(book.id, "banner"))}
        disabled={busy !== "" || book.status !== "complete"}
        className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
      >
        <Icon name="image" /> {busy === "cover" ? "Making cover…" : "New cover"}
      </button>
      {!(audio.status === "done" && audio.url) && (
        <button
          onClick={() => run("audio", () => api.startAudiobook(book.id))}
          disabled={busy !== "" || book.status !== "complete" || audio.status === "working"}
          className="flex items-center gap-1.5 rounded-xl border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
        >
          <Icon name="music" />
          {audio.status === "working" ? `Narrating… ${audio.progress ?? 0}%` : busy === "audio" ? "Starting…" : "Audiobook"}
        </button>
      )}
      {audio.status === "done" && audio.url && (
        <video controls preload="metadata" src={audio.url} className="h-10 w-56 rounded-xl bg-stone-900" aria-label="Audiobook player">
          {audio.captions && <track kind="captions" src={audio.captions} srcLang="en" label="English" default />}
        </video>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
