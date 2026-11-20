(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    enabled: true,
    centerFeed: true, // hide left & right rails, keep only the content column
    ads: true,
    reels: true,
    friends: true, // 你可能認識的朋友 / People you may know
    groups: true, // 你的社團建議 / Suggested groups
    suggested: false // "Suggested for you" posts from pages you don't follow
  };
  const FILTERS = ["ads", "reels", "friends", "groups", "suggested"];
  // Pages where the side rails are the content (e.g. Messenger chat list).
  const RAIL_EXCLUDED = [/^\/messages/, /^\/settings/];

  let settings = { ...DEFAULTS };
  const root = document.documentElement;

  function applyClasses() {
    const on = settings.enabled;
    root.classList.toggle("cleanfb-rails", on && settings.centerFeed && !railsExcluded());
    for (const f of FILTERS) root.classList.toggle(`cleanfb-${f}`, on && settings[f]);
  }

  // Apply defaults immediately (we run at document_start) so nothing flashes
  // before storage has loaded.
  applyClasses();

  // ---------------------------------------------------------------------------
  // Text helpers
  // ---------------------------------------------------------------------------
  // Lowercase and strip whitespace, zero-width chars and separators.
  const norm = (s) => (s || "").toLowerCase().replace(/[\s ​-‏⁠﻿·•]/g, "");

  const AD_LABELS = [
    "sponsored", "贊助", "赞助", "廣告", "广告", "đượctàitrợ", "sponsorisé",
    "gesponsert", "patrocinado", "publicidad", "sponsorizzato", "gesponsord",
    "sponsorowane", "реклама", "広告", "광고", "ได้รับการสนับสนุน", "bersponsor"
  ].map(norm);

  const HEADINGS = {
    reels: [
      /^reels?$/, /^reels?(and|&|和|與|与|・)/, /^連續短片/, /^短片$/, /^短影音/, /^thướcphim/
    ],
    friends: [
      /^peopleyoumayknow$/, /^suggestedfriends$/, /^friendsuggestions$/,
      /^你可能認識的(朋友|人)$/, /^你可能认识的(朋友|人)$/, /^可能認識的(朋友|人)$/,
      /^好友建議$/, /^好友建议$/, /^朋友建議$/, /^建議的朋友$/,
      /^nhữngngườibạncóthểbiết$/, /^nhữngngườibạncóthểquen$/, /^gợiýkếtbạn$/
    ],
    groups: [
      /^suggestedgroups$/, /^suggestedgroupsforyou$/, /^groupssuggestedforyou$/, /^groupsyoumightlike$/,
      /^你的社團建議$/, /^社團建議$/, /^建議的社團$/, /^推薦社團$/, /^為你推薦的社團$/, /^你可能會喜歡的社團$/,
      /^你的小组推荐$/, /^小组推荐$/, /^推荐小组$/
    ],
    suggested: [
      /^suggestedforyou$/, /^為你推薦$/, /^为你推荐$/, /^推薦給你$/, /^建議貼文$/, /^建議你追蹤$/
    ]
  };

  // Is `needle` a subsequence of `hay`? Used as a cheap pre-filter for the
  // obfuscated "Sponsored" label (real letters mixed with hidden decoys).
  function isSubsequence(needle, hay) {
    let i = 0;
    for (let j = 0; j < hay.length && i < needle.length; j++) if (hay[j] === needle[i]) i++;
    return i === needle.length;
  }

  // Text the user actually sees: drops text nodes that are not rendered,
  // invisible, or pushed outside the element box, and orders by x position
  // (Facebook scrambles letter order with flexbox `order`).
  function visibleText(el) {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return "";
    const parts = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = norm(n.nodeValue);
      if (!t) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right) continue;
      const cs = getComputedStyle(n.parentElement);
      if (cs.visibility === "hidden" || cs.opacity === "0" || parseFloat(cs.fontSize) === 0) continue;
      parts.push({ x: r.left, t });
    }
    parts.sort((a, b) => a.x - b.x);
    return parts.map((p) => p.t).join("");
  }

  // ---------------------------------------------------------------------------
  // Feed units
  // ---------------------------------------------------------------------------
  const UNIT_SEL = [
    '[role="feed"] > *',
    '[data-pagelet^="FeedUnit"]',
    "[aria-posinset]",
    '[role="article"]:not([role="article"] [role="article"])'
  ].join(",");
  const HIDE_ATTR = "data-cleanfb-hide";

  // Outermost feed unit containing `el`.
  function unitOf(el) {
    let u = el.closest(UNIT_SEL);
    while (u && u.parentElement) {
      const up = u.parentElement.closest(UNIT_SEL);
      if (!up) break;
      u = up;
    }
    return u;
  }

  function isAd(unit) {
    // Direct signals.
    if (unit.querySelector('a[href*="/ads/about"], a[href*="facebook.com/ads/"], a[aria-label="Sponsored"], a[aria-label="贊助"], a[aria-label="赞助"]')) {
      return true;
    }

    // Only look in the header: skip anything after the post text, so comments
    // or captions that say "sponsored" don't trigger.
    const message = unit.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
    const inHeader = (el) => !message || !(message.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

    // aria-labelledby pointing to a (hidden) "Sponsored" text node.
    for (const el of unit.querySelectorAll("[aria-labelledby]")) {
      if (!inHeader(el)) continue;
      for (const id of el.getAttribute("aria-labelledby").split(/\s+/)) {
        const ref = id && document.getElementById(id);
        if (ref && AD_LABELS.includes(norm(ref.textContent))) return true;
      }
    }

    // SVG <use> referencing a <text> element containing the label.
    for (const use of unit.querySelectorAll("svg use")) {
      const href = use.getAttribute("href") || use.getAttribute("xlink:href") || "";
      if (!href.startsWith("#")) continue;
      const ref = document.getElementById(href.slice(1));
      if (ref && AD_LABELS.includes(norm(ref.textContent))) return true;
    }

    // Obfuscated label rendered as scrambled spans.
    for (const el of unit.querySelectorAll("a, span")) {
      const raw = norm(el.textContent);
      if (!raw || raw.length > 60) continue;
      if (!AD_LABELS.some((l) => isSubsequence(l, raw))) continue;
      if (!inHeader(el)) continue;
      if (AD_LABELS.includes(raw) || AD_LABELS.includes(visibleText(el))) return true;
    }
    return false;
  }

  const HEADING_SEL = 'h2, h3, h4, [role="heading"], span';
  const HEADING_TYPES = ["reels", "friends", "groups", "suggested"];

  // Which module title (if any) is this short text?
  function headingType(el) {
    const t = norm(el.textContent);
    if (!t || t.length > 40) return null;
    return HEADING_TYPES.find((type) => HEADINGS[type].some((p) => p.test(t))) || null;
  }

  function headingIn(unit) {
    for (const el of unit.querySelectorAll(HEADING_SEL)) {
      const type = headingType(el);
      if (type) return type;
    }
    return null;
  }

  function classify(unit) {
    if (unit.querySelector('a[href*="/reel"]')) return "reels";
    if (unit.querySelector('a[href*="/friends/suggestions"]')) return "friends";
    if (unit.querySelector('a[href*="/groups/discover"]')) return "groups";
    const heading = headingIn(unit);
    if (heading && heading !== "suggested") return heading;
    if (isAd(unit)) return "ads";
    return heading;
  }

  // Fallback for modules that aren't wrapped like a normal feed post: from the
  // title, climb to the block that is one item of a list (the feed column).
  function cardFromHeading(el) {
    const unit = unitOf(el);
    if (unit) return unit;
    const main = el.closest('[role="main"]');
    if (!main) return null;
    for (let node = el; node.parentElement && node !== main; node = node.parentElement) {
      const parent = node.parentElement;
      if (parent.childElementCount < 3) continue;
      const r = node.getBoundingClientRect();
      if (r.height > 1400) return null; // too big to be one module: bail out
      if (r.height >= 150 && r.width >= 300) return node;
    }
    return null;
  }

  function scanHeadings(scope) {
    if (!scope.isConnected || !scope.closest('[role="main"]') && !scope.querySelector('[role="main"]')) return;
    const els = scope.matches(HEADING_SEL) ? [scope] : scope.querySelectorAll(HEADING_SEL);
    for (const el of els) {
      if (el.closest(`[${HIDE_ATTR}]`)) continue;
      const type = headingType(el);
      if (!type) continue;
      const card = cardFromHeading(el);
      if (card && !card.contains(document.querySelector('[role="feed"]'))) card.setAttribute(HIDE_ATTR, type);
    }
  }

  // Always classify (even if a filter is off) so toggling only flips a CSS class.
  function checkUnit(unit) {
    if (!unit.isConnected || unit.hasAttribute(HIDE_ATTR)) return;
    const type = classify(unit);
    if (type) unit.setAttribute(HIDE_ATTR, type);
  }

  // ---------------------------------------------------------------------------
  // Left / right rails
  // ---------------------------------------------------------------------------
  const RAIL_ATTR = "data-cleanfb-rail";

  function railsExcluded() {
    return RAIL_EXCLUDED.some((r) => r.test(location.pathname));
  }

  // Walk up from the main content column and mark any tall sibling that sits
  // fully to its left or right. Only looks at ancestors of [role=main], so it's
  // cheap, and never touches the top bar, dialogs or chat windows.
  function markRails() {
    if (railsExcluded()) return;
    const main = document.querySelector('[role="main"]');
    if (!main) return;
    const mr = main.getBoundingClientRect();
    if (!mr.width) return;
    const vh = window.innerHeight;

    for (let node = main; node.parentElement && node.parentElement !== document.body; node = node.parentElement) {
      for (const sib of node.parentElement.children) {
        if (sib === node || sib.hasAttribute(RAIL_ATTR)) continue;
        if (sib.matches('[role="banner"], [role="dialog"]') || sib.querySelector('[role="banner"], [role="dialog"]')) continue;
        const r = sib.getBoundingClientRect();
        if (r.width < 100 || r.height < vh * 0.5 || r.top > 200) continue;
        const left = r.right <= mr.left + 2;
        const right = r.left >= mr.right - 2;
        if (!left && !right) continue;
        if (r.bottom <= mr.top || r.top >= mr.bottom) continue;
        sib.setAttribute(RAIL_ATTR, left ? "left" : "right");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Scanning: handles infinite scroll and SPA navigation
  // ---------------------------------------------------------------------------
  const pendingUnits = new Set();
  const pendingScopes = new Set(); // inserted subtrees outside any feed unit
  let fullScan = true;
  let railsDirty = true;
  let frame = 0;
  let lastPath = location.pathname;
  let lastRailCheck = 0;

  function schedule() {
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function flush() {
    frame = 0;
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      document.querySelectorAll(`[${RAIL_ATTR}]`).forEach((el) => el.removeAttribute(RAIL_ATTR));
      applyClasses();
      fullScan = true;
      railsDirty = true;
    }

    if (fullScan) {
      fullScan = false;
      document.querySelectorAll(UNIT_SEL).forEach((el) => pendingUnits.add(unitOf(el)));
      const main = document.querySelector('[role="main"]');
      if (main) pendingScopes.add(main);
    }
    for (const unit of pendingUnits) if (unit) checkUnit(unit);
    pendingUnits.clear();
    for (const scope of pendingScopes) scanHeadings(scope);
    pendingScopes.clear();

    // Rails render once, but lazily; re-check at most twice a second.
    const now = performance.now();
    if (railsDirty && now - lastRailCheck > 500) {
      lastRailCheck = now;
      railsDirty = false;
      markRails();
    } else if (railsDirty) {
      setTimeout(schedule, 500);
    }
  }

  function collect(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el) return;
    const unit = unitOf(el);
    if (unit) {
      pendingUnits.add(unit);
    } else {
      // A chunk was inserted outside a feed post: queue any units inside it,
      // and scan it for module titles (Reels, 你的社團建議, ...).
      el.querySelectorAll(UNIT_SEL).forEach((u) => pendingUnits.add(unitOf(u)));
      pendingScopes.add(el);
    }
  }

  const observer = new MutationObserver((records) => {
    for (const rec of records) {
      if (rec.type === "childList") rec.addedNodes.forEach(collect);
      else collect(rec.target); // characterData: text filled in later
    }
    railsDirty = true;
    schedule();
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", () => { railsDirty = true; schedule(); });

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    applyClasses();
    schedule();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, { newValue }] of Object.entries(changes)) {
      if (k in DEFAULTS) settings[k] = newValue ?? DEFAULTS[k];
    }
    applyClasses();
    railsDirty = true;
    schedule();
  });
})();
