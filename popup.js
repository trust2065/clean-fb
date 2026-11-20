const defaults = { enabled: true, ads: true, reels: true, friends: true };
const keys = Object.keys(defaults);

function getSettings(callback) {
  chrome.storage.sync.get(keys, (stored) => callback({ ...defaults, ...stored }));
}

function saveSettings(settings) {
  chrome.storage.sync.set(settings);
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "settingsChanged", settings });
    }
  });
}

getSettings((settings) => {
  const ads = document.querySelector("#ads");
  const reels = document.querySelector("#reels");
  const friends = document.querySelector("#friends");
  const toggleAll = document.querySelector("#toggleAll");

  ads.checked = settings.ads;
  reels.checked = settings.reels;
  friends.checked = settings.friends;
  toggleAll.textContent = settings.enabled ? "On" : "Off";
  toggleAll.setAttribute("aria-pressed", String(settings.enabled));
  [ads, reels, friends].forEach((input) => {
    input.disabled = !settings.enabled;
  });

  for (const [key, input] of [["ads", ads], ["reels", reels], ["friends", friends]]) {
    input.addEventListener("change", () => {
      getSettings((current) => saveSettings({ ...current, [key]: input.checked }));
    });
  }

  toggleAll.addEventListener("click", () => {
    getSettings((current) => {
      const enabled = !current.enabled;
      const next = { ...current, enabled };
      saveSettings(next);
      toggleAll.textContent = enabled ? "On" : "Off";
      toggleAll.setAttribute("aria-pressed", String(enabled));
      [ads, reels, friends].forEach((input) => { input.disabled = !enabled; });
    });
  });
});
