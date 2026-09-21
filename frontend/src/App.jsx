import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

function HealthDot() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth({ backend: "down" }));
    return () => (alive = false);
  }, []);
  const color = (s) =>
    s === "ok" ? "bg-green-500" : s === "down" ? "bg-red-500" : "bg-yellow-500";
  if (!health) return <span className="text-sm text-stone-500">checking GPU…</span>;
  return (
    <div className="flex gap-3 text-sm">
      {["backend", "ollama", "forge"].map((k) => (
        <span key={k} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${color(health[k])}`} />
          {k}
        </span>
      ))}
    </div>
  );
}

function CreateForm({ onCreated }) {
  const [theme, setTheme] = useState("a little robot who is afraid of the dark");
  const [hero, setHero] = useState("Bolt");
  const [heroDesc, setHeroDesc] = useState("a small robot with a round orange head");
  const [chapters, setChapters] = useState(5);
  const [artStyle, setArtStyle] = useState("watercolor");
  const [styles, setStyles] = useState(["watercolor"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.styles().then(setStyles).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { id } = await api.createStory({
        theme,
        hero,
        hero_desc: heroDesc,
        chapters: Number(chapters),
        art_style: artStyle,
      });
      onCreated(id);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl space-y-4">
      <h2 className="text-2xl font-bold">Start a new storybook</h2>
      <label className="block">
        <span className="text-sm font-medium">Story idea / theme</span>
        <input className={input} value={theme} onChange={(e) => setTheme(e.target.value)} required />
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium">Hero name</span>
          <input className={input} value={hero} onChange={(e) => setHero(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Chapters (1–10)</span>
          <input
            className={input}
            type="number"
            min="1"
            max="10"
            value={chapters}
            onChange={(e) => setChapters(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium">What does the hero look like? (keeps art consistent)</span>
        <input className={input} value={heroDesc} onChange={(e) => setHeroDesc(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Art style</span>
        <select className={input} value={artStyle} onChange={(e) => setArtStyle(e.target.value)}>
          {styles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-amber-500 px-4 py-3 font-bold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? "Starting…" : "Generate storybook"}
      </button>
    </form>
  );
}

function ChapterCard({ bookId, chapter, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [regenError, setRegenError] = useState("");
  const status = chapter.status;

  const regen = async () => {
    setBusy(true);
    setRegenError("");
    try {
      await api.regenerate(bookId, chapter.idx);
      onChanged(await api.getStory(bookId));
    } catch (err) {
      setRegenError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow">
      <div className="bg-stone-200">
        {status === "done" ? (
          <img
            src={api.imageUrl(bookId, chapter.idx)}
            alt={`Chapter ${chapter.idx + 1} illustration`}
            className="aspect-[3/2] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[3/2] w-full items-center justify-center text-stone-500">
            {status === "queued" && "⏳ queued"}
            {status === "writing" && "✍️ writing…"}
            {status === "drawing" && "🎨 drawing…"}
            {String(status).startsWith("error") && `⚠️ ${status}`}
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="font-bold">Chapter {chapter.idx + 1}</h3>
        <p className="whitespace-pre-wrap leading-relaxed">{chapter.text || <em>…</em>}</p>
        {status === "done" && (
          <button
            onClick={regen}
            disabled={busy}
            className="rounded-lg border border-stone-300 px-3 py-1 text-sm hover:bg-stone-100 disabled:opacity-50"
          >
            {busy ? "Redrawing…" : "Redraw this picture"}
          </button>
        )}
        {regenError && <p className="text-sm text-red-600">{regenError}</p>}
      </div>
    </section>
  );
}

function BookView({ bookId, onBack }) {
  const [book, setBook] = useState(null);
  const [error, setError] = useState("");

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

  if (error) return <p className="text-red-600">{error}</p>;
  if (!book) return <p>Loading…</p>;

  const done = book.chapters.filter((c) => c.status === "done").length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-stone-500 hover:underline">
          ← new story
        </button>
        <a
          href={api.exportUrl(bookId)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-sm hover:bg-stone-100"
        >
          Printable version
        </a>
      </div>
      <h2 className="text-2xl font-bold">
        {book.meta.hero} <span className="text-base font-normal text-stone-500">— {book.meta.theme}</span>
      </h2>
      {book.status !== "complete" && (
        <div className="rounded-lg bg-amber-100 px-4 py-2 text-sm">
          Generating… {done}/{book.chapters.length} scenes done. Keep this tab open.
        </div>
      )}
      {book.chapters.map((c) => (
        <ChapterCard key={c.idx} bookId={bookId} chapter={c} onChanged={setBook} />
      ))}
    </div>
  );
}

export default function App() {
  const [bookId, setBookId] = useState(null);
  return (
    <div className="min-h-screen p-4 sm:p-8">
      <header className="mx-auto mb-8 flex max-w-2xl items-center justify-between">
        <h1 className="text-3xl font-black">📖 Storybook Studio</h1>
        <HealthDot />
      </header>
      {bookId ? (
        <BookView bookId={bookId} onBack={() => setBookId(null)} />
      ) : (
        <CreateForm onCreated={setBookId} />
      )}
    </div>
  );
}
