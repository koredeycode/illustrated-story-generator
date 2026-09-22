import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

function CoverThumb({ id }) {
  const [stage, setStage] = useState(0);
  if (stage === 0)
    return (
      <img
        src={api.coverUrl(id)}
        alt=""
        aria-hidden="true"
        className="h-12 w-16 rounded-lg object-cover"
        loading="lazy"
        onError={() => setStage(1)}
      />
    );
  if (stage === 1)
    return (
      <img
        src={api.imageUrl(id, 0)}
        alt=""
        aria-hidden="true"
        className="h-12 w-16 rounded-lg object-cover"
        loading="lazy"
        onError={() => setStage(2)}
      />
    );
  return null;
}

export default function Gallery({ onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api.listBooks());
    } catch (err) {
      setError(String(err.message || err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (b) => {
    if (!b.local && b.remote) {
      setFetching(b.id);
      setError("");
      try {
        await api.fetchBook(b.id);
      } catch (err) {
        setError(String(err.message || err));
        setFetching("");
        return;
      }
      setFetching("");
    }
    onOpen(b.id);
  };

  if (error)
    return (
      <p role="alert" className="mx-auto max-w-2xl text-red-700">
        {error}
      </p>
    );
  if (!data) return <p className="mx-auto max-w-2xl text-stone-500">Loading library…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-black">Library</h2>
        <span className="text-xs text-stone-500">
          {data.storage === "r2" ? "backed by cloud storage" : "local only — add R2 keys for cloud backup"}
        </span>
      </div>
      {data.books.length === 0 && (
        <p className="rounded-2xl bg-white p-6 text-center text-stone-500 shadow-sm ring-1 ring-stone-200">
          No books yet. Create your first story!
        </p>
      )}
      {data.books.map((b) => (
        <div
          key={b.id}
          className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200"
        >
          <div className="flex items-center gap-3">
            {b.local ? (
              <CoverThumb id={b.id} />
            ) : (
              <span aria-hidden="true" className="flex h-12 w-16 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
                <Icon name="cloud" className="h-6 w-6" />
              </span>
            )}
            <div>
              <p className="font-mono text-sm font-bold">{b.id}</p>
              <p className="text-xs text-stone-500">
                {b.local && b.remote ? "on this machine + cloud" : b.local ? "on this machine" : "cloud only"}
              </p>
            </div>
          </div>
          <button
            onClick={() => open(b)}
            disabled={fetching === b.id}
            className="rounded-xl bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-50"
          >
            {fetching === b.id ? "Fetching…" : b.local ? "Open" : "Download & open"}
          </button>
        </div>
      ))}
    </div>
  );
}
