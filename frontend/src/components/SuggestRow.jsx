import { useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** AI suggestion chips for a wizard field. */
export default function SuggestRow({ kind, context, onPick, label }) {
  const [ideas, setIdeas] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.suggest(kind, context);
      setIdeas(r.suggestions || []);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs text-stone-500">{label || "Need inspiration?"}</p>
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="flex items-center gap-1 rounded-full border border-amber-700/40 px-2.5 py-0.5 text-xs font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
        >
          <Icon name="sparkles" className="h-3 w-3" />
          {busy ? "Dreaming…" : ideas.length ? "More ideas" : "Suggest ideas"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {ideas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ideas.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => onPick(idea)}
              className="rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 transition hover:border-amber-700 hover:bg-amber-50 hover:text-amber-900"
            >
              {idea}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
