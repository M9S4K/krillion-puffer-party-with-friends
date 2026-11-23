/* Krillion Party Joiner - everything lives in one panel on the page. */

(() => {
  "use strict";
  if (window.__kpjLoaded) return;
  window.__kpjLoaded = true;

  const DEFAULTS = { enabled: true, party: "", follow: true, autoSeat: true, sound: true, size: "any", open: false };
  const ROOM_RE = /^\/party\/([A-Za-z]{4})\/?$/;
  const ECHO_MS = 25000;
  const SEAT_TIMEOUT_MS = 15000;
  const HEARTBEAT_MS = 20000;           // the broker has no daily cap, so presence can be prompt
  const PEER_STALE_MS = 70000;          // three missed keepalives
  const REPLY_THROTTLE_MS = 60000;

  let cfg = { ...DEFAULTS };
  let clientId = "";
  let ws = null, wsState = "off", reconnectAt = 0, reconnectDelay = 1000, pinger = null;
  let lastBroadcast = { code: null, at: 0 };
  let lastHandled = { code: null, at: 0 };
  let lastPath = location.pathname;
  let peers = new Map();            // id -> { name, room, at }
  let seenRows = new Set();         // rows already on screen, so only new ones animate
  let lastSig = "";                 // what we last told the party
  let blinkUntil = new Map();       // peer id -> when their arrival blink ends
  let linkCue = "off";              // off | connecting | ok - the glyph by the name
  let linkCueT = null;
  let lastSentAt = 0;
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
      `settings  follow=${cfg.follow} autoSeat=${cfg.autoSeat} sound=${cfg.sound} size=${cfg.size}`,
      `relay     ${wsState} via ${BROKERS[brokerIdx % BROKERS.length]}`,
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
  const topicFor = p => "kpj/" + String(p).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  const roomCode = (path = location.pathname) => {
    const m = ROOM_RE.exec(path);
    return m ? m[1].toUpperCase() : null;
  };
  const myName = () => {
    const box = [...document.querySelectorAll("input")]
      .find(i => i.maxLength === 16 || /calls you/i.test(i.placeholder || ""));
    // inside a room the name box is gone from the DOM, so keep the last one we saw
    const live = (box?.value || localStorage.getItem("party-name") || "").trim();
    if (live) { try { localStorage.setItem("kpj-name", live); } catch {} return live; }
    try { return (localStorage.getItem("kpj-name") || "").trim(); } catch { return ""; }
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



  // one table: the label people read, and the lobby sizes it accepts
  const SIZES = [
    { v: "any", label: "Any",   fits: () => true },
    { v: "2",   label: "1v1",   fits: m => m === 2 },
    { v: "3",   label: "3s",    fits: m => m === 3 },
    { v: "6",   label: "4-6",   fits: m => m >= 4 && m <= 6 },
    { v: "10",  label: "8-10",  fits: m => m >= 7 && m <= 10 },
    { v: "12",  label: "10+",   fits: m => m >= 11 }
  ];
  const sizeOf = v => SIZES.find(x => x.v === v) || SIZES[0];
  const seats = n => n === 1 ? "a free seat" : `${n} free seats`;
  const HOLD_MS = 4000;             // moving a party that is already together

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
            <div id="kpj-kicker-row"><span id="kpj-kicker">Party name</span><button id="kpj-info" aria-label="About the party name" aria-describedby="kpj-tip"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.6" stroke-linecap="round"/><path d="M8 4.8v.5" stroke-linecap="round"/></svg></button><span id="kpj-tip" role="tooltip">Type out any name and ask your friends to type it in exactly to join the same party</span></div>
            <div id="kpj-name-row">
              <input id="kpj-name-input" type="text" spellcheck="false" autocomplete="off"
                     aria-label="Party name" placeholder="name your party">
              <i id="kpj-link" data-cue="off" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.5 12.5 5" stroke-linecap="round" stroke-linejoin="round"/></svg></i>
            </div>
          </div>
          <button id="kpj-set" title="Settings" aria-label="Settings" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h6.2M13 5.5h.5M2.5 10.5h2.7M9.5 10.5h4" stroke-linecap="round"/><circle cx="10.8" cy="5.5" r="1.7"/><circle cx="7.3" cy="10.5" r="1.7"/></svg></button>
          <button id="kpj-close" title="Hide" aria-label="Hide panel"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke-linecap="round"/></svg></button>
          <div id="kpj-settings" role="dialog" aria-label="Settings" hidden>
            <label><input type="checkbox" id="kpj-enabled"><span>Keep my party connected</span></label>
            <label><input type="checkbox" id="kpj-follow"><span>Follow my party into rooms</span></label>
            <label><input type="checkbox" id="kpj-autoSeat"><span>Take my seat automatically</span></label>
            <label><input type="checkbox" id="kpj-sound"><span>Play a sound</span></label>
          </div>
        </div>
        <div id="kpj-who"></div>
        <div id="kpj-acts">
          <div id="kpj-cta">
          <div id="kpj-size-wrap">
            <button id="kpj-size" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Room size">
              <span id="kpj-size-txt">Any</span>
              <svg class="kpj-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.6 6 7.6l3-3" stroke-linecap="round"/></svg>
            </button>
            <ul id="kpj-size-menu" role="listbox" aria-label="Room size" tabindex="-1" hidden>
              ${SIZES.map(o => `<li role="option" id="kpj-size-${o.v}" data-v="${o.v}" aria-selected="false">${o.label}</li>`).join("")}
            </ul>
          </div>
          <button id="kpj-go" type="button"><span id="kpj-go-txt">Find room</span><i class="kpj-fill" aria-hidden="true"></i></button>
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
      sizeTxt: root.querySelector("#kpj-size-txt"),
      sizeMenu: root.querySelector("#kpj-size-menu"),
      goTxt: root.querySelector("#kpj-go-txt"),
      msg: root.querySelector("#kpj-msg"),
      party: root.querySelector("#kpj-name-input"),
      link: root.querySelector("#kpj-link"),
      set: root.querySelector("#kpj-set"),
      settings: root.querySelector("#kpj-settings")
    };

    el.pill.onclick = () => setOpen(true);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && root.classList.contains("open") && !/input|textarea/i.test(document.activeElement?.tagName || "")) setOpen(false);
    });
    root.querySelector("#kpj-close").onclick = () => setOpen(false);
    el.msg.onclick = copyLog;
    document.addEventListener("keydown", e => {
      if (e.altKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); copyLog(); }
    });

    /* --- settings: three switches, no separate page --- */
    const setOpenSettings = open => {
      el.settings.hidden = !open;
      el.set.setAttribute("aria-expanded", String(open));
      if (open) el.settings.querySelector("input").focus();
    };
    el.set.onclick = () => setOpenSettings(el.settings.hidden);
    el.settings.onchange = ev => {
      const box = ev.target.closest("input[type=checkbox]");
      if (box) chrome.storage.sync.set({ [box.id.replace("kpj-", "")]: box.checked });
    };
    el.settings.onkeydown = ev => {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); setOpenSettings(false); el.set.focus(); }
    };
    document.addEventListener("pointerdown", ev => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!el.settings.hidden && !t?.closest("#kpj-settings") && !t?.closest("#kpj-set")) setOpenSettings(false);
    }, true);

    /* --- room size: a listbox, so it can wear the panel's own clothes --- */
    const sizeOpen = open => {
      el.sizeMenu.hidden = !open;
      el.size.setAttribute("aria-expanded", String(open));
      if (!open) {
        el.sizeMenu.removeAttribute("aria-activedescendant");
        el.sizeMenu.querySelectorAll(".kpj-cursor").forEach(n => n.classList.remove("kpj-cursor"));
        return;
      }
      const sel = el.sizeMenu.querySelector('[aria-selected="true"]') || el.sizeMenu.firstElementChild;
      sel.classList.add("kpj-cursor");
      el.sizeMenu.setAttribute("aria-activedescendant", sel.id);
      el.sizeMenu.focus();
    };
    const sizePick = v => { chrome.storage.sync.set({ size: v }); cfg.size = v; paintSize(); };
    el.size.onclick = () => sizeOpen(el.sizeMenu.hidden);
    el.size.onkeydown = ev => {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); sizeOpen(true); }
    };
    el.sizeMenu.onclick = ev => {
      const li = ev.target.closest("[data-v]");
      if (!li) return;
      sizePick(li.dataset.v); sizeOpen(false); el.size.focus();
    };
    el.sizeMenu.onkeydown = ev => {
      const items = [...el.sizeMenu.children];
      const i = Math.max(0, items.findIndex(n => n.classList.contains("kpj-cursor")));
      if (ev.key === "Escape") {                      // the panel's own Escape must not also fire
        ev.preventDefault(); ev.stopPropagation(); sizeOpen(false); el.size.focus(); return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault(); sizePick(items[i].dataset.v); sizeOpen(false); el.size.focus(); return;
      }
      const to = ev.key === "ArrowDown" ? i + 1 : ev.key === "ArrowUp" ? i - 1
               : ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : null;
      if (to === null) return;
      ev.preventDefault();
      const n = Math.max(0, Math.min(items.length - 1, to));
      items[i].classList.remove("kpj-cursor");
      items[n].classList.add("kpj-cursor");
      el.sizeMenu.setAttribute("aria-activedescendant", items[n].id);
    };
    document.addEventListener("pointerdown", ev => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!el.sizeMenu.hidden && !t?.closest("#kpj-size-wrap")) sizeOpen(false);
    }, true);

    /* --- the key: a tap to find a room, a hold to move a party already together --- */
    let holdT = null;
    const endHold = () => { clearTimeout(holdT); holdT = null; el.go.classList.remove("kpj-holding"); };
    const startHold = () => {
      if (el.go.disabled || !el.go.dataset.hold || holdT) return;
      el.go.classList.add("kpj-holding");
      holdT = setTimeout(() => {
        const still = !!el.go.dataset.hold;
        endHold();
        if (still) findRoom();
      }, HOLD_MS);
    };
    el.go.onclick = () => { if (!el.go.dataset.hold) findRoom(); };
    el.go.onpointerdown = ev => { if (ev.button === 0) startHold(); };
    el.go.onpointerup = endHold;
    el.go.onpointerleave = endHold;
    el.go.onpointercancel = endHold;
    el.go.onblur = endHold;
    el.go.onkeydown = ev => {                        // a plain key press still clicks
      if (!el.go.dataset.hold) return;
      if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) { ev.preventDefault(); startHold(); }
    };
    el.go.onkeyup = ev => {
      if (!el.go.dataset.hold) return;
      if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); endHold(); }
    };
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
      (el.root || document.documentElement).appendChild(t);   // under the widget, where you are looking
    }
    t.textContent = ms ? text : text + "  (click to dismiss)";
    t.classList.toggle("sticky", !ms);
    t.classList.add("show");
    clearTimeout(t._h);
    if (ms) t._h = setTimeout(() => t.classList.remove("show", "sticky"), ms);
  }

  /* ---------- sound ----------
     Square-wave blips, synthesised rather than shipped: no asset, no network,
     and it suits a pixel game. A page needs a gesture before audio will play,
     so the context is made on the first blip and every failure is swallowed. */
  let actx = null;
  const TUNES = {
    arrive: [[880, 0, .07], [1320, .07, .09]],   // someone joined you
    move:   [[660, 0, .10]]                      // your screen is about to change
  };
  function blip(kind) {
    if (!cfg.sound) return;
    const notes = TUNES[kind];
    if (!notes) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const t0 = actx.currentTime;
      for (const [hz, at, len] of notes) {
        const osc = actx.createOscillator(), gain = actx.createGain();
        osc.type = "square";
        osc.frequency.value = hz;
        // a ramp at each end, or the square wave clicks
        gain.gain.setValueAtTime(0.0001, t0 + at);
        gain.gain.exponentialRampToValueAtTime(0.05, t0 + at + .008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        osc.connect(gain).connect(actx.destination);
        osc.start(t0 + at);
        osc.stop(t0 + at + len + .02);
      }
    } catch { /* no audio on this page, so no sound */ }
  }

  // a friend turning up while you are mid-game is easy to miss, so their row blinks
  function blink(id) {
    blip("arrive");
    blinkUntil.set(id, now() + 2000);
    setTimeout(() => { blinkUntil.delete(id); render(); }, 2050);
  }

  // by the party name: a spinner while the socket opens, then a check that fades
  function setLinkCue(next) {
    if (next === linkCue) return;
    if (linkCue === "connecting" && next === "ok") {
      linkCue = "ok"; el.link.dataset.cue = "ok";
      clearTimeout(linkCueT);
      linkCueT = setTimeout(() => { linkCue = "off"; el.link.dataset.cue = "off"; }, 1600);
      return;
    }
    if (next === "ok") next = "off";          // nothing to confirm if it was never connecting
    clearTimeout(linkCueT);
    linkCue = next; el.link.dataset.cue = next;
  }

  function paintSize() {
    if (!el.sizeTxt) return;
    const cur = sizeOf(cfg.size || "any");
    el.sizeTxt.textContent = cur.label;
    for (const li of el.sizeMenu.children) li.setAttribute("aria-selected", String(li.dataset.v === cur.v));
  }

  // The whole point of the panel: who is here, and are we together.
  function render() {
    if (!el.root) return;
    const state = !cfg.enabled ? "dead" : !cfg.party ? "wait" : wsState === "on" ? "live" : "wait";
    el.dots.forEach(d => { d.className = "kpj-dot " + state; });
    setLinkCue(!cfg.party || !cfg.enabled ? "off" : wsState === "on" ? "ok" : "connecting");

    const mates = livePeers();
    const mine = roomCode();
    el.pillTxt.textContent = !cfg.party ? "Set up party"
      : !cfg.enabled ? "Party · paused"
      : mates.length ? `Party · ${mates.length + 1}` : "Party · alone";
    if (document.activeElement !== el.party && el.party.value !== (cfg.party || "")) el.party.value = cfg.party || "";

    const blinking = id => blinkUntil.get(id) > now();
    const fresh = id => (seenRows.has(id) || blinking(id) ? "" : " kpj-in");
    const ids = new Set(["me", "invite"]);
    const rows = [`<div class="kpj-who-row kpj-self${fresh("me")}"><i class="kpj-dot ${state}"></i><b>${esc(myName() || "you")}</b>
        <em class="kpj-me">(you)</em><span>${mine ? "in " + mine : "browsing"}</span></div>`];
    for (const [id, p] of [...peers].filter(([, p]) => now() - p.at < PEER_STALE_MS)) {
      ids.add(id);
      const together = mine && p.room === mine;
      const stuck = p.follows === false;           // they have following switched off
      const status = stuck ? "not following"       // the red dot is never the only cue
        : together ? ""                            // you can see you are together; the key says so too
        : p.room ? (mine ? "too late" : "playing")
        : "browsing";
      rows.push(`<div class="kpj-who-row${together ? " kpj-same" : ""}${stuck ? " kpj-stuck" : ""}${
        blinking(id) ? " kpj-blink" : ""}${fresh(id)}">
        <i class="kpj-dot ${stuck ? "dead" : "live"}"></i><b>${esc(p.name || "friend")}</b>
        <span>${status}</span></div>`);
    }
    // always offer the next seat: a party is however many of you turn up
    rows.push(`<div class="kpj-who-row kpj-away"><i class="kpj-dot kpj-ghost"></i>
      <button class="kpj-invite" type="button">invite +</button></div>`);
    seenRows = ids;
    const html = rows.join("");
    if (el.who.dataset.sig !== html) {
      el.who.innerHTML = html;
      el.who.dataset.sig = html;
      el.who.querySelector(".kpj-invite").onclick = invite;
    }

    // all of you in one room already? moving means dragging everyone out, so make it deliberate
    const together = !!mine && mates.length > 0 && mates.every(p => p.room === mine);
    el.go.dataset.hold = together ? "1" : "";
    el.goTxt.textContent = together ? "Hold to move" : "Find room";
    el.go.disabled = !cfg.enabled || !cfg.party;

    // only when there is something to do about it: the rest is on the dots and the cue
    if (!cfg.party) say("Name your party above, same on both machines.");
    else if (!cfg.enabled) say("Paused - nothing is sent or followed.");
    else if (!stickyMsg) say("");
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


  /* ---------- relay: MQTT 3.1.1 over WebSocket ---------- */
  // Public brokers, no account. Fair-use rate limits, no daily message quota.
  const BROKERS = ["wss://broker.hivemq.com:8884/mqtt", "wss://test.mosquitto.org:8081/mqtt"];
  let brokerIdx = 0;

  const mqStr = str => { const b = new TextEncoder().encode(str); return [b.length >> 8 & 255, b.length & 255, ...b]; };
  const mqLen = n => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
  const mqPkt = (type, flags, body) => new Uint8Array([type << 4 | flags, ...mqLen(body.length), ...body]);

  function mqDecode(buf) {
    const d = new Uint8Array(buf), type = d[0] >> 4;
    if (type !== 3) return { type };
    let i = 1, mult = 1, rl = 0, b;
    do { b = d[i++]; rl += (b & 127) * mult; mult *= 128; } while (b & 128);
    const end = i + rl;
    const tl = (d[i] << 8) | d[i + 1];
    const topic = new TextDecoder().decode(d.slice(i + 2, i + 2 + tl));
    const text = new TextDecoder().decode(d.slice(i + 2 + tl, end));
    return { type, topic, text };
  }

  /* ---------- relay ---------- */

  function connect() {
    if (!cfg.enabled || !cfg.party) { closeWs(); return; }
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    wsState = "wait"; render();
    const url = BROKERS[brokerIdx % BROKERS.length];
    try { ws = new WebSocket(url, "mqtt"); ws.binaryType = "arraybuffer"; }
    catch { scheduleReconnect(); return; }

    ws.onopen = () => {
      // CONNECT: clean session, 60s keepalive
      ws.send(mqPkt(1, 0, [...mqStr("MQTT"), 4, 2, 0, 60, ...mqStr("kpj" + clientId.slice(0, 12))]));
    };
    ws.onclose = () => {
      wsState = "off"; log("relay closed", url);
      clearInterval(pinger); pinger = null;
      brokerIdx++;                                   // try the other broker next time
      render(); scheduleReconnect();
    };
    ws.onerror = () => { log("relay error", url); try { ws.close(); } catch {} };
    ws.onmessage = ev => {
      const f = mqDecode(ev.data);
      if (f.type === 2) {                            // CONNACK -> subscribe
        ws.send(mqPkt(8, 2, [0, 1, ...mqStr(topicFor(cfg.party)), 0]));
        wsState = "on"; reconnectDelay = 1000;
        log("relay open", { broker: url, topic: topicFor(cfg.party) });
        clearInterval(pinger);
        pinger = setInterval(() => { try { ws.send(mqPkt(12, 0, [])); } catch {} }, 45000);
        render(); heartbeat(true);
        return;
      }
      if (f.type !== 3 || !f.text) return;
      let m; try { m = JSON.parse(f.text); } catch { return; }
      if (!m || m.from === clientId) return;
      if (m.ts && now() - m.ts > 120000) return;    // ignore anything stale

      if (m.t === "hi") {
        const first = !peers.has(m.from);
        peers.set(m.from, { name: m.name, room: m.code || null, follows: m.f !== 0, at: now() });
        if (first) blink(m.from);
        render();
        // say hello back once, so whoever just arrived can see us
        if (first) log("peer seen", { name: m.name, room: m.code || null });
        if (first && now() - lastSentAt > REPLY_THROTTLE_MS) heartbeat(true);
        return;
      }
      if (m.t === "join" && typeof m.code === "string") {
        if (!peers.has(m.from)) blink(m.from);
        peers.set(m.from, { name: m.name, room: m.code.toUpperCase(), follows: m.f !== 0, at: now() });
        render();
        onCall(m.code.toUpperCase(), m.name);
      }
    };
  }

  function closeWs() { clearInterval(pinger); pinger = null; try { ws && ws.close(); } catch {} ws = null; wsState = "off"; render(); }
  function scheduleReconnect() {
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    reconnectAt = now() + reconnectDelay;
  }

  function publish(payload) {
    if (!ws || ws.readyState !== 1 || wsState !== "on") return Promise.resolve({ ok: false, offline: true });
    try {
      const body = new TextEncoder().encode(JSON.stringify(payload));
      ws.send(mqPkt(3, 0, [...mqStr(topicFor(cfg.party)), ...body]));
      lastSentAt = now();
      log("sent", { t: payload.t, code: payload.code || null });
      return Promise.resolve({ ok: true });
    } catch (e) {
      log("send failed", String(e));
      return Promise.resolve({ ok: false });
    }
  }

  function heartbeat(force = false) {
    if (!cfg.enabled || !cfg.party || wsState !== "on") return;
    const sig = `${myName()}|${roomCode() || ""}|${cfg.follow ? 1 : 0}`;
    if (!force && sig === lastSig && now() - lastSentAt < HEARTBEAT_MS) return;
    lastSig = sig;
    publish({ t: "hi", from: clientId, name: myName(), code: roomCode(), f: cfg.follow ? 1 : 0, ts: now() });
  }

  // one quiet check on boot, so a broken link is visible before it matters

  // the page reloads on every room change, so the guard lives in sessionStorage too
  function echoed(code) {
    if (lastBroadcast.code === code && now() - lastBroadcast.at < ECHO_MS) return true;
    let raw = null;
    try { raw = sessionStorage.getItem("kpj-sent"); } catch {}
    if (!raw) return false;
    const [c, at] = raw.split("|");
    return c === code && now() - Number(at) < ECHO_MS;
  }

  function broadcast(code, manual = false) {
    if (!cfg.enabled || !cfg.party) return;
    if (!manual && echoed(code)) return;
    lastBroadcast = { code, at: now() };
    try { sessionStorage.setItem("kpj-sent", `${code}|${lastBroadcast.at}`); } catch {}
    publish({ t: "join", code, from: clientId, name: myName(), f: cfg.follow ? 1 : 0, ts: now() }).then(r => {
      if (r && r.ok) say(livePeers().length ? `Sent ${code} to your party.` : `Sent ${code} - nobody is listening yet.`, 6000);
      else if (r && r.offline) say("Relay is still connecting - that room will go out in a moment.", 6000);
      else say("Could not send to the relay. The log (Alt+L) has the detail.", 9000);
    });
  }

  /* ---------- following ---------- */

  function onCall(code, who) {
    if (!cfg.follow) return;
    if (roomCode() === code) return;
    if (lastHandled.code === code && now() - lastHandled.at < ECHO_MS) return;
    lastHandled = { code, at: now() };
    log("following", { code, who });
    blip("move");
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
      if (document.querySelector("iframe[src*='challenges.cloudflare.com'], dialog[open]")) { return toast("Krillion wants a quick verification - complete it and you\u2019re in.", 0);
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
          } else { heartbeat(); }      // you can see you are in; no toast for it
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
    const need = size;                      // one of you needs one seat, not two
    const want = cfg.size || "any";
    const fits = x => sizeOf(want).fits(x.maxPlayers);
    const open = r.rooms.filter(x => x.phase === "lobby" && (x.maxPlayers - x.players) >= need);
    const pick = [...open.filter(fits), ...(want === "any" ? [] : [])]
      .sort((a, b) => (b.players - a.players) || (b.maxPlayers - a.maxPlayers))[0];
    if (!pick) {
      const label = sizeOf(want).label.toLowerCase();
      return say(open.length
        ? `No ${label} lobby with ${seats(need)}. Try another size or wait a few seconds.`
        : `No lobby with ${seats(need)} right now. Try again in a few seconds.`, 8000);
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
      paintSize();
      for (const k of ["enabled", "follow", "autoSeat", "sound"]) {
        const n = el.root.querySelector("#kpj-" + k);
        if (n) n.checked = !!cfg[k];
      }
      if (cfg.open || !cfg.party) el.root.classList.add("open");
      render();
      watchClicks();
      log("boot", { party: maskParty(cfg.party), room: roomCode() });
      connect();

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
      if (k === "follow") setTimeout(() => heartbeat(true), 0);
      const node = el.root?.querySelector("#kpj-" + k);
      if (node && node.type === "checkbox" && node.checked !== !!v.newValue) node.checked = !!v.newValue;
      if (k === "party" && el.party && document.activeElement !== el.party) el.party.value = v.newValue || "";
      if (k === "size") paintSize();
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
