import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

function CoverArt({ id, title }) {
  const [stage, setStage] = useState(0);
  if (stage === 0)
    return (
      <img
        src={api.coverUrl(id)}
        alt=""
        aria-hidden="true"
        className="aspect-[4/3] w-full object-cover"
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
        className="aspect-[4/3] w-full object-cover"
        loading="lazy"
        onError={() => setStage(2)}
      />
    );
  return (
    <span
      aria-hidden="true"
      className="flex aspect-[4/3] w-full items-center justify-center bg-stone-100 text-stone-300"
    >
      <Icon name="book" className="h-10 w-10" />
    </span>
  );
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
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-display text-2xl font-black">Library</h2>
        <span className="flex items-center gap-1.5 text-xs text-stone-500">
          <Icon name={data.storage === "r2" ? "cloud" : "clock"} className="h-3.5 w-3.5" />
          {data.storage === "r2" ? "backed by cloud storage" : "local only — add R2 keys for cloud backup"}
        </span>
      </div>
      {data.books.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-stone-200">
          <Icon name="book" className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-medium">No books yet</p>
          <p className="mt-1 text-sm text-stone-500">Create your first story to fill the shelf.</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {data.books.map((b) => {
          const meta = b.meta || {};
          return (
            <article
              key={b.id}
              aria-label={meta.hero ? `${meta.hero} — ${meta.theme}` : `Story ${b.id}`}
              className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition hover:shadow-md"
            >
              <div className="relative">
                {b.local ? (
                  <CoverArt id={b.id} />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-stone-100 text-stone-400"
                  >
                    <Icon name="cloud" className="h-8 w-8" />
                    <span className="text-xs">in cloud storage</span>
                  </span>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-stone-900/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                  {meta.chapters ? `${meta.chapters} chapters` : b.id.slice(0, 8)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="font-display text-lg font-bold leading-tight">
                  {meta.hero || "Untitled story"}
                </h3>
                {meta.theme && <p className="line-clamp-2 text-sm text-stone-500">{meta.theme}</p>}
                <div className="mt-auto flex items-center justify-between pt-3">
                  <span className="flex items-center gap-1 text-xs text-stone-500">
                    <Icon
                      name={b.local && b.remote ? "check" : b.remote ? "cloud" : "clock"}
                      className="h-3.5 w-3.5"
                    />
                    {b.local && b.remote ? "here + cloud" : b.local ? "this machine" : "cloud only"}
                  </span>
                  <button
                    onClick={() => open(b)}
                    disabled={fetching === b.id}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-50"
                  >
                    <Icon name="book" />
                    {fetching === b.id ? "Fetching…" : b.local ? "Open" : "Download"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
