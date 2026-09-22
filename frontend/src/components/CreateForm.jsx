import { useEffect, useState } from "react";
import { api } from "../api.js";

const fieldInput =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-ink shadow-sm " +
  "placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/30";

export default function CreateForm({ onCreated }) {
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

  return (
    <form
      onSubmit={submit}
      aria-labelledby="create-heading"
      className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8"
    >
      <h2 id="create-heading" className="font-display text-2xl font-black">
        Start a new storybook
      </h2>
      <p className="mt-1 text-sm text-stone-500">
        About two minutes of GPU per chapter. Keep the tab open while it draws.
      </p>
      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Story idea / theme</span>
          <input
            className={fieldInput}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            required
          />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Hero name</span>
            <input
              className={fieldInput}
              value={hero}
              onChange={(e) => setHero(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Chapters (1–10)</span>
            <input
              className={fieldInput}
              type="number"
              min="1"
              max="10"
              value={chapters}
              onChange={(e) => setChapters(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            What does the hero look like?
          </span>
          <input
            className={fieldInput}
            value={heroDesc}
            onChange={(e) => setHeroDesc(e.target.value)}
            aria-describedby="hero-desc-hint"
            placeholder="e.g. a small robot with a round orange head"
          />
          <span id="hero-desc-hint" className="mt-1 block text-xs text-stone-500">
            This description is locked onto every illustration to keep the hero
            consistent.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Art style</span>
          <select
            className={fieldInput}
            value={artStyle}
            onChange={(e) => setArtStyle(e.target.value)}
          >
            {styles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="w-full rounded-xl bg-amber-700 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-amber-900 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Generate storybook"}
        </button>
      </div>
    </form>
  );
}
