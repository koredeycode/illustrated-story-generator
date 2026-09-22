import { useCallback, useEffect, useState } from "react";
import AgentManager from "./components/AgentManager.jsx";
import Canvas from "./components/Canvas.jsx";
import ChatPane from "./components/ChatPane.jsx";
import ExportBar from "./components/ExportBar.jsx";
import HealthDot from "./components/HealthDot.jsx";
import Icon from "./components/icons.jsx";
import Inspector from "./components/Inspector.jsx";
import ProjectsSidebar from "./components/ProjectsSidebar.jsx";
import { api } from "./api.js";
import "./index.css";

/** Stitch-style Studio: projects rail | chat + canvas | inspector rail. */
export default function App() {
  const [projectId, setProjectId] = useState(null);
  const [project, setProject] = useState(null);
  const [selection, setSelection] = useState(null);
  const [sidebarKey, setSidebarKey] = useState(0);
  const [rightTab, setRightTab] = useState("Inspector");

  const refresh = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      return;
    }
    try {
      setProject(await api.getProject(projectId));
    } catch {
      /* project may be on another machine; keep stale view */
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

  return (
    <div className="flex min-h-screen flex-col px-4 py-4 sm:px-6">
      <header className="mx-auto mb-4 flex w-full max-w-[1400px] flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-black tracking-tight">
            <Icon name="book" className="h-7 w-7 text-amber-700" />
            Storybook Studio
          </h1>
          <p className="mt-0.5 text-sm text-stone-500">Chat it. Watch it draw. Any illustrated book.</p>
        </div>
        <HealthDot />
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3 lg:flex-row">
        <ProjectsSidebar activeId={projectId} onSelect={select} refreshKey={sidebarKey} />

        <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col gap-3 xl:flex-row">
          <div className="flex min-h-[60vh] min-w-0 flex-1">
            <ChatPane projectId={projectId} project={project} selection={selection} onChanged={onChanged} />
          </div>
          <div className="flex min-h-[60vh] min-w-0 flex-1 flex-col gap-3">
            <Canvas project={project} selection={selection} onSelect={setSelection} onChanged={onChanged} />
            <ExportBar project={project} onChanged={onChanged} />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-72">
          <div role="tablist" aria-label="Right panel" className="flex gap-1">
            {["Inspector", "Agent"].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={rightTab === t}
                onClick={() => setRightTab(t)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  rightTab === t ? "bg-stone-900 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {rightTab === "Inspector" ? (
            <Inspector project={project} onChanged={onChanged} />
          ) : (
            <AgentManager project={project} />
          )}
        </div>
      </main>

      <footer className="mx-auto mt-6 w-full max-w-[1400px] text-center text-xs text-stone-400">
        Runs on free Kaggle GPU — supervised agent, every plan needs your approval. Finished work backs up to cloud storage when configured.
      </footer>
    </div>
  );
}
