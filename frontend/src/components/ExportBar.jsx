import { useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Dark export panel: web page / PDF / cover refresh / audiobook. */
export default function ExportBar({ project, onChanged }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const book = project?.active;
  const audio = book?.audio || { status: "idle" };

  if (!book)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-500">
        Export — nothing generated yet.
      </div>
    );

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

  const ghost =
    "flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-white/10 disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3" aria-label="Export">
      <a href={api.exportUrl(book.id, "html")} target="_blank" rel="noreferrer" className={ghost}>
        <Icon name="fileText" /> Web page
      </a>
      <a
        href={api.exportUrl(book.id, "pdf")}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-1.5 text-sm font-bold text-black transition hover:bg-white"
      >
        <Icon name="download" /> PDF book
      </a>
      <button onClick={() => run("cover", () => api.makeCover(book.id, "banner"))} disabled={busy !== "" || book.status !== "complete"} className={ghost}>
        <Icon name="image" /> {busy === "cover" ? "Making cover…" : "New cover"}
      </button>
      {!(audio.status === "done" && audio.url) && (
        <button
          onClick={() => run("audio", () => api.startAudiobook(book.id))}
          disabled={busy !== "" || book.status !== "complete" || audio.status === "working"}
          className={ghost}
        >
          <Icon name="music" />
          {audio.status === "working" ? `Narrating… ${audio.progress ?? 0}%` : busy === "audio" ? "Starting…" : "Audiobook"}
        </button>
      )}
      {audio.status === "done" && audio.url && (
        <video controls preload="metadata" src={audio.url} className="h-10 w-full rounded-xl bg-black" aria-label="Audiobook player">
          {audio.captions && <track kind="captions" src={audio.captions} srcLang="en" label="English" default />}
        </video>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
