import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function HealthDot() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth({ backend: "down" }));
    return () => (alive = false);
  }, []);
  const dot = (s) =>
    s === "ok" ? "bg-green-400" : s === "down" ? "bg-red-400" : "bg-amber-400";
  if (!health)
    return (
      <span role="status" className="text-xs text-zinc-500">
        Checking GPU…
      </span>
    );
  return (
    <div role="status" aria-label="Service status" className="flex items-center gap-2.5 text-xs text-zinc-400">
      {["backend", "ollama", "forge"].map((k) => (
        <span key={k} title={`${k}: ${health[k] ?? "unknown"}`} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${dot(health[k])}`} />
          {k}
          <span className="sr-only">{health[k] ?? "unknown"}</span>
        </span>
      ))}
    </div>
  );
}
