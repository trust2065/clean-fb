(() => {
  const defaults = { enabled: true, ads: true, reels: true, friends: true };

  const patterns = {
    ads: [
      /\bsponsored\b/i,
      /\bpaid partnership\b/i,
      /được tài trợ/i,
      /sponsor(?:isé|isé|isé|ed)?/i
    ],
    reels: [
      /\breels\b/i,
      /\bwatch reels\b/i,
      /\breel\b/i,
      /facebook reel/i,
      /thước phim/i,
      /xem reel/i
    ],
    friends: [
      /people you may know/i,
      /suggested for you/i,
      /friend suggestions/i,
      /gợi ý kết bạn/i,
      /những người bạn có thể biết/i,
      /你可能認識的朋友/i,
      /可能認識的人/i,
      /可能认识的朋友/i,
      /好友建議/i,
      /好友建议/i
    ]
  };

  let settings = { ...defaults };
  function matchesText(text, type) {
    return patterns[type].some((pattern) => pattern.test(text));
  }

  function findFeedCandidates() {
    const selectors = [
      '[role="article"]',
      '[data-pagelet^="FeedUnit"]',
      '[data-pagelet*="Reels"]',
      '[data-pagelet*="reel"]',
      '[data-pagelet*="People"]',
      '[data-pagelet*="RightRail"]',
      'div[role="feed"] > div',
      'article'
    ];
    return document.querySelectorAll(selectors.join(","));
  }

  function classifyCandidate(candidate) {
    if (candidate.closest("[data-clean-fb]")) return;
    if (candidate.querySelector("[data-clean-fb]")) return;

    const text = (candidate.innerText || candidate.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return;

    for (const type of ["ads", "reels", "friends"]) {
      if (!settings[type]) continue;
      if (matchesText(text, type)) {
        const target = candidate.closest('[role="article"]') || candidate;
        target.setAttribute("data-clean-fb", type);
        return;
      }
    }

    // Facebook often puts Reels and friend modules in named pagelets.
    if (settings.reels && /reel/i.test(candidate.getAttribute("data-pagelet") || "")) {
      candidate.setAttribute("data-clean-fb", "reels");
    } else if (settings.friends && /people|friend/i.test(candidate.getAttribute("data-pagelet") || "")) {
      candidate.setAttribute("data-clean-fb", "friends");
    }
  }

  function applySettings() {
    const root = document.documentElement;
    root.classList.toggle("clean-fb-hide-ads", settings.enabled && settings.ads);
    root.classList.toggle("clean-fb-hide-reels", settings.enabled && settings.reels);
    root.classList.toggle("clean-fb-hide-friends", settings.enabled && settings.friends);

    if (!settings.enabled) {
      document.querySelectorAll("[data-clean-fb]").forEach((node) => node.removeAttribute("data-clean-fb"));
      return;
    }

    scan();
  }

  function scan() {
    findFeedCandidates().forEach(classifyCandidate);

    if (settings.enabled && settings.reels) {
      const reelLinks = document.querySelectorAll(
        'a[href*="/reel"], a[href*="/reels"], a[aria-label*="Reel" i], a[aria-label*="Reels" i]'
      );

      reelLinks.forEach((link) => {
        const article = link.closest('[role="article"], [data-pagelet], article');
        const pagelet = link.closest('[data-pagelet]');
        const target =
          article ||
          pagelet ||
          link.closest('[role="navigation"] li, [role="navigation"] [role="link"], [role="link"]') ||
          link;
        target.setAttribute("data-clean-fb", "reels");
      });

      document.querySelectorAll('[data-pagelet]').forEach((pagelet) => {
        if (/reel/i.test(pagelet.getAttribute("data-pagelet") || "")) {
          pagelet.setAttribute("data-clean-fb", "reels");
        }
      });
    }
  }

  function scanMutationTarget(target) {
    if (target instanceof Text) {
      target = target.parentElement;
    }
    if (!(target instanceof Element)) return;

    const scope =
      target.closest('[role="article"], [data-pagelet], div[role="feed"] > div, article') ||
      target.querySelector(
        '[role="article"], [data-pagelet], div[role="feed"] > div, article'
      ) ||
      target;

    classifyCandidate(scope);

    const reelLinks = scope.querySelectorAll(
      'a[href*="/reel"], a[href*="/reels"], a[aria-label*="Reel" i], a[aria-label*="Reels" i]'
    );

    reelLinks.forEach((link) => {
      const article = link.closest('[role="article"], [data-pagelet], article');
      const target = article || link.closest('[role="navigation"] li, [role="link"]') || link;
      target.setAttribute("data-clean-fb", "reels");
    });

    if (settings.reels) {
      const pagelets = scope.matches('[data-pagelet]')
        ? [scope]
        : scope.querySelectorAll('[data-pagelet]');
      pagelets.forEach((pagelet) => {
        if (/reel/i.test(pagelet.getAttribute("data-pagelet") || "")) {
          pagelet.setAttribute("data-clean-fb", "reels");
        }
      });
    }
  }

  function queueScan(records) {
    if (!records) {
      scan();
      return;
    }

    records.forEach((record) => {
      if (record.type === "childList") {
        record.addedNodes.forEach((node) => scanMutationTarget(node));
      } else {
        scanMutationTarget(record.target);
      }
    });
  }

  chrome.storage.sync.get(defaults, (stored) => {
    settings = { ...defaults, ...stored };
    applySettings();

    const observer = new MutationObserver((records) => queueScan(records));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["href", "data-pagelet", "aria-label"]
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "settingsChanged") {
      settings = { ...defaults, ...message.settings };
      applySettings();
    }
  });
})();
