import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Dark conversation log: messages, plan cards, approval box. Composer lives in PromptBar. */
export default function ChatPane({ projectId, project, selection, onChanged, onSuggest }) {
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  const messages = project?.messages || [];
  const pendingPlan = project?.pending_plan;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thinking]);

  useEffect(() => {
    if (!projectId) return;
    const es = new EventSource(api.projectEventsUrl(projectId));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "agent_thinking") {
          setThinking(true);
          return;
        }
        if (data.type === "snapshot") return;
        setThinking(false);
        api.getProject(projectId).then(onChanged).catch(() => {});
      } catch {
        /* keep-alive noise */
      }
    };
    es.onerror = () => {};
    return () => es.close();
  }, [projectId, onChanged]);

  const approve = async () => {
    if (!projectId || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.approvePlan(projectId, null);
      onChanged(await api.getProject(projectId));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-violet-400 text-black" : "border border-white/10 bg-white/5 text-zinc-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.selection != null && (
                <p className="mt-1 text-[11px] opacity-70">↳ page {m.selection + 1} selected</p>
              )}
              {m.plan && (
                <div className="mt-2 rounded-xl bg-black/40 p-3 ring-1 ring-white/10">
                  <p className="font-display font-bold text-white">{m.plan.title || m.plan.hero}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {m.plan.book_type} · {m.plan.chapters} chapters · {m.plan.art_style}
                  </p>
                  <p className="mt-1 text-xs text-zinc-300">{m.plan.theme}</p>
                  {(m.plan.beats || []).slice(0, 4).map((b, j) => (
                    <p key={j} className="mt-0.5 text-xs text-zinc-400">• {b}</p>
                  ))}
                  {(m.plan.beats || []).length > 4 && (
                    <p className="text-[11px] text-zinc-600">+{(m.plan.beats || []).length - 4} more beats…</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {pendingPlan && (
          <div className="rounded-2xl border border-violet-400/50 bg-violet-400/10 p-4" role="group" aria-label="Plan approval">
            <p className="flex items-center gap-1.5 text-sm font-bold text-violet-200">
              <Icon name="sparkles" className="h-4 w-4" /> Plan awaiting approval
            </p>
            <p className="mt-1 font-display text-lg font-black text-white">{pendingPlan.title || pendingPlan.hero}</p>
            <p className="text-sm text-zinc-300">{pendingPlan.theme}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={approve}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-bold text-black transition hover:bg-white disabled:opacity-50"
              >
                <Icon name="check" /> {busy ? "Starting…" : "Approve & generate"}
              </button>
              <button
                onClick={() => onSuggest && onSuggest(`Change the plan: ${pendingPlan.title || pendingPlan.hero} — `)}
                className="rounded-xl border border-white/20 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
              >
                Request changes
              </button>
            </div>
          </div>
        )}
        {thinking && (
          <div className="flex justify-start" aria-label="Agent is working">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-400">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-accent motion-safe:animate-pulse" />
              Agent working…
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        <div ref={bottomRef} />
      </div>
      {selection && (
        <p className="border-t border-white/10 px-4 py-2 text-xs text-zinc-500">
          Page {selection.chapter_idx + 1} selected — the prompt bar below talks about it.
        </p>
      )}
    </div>
  );
}
