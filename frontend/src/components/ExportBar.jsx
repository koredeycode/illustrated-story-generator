import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Dark export panel: web page / PDF / cover refresh / audiobook + voice picker + preview. */
export default function ExportBar({ project, onChanged }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [voices, setVoices] = useState(null);
  const [voice, setVoice] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef(null);
  const book = project?.active;
  const audio = book?.audio || { status: "idle" };

  useEffect(() => {
    let alive = true;
    api
      .voices()
      .then((d) => alive && setVoices(d))
      .catch(() => alive && setVoices({ voices: [], default: "" }));
    return () => (alive = false);
  }, []);

  useEffect(() => {
    if (audio.voice) setVoice(audio.voice);
    else if (voices?.default) setVoice(voices.default);
  }, [audio.voice, voices]);

  if (!book)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-500">
        Export — nothing generated yet.
      </div>
    );

  const togglePreview = () => {
    const el = previewRef.current;
    if (!el) return;
    if (previewing) {
      el.pause();
      setPreviewing(false);
      return;
    }
    const v = voice || voices?.default || "";
    if (!v) return;
    el.src = `/api/voices/preview?voice=${encodeURIComponent(v)}`;
    el.play()
      .then(() => setPreviewing(true))
      .catch((err) => setError(String(err.message || err)));
  };

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
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <Icon name="music" className="h-3.5 w-3.5" />
            <span className="sr-only">Narration voice</span>
            <select
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value);
                if (previewRef.current) {
                  previewRef.current.pause();
                  setPreviewing(false);
                }
              }}
              disabled={busy !== "" || audio.status === "working" || !voices}
              title={
                audio.status === "working"
                  ? "Voice is locked while narration runs"
                  : "Pick a narration voice — preview it before the book finishes"
              }
              aria-label="Narration voice"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/50 px-2 py-1.5 text-xs text-zinc-200 focus:border-accent/60 focus:outline-none disabled:opacity-50"
            >
              {!voices && <option value="">Loading voices…</option>}
              {voices && voices.voices.length === 0 && (
                <option value={voices.default || ""}>Default ({voices.default || "unavailable offline"})</option>
              )}
              {(voices?.voices || []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id.replace(/^[a-z]{2}-[A-Z]{2}-/, "").replace(/Neural$/, "")} · {v.locale} · {v.gender}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={togglePreview}
              disabled={!voices || !(voice || voices.default)}
              title={previewing ? "Stop preview" : "Preview voice"}
              aria-label={previewing ? "Stop voice preview" : "Preview voice"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Icon name={previewing ? "stop" : "play"} className="h-3.5 w-3.5" />
            </button>
            <audio
              ref={previewRef}
              preload="none"
              className="hidden"
              onEnded={() => setPreviewing(false)}
              onError={() => {
                setPreviewing(false);
                setError("Voice preview failed — is the GPU server reachable?");
              }}
            />
          </label>
          <button
            onClick={() => run("audio", () => api.startAudiobook(book.id, voice || voices?.default))}
            disabled={busy !== "" || book.status !== "complete" || audio.status === "working"}
            className={ghost}
          >
            <Icon name="play" />
            {audio.status === "working" ? `Narrating… ${audio.progress ?? 0}%` : busy === "audio" ? "Starting…" : "Audiobook"}
          </button>
        </div>
      )}
      {audio.status === "done" && audio.url && (
        <>
          <video controls preload="metadata" src={audio.url} className="h-10 w-full rounded-xl bg-black" aria-label="Audiobook player">
            {audio.captions && <track kind="captions" src={audio.captions} srcLang="en" label="English" default />}
          </video>
          {audio.voice && (
            <p className="text-[11px] text-zinc-500">
              Narrated by {audio.voice.replace(/^[a-z]{2}-[A-Z]{2}-/, "").replace(/Neural$/, "")}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
