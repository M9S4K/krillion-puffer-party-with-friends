/* Krillion Party Joiner - everything lives in one panel on the page. */

(() => {
  "use strict";
  if (window.__kpjLoaded) return;
  window.__kpjLoaded = true;

  const DEFAULTS = { enabled: true, party: "", follow: true, autoSeat: true, size: "any", open: false };
  const ROOM_RE = /^\/party\/([A-Za-z]{4})\/?$/;
  const ECHO_MS = 25000;
  const SEAT_TIMEOUT_MS = 15000;
  // ntfy.sh allows ~250 messages a day per IP, so presence is event-driven
  const HEARTBEAT_MS = 10 * 60000;      // keepalive, not a pulse
  const PEER_STALE_MS = 26 * 60000;     // two missed keepalives
  const REPLY_THROTTLE_MS = 60000;

  let cfg = { ...DEFAULTS };
  let clientId = "";
  let ws = null, wsState = "off", reconnectAt = 0, reconnectDelay = 1000;
  let lastBroadcast = { code: null, at: 0 };
  let lastHandled = { code: null, at: 0 };
  let lastPath = location.pathname;
  let peers = new Map();            // id -> { name, room, at }
  let seenRows = new Set();         // rows already on screen, so only new ones animate
  let lastSig = "";                 // what we last told the party
  let lastSentAt = 0;
  let throttledUntil = 0;           // set when the relay says we are over quota
  let el = {};

  const now = () => Date.now();

  /* ---------- event log ---------- */
  // a small ring buffer, kept across reloads, copied out on demand
  const LOG_MAX = 250;
  let LOG = [];

  function log(event, detail) {
    LOG.push({ t: new Date().toISOString().slice(11, 23), e: event, d: detail ?? "" });
    if (LOG.length > LOG_MAX) LOG = LOG.slice(-LOG_MAX);
    try { chrome.storage?.local?.set({ kpjLog: LOG.slice(-LOG_MAX) }); } catch {}
  }

  const maskParty = p => !p ? "(unset)" : `${p.slice(0, 2)}…${p.length} chars`;

  function logReport() {
    const v = chrome.runtime?.getManifest?.()?.version ?? "?";
    const head = [
      `Krillion Party Joiner ${v} - diagnostic log`,
      `when      ${new Date().toISOString()}`,
      `browser   ${navigator.userAgent}`,
      `page      ${location.pathname}`,
      `party     ${maskParty(cfg.party)}`,
      `settings  follow=${cfg.follow} autoSeat=${cfg.autoSeat} size=${cfg.size}`,
      `relay     ws=${wsState}${now() < throttledUntil ? ` throttled ${Math.ceil((throttledUntil - now()) / 60000)}m` : ""}`,
      `peers     ${livePeers().length} live, ${peers.size} known`,
      "",
    ].join("\n");
    return head + LOG.map(r => `${r.t}  ${r.e}${r.d ? "  " + JSON.stringify(r.d) : ""}`).join("\n");
  }

  async function copyLog() {
    const text = logReport();
    try { await navigator.clipboard.writeText(text); toast("Log copied - paste it to whoever is debugging.", 6000); }
    catch { console.log(text); toast("Clipboard blocked - the log is in the console (F12).", 8000); }
  }
  const topicFor = p => "kpj-" + String(p).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const roomCode = (path = location.pathname) => {
    const m = ROOM_RE.exec(path);
    return m ? m[1].toUpperCase() : null;
  };
  const myName = () => {
    const box = [...document.querySelectorAll("input")]
      .find(i => i.maxLength === 16 || /calls you/i.test(i.placeholder || ""));
    return (box?.value || localStorage.getItem("party-name") || "").trim();
  };
  const livePeers = () => [...peers.values()].filter(p => now() - p.at < PEER_STALE_MS);
  const send = (type, payload) => new Promise(res => {
    try {
      if (!chrome.runtime?.id) return res({ ok: false, dead: true });   // extension reloaded under us
      chrome.runtime.sendMessage({ type, ...payload }, r => {
        if (chrome.runtime.lastError) return res({ ok: false, dead: true });
        res(r || { ok: false });
      });
    } catch { res({ ok: false, dead: true }); }
  });

  // ntfy allows cross-origin posts, so the page can publish even with no worker behind it
  async function publishDirect(topic, payload) {
    try {
      const r = await fetch("https://ntfy.sh/" + encodeURIComponent(topic), {
        method: "POST", body: JSON.stringify(payload), cache: "no-store"
      });
      return { ok: r.ok, status: r.status };
    } catch { return { ok: false }; }
  }

  /* ---------- panel ---------- */

  function build() {
    const root = document.createElement("div");
    root.id = "kpj";
    root.innerHTML = `
      <button id="kpj-pill" aria-label="Open party joiner"><i class="kpj-dot"></i><span id="kpj-pill-txt">Party</span></button>
      <div id="kpj-stack">
      <div id="kpj-panel">
        <div id="kpj-top">
          <div id="kpj-id">
            <div id="kpj-kicker-row"><span id="kpj-kicker">Party</span><button id="kpj-info" aria-label="About the party name" aria-describedby="kpj-tip"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.6" stroke-linecap="round"/><path d="M8 4.8v.5" stroke-linecap="round"/></svg></button><span id="kpj-tip" role="tooltip">Both of you type the same party name. Only room codes travel.</span></div>
            <input id="kpj-name-input" type="text" spellcheck="false" autocomplete="off"
                   aria-label="Party name" placeholder="name your party">
          </div>
          <button id="kpj-close" title="Hide" aria-label="Hide panel"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke-linecap="round"/></svg></button>
        </div>
        <div id="kpj-who"></div>
        <div id="kpj-acts">
          <div id="kpj-cta">
          <select id="kpj-size" aria-label="Room size">
            <option value="any">Any size</option>
            <option value="2">1v1</option>
            <option value="3">3 players</option>
            <option value="6">4-6</option>
            <option value="10">8-10</option>
          </select>
          <button id="kpj-go">Find a room</button>
          </div>
        </div>
        <button id="kpj-msg" type="button" role="status" aria-live="polite" title="Click to copy the diagnostic log"></button>
      </div>
      </div>`;
    document.documentElement.appendChild(root);

    el = {
      root,
      pill: root.querySelector("#kpj-pill"),
      pillTxt: root.querySelector("#kpj-pill-txt"),
      dots: root.querySelectorAll(".kpj-dot"),
      who: root.querySelector("#kpj-who"),
      go: root.querySelector("#kpj-go"),
      size: root.querySelector("#kpj-size"),
      msg: root.querySelector("#kpj-msg"),
      party: root.querySelector("#kpj-name-input")
    };

    el.pill.onclick = () => setOpen(true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && root.classList.contains("open") && !/input|textarea/i.test(document.activeElement?.tagName || "")) setOpen(false);
    });
    root.querySelector("#kpj-close").onclick = () => setOpen(false);
    el.go.onclick = findRoom;
    el.msg.onclick = copyLog;
    document.addEventListener("keydown", e => {
      if (e.altKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); copyLog(); }
    });
    el.size.onchange = () => chrome.storage.sync.set({ size: el.size.value });
    el.party.oninput = () => chrome.storage.sync.set({ party: el.party.value.trim() });
    el.party.onkeydown = e => { if (e.key === "Enter") el.party.blur(); };
    return root;
  }

  function setOpen(open, moveFocus = true) {
    if (open) {
      el.root.classList.remove("closing");
      el.root.classList.add("open");
      if (moveFocus) (cfg.party ? el.go : el.party).focus();
    } else if (el.root.classList.contains("open")) {
      // let the exit run, then hand focus back to the control that opened it
      el.root.classList.add("closing");
      setTimeout(() => {
        el.root.classList.remove("open", "closing");
        if (moveFocus) el.pill.focus();
      }, 150);
    }
    chrome.storage.sync.set({ open });
  }

  let stickyMsg = null;
  function say(text, hold = 0) {
    if (!el.msg) return;
    if (el.msg.textContent !== text) {
      el.msg.textContent = text;
      el.msg.classList.remove("kpj-fresh");
      void el.msg.offsetWidth;            // restart the fade
      el.msg.classList.add("kpj-fresh");
    }
    el.msg.classList.toggle("kpj-empty", !text);
    clearTimeout(stickyMsg);
    stickyMsg = hold ? setTimeout(() => { stickyMsg = null; render(); }, hold) : null;
  }

  // ms = 0 keeps it up until the user dismisses it - errors must not time out
  function toast(text, ms = 4500) {
    let t = document.getElementById("kpj-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "kpj-toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      t.onclick = () => t.classList.remove("show", "sticky");
      document.documentElement.appendChild(t);
    }
    t.textContent = ms ? text : text + "  (click to dismiss)";
    t.classList.toggle("sticky", !ms);
    t.classList.add("show");
    clearTimeout(t._h);
    if (ms) t._h = setTimeout(() => t.classList.remove("show", "sticky"), ms);
  }

  // The whole point of the panel: who is here, and are we together.
  function render() {
    if (!el.root) return;
    const state = !cfg.enabled ? "dead" : !cfg.party ? "wait" : wsState === "on" ? "live" : "wait";
    el.dots.forEach(d => { d.className = "kpj-dot " + state; });

    const mates = livePeers();
    const mine = roomCode();
    el.pillTxt.textContent = !cfg.party ? "Set up party"
      : !cfg.enabled ? "Party · paused"
      : mates.length ? `Party · ${mates.length + 1}` : "Party · alone";
    if (document.activeElement !== el.party && el.party.value !== (cfg.party || "")) el.party.value = cfg.party || "";

    const fresh = id => (seenRows.has(id) ? "" : " kpj-in");
    const ids = new Set(["me", "invite"]);
    const rows = [`<div class="kpj-who-row${fresh("me")}"><i class="kpj-dot live"></i><b>${esc(myName() || "you")}</b>
        <em class="kpj-me">(you)</em><span>${mine ? "in " + mine : "browsing"}</span></div>`];
    for (const [id, p] of [...peers].filter(([, p]) => now() - p.at < PEER_STALE_MS)) {
      ids.add(id);
      const together = mine && p.room === mine;
      const status = together ? "with you"
        : p.room ? (mine ? "too late" : "playing")
        : "browsing";
      rows.push(`<div class="kpj-who-row${together ? " kpj-same" : ""}${fresh(id)}">
        <i class="kpj-dot live"></i><b>${esc(p.name || "friend")}</b>
        <span>${status}</span></div>`);
    }
    // always offer the next seat: a party is however many of you turn up
    rows.push(`<div class="kpj-who-row kpj-away"><i class="kpj-dot kpj-ghost"></i>
      <button class="kpj-invite" type="button">Invite +</button></div>`);
    seenRows = ids;
    const html = rows.join("");
    if (el.who.dataset.sig !== html) {
      el.who.innerHTML = html;
      el.who.dataset.sig = html;
      el.who.querySelector(".kpj-invite").onclick = invite;
    }

    const size = mates.length + 1;
    el.go.textContent = "Find a room";
    el.go.disabled = !cfg.enabled || !cfg.party;

    // the link state is spelled out, never carried by the dot's colour alone
    if (!cfg.party) say("Name your party above, same on both machines.");
    else if (!cfg.enabled) say("Paused - nothing is sent or followed.");
    else if (wsState !== "on") say("Connecting…");
    else if (!stickyMsg) say(mates.length ? `Linked · ${cfg.party}` : `Linked - waiting for your friend`);
  }

  async function invite() {
    const name = cfg.party || "";
    if (!name) { el.party.focus(); return say("Name your party first, then invite.", 6000); }
    const text = `Play Krillion Puffer Party with me: install the Party Joiner extension, `
               + `type the party name "${name}", and we land in the same room.`;
    try {
      await navigator.clipboard.writeText(text);
      say("Invite copied. Send it to your friend.", 7000);
    } catch {
      say(`Send them this party name: ${name}`, 9000);
    }
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- relay ---------- */

  function connect() {
    if (!cfg.enabled || !cfg.party) { closeWs(); return; }
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    wsState = "wait"; render();
    try { ws = new WebSocket(`wss://ntfy.sh/${encodeURIComponent(topicFor(cfg.party))}/ws`); }
    catch { scheduleReconnect(); return; }
    ws.onopen = () => { wsState = "on"; reconnectDelay = 1000; log("ws open", topicFor(cfg.party)); render(); heartbeat(true); };
    ws.onclose = () => { wsState = "off"; log("ws close"); render(); scheduleReconnect(); };
    ws.onerror = () => { log("ws error"); try { ws.close(); } catch {} };
    ws.onmessage = ev => {
      let frame; try { frame = JSON.parse(ev.data); } catch { return; }
      if (frame.event !== "message" || !frame.message) return;
      if (frame.time && now() - frame.time * 1000 > 60000) return;
      let m; try { m = JSON.parse(frame.message); } catch { return; }
      if (!m || m.from === clientId) return;

      if (m.t === "hi") {
        const first = !peers.has(m.from);
        peers.set(m.from, { name: m.name, room: m.code || null, at: now() });
        render();
        // say hello back once, so whoever just arrived can see us
        if (first) log("peer seen", { name: m.name, room: m.code || null });
        if (first && now() - lastSentAt > REPLY_THROTTLE_MS) heartbeat(true);
        return;
      }
      if (m.t === "join" && typeof m.code === "string") {
        peers.set(m.from, { name: m.name, room: m.code.toUpperCase(), at: now() });
        render();
        onCall(m.code.toUpperCase(), m.name);
      }
    };
  }

  function closeWs() { try { ws && ws.close(); } catch {} ws = null; wsState = "off"; render(); }
  function scheduleReconnect() {
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    reconnectAt = now() + reconnectDelay;
  }

  async function publish(payload) {
    if (now() < throttledUntil) return { ok: false, throttled: true };
    const topic = topicFor(cfg.party);
    const viaWorker = await send("publish", { topic, payload });
    if (viaWorker.ok) { lastSentAt = now(); log("publish ok", { via: "worker", t: payload.t }); return viaWorker; }
    if (viaWorker.status === 429) {
      throttledUntil = now() + (viaWorker.retryAfter ? viaWorker.retryAfter * 1000 : 3600000);
      log("publish 429", { retryAfter: viaWorker.retryAfter });
      return { ok: false, throttled: true, retryAfter: viaWorker.retryAfter };
    }
    const direct = await publishDirect(topic, payload);     // worker asleep, gone, or blocked
    if (direct.ok) { lastSentAt = now(); log("publish ok", { via: "page", t: payload.t }); return direct; }
    log("publish failed", { workerStatus: viaWorker.status ?? null, dead: !!viaWorker.dead });
    return { ...direct, dead: viaWorker.dead };
  }

  function heartbeat(force = false) {
    if (!cfg.enabled || !cfg.party || wsState !== "on") return;
    const sig = `${myName()}|${roomCode() || ""}`;
    if (!force && sig === lastSig && now() - lastSentAt < HEARTBEAT_MS) return;
    lastSig = sig;
    publish({ t: "hi", from: clientId, name: myName(), code: roomCode(), ts: now() });
  }

  // one quiet check on boot, so a broken link is visible before it matters
  async function probe() {
    if (!cfg.party) return;
    const r = await publish({ t: "hi", from: clientId, name: myName(), code: roomCode(), ts: now() });
    lastSig = `${myName()}|${roomCode() || ""}`;
    if (r.ok) return;
    if (r.throttled) say(relayWait(r.retryAfter), 14000);
    else if (r.dead) say("Extension was updated. Reload this page to relink.", 12000);
    else say("Can\u2019t reach ntfy.sh - check for an ad blocker.", 12000);
  }

  const relayWait = secs => {
    const h = Math.ceil((secs || 3600) / 3600);
    return `Relay is over its daily limit. It frees up in about ${h} hour${h > 1 ? "s" : ""}.`;
  };

  function broadcast(code, manual = false) {
    if (!cfg.enabled || !cfg.party) return;
    if (!manual && lastBroadcast.code === code && now() - lastBroadcast.at < ECHO_MS) return;
    lastBroadcast = { code, at: now() };
    publish({ t: "join", code, from: clientId, name: myName(), ts: now() }).then(r => {
      if (r && r.ok) say(livePeers().length ? `Sent ${code} to your party.` : `Sent ${code} - nobody is listening yet.`, 6000);
      else if (r && r.throttled) say(relayWait(r.retryAfter), 12000);
      else if (r && r.dead) say("Extension was updated. Reload this page to relink.", 10000);
      else say("Can\u2019t reach ntfy.sh. An ad blocker or your network may be blocking it.", 9000);
    });
  }

  /* ---------- following ---------- */

  function onCall(code, who) {
    if (!cfg.follow) return;
    if (roomCode() === code) return;
    if (lastHandled.code === code && now() - lastHandled.at < ECHO_MS) return;
    lastHandled = { code, at: now() };
    log("following", { code, who });
    toast(`${who || "Your friend"} went to ${code} - following.`);
    sessionStorage.setItem("kpj-follow", code);
    location.href = `https://krillion.io/party/${code}`;
  }

  function autoSeat() {
    if (!cfg.autoSeat) return;
    const code = roomCode();
    const want = sessionStorage.getItem("kpj-follow");
    if (!code || want !== code) return;
    sessionStorage.removeItem("kpj-follow");

    const started = now();
    const tick = () => {
      if (now() - started > SEAT_TIMEOUT_MS) return log("seat timeout", code) || toast(`Couldn\u2019t get into ${code}. Open the room and press Take a seat.`, 0);
      if (document.querySelector("iframe[src*='challenges.cloudflare.com'], dialog[open]")) { return toast("Krillion wants a quick verification \u2014 complete it and you\u2019re in.", 0);
      }
      const btn = [...document.querySelectorAll("button")]
        .find(b => /take a seat/i.test(b.textContent || "") && !b.disabled);
      if (btn) {
        const box = [...document.querySelectorAll("input")]
          .find(i => i.maxLength === 16 || /calls you/i.test(i.placeholder || ""));
        if (box && !box.value.trim()) { box.focus();
          return toast("Enter your name above - Krillion needs it before it seats you.", 0);
        }
        log("seat clicked", code);
        btn.click();
        setTimeout(() => {
          if (roomCode() === code && /take a seat/i.test(document.body.innerText || "")) { toast(`Couldn\u2019t seat you in ${code}. Press Take a seat to join.`, 0);
          } else { toast(`You're in ${code}.`); heartbeat(); }
        }, 2500);
        return;
      }
      if (/room is full|this room is full/i.test(document.body.innerText || "")) {
        return toast(`${code} filled up before you got there. Try Find a room again.`, 6000);
      }
      setTimeout(tick, 250);
    };
    setTimeout(tick, 300);
  }

  /* ---------- room finder ---------- */

  async function findRoom() {
    const size = livePeers().length + 1;
    el.go.disabled = true;
    say("Looking for a lobby with space…");
    const r = await send("rooms", { pages: 3 });
    el.go.disabled = false;
    log("rooms", { ok: !!r.ok, count: r.rooms?.length ?? 0 });
    if (!r.ok || !r.rooms?.length) return say("Can\u2019t read the room list. Check your connection and try again.", 8000);
    const need = Math.max(2, size);
    const want = cfg.size || "any";
    const fits = x => want === "any" ? true
      : want === "2" ? x.maxPlayers === 2
      : want === "3" ? x.maxPlayers === 3
      : want === "6" ? x.maxPlayers >= 4 && x.maxPlayers <= 6
      : x.maxPlayers >= 7;
    const open = r.rooms.filter(x => x.phase === "lobby" && (x.maxPlayers - x.players) >= need);
    const pick = [...open.filter(fits), ...(want === "any" ? [] : [])]
      .sort((a, b) => (b.players - a.players) || (b.maxPlayers - a.maxPlayers))[0];
    if (!pick) {
      const label = el.size.selectedOptions[0].textContent.toLowerCase();
      return say(open.length
        ? `No ${label} lobby with ${need} free seats. Try another size or wait a few seconds.`
        : `No lobby with ${need} free seats right now. Try again in a few seconds.`, 8000);
    }
    say(`${pick.code} · ${pick.players}/${pick.maxPlayers} - going in.`);
    broadcast(pick.code, true);
    sessionStorage.setItem("kpj-follow", pick.code);
    location.href = `https://krillion.io/party/${pick.code}`;
  }

  /* ---------- watchers ---------- */

  function watchClicks() {
    document.addEventListener("click", ev => {
      if (!cfg.enabled) return;
      const el2 = ev.target instanceof Element ? ev.target : null;
      if (!el2 || el2.closest("#kpj")) return;
      const btn = el2.closest("button, a");
      if (!btn) return;
      const label = (btn.textContent || "").trim();

      if (/take a seat/i.test(label)) { const c = roomCode(); if (c) broadcast(c); return; }

      const row = /^([A-Z]{4})[\s\S]*?\d+\s*\/\s*\d+/.exec(label);
      if (row) { if (!/FULL\s*$/i.test(label)) broadcast(row[1]); return; }

      if (/^join$/i.test(label)) {
        const typed = (btn.parentElement?.querySelector("input")?.value || "").trim().toUpperCase();
        if (/^[A-Z]{4}$/.test(typed)) broadcast(typed);
      }
    }, true);
  }

  function checkPath() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const code = roomCode();
    if (code) {
      if (sessionStorage.getItem("kpj-follow") !== code) broadcast(code);
      autoSeat();
    }
    heartbeat();
    render();
  }

  /* ---------- boot ---------- */

  chrome.storage.sync.get(DEFAULTS, saved => {
    cfg = { ...DEFAULTS, ...saved };
    chrome.storage.local.get({ clientId: "", kpjLog: [] }, s => {
      if (Array.isArray(s.kpjLog)) LOG = s.kpjLog.slice(-LOG_MAX);
      clientId = s.clientId || (Math.random().toString(36).slice(2) + now().toString(36));
      if (!s.clientId) chrome.storage.local.set({ clientId });

      build();
      el.party.value = cfg.party || "";
      el.size.value = cfg.size || "any";
      if (cfg.open || !cfg.party) el.root.classList.add("open");
      render();
      watchClicks();
      log("boot", { party: maskParty(cfg.party), room: roomCode() });
      connect();
      setTimeout(probe, 1500);

      const code = roomCode();
      if (code) { if (sessionStorage.getItem("kpj-follow") !== code) broadcast(code); autoSeat(); }
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    let relink = false;
    for (const [k, v] of Object.entries(changes)) {
      cfg[k] = v.newValue;
      if (k === "party" || k === "enabled") relink = true;
      const node = el.root?.querySelector("#kpj-" + k);
      if (node && node.type === "checkbox" && node.checked !== !!v.newValue) node.checked = !!v.newValue;
      if (k === "party" && el.party && document.activeElement !== el.party) el.party.value = v.newValue || "";
      if (k === "size" && el.size) el.size.value = v.newValue || "any";
    }
    if (relink) { closeWs(); connect(); }
    render();
  });

  setInterval(() => {
    checkPath();
    if (cfg.enabled && cfg.party && (!ws || ws.readyState > 1) && now() > reconnectAt) connect();
  }, 300);

  setInterval(() => { heartbeat(); render(); }, 60000);   // heartbeat() decides if it actually sends
})();
