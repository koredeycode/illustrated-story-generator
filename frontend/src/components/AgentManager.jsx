import Icon from "./icons.jsx";

/** Dark agent manager: plan status, per-page job states, queue. */
export default function AgentManager({ project }) {
  const book = project?.active;
  const chapters = book?.chapters || [];
  const done = chapters.filter((c) => c.status === "done").length;
  const audio = book?.audio || { status: "idle" };

  if (!project)
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-500">
        Agent idle — no project selected.
      </div>
    );

  const rows = chapters.map((c) => (
    <li key={c.idx} className="flex items-center justify-between gap-2 py-0.5">
      <span className="truncate text-zinc-300">Page {c.idx + 1}</span>
      <span
        className={`rounded-full px-2 py-px text-[11px] font-medium ${
          c.status === "done"
            ? "bg-green-400/15 text-green-300"
            : c.status === "preview"
              ? "bg-sky-400/15 text-sky-300"
              : c.status === "queued"
                ? "bg-white/10 text-zinc-500"
                : String(c.status).startsWith("error")
                  ? "bg-red-400/15 text-red-300"
                  : "bg-amber-400/15 text-amber-300"
        }`}
      >
        {c.status === "done" && c.match ? `${c.match} match` : c.status}
      </span>
    </li>
  ));

  return (
    <section aria-label="Agent manager" className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-white">
        <Icon name="sparkles" className="h-4 w-4 text-accent" /> Agent
      </h3>
      <dl className="mt-2 space-y-1 text-xs text-zinc-500">
        <div className="flex justify-between">
          <dt>Plan</dt>
          <dd className="font-medium text-zinc-200">
            {project.pending_plan ? "awaiting approval" : book ? "approved" : "none yet"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Book</dt>
          <dd className="font-medium text-zinc-200">
            {book ? `${book.status} · ${done}/${chapters.length}` : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Audiobook</dt>
          <dd className="font-medium text-zinc-200">{audio.status}</dd>
        </div>
        {book?.timings?.total_s != null && (
          <div className="flex justify-between">
            <dt>Total GPU</dt>
            <dd className="font-medium text-zinc-200">{book.timings.total_s}s</dd>
          </div>
        )}
      </dl>
      {chapters.length > 0 && <ul className="mt-2 border-t border-white/10 pt-2 text-xs">{rows}</ul>}
      {(project.versions || []).length > 1 && (
        <p className="mt-2 text-[11px] text-zinc-600">{project.versions.length} versions in this project</p>
      )}
    </section>
  );
}
