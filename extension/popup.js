const box = document.getElementById("party");
const ok = document.getElementById("ok");

chrome.storage.sync.get({ party: "" }, c => { box.value = c.party || ""; });

let flash;
box.addEventListener("input", () => {
  chrome.storage.sync.set({ party: box.value.trim() }, () => {
    ok.textContent = "saved";
    clearTimeout(flash);
    flash = setTimeout(() => (ok.textContent = ""), 1200);
  });
});
