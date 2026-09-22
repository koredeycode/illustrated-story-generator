import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";
import PromptBar from "./PromptBar.jsx";

/** Stitch-style landing: aurora hero + glass prompt + project shelf. */
export default function Landing({ onStart, onOpen }) {
  const [projects, setProjects] = useState(null);
  const [books, setBooks] = useState(null);
  const [types, setTypes] = useState([]);
  const [bookType, setBookType] = useState("picture");
  const [busy, setBusy] = useState(false);
  const [adopting, setAdopting] = useState("");

  useEffect(() => {
    api.listProjects().then(setProjects).catch(() => {});
    api.bookTypes().then((d) => setTypes(d.types || [])).catch(() => {});
    api.listBooks().then(setBooks).catch(() => {});
  }, []);

  const start = async (message) => {
    if (busy) return;
    setBusy(true);
    try {
      await onStart(message, bookType);
    } finally {
      setBusy(false);
    }
  };

  // Books on disk that no project references (e.g. made before projects existed).
  const claimed = new Set();
  (projects?.projects || []).forEach((p) => {
    (p.version_books || []).forEach((b) => claimed.add(b));
    if (p.active_book) claimed.add(p.active_book);
  });
  const orphans = (books?.books || []).filter((b) => b.local && !claimed.has(b.id));

  const adopt = async (b) => {
    setAdopting(b.id);
    try {
      const { id } = await api.createProject(b.meta?.hero || "Adopted book", "picture");
      await api.adoptBook(id, b.id);
      onOpen(id);
    } catch {
      /* PromptBar-style inline errors live in the workspace; reset here */
    } finally {
      setAdopting("");
    }
  };

  return (
    <div className="bg-dots relative flex min-h-screen flex-col overflow-hidden">
      {/* aurora streaks */}
      <div aria-hidden="true" className="aurora left-[-10%] top-[20%] h-64 w-[60%] -rotate-12 bg-violet-600/40" />
      <div aria-hidden="true" className="aurora right-[-15%] top-[45%] h-56 w-[55%] rotate-12 bg-sky-500/25" />
      <div aria-hidden="true" className="aurora bottom-[-10%] left-[30%] h-48 w-[40%] bg-fuchsia-600/20" />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16">
        <p className="rise-in mb-4 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-zinc-300">
          <Icon name="sparkles" className="h-3.5 w-3.5 text-accent" />
          Illustrated books, drawn on your own GPU
        </p>
        <h1 className="rise-in text-center font-display text-5xl font-black leading-[1.05] tracking-tight text-white sm:text-6xl">
          Illustrate at the
          <br />
          speed of imagination
        </h1>
        <p className="rise-in mt-4 max-w-xl text-center text-sm text-zinc-400 sm:text-base">
          Picture books, manga, cookbooks, textbooks — describe any illustrated book and the
          studio drafts it with you, page by page.
        </p>
        <div className="rise-in mt-8 w-full">
          <PromptBar
            variant="hero"
            busy={busy}
            onSend={start}
            bookTypes={types}
            bookType={bookType}
            onBookType={setBookType}
          />
        </div>

        {projects?.projects?.length > 0 && (
          <div className="mt-12 w-full">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Recent projects</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {projects.projects.slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur transition hover:border-accent/50 hover:bg-white/10"
                >
                  <span className="block truncate text-sm font-medium text-zinc-100">{p.title}</span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    {p.book_type} · {p.versions} version{p.versions === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {orphans.length > 0 && (
          <div className="mt-8 w-full">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
              Previous books on this machine
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {orphans.slice(0, 6).map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur"
                >
                  <span className="block truncate text-sm font-medium text-zinc-100">
                    {b.meta?.hero || "Untitled story"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-zinc-500">
                    {b.meta?.chapters ? `${b.meta.chapters} chapters · ` : ""}not in any project yet
                  </span>
                  <button
                    onClick={() => adopt(b)}
                    disabled={adopting !== ""}
                    className="mt-2 rounded-lg bg-zinc-100 px-3 py-1 text-xs font-bold text-black transition hover:bg-white disabled:opacity-50"
                  >
                    {adopting === b.id ? "Adopting…" : "Open as project"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="relative z-10 pb-6 text-center text-xs text-zinc-600">
        Runs on free Kaggle GPU — finished books back up to cloud storage when configured.
      </footer>
    </div>
  );
}
