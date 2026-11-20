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
    suggested: false, // "Suggested for you" posts from pages you don't follow
    contentWidth: "100%" // max width of the widened content column
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
    root.style.setProperty("--cleanfb-width", settings.contentWidth || "100%");
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

  // Comments are [role=article] too, and a reel/video post's comment links all
  // point to /reel/...?comment_id=..., so without exempting them every comment
  // under a reel would be classified as "reels" and hidden.
  const COMMENT_LABEL = /comment|reply|留言|回覆|回复|评论|評論|bìnhluận|phảnhồi/i;
  function isComment(el) {
    for (let a = el.closest('[role="article"]'); a; a = a.parentElement && a.parentElement.closest('[role="article"]')) {
      if (COMMENT_LABEL.test(norm(a.getAttribute("aria-label")))) return true;
    }
    return false;
  }

  // Never filter things the user opened on purpose (post dialog, comments).
  // Posts in the feed itself are never treated as comments.
  const FEED_POST_SEL = '[role="feed"] > *, [aria-posinset], [data-pagelet^="FeedUnit"]';
  function exempt(el) {
    if (el.closest('[role="dialog"]')) return true;
    return isComment(el) && !el.closest(FEED_POST_SEL);
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
      if (isComment(el)) continue;
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
      if (el.closest(`[${HIDE_ATTR}]`) || el.closest('[role="dialog"]') || isComment(el)) continue;
      const type = headingType(el);
      if (!type) continue;
      const card = cardFromHeading(el);
      if (card && !card.contains(document.querySelector('[role="feed"]'))) card.setAttribute(HIDE_ATTR, type);
    }
  }

  // Always classify (even if a filter is off) so toggling only flips a CSS class.
  function checkUnit(unit) {
    if (!unit.isConnected || unit.hasAttribute(HIDE_ATTR) || exempt(unit)) return;
    const type = classify(unit);
    if (type) unit.setAttribute(HIDE_ATTR, type);
    else if (wideActive()) widenTree(unit, 8, 4);
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
        if (r.width < 100) continue;
        const left = r.right <= mr.left + 2;
        const right = r.left >= mr.right - 2;
        if (!left && !right) continue;
        // Empty wrapper whose contents our CSS already hid, but which still
        // reserves its column width.
        const emptySpacer = r.height < 10;
        if (!emptySpacer) {
          if (r.height < vh * 0.5 || r.top > 200) continue;
          if (r.bottom <= mr.top || r.top >= mr.bottom) continue;
        }
        sib.setAttribute(RAIL_ATTR, left ? "left" : "right");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Widen the content column into the space the rails used to take
  // ---------------------------------------------------------------------------
  // Facebook caps the feed at ~680px with obfuscated classes, so we detect the
  // caps by layout instead: walking down from the container that held the
  // rails, any wide block (>= 500px) that is narrower than its parent gets
  // data-cleanfb-wide="box" (stretched); wide blocks with a px max-width get
  // data-cleanfb-wide="max" (cap lifted). Small things (avatars, buttons) and
  // deep media inside posts are left alone.
  const WIDE_ATTR = "data-cleanfb-wide";
  const MIN_WIDE = 500;
  const RAIL_SEL = [
    `[${RAIL_ATTR}]`, '[role="complementary"]', '[data-pagelet="LeftRail"]', '[data-pagelet="RightRail"]',
    '[role="navigation"][aria-label="捷徑"]', '[role="navigation"][aria-label="Shortcuts"]'
  ].join(",");
  let wideChanged = false;
  let lastMainWidth = 0;

  // Only widen on pages that had side rails (home feed, groups, ...), not on
  // pages with their own layout (profiles, Messenger).
  function wideActive() {
    return root.classList.contains("cleanfb-rails") && !!document.querySelector(RAIL_SEL);
  }

  function markWide(el, mode) {
    const cur = el.getAttribute(WIDE_ATTR);
    if (cur === mode || cur === "box") return;
    el.setAttribute(WIDE_ATTR, mode);
    wideChanged = true;
  }

  // Does `el` share its row with a visible sibling column (e.g. a group's
  // "About" box next to its posts)? Then stretching it would break the layout.
  function hasSideSibling(el, r) {
    for (const sib of el.parentElement.children) {
      if (sib === el) continue;
      const s = sib.getBoundingClientRect();
      if (s.width < 150 || s.height < 50) continue;
      if (s.bottom > r.top && s.top < r.bottom) return true;
    }
    return false;
  }

  // Fit one element to its parent: stretch it if it's capped narrower than the
  // parent, or lift a px max-width cap.
  function fitToParent(el, allowBox) {
    if (el.matches('[role="banner"], [role="dialog"], img, video, svg, canvas')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < MIN_WIDE) return false;
    const parentWidth = el.parentElement.getBoundingClientRect().width;
    if (allowBox && r.width < parentWidth * 0.9 && !hasSideSibling(el, r)) markWide(el, "box");
    else if (getComputedStyle(el).maxWidth.endsWith("px")) markWide(el, "max");
    return true;
  }

  // Breadth-first so each parent is widened before its children are measured.
  function widenTree(start, maxDepth, boxDepth, stopAtUnits = false) {
    const queue = [[start, 0]];
    while (queue.length) {
      const [el, depth] = queue.shift();
      for (const child of el.children) {
        if (child.hasAttribute(RAIL_ATTR) || child.hasAttribute(HIDE_ATTR)) continue;
        if (!fitToParent(child, depth < boxDepth)) continue;
        if (stopAtUnits && child.matches(UNIT_SEL)) continue; // posts handled in checkUnit
        if (depth + 1 < maxDepth) queue.push([child, depth + 1]);
      }
    }
  }

  function widenLayout() {
    if (!wideActive()) return;
    const main = document.querySelector('[role="main"]');
    if (!main) return;

    // 1. The path from <body> down to [role=main], outermost first.
    const chain = [];
    for (let el = main; el && el !== document.body; el = el.parentElement) chain.unshift(el);
    for (const el of chain) fitToParent(el, true);

    // 2. Everything inside main down to the posts (feed column, composer, stories).
    widenTree(main, 30, 30, true);

    // Column width changed: re-fit posts already on the page.
    const mw = Math.round(main.getBoundingClientRect().width);
    if (mw !== lastMainWidth) {
      lastMainWidth = mw;
      document.querySelectorAll(UNIT_SEL).forEach((u) => pendingUnits.add(unitOf(u)));
      schedule();
    }

    if (wideChanged) {
      wideChanged = false;
      railsDirty = true; // layout moved; re-check for rails/caps once more
      // Let Facebook recompute image/video sizes for the new width.
      setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
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
      document.querySelectorAll(`[${RAIL_ATTR}], [${WIDE_ATTR}]`).forEach((el) => {
        el.removeAttribute(RAIL_ATTR);
        el.removeAttribute(WIDE_ATTR);
      });
      lastMainWidth = 0;
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
      widenLayout();
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

  // Facebook may overwrite <html class>, which would drop our filter classes:
  // put them back if any went missing.
  function classesMissing() {
    const on = settings.enabled;
    if (root.classList.contains("cleanfb-rails") !== (on && settings.centerFeed && !railsExcluded())) return true;
    return FILTERS.some((f) => root.classList.contains(`cleanfb-${f}`) !== !!(on && settings[f]));
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
  new MutationObserver(() => { if (classesMissing()) applyClasses(); })
    .observe(root, { attributes: true, attributeFilter: ["class"] });
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
    // Width or rails toggled: let Facebook re-fit images/videos.
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  });
})();
