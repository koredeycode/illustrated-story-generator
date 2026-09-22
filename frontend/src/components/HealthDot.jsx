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
    s === "ok" ? "bg-green-600" : s === "down" ? "bg-red-600" : "bg-amber-500";
  if (!health)
    return (
      <span role="status" className="text-sm text-stone-500">
        Checking GPU…
      </span>
    );
  return (
    <div role="status" aria-label="Service status" className="flex gap-3 text-sm text-stone-600">
      {["backend", "ollama", "forge"].map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full ${dot(health[k])}`}
          />
          {k}
          <span className="sr-only">{health[k] ?? "unknown"}</span>
        </span>
      ))}
    </div>
  );
}
