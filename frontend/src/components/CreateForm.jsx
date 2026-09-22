import { useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";
import SuggestRow from "./SuggestRow.jsx";

const fieldInput =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-ink shadow-sm " +
  "placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/30";

const THEME_IDEAS = [
  "a little robot who is afraid of the dark",
  "a cat who sails the seven seas",
  "a girl who befriends a grumpy dragon",
  "a boy whose drawings come alive at night",
];

const LOOK_IDEAS = [
  "a small robot with a round orange head",
  "a fluffy orange cat with a sailor hat",
  "a green dragon with tiny round glasses",
];

const QUALITY_MINUTES = { draft: 1, balanced: 2, best: 4 };
const QUALITY_LABELS = {
  draft: "Draft — fast, rough",
  balanced: "Balanced — recommended",
  best: "Best — slow, prettiest",
};

const STEPS = ["Story", "Hero", "Style", "Details", "Look"];

export default function CreateForm({ onCreated }) {
  const [step, setStep] = useState(0);
  const [theme, setTheme] = useState(THEME_IDEAS[0]);
  const [hero, setHero] = useState("Bolt");
  const [heroDesc, setHeroDesc] = useState(LOOK_IDEAS[0]);
  const [chapters, setChapters] = useState(5);
  const [artStyle, setArtStyle] = useState("watercolor");
  const [styles, setStyles] = useState(["watercolor"]);
  const [dedication, setDedication] = useState("");
  const [loras, setLoras] = useState([]);
  const [lora, setLora] = useState("");
  const [quality, setQuality] = useState("balanced");
  const [approval, setApproval] = useState(false);
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

  const minutes = chapters * (QUALITY_MINUTES[quality] ?? 2) + 1;

  const canNext = () => {
    if (step === 0) return theme.trim().length >= 3;
    if (step === 1) return hero.trim().length >= 1;
    return true;
  };

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
      setStep(4);
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

      <ol aria-label="Creation steps" className="mt-4 flex items-center gap-1 text-xs font-medium">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-1 last:flex-none">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 disabled:cursor-default"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  i === step
                    ? "bg-amber-700 text-white"
                    : i < step
                      ? "bg-amber-100 text-amber-900"
                      : "bg-stone-200 text-stone-600"
                }`}
              >
                {i < step ? <Icon name="check" className="h-3 w-3" /> : i + 1}
              </span>
              <span className={i === step ? "text-ink" : "hidden text-stone-500 sm:inline"}>
                {label}
              </span>
            </button>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="h-px flex-1 bg-stone-200" />}
          </li>
        ))}
      </ol>

      <div className="mt-6">
        {step === 0 && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-base font-medium">
                What's the story about?
              </span>
              <textarea
                className={`${fieldInput} min-h-24`}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                required
                minLength={3}
                placeholder="A little robot who is afraid of the dark…"
              />
            </label>
            <SuggestRow kind="theme" context={{}} onPick={setTheme} label="Or start from an AI idea:" />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-base font-medium">Who's the hero?</span>
              <input
                className={`${fieldInput} font-display text-lg font-bold`}
                value={hero}
                onChange={(e) => setHero(e.target.value)}
                required
                placeholder="Bolt"
              />
              <span className="mt-2 block">
                <SuggestRow kind="hero" context={{ theme }} onPick={setHero} label="Need a name?" />
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">
                What do they look like?
              </span>
              <input
                className={fieldInput}
                value={heroDesc}
                onChange={(e) => setHeroDesc(e.target.value)}
                aria-describedby="hero-desc-hint"
                placeholder="a small robot with a round orange head"
              />
              <span id="hero-desc-hint" className="mt-1 block text-xs text-stone-500">
                This locks onto every illustration — be specific about shape and color.
              </span>
              <span className="mt-2 block">
                <SuggestRow kind="look" context={{ hero, theme }} onPick={setHeroDesc} label="Describe it for me:" />
              </span>
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-base font-medium">Pick an art style</span>
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
              <span className="mt-1 block text-xs text-stone-500">
                A real style model beats a prompt suffix. {loras.length === 0 && "None installed — ask in the notebook."}
              </span>
            </label>
            <fieldset>
              <legend className="mb-2 text-base font-medium">Render quality</legend>
              <div className="space-y-2">
                {Object.entries(QUALITY_LABELS).map(([value, label]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition ${
                      quality === value
                        ? "border-amber-700 bg-amber-50"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="quality"
                      value={value}
                      checked={quality === value}
                      onChange={() => setQuality(value)}
                      className="accent-amber-700"
                    />
                    <span className="text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="block text-xs text-stone-500">
                        ≈ {chapters * QUALITY_MINUTES[value]} min for {chapters} chapters
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-base font-medium">How many chapters?</span>
              <input
                className={fieldInput}
                type="number"
                min="1"
                max="10"
                value={chapters}
                onChange={(e) => setChapters(e.target.value)}
              />
            </label>
            <details className="rounded-xl border border-stone-200 px-3 py-2" open={dedication !== ""}>
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
              <span className="mt-2 block">
                <SuggestRow kind="dedication" context={{ hero }} onPick={setDedication} label="Word it for me:" />
              </span>
            </details>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-amber-700"
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
            <div className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600">
              <Icon name="clock" />
              Estimated GPU time: ≈ {minutes} minutes
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-stone-600">
              <span className="font-display text-base font-bold text-ink">{hero}</span> — pick
              the face that leads the whole book:
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
            <div className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
              <span className="font-medium text-ink">Summary:</span> {chapters} chapters ·{" "}
              {artStyle}
              {lora && ` + ${lora}`} · {QUALITY_LABELS[quality].split(" — ")[0].toLowerCase()} ·{" "}
              ≈ {minutes} min GPU{dedication && <> · “{dedication}”</>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-4 py-3 font-bold text-stone-700 transition hover:bg-stone-100 sm:flex-none sm:px-6"
          >
            <Icon name="arrowLeft" /> Back
          </button>
        )}
        {step < 3 && (
          <button
            type="button"
            onClick={() => canNext() && setStep(step + 1)}
            disabled={!canNext()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-3 font-bold text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            Continue <Icon name="arrowRight" />
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            onClick={findHero}
            disabled={refBusy || !canNext()}
            aria-busy={refBusy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-3 font-bold text-white transition hover:bg-stone-700 disabled:opacity-40"
          >
            <Icon name="sparkles" />
            {refBusy ? "Drawing looks…" : "Meet your hero"}
          </button>
        )}
        {step === 4 && (
          <button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-3 font-bold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-50"
          >
            <Icon name="book" />
            {busy ? "Starting…" : "Generate my book"}
          </button>
        )}
      </div>
      {step === 4 && (
        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full text-center text-xs text-stone-500 hover:underline disabled:opacity-50"
        >
          or skip the picker — surprise me
        </button>
      )}
    </form>
  );
}
