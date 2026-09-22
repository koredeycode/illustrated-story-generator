import Icon from "./icons.jsx";

/** M5 Agent manager: plan status, per-page job states, queue — supervised autonomy at a glance. */
export default function AgentManager({ project }) {
  const book = project?.active;
  const chapters = book?.chapters || [];
  const done = chapters.filter((c) => c.status === "done").length;
  const audio = book?.audio || { status: "idle" };

  if (!project)
    return (
      <div className="rounded-2xl bg-white p-4 text-xs text-stone-500 ring-1 ring-stone-200">
        Agent idle — no project selected.
      </div>
    );

  const rows = chapters.map((c) => (
    <li key={c.idx} className="flex items-center justify-between gap-2 py-0.5">
      <span className="truncate">Page {c.idx + 1}</span>
      <span
        className={`rounded-full px-2 py-px text-[11px] font-medium ${
          c.status === "done"
            ? "bg-green-100 text-green-900"
            : c.status === "preview"
              ? "bg-sky-100 text-sky-900"
              : c.status === "queued"
                ? "bg-stone-200 text-stone-600"
                : String(c.status).startsWith("error")
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-900"
        }`}
      >
        {c.status === "done" && c.match ? `${c.match} match` : c.status}
      </span>
    </li>
  ));

  return (
    <section aria-label="Agent manager" className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h3 className="flex items-center gap-1.5 text-sm font-bold">
        <Icon name="sparkles" className="h-4 w-4 text-amber-700" /> Agent
      </h3>
      <dl className="mt-2 space-y-1 text-xs text-stone-600">
        <div className="flex justify-between">
          <dt>Plan</dt>
          <dd className="font-medium text-stone-800">
            {project.pending_plan ? "awaiting approval" : book ? "approved" : "none yet"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Book</dt>
          <dd className="font-medium text-stone-800">
            {book ? `${book.status} · ${done}/${chapters.length}` : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>Audiobook</dt>
          <dd className="font-medium text-stone-800">{audio.status}</dd>
        </div>
        {book?.timings?.total_s != null && (
          <div className="flex justify-between">
            <dt>Total GPU</dt>
            <dd className="font-medium text-stone-800">{book.timings.total_s}s</dd>
          </div>
        )}
      </dl>
      {chapters.length > 0 && <ul className="mt-2 border-t border-stone-100 pt-2 text-xs">{rows}</ul>}
      {(project.versions || []).length > 1 && (
        <p className="mt-2 text-[11px] text-stone-400">{project.versions.length} versions in this project</p>
      )}
    </section>
  );
}
