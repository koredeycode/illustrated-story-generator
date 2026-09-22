import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

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
  const [dedication, setDedication] = useState("");
  const [loras, setLoras] = useState([]);
  const [lora, setLora] = useState("");
  const [quality, setQuality] = useState("balanced");
  const [approval, setApproval] = useState(false);
  const [step, setStep] = useState("setup");
  const [refs, setRefs] = useState(null);
  const [refSeed, setRefSeed] = useState(null);
  const [refBusy, setRefBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.styles().then(setStyles).catch(() => {});
    api
      .loras()
      .then((d) => setLoras(d.loras || []))
      .catch(() => {});
  }, []);

  const findHero = async () => {
    setRefBusy(true);
    setError("");
    try {
      const r = await api.referenceOptions({
        hero_desc: heroDesc,
        art_style: artStyle,
        seed: 42,
      });
      setRefs(r);
      setRefSeed(r.options[0]?.seed ?? null);
      setStep("hero");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setRefBusy(false);
    }
  };

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
        dedication,
        lora,
        quality,
        approval,
        ref_token: refs?.token || "",
        ref_seed: refSeed,
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
      <ol aria-label="Creation steps" className="mt-4 flex items-center gap-2 text-xs font-medium">
        <li aria-current={step === "setup" ? "step" : undefined} className="flex items-center gap-1.5">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full ${step === "setup" ? "bg-amber-700 text-white" : "bg-stone-200 text-stone-600"}`}>1</span>
          Story
        </li>
        <li aria-hidden="true" className="h-px flex-1 bg-stone-200" />
        <li aria-current={step === "hero" ? "step" : undefined} className="flex items-center gap-1.5">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full ${step === "hero" ? "bg-amber-700 text-white" : "bg-stone-200 text-stone-600"}`}>2</span>
          Hero look
        </li>
      </ol>

      {step === "setup" ? (
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Style LoRA (optional)</span>
              <select
                className={fieldInput}
                value={lora}
                onChange={(e) => setLora(e.target.value)}
              >
                <option value="">None — prompt style only</option>
                {loras.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Render quality</span>
            <select
              className={fieldInput}
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
            >
              <option value="draft">Draft — fast, rough (~1 min/chapter)</option>
              <option value="balanced">Balanced — recommended (~2 min/chapter)</option>
              <option value="best">Best — slow, prettiest (~4 min/chapter)</option>
            </select>
          </label>
          <details className="rounded-xl border border-stone-200 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Add a dedication
            </summary>
            <input
              className={`${fieldInput} mt-2`}
              value={dedication}
              maxLength={120}
              onChange={(e) => setDedication(e.target.value)}
              placeholder="For Ada, love Dad"
            />
          </details>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={approval}
              onChange={(e) => setApproval(e.target.checked)}
            />
            <span>
              Approve each scene before the full render
              <span className="block text-xs text-stone-500">
                Shows a fast preview per chapter. Slower, but no GPU wasted on duds.
              </span>
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={findHero}
              disabled={refBusy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-700 px-4 py-3 font-bold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
            >
              <Icon name="sparkles" />
              {refBusy ? "Drawing looks…" : "Pick my hero's look"}
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-amber-800 focus-visible:outline-amber-900 disabled:opacity-50"
            >
              {busy ? "Starting…" : "Surprise me — generate"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-stone-600">
            Pick the keeper — this face locks in for the whole book:
          </p>
          <div role="radiogroup" aria-label="Hero look" className="grid grid-cols-3 gap-3">
            {refs.options.map((o) => (
              <label
                key={o.seed}
                className={`cursor-pointer overflow-hidden rounded-xl ring-2 transition ${
                  refSeed === o.seed ? "ring-amber-700" : "ring-transparent hover:ring-stone-300"
                }`}
              >
                <input
                  type="radio"
                  name="hero-look"
                  className="sr-only"
                  checked={refSeed === o.seed}
                  onChange={() => setRefSeed(o.seed)}
                />
                <img src={o.url} alt={`Hero look option ${o.seed}`} className="aspect-square w-full object-cover" />
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setStep("setup")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-4 py-3 font-bold text-stone-700 transition hover:bg-stone-100"
            >
              <Icon name="arrowLeft" /> Back
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-50"
            >
              <Icon name="sparkles" />
              {busy ? "Starting…" : "Generate with this hero"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
