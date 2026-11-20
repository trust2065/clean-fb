// Keep in sync with DEFAULTS in content.js. Content scripts react to
// chrome.storage changes, so every open Facebook tab updates live.
const DEFAULTS = { enabled: true, centerFeed: true, ads: true, reels: true, friends: true, groups: true, suggested: false };

const inputs = [...document.querySelectorAll("input[data-key]")];
const toggleAll = document.querySelector("#toggleAll");

function render(settings) {
  for (const input of inputs) {
    input.checked = settings[input.dataset.key];
    input.disabled = !settings.enabled;
  }
  toggleAll.textContent = settings.enabled ? "On" : "Off";
  toggleAll.setAttribute("aria-pressed", String(settings.enabled));
}

chrome.storage.sync.get(DEFAULTS, render);

for (const input of inputs) {
  input.addEventListener("change", () => chrome.storage.sync.set({ [input.dataset.key]: input.checked }));
}

toggleAll.addEventListener("click", () => {
  chrome.storage.sync.get(DEFAULTS, (s) => {
    const next = { ...s, enabled: !s.enabled };
    chrome.storage.sync.set({ enabled: next.enabled });
    render(next);
  });
});
