function unreachable(status) {
  return (
    `Couldn't reach the GPU server` +
    (status ? ` (tunnel error ${status})` : ``) +
    ` — the backend may be restarting. Wait a few seconds and retry.`
  );
}

async function req(path, opts) {
  let r;
  try {
    r = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    throw new Error(unreachable());
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    const isHtml =
      (r.headers.get("content-type") || "").includes("text/html") ||
      /^\s*<!doctype html/i.test(body) ||
      /^\s*<html/i.test(body);
    if (isHtml) throw new Error(unreachable(r.status));
    throw new Error(`${r.status}: ${body.slice(0, 200)}`);
  }
  try {
    return await r.json();
  } catch {
    throw new Error(unreachable(r.status));
  }
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
  previewUrl: (id, idx) => `/books/${id}/pv${idx}.png`,
  coverUrl: (id) => `/books/${id}/cover.png`,
  audioFileUrl: (id) => `/books/${id}/audiobook.mp4`,
  listBooks: () => req("/api/books"),
  fetchBook: (id) => req(`/api/books/${id}/fetch`, { method: "POST" }),
  referenceOptions: (spec) =>
    req("/api/reference", { method: "POST", body: JSON.stringify(spec) }),
  loras: () => req("/api/loras"),
  previewChapter: (id, chapter_idx, seed) =>
    req(`/api/story/${id}/preview`, {
      method: "POST",
      body: JSON.stringify({ chapter_idx, seed }),
    }),
  approveChapter: (id, chapter_idx) =>
    req(`/api/story/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ chapter_idx }),
    }),
  makeCover: (id, layout) =>
    req(`/api/story/${id}/cover`, {
      method: "POST",
      body: JSON.stringify({ layout: layout || "banner" }),
    }),
  startAudiobook: (id) => req(`/api/story/${id}/audiobook`, { method: "POST" }),
};
