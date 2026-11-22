// Network work that a content script is not allowed to do cross-origin.

const NTFY = "https://ntfy.sh/";
const ROOMS = "https://party.krillion.io/rooms";

async function publish(topic, payload) {
  const res = await fetch(NTFY + encodeURIComponent(topic), {
    method: "POST",
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  return { ok: res.ok, status: res.status };
}

async function rooms(pages = 2) {
  const out = new Map();
  let cursor = null;
  for (let i = 0; i < pages; i++) {
    const url = cursor ? `${ROOMS}?cursor=${encodeURIComponent(cursor)}` : ROOMS;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) break;
    const data = await res.json();
    for (const r of data.rooms || []) out.set(r.code, r);
    cursor = data.nextCursor || null;
    if (!cursor) break;
  }
  return [...out.values()];
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "publish") {
    publish(msg.topic, msg.payload).then(reply).catch(e => reply({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "rooms") {
    rooms(msg.pages || 2).then(r => reply({ ok: true, rooms: r }))
      .catch(e => reply({ ok: false, error: String(e), rooms: [] }));
    return true;
  }
});
