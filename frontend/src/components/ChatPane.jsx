import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import Icon from "./icons.jsx";

/** Stitch-style chat: messages, plan approval cards, composer with page selection. */
export default function ChatPane({ projectId, project, selection, onChanged }) {
  const [input, setInput] = useState("");
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
        if (data.type === "snapshot") return; // initial state; already have it
        // Any other project event (message, plan, approval_request, canvas,
        // book, book:*, version, bible, critic) may change visible state.
        setThinking(false);
        api.getProject(projectId).then(onChanged).catch(() => {});
      } catch {
        /* keep-alive or snapshot noise */
      }
    };
    es.onerror = () => {};
    return () => es.close();
  }, [projectId, onChanged]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy || !projectId) return;
    setBusy(true);
    setError("");
    setInput("");
    setThinking(true);
    try {
      await api.chat(projectId, msg, selection?.chapter_idx ?? null);
      onChanged(await api.getProject(projectId));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
      setThinking(false);
    }
  };

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

  if (!projectId)
    return (
      <div className="flex flex-1 items-center justify-center rounded-2xl bg-white p-8 text-center ring-1 ring-stone-200">
        <div>
          <Icon name="book" className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 font-medium">Pick a project — or start one</p>
          <p className="mt-1 text-sm text-stone-500">Describe any illustrated book and the agent drafts a plan.</p>
        </div>
      </div>
    );

  return (
    <section aria-label="Studio chat" className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white ring-1 ring-stone-200">
      <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-800"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.selection != null && (
                <p className="mt-1 text-[11px] opacity-70">↳ page {m.selection + 1} selected</p>
              )}
              {m.plan && (
                <div className="mt-2 rounded-xl bg-white p-3 text-stone-800 ring-1 ring-stone-200">
                  <p className="font-display font-bold">{m.plan.title || m.plan.hero}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {m.plan.book_type} · {m.plan.chapters} chapters · {m.plan.art_style}
                  </p>
                  <p className="mt-1 text-xs">{m.plan.theme}</p>
                  {(m.plan.beats || []).slice(0, 4).map((b, j) => (
                    <p key={j} className="mt-0.5 text-xs text-stone-600">• {b}</p>
                  ))}
                  {(m.plan.beats || []).length > 4 && (
                    <p className="text-[11px] text-stone-400">+{(m.plan.beats || []).length - 4} more beats…</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {pendingPlan && (
          <div className="rounded-2xl border-2 border-amber-600/60 bg-amber-50 p-4" role="group" aria-label="Plan approval">
            <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
              <Icon name="sparkles" className="h-4 w-4" /> Plan awaiting approval
            </p>
            <p className="mt-1 font-display text-lg font-black">{pendingPlan.title || pendingPlan.hero}</p>
            <p className="text-sm text-stone-600">{pendingPlan.theme}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={approve}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800 disabled:opacity-50"
              >
                <Icon name="check" /> {busy ? "Starting…" : "Approve & generate"}
              </button>
              <button
                onClick={() => send(`Change the plan: ${pendingPlan.title} — `)}
                className="rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-600 hover:bg-white"
              >
                Request changes
              </button>
            </div>
          </div>
        )}
        {thinking && (
          <div className="flex justify-start" aria-label="Agent is working">
            <div className="flex items-center gap-2 rounded-2xl bg-stone-100 px-3 py-2 text-sm text-stone-500">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-amber-600 motion-safe:animate-pulse" />
              Agent working…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {selection && (
        <p className="border-t border-stone-100 px-4 pt-2 text-xs text-stone-500">
          Talking about <strong>page {selection.chapter_idx + 1}</strong> —{" "}
          <button className="underline" onClick={() => onChanged(project, true)}>
            clear
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="px-4 text-xs text-red-700">
          {error}
        </p>
      )}
      <form
        className="flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pendingPlan ? "Ask for plan changes…" : "Describe a book, rewrite, or redraw…"}
          aria-label="Chat with the studio agent"
          className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-stone-400 focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/30"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-700 disabled:opacity-40"
        >
          Send
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        {["Make me a manga", "Surprise picture book"].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => send(chip)}
            disabled={busy}
            className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-600 hover:border-amber-700 hover:text-amber-900 disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
        {["Redraw this page", "Rewrite shorter"].map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => send(chip)}
            disabled={busy || !selection}
            title={selection ? `Applies to page ${selection.chapter_idx + 1}` : "Select a page in the Storyboard tab first"}
            className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-600 hover:border-amber-700 hover:text-amber-900 disabled:opacity-40"
          >
            {chip}
          </button>
        ))}
      </div>
    </section>
  );
}
