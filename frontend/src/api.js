async function req(path, opts) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

export const api = {
  health: () => fetch("/api/health").then((r) => r.json()),
  styles: () => req("/api/styles"),
  createStory: (spec) =>
    req("/api/story", { method: "POST", body: JSON.stringify(spec) }),
  getStory: (id) => req(`/api/story/${id}`),
  regenerate: (id, chapter_idx) =>
    req(`/api/story/${id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ chapter_idx }),
    }),
  eventsUrl: (id) => `/api/story/${id}/events`,
  exportUrl: (id, format = "html") => `/api/story/${id}/export?format=${format}`,
  imageUrl: (id, idx) => `/books/${id}/ch${idx}.png`,
};
