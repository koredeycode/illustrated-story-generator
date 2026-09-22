import { useCallback, useEffect, useRef, useState } from "react";
import AgentManager from "./components/AgentManager.jsx";
import Canvas from "./components/Canvas.jsx";
import ChatPane from "./components/ChatPane.jsx";
import ExportBar from "./components/ExportBar.jsx";
import HealthDot from "./components/HealthDot.jsx";
import Icon from "./components/icons.jsx";
import Inspector from "./components/Inspector.jsx";
import Landing from "./components/Landing.jsx";
import PromptBar from "./components/PromptBar.jsx";
import ProjectsSidebar from "./components/ProjectsSidebar.jsx";
import { api } from "./api.js";
import "./index.css";

const RAIL = [
  { id: "inspector", label: "Inspector", icon: "sliders" },
  { id: "agent", label: "Agent", icon: "sparkles" },
  { id: "export", label: "Export", icon: "download" },
];

/** Stitch-style dark studio: topbar | chat sidebar + dotted canvas + icon rail. */
export default function App() {
  const [projectId, setProjectId] = useState(null);
  const [project, setProject] = useState(null);
  const [selection, setSelection] = useState(null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [rightPanel, setRightPanel] = useState("inspector");
  const [chatBusy, setChatBusy] = useState(false);
  const [shared, setShared] = useState(false);
  const [draft, setDraft] = useState("");
  const shareTimer = useRef(null);

  useEffect(() => () => {
    if (shareTimer.current) clearTimeout(shareTimer.current);
  }, []);

  // Deep-link: ?project=<id> opens a project directly (used by Share).
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("project");
      if (id) setProjectId(id);
    } catch {
      /* no URL API — ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      return;
    }
    try {
      setProject(await api.getProject(projectId));
    } catch {
      /* keep stale view */
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [projectId, refresh]);

  const select = (id) => {
    setProjectId(id);
    setSelection(null);
    setSidebarKey((k) => k + 1);
  };

  const onChanged = useCallback(
    async (maybeProject, clearSel) => {
      if (clearSel === true) {
        setSelection(null);
        return;
      }
      if (maybeProject && maybeProject.id) {
        setProject(maybeProject);
        setSidebarKey((k) => k + 1);
      } else {
        refresh();
      }
    },
    [refresh]
  );

  const sendChat = useCallback(
    async (message) => {
      if (!projectId || chatBusy) return;
      setChatBusy(true);
      try {
        await api.chat(projectId, message, selection?.chapter_idx ?? null);
        setDraft("");
        onChanged(await api.getProject(projectId));
      } catch (err) {
        try {
          onChanged(await api.getProject(projectId));
        } catch {
          /* refresh best-effort; the original error is what matters */
        }
        throw err;
      } finally {
        setChatBusy(false);
      }
    },
    [projectId, chatBusy, selection, onChanged]
  );

  const startProject = useCallback(
    async (message, bookType) => {
      const { id } = await api.createProject("", bookType || "picture");
      setProjectId(id);
      setSidebarKey((k) => k + 1);
      const p = await api.getProject(id);
      setProject(p);
      await api.chat(id, message, null);
      onChanged(await api.getProject(id));
    },
    [onChanged]
  );

  const share = async () => {
    try {
      const url = new URL(window.location.href);
      if (projectId) url.searchParams.set("project", projectId);
      await navigator.clipboard.writeText(url.toString());
      setShared(true);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShared(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!projectId) {
    return <Landing onStart={startProject} onOpen={select} />;
  }

  return (
    <div className="bg-dots flex min-h-screen flex-col overflow-hidden lg:h-screen">
      {/* top bar */}
      <header className="z-20 flex items-center gap-3 border-b border-white/10 bg-black/60 px-4 py-2 backdrop-blur">
        <button
          onClick={() => setProjectId(null)}
          aria-label="Home"
          className="flex items-center gap-2 rounded-lg px-1 py-1 transition hover:bg-white/10"
        >
          <Icon name="book" className="h-5 w-5 text-accent" />
          <span className="hidden font-display text-lg font-black text-white sm:inline">Studio</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-100">
            {project?.meta?.title || "Loading…"}
          </p>
          <p className="text-[11px] text-zinc-500">
            {project?.meta?.book_type || ""} · {(project?.versions || []).length} version
            {(project?.versions || []).length === 1 ? "" : "s"}
          </p>
        </div>
        <HealthDot />
        <button
          onClick={share}
          className="flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
        >
          <Icon name="share" className="h-3.5 w-3.5" /> {shared ? "Copied!" : "Share"}
        </button>
        <button
          onClick={() => setRightPanel(rightPanel === "export" ? null : "export")}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-white"
        >
          <Icon name="download" className="h-3.5 w-3.5" /> Export
        </button>
      </header>

      {/* body */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* left: projects + chat */}
        <aside className="flex max-h-[45vh] w-full shrink-0 flex-col gap-2 border-b border-white/10 bg-black/60 p-3 backdrop-blur lg:max-h-none lg:w-80 lg:border-b-0 lg:border-r">
          <ProjectsSidebar
            activeId={projectId}
            onSelect={select}
            refreshKey={sidebarKey}
            onNew={() => setProjectId(null)}
          />
          <div className="flex min-h-0 flex-1 rounded-2xl border border-white/10 bg-panel/80">
            <ChatPane
              projectId={projectId}
              project={project}
              selection={selection}
              onChanged={onChanged}
              onSuggest={setDraft}
            />
          </div>
        </aside>

        {/* center: canvas + floating prompt */}
        <main className="relative flex min-h-[70vh] min-w-0 flex-1 flex-col lg:min-h-0">
          <div className="min-h-0 flex-1 p-4">
            <Canvas project={project} selection={selection} onSelect={setSelection} onChanged={onChanged} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <PromptBar
              onSend={sendChat}
              busy={chatBusy}
              selection={selection}
              onClearSelection={() => setSelection(null)}
              draft={draft}
              pendingPlan={project?.pending_plan}
            />
          </div>
        </main>

        {/* right: toggle panel + icon rail */}
        <div className="flex shrink-0">
          {rightPanel && (
            <div className="max-h-[50vh] w-full shrink-0 overflow-y-auto border-t border-white/10 bg-black/60 p-3 backdrop-blur lg:max-h-none lg:w-72 lg:border-l lg:border-t-0">
              {rightPanel === "inspector" && <Inspector project={project} onChanged={onChanged} />}
              {rightPanel === "agent" && <AgentManager project={project} />}
              {rightPanel === "export" && <ExportBar project={project} onChanged={onChanged} />}
            </div>
          )}
          <nav aria-label="Panels" className="flex w-full shrink-0 flex-row items-center justify-center gap-1 border-t border-white/10 bg-black/60 py-2 backdrop-blur lg:w-12 lg:flex-col lg:border-l lg:border-t-0 lg:py-3">
            {RAIL.map((r) => (
              <button
                key={r.id}
                onClick={() => setRightPanel(rightPanel === r.id ? null : r.id)}
                aria-pressed={rightPanel === r.id}
                title={r.label}
                aria-label={r.label}
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${
                  rightPanel === r.id
                    ? "bg-violet-400 text-black"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon name={r.icon} className="h-4 w-4" />
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}
