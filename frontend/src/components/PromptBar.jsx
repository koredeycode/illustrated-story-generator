import { useEffect, useState } from "react";
import Icon from "./icons.jsx";

const QUICK = ["Make me a manga", "Surprise picture book"];
const PAGED = ["Redraw this page", "Rewrite shorter"];

/** Stitch-style glass composer. `variant`: "floating" (over canvas) or "hero" (landing).
 *  Input clears only on success; failures stay visible with the text preserved. */
export default function PromptBar({
  onSend,
  busy,
  selection,
  onClearSelection,
  variant = "floating",
  bookTypes = [],
  bookType,
  onBookType,
  draft,
  pendingPlan,
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const hero = variant === "hero";

  useEffect(() => {
    if (draft) setInput(draft);
  }, [draft]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setError("");
    try {
      await onSend(msg);
      setInput("");
    } catch (err) {
      setError(String((err && err.message) || err || "Couldn't reach the studio — try again."));
    }
  };

  const placeholder = pendingPlan
    ? "Ask for plan changes…"
    : hero
      ? "What book shall we illustrate?"
      : "What would you like to change or create?";

  return (
    <div className={hero ? "w-full" : "pointer-events-auto w-full max-w-2xl"}>
      <div className={`glass rounded-2xl ${hero ? "p-5" : "p-3"}`}>
        {selection && (
          <p className="px-1 pb-2 text-xs text-zinc-400">
            Talking about <strong className="text-zinc-100">page {selection.chapter_idx + 1}</strong> —{" "}
            <button className="underline hover:text-zinc-200" onClick={onClearSelection}>
              clear
            </button>
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            aria-label="Prompt the studio agent"
            className={`w-full bg-transparent outline-none placeholder:text-zinc-500 ${
              hero ? "text-lg text-zinc-100" : "px-1 text-sm text-zinc-100"
            }`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hero && bookTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Book type">
                {bookTypes.slice(0, 4).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onBookType && onBookType(t.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      bookType === t.id
                        ? "bg-violet-400 text-black"
                        : "bg-white/10 text-zinc-300 hover:bg-white/20"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-zinc-400 sm:flex">
              <Icon name="sparkles" className="h-3 w-3 text-accent" />
              local GPU
            </span>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send prompt"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-black transition hover:bg-white disabled:opacity-30"
            >
              <Icon name="arrowUp" className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
      {!hero && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {QUICK.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => send(chip)}
              disabled={busy}
              className="rounded-full border border-white/15 bg-black/50 px-2.5 py-0.5 text-xs text-zinc-300 backdrop-blur transition hover:border-accent/60 hover:text-white disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
          {PAGED.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => send(chip)}
              disabled={busy || !selection}
              title={selection ? `Applies to page ${selection.chapter_idx + 1}` : "Select a page on the canvas first"}
              className="rounded-full border border-white/15 bg-black/50 px-2.5 py-0.5 text-xs text-zinc-300 backdrop-blur transition hover:border-accent/60 hover:text-white disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
