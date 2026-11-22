/* Every state the panel can be in, taken from extension/content.js.
   `when` is the thing that puts it on screen. Keep in step with the source. */
const ME = ["puffa", 1, "browsing"];
const PARTY = "puffa-trench-8471";

export const STATES = {
  /* ---- the collapsed pill ------------------------------------------- */
  "collapsed-alone": { group: "Collapsed", cap: "Alone",
    when: "Panel hidden, party set, nobody else here yet.",
    build: a => { a.pill("Party · alone"); a.collapse(); } },
  "collapsed-group": { group: "Collapsed", cap: "Party of 3",
    when: "Panel hidden. The count is you plus everyone the relay can still hear.",
    build: a => { a.pill("Party · 3"); a.collapse(); } },
  "collapsed-paused": { group: "Collapsed", cap: "Paused",
    when: "Following is switched off. Dot goes red.",
    build: a => { a.pill("Party · paused"); a.dot("dead"); a.collapse(); } },
  "collapsed-setup": { group: "Collapsed", cap: "No party yet",
    when: "First run, before a party name exists. Dot goes amber.",
    build: a => { a.pill("Set up party"); a.dot("wait"); a.collapse(); } },

  /* ---- setting up and connecting ------------------------------------ */
  "no-party": { group: "Setup", cap: "No party name",
    when: "First run. The key is dead until the field has a name.",
    build: a => { a.party(""); a.rows([ME]); a.dot("wait");
                  a.key("Find room", { disabled: true });
                  a.say("Name your party above, same on both machines."); } },
  "connecting": { group: "Setup", cap: "Connecting",
    when: "A spinner sits beside the party name while the socket opens. No footer line.",
    build: a => { a.rows([ME]); a.dot("wait"); a.cue("connecting"); a.msgHidden(); } },
  "connected": { group: "Setup", cap: "Just connected",
    when: "The spinner becomes a check, which fades after 1.6s. Your dot turns green.",
    build: a => { a.rows([ME]); a.cue("ok"); a.msgHidden(); } },
  "settings": { group: "Setup", cap: "Settings", tall: true,
    when: "The gear in the header. Three switches, no separate page.",
    build: a => { a.rows([ME]); a.msgHidden(); a.settings(true); } },
  "paused": { group: "Setup", cap: "Paused",
    when: "Following switched off. Nothing is sent and nothing is followed.",
    build: a => { a.rows([ME]); a.dot("dead"); a.key("Find room", { disabled: true });
                  a.say("Paused - nothing is sent or followed."); } },
  "linked-alone": { group: "Setup", cap: "Linked, alone",
    when: "The resting state: socket up, nobody else on the topic yet.",
    build: a => { a.rows([ME]); a.msgHidden(); } },
  "linked-group": { group: "Setup", cap: "Linked, friend here",
    when: "Someone else is on the same party name.",
    build: a => { a.rows([ME, ["Finum", 0, "browsing"]]); a.msgHidden(); } },

  /* ---- who is here --------------------------------------------------- */
  "friend-browsing": { group: "Presence", cap: "Friend browsing",
    when: "They have the extension open but are in no room.",
    build: a => { a.rows([ME, ["Finum", 0, "browsing"]]); a.msgHidden(); } },
  "friend-playing": { group: "Presence", cap: "Friend playing",
    when: "They are in a room and you are not. Press the key to chase a lobby.",
    build: a => { a.rows([ME, ["Finum", 0, "playing"]]); a.msgHidden(); } },
  "too-late": { group: "Presence", cap: "Too late",
    when: "You are both in rooms, but different ones.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "too late"]]);
                  a.msgHidden(); } },
  "together": { group: "Presence", cap: "Together",
    when: "Everyone the relay can hear is in your room. The key changes mode.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "", "kpj-same"]]);
                  a.key("Hold to move", { hold: true });
                  a.msgHidden(); } },
  "crowd": { group: "Presence", cap: "Four of you",
    when: "A party is however many turn up. The invite row is always last.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "", "kpj-same"],
                          ["shrimpy", 0, "", "kpj-same"], ["kelp", 0, "browsing"]]);
                  a.key("Hold to move", { hold: true }); a.pill("Party · 4");
                  a.msgHidden(); } },
  "friend-stuck": { group: "Presence", cap: "Friend will not follow",
    when: "They switched following off. Their dot goes red and the row says why.",
    build: a => { a.rows([ME, ["Finum", 0, "not following", "kpj-stuck"]]); a.msgHidden();
                  document.querySelectorAll(".kpj-stuck .kpj-dot").forEach(d => d.className = "kpj-dot dead"); } },
  "friend-arrived": { group: "Presence", cap: "Friend just arrived",
    when: "Their row blinks for two seconds, so an arrival is not missed mid-game.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "", "kpj-same kpj-blink"]]);
                  a.key("Hold to move", { hold: true }); a.msgHidden(); } },
  "stale": { group: "Presence", cap: "Friend dropped off",
    when: "No heartbeat for 70 seconds, so the row is gone and the key reverts.",
    build: a => { a.rows([["puffa", 1, "in GNFS"]]); a.msgHidden(); } },

  /* ---- the party name tooltip ---------------------------------------- */
  "tooltip": { group: "Tooltip", cap: "Party name, explained", wide: true,
    when: "Hover or keyboard-focus the info icon. It hangs off the card so it covers nothing.",
    build: a => { a.rows([ME]); a.tip(true); a.msgHidden(); } },

  /* ---- the room size key --------------------------------------------- */
  "size-menu": { group: "Room size", cap: "Menu open", tall: true,
    when: "Click the size key, or press Down on it. Arrows, Home, End, Enter, Escape.",
    build: a => { a.rows([ME]); a.menu(true); a.msgHidden(); } },
  "size-any": { group: "Room size", cap: "Any size",
    when: "The default: every lobby with room for all of you.",
    build: a => { a.rows([ME]); a.size("Any"); a.msgHidden(); } },

  /* ---- the primary key ------------------------------------------------ */
  "key-find": { group: "The key", cap: "Find room",
    when: "A tap searches the lobby list for one with a seat for each of you.",
    build: a => { a.rows([ME]); a.msgHidden(); } },
  "key-disabled": { group: "The key", cap: "Disabled",
    when: "No party name, or paused.",
    build: a => { a.party(""); a.rows([ME]); a.dot("wait"); a.key("Find room", { disabled: true });
                  a.say("Name your party above, same on both machines."); } },
  "key-hold": { group: "The key", cap: "Hold to move",
    when: "You are all in one room, so a stray tap must not drag everyone out.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "", "kpj-same"]]);
                  a.key("Hold to move", { hold: true }); a.msgHidden(); } },
  "key-holding": { group: "The key", cap: "Holding, 1.6s in",
    when: "Four seconds of pointer or Enter. Let go and it snaps back in 200ms.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "", "kpj-same"]]);
                  a.key("Hold to move", { hold: true, fill: "60%" });
                  a.msgHidden(); } },

  /* ---- invite ---------------------------------------------------------- */
  "invite-copied": { group: "Invite", cap: "Copied",
    when: "Click invite +. It puts a sentence on the clipboard naming the party.",
    build: a => { a.rows([ME]); a.say("Invite copied. Send it to your friend."); } },
  "invite-no-party": { group: "Invite", cap: "Nothing to invite to",
    when: "Click invite + with no name. Focus jumps to the field.",
    build: a => { a.party(""); a.rows([ME]); a.dot("wait"); a.key("Find room", { disabled: true });
                  a.say("Name your party first, then invite."); } },
  "invite-no-clipboard": { group: "Invite", cap: "Clipboard refused",
    when: "The page blocked the write, so the name is shown to read out instead.",
    build: a => { a.rows([ME]); a.say("Send them this party name: " + PARTY); } },

  /* ---- looking for a room --------------------------------------------- */
  "looking": { group: "Finding a room", cap: "Searching",
    when: "Right after the key is pressed, while the lobby list loads.",
    build: a => { a.rows([ME]); a.key("Find room", { disabled: true });
                  a.say("Looking for a lobby with space…"); } },
  "going-in": { group: "Finding a room", cap: "Found one",
    when: "A lobby fits. The code goes out to the party and the page navigates.",
    build: a => { a.rows([ME]); a.say("GNFS · 4/6 - going in."); } },
  "no-lobby-size": { group: "Finding a room", cap: "None that size",
    when: "Lobbies exist, none match the size you picked.",
    build: a => { a.rows([ME]); a.say("No 4-6 lobby with a free seat. Try another size or wait a few seconds."); } },
  "no-lobby": { group: "Finding a room", cap: "None at all",
    when: "Nothing in the list has room for all of you.",
    build: a => { a.rows([ME]); a.say("No lobby with a free seat right now. Try again in a few seconds."); } },
  "rooms-failed": { group: "Finding a room", cap: "List unreachable",
    when: "The room list request failed.",
    build: a => { a.rows([ME]); a.say("Can’t read the room list. Check your connection and try again."); } },

  /* ---- sending a room to the party ------------------------------------- */
  "sent": { group: "Sending", cap: "Sent",
    when: "You joined a room and the code went out over the relay.",
    build: a => { a.rows([ME, ["Finum", 0, "browsing"]]); a.say("Sent GNFS to your party."); } },
  "sent-alone": { group: "Sending", cap: "Nobody listening",
    when: "The code went out, but no live peer is on the topic.",
    build: a => { a.rows([ME]); a.say("Sent GNFS - nobody is listening yet."); } },
  "relay-connecting": { group: "Sending", cap: "Relay still opening",
    when: "You joined before the socket was up. It goes out on connect.",
    build: a => { a.rows([ME]); a.dot("wait"); a.say("Relay is still connecting - that room will go out in a moment."); } },
  "relay-failed": { group: "Sending", cap: "Relay refused",
    when: "The publish failed. Alt+L, or click this line, copies the log.",
    build: a => { a.rows([ME]); a.dot("wait"); a.say("Could not send to the relay. The log (Alt+L) has the detail."); } },

  /* ---- toasts, bottom right -------------------------------------------- */
  "toast-following": { group: "Toasts", tall: true, cap: "Following a friend",
    when: "A friend's room code arrived. The page is about to navigate.",
    build: a => { a.rows([ME, ["Finum", 0, "playing"]]); a.toast("Finum went to AVXF - following."); } },
  "toast-seated": { group: "Toasts", tall: true, cap: "Seated",
    when: "The auto-seat worked.",
    build: a => { a.rows([["puffa", 1, "in GNFS"], ["Finum", 0, "", "kpj-same"]]); a.toast("You're in GNFS."); } },
  "toast-filled": { group: "Toasts", tall: true, cap: "Room filled up",
    when: "You arrived and every seat had gone.",
    build: a => { a.rows([ME]); a.toast("GNFS filled up before you got there. Try Find a room again."); } },
  "toast-no-name": { group: "Toasts", tall: true, cap: "Krillion wants a name",
    when: "Krillion will not seat you without a display name. Stays until dismissed.",
    build: a => { a.rows([ME]); a.toast("Enter your name above - Krillion needs it before it seats you.", true); } },
  "toast-verify": { group: "Toasts", tall: true, cap: "Verification",
    when: "A Cloudflare check is on screen. Stays until dismissed.",
    build: a => { a.rows([ME]); a.toast("Krillion wants a quick verification - complete it and you're in.", true); } },
  "toast-seat-timeout": { group: "Toasts", tall: true, cap: "Seat timed out",
    when: "15 seconds of trying and no seat. Stays until dismissed.",
    build: a => { a.rows([ME]); a.toast("Couldn’t get into GNFS. Open the room and press Take a seat.", true); } },
  "toast-seat-failed": { group: "Toasts", tall: true, cap: "Seat refused",
    when: "The button was clicked but you are still not in. Stays until dismissed.",
    build: a => { a.rows([ME]); a.toast("Couldn’t seat you in GNFS. Press Take a seat to join.", true); } },
  "toast-log-copied": { group: "Toasts", tall: true, cap: "Log copied",
    when: "Alt+L, or a click on the status line.",
    build: a => { a.rows([ME]); a.toast("Log copied - paste it to whoever is debugging."); } },
  "toast-clipboard-blocked": { group: "Toasts", tall: true, cap: "Clipboard blocked",
    when: "The page refused the clipboard write, so the log went to the console.",
    build: a => { a.rows([ME]); a.toast("Clipboard blocked - the log is in the console (F12)."); } }
};
