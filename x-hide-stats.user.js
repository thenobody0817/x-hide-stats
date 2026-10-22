// ==UserScript==
// @name         x-hide-stats
// @namespace    https://github.com/thenobody0817/x-hide-stats
// @version      1.1.0
// @description  Hide engagement counts, view counts and follower/following stats on x.com
// @author       thenobody0817
// @license      MIT
// @match        https://x.com/*
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://mobile.x.com/*
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/thenobody0817/x-hide-stats/main/x-hide-stats.user.js
// @updateURL    https://raw.githubusercontent.com/thenobody0817/x-hide-stats/main/x-hide-stats.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'x-hide-stats:v1';

  const GROUP_LABELS = {
    engagement: 'Engagement counts (reply / repost / like / bookmark)',
    views: 'View counts (views / impressions)',
    profile: 'Profile stats (followers / following / posts)',
  };
  const GROUP_ORDER = ['engagement', 'views', 'profile'];

  const state = { engagement: true, views: true, profile: true };

  // ---------------------------------------------------------------- storage

  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
    } catch (e) {}
    return fallback;
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(key, value);
    } catch (e) {}
  }

  function restore() {
    const raw = gmGet(STORAGE_KEY, '');
    if (typeof raw !== 'string' || !raw) return;
    try {
      const saved = JSON.parse(raw);
      for (const group of GROUP_ORDER) {
        if (typeof saved[group] === 'boolean') state[group] = saved[group];
      }
    } catch (e) {}
  }

  function persist() {
    gmSet(STORAGE_KEY, JSON.stringify(state));
  }

  // ------------------------------------------------------------------- css
  //
  // x.com serves two different front-ends and both are in the wild:
  //
  //   classic  <button data-testid="reply"> ... <span data-testid="app-text-transition-container">15</span>
  //   2026     <div data-engagement-action="reply"> ... <span class="x-animated-count-visual">4K</span>
  //
  // Only the number is hidden; the icon, the button and its hit area stay.

  const CSS = {
    engagement: `
/* classic x.com: the count sits in its own div next to the icon */
button[data-testid="reply"] div:has(> span[data-testid="app-text-transition-container"]),
button[data-testid="retweet"] div:has(> span[data-testid="app-text-transition-container"]),
button[data-testid="unretweet"] div:has(> span[data-testid="app-text-transition-container"]),
button[data-testid="like"] div:has(> span[data-testid="app-text-transition-container"]),
button[data-testid="unlike"] div:has(> span[data-testid="app-text-transition-container"]),
button[data-testid="bookmark"] div:has(> span[data-testid="app-text-transition-container"]),
button[data-testid="removeBookmark"] div:has(> span[data-testid="app-text-transition-container"]),
/* 2026 x.com: the count is an animated span inside the engagement pill */
div[data-engagement-action="reply"] :is(span:has(> .x-animated-count-visual), .x-animated-count-visual),
div[data-engagement-action="retweet"] :is(span:has(> .x-animated-count-visual), .x-animated-count-visual),
div[data-engagement-action="like"] :is(span:has(> .x-animated-count-visual), .x-animated-count-visual),
div[data-engagement-action="bookmark"] :is(span:has(> .x-animated-count-visual), .x-animated-count-visual),
[data-xhs-hide~="engagement"]
{ display: none !important; }
`,
    views: `
/* classic x.com: the view counter in the action bar and the permalink bar */
a[href$="/analytics"] div:has(> span[data-testid="app-text-transition-container"]),
/* the "411 Views" chunk of the permalink bar, number and label together */
a[href$="/analytics"]:has(> span),
/* 2026 x.com: the "View count" pill */
div[data-engagement-action="generic"] :is(span:has(> .x-animated-count-visual), .x-animated-count-visual),
[data-xhs-hide~="views"]
{ display: none !important; }
`,
    profile: `
[data-xhs-hide~="profile"]
{ display: none !important; }
`,
  };

  // ------------------------------------------------------------- selectors

  const METRIC_BUTTONS = [
    'button[data-testid="reply"]',
    'button[data-testid="retweet"]',
    'button[data-testid="unretweet"]',
    'button[data-testid="like"]',
    'button[data-testid="unlike"]',
    'button[data-testid="bookmark"]',
    'button[data-testid="removeBookmark"]',
  ].join(',');

  const NEW_ACTIONS = [
    'div[data-engagement-action="reply"]',
    'div[data-engagement-action="retweet"]',
    'div[data-engagement-action="like"]',
    'div[data-engagement-action="bookmark"]',
  ].join(',');

  const VIEWS_LINK = 'a[href$="/analytics"]';
  const VIEWS_ACTION = 'div[data-engagement-action="generic"]';

  const PROFILE_LINKS = [
    'a[href$="/followers"]',
    'a[href$="/following"]',
    'a[href$="/verified_followers"]',
  ].join(',');

  const IMPRESSION_TILES = '[data-testid="impressions"]';
  const ENGAGEMENT_TILES = '[data-testid="engagements"]';

  // A bare number: 15, 1,234, 8.7K, 89.5K, 1.2M
  const COUNT_ONLY = /^\s*\d[\d.,]*\s*[KMB]?\s*$/;
  // A number followed by a stat word: "12.5M Followers", "31K posts", "398 Views"
  const COUNT_AND_WORD =
    /^\s*\d[\d.,]*\s*[KMB]?\s*(followers?|following|posts?|tweets?|views?|impressions?)\s*$/i;

  // ---------------------------------------------------------------- helpers

  function qsa(root, selector) {
    const found = [];
    if (!root || root.nodeType !== 1) return found;
    if (root.matches && root.matches(selector)) found.push(root);
    found.push.apply(found, root.querySelectorAll(selector));
    return found;
  }

  function mark(element, group) {
    if (!element || element.nodeType !== 1) return;
    const current = element.getAttribute('data-xhs-hide') || '';
    if (current.split(/\s+/).indexOf(group) !== -1) return;
    element.setAttribute('data-xhs-hide', current ? current + ' ' + group : group);
  }

  function isCountLeaf(element) {
    if (!element || element.children.length !== 0) return false;
    return COUNT_ONLY.test(element.textContent || '');
  }

  // --------------------------------------------------------------- aria fix
  //
  // The classic front-end puts the count into the accessible name:
  //   aria-label="15 Replies. Reply"  ->  "Reply"
  //   aria-label="1 reply, 6 reposts, 8784 likes"  ->  "reply, reposts, likes"
  // A screen reader would otherwise read every number out loud, so the
  // numbers are dropped from the label.  The visible number is hidden by CSS.

  function scrubAria(element) {
    if (!element || element.nodeType !== 1) return;
    const label = element.getAttribute('aria-label');
    if (!label || !/\d/.test(label)) return;
    let next = label.replace(/\b\d[\d.,]*\s*[KMB]?\s+(?=[a-z])/gi, '');
    next = next.replace(/^\s*[a-z]+\.\s+/i, '');
    next = next.replace(/\s{2,}/g, ' ').trim();
    if (next && next !== label) element.setAttribute('aria-label', next);
  }

  // ---------------------------------------------------------------- marking

  // Hide the number inside every container of a given kind.
  function markCounters(root, group, selector) {
    for (const container of qsa(root, selector)) {
      for (const element of container.querySelectorAll('span, div')) {
        if (isCountLeaf(element)) {
          mark(element, group);
          break;
        }
      }
    }
  }

  // Hide the number next to "Followers" / "Following" on profiles and cards.
  function markProfileCounts(root) {
    for (const link of qsa(root, PROFILE_LINKS)) {
      let done = false;
      for (const element of link.querySelectorAll('span, div')) {
        if (isCountLeaf(element)) {
          mark(element, 'profile');
          done = true;
          break;
        }
      }
      if (!done && COUNT_AND_WORD.test(link.textContent || '')) mark(link, 'profile');
    }
  }

  // Hide whole cells where the number and its label belong together:
  // "31K posts" (one text node), "398 Views" and "165.6K Views" (split nodes).
  function markCountLabels(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const leaves = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (COUNT_AND_WORD.test(text)) {
        const parent = node.parentElement;
        if (!parent) continue;
        const own = (parent.textContent || '').replace(/\s+/g, ' ').trim();
        if (own !== text) continue;
        if (parent.closest('[dir="auto"], [data-testid="tweetText"]')) continue;
        if (parent.closest(PROFILE_LINKS)) continue;
        mark(parent, /views?|impressions?/i.test(text) ? 'views' : 'profile');
      } else if (COUNT_ONLY.test(text)) {
        leaves.push(node.parentElement);
      }
    }
    for (const leaf of leaves) {
      if (!leaf) continue;
      let element = leaf;
      let depth = 0;
      while (element && element !== document.body && depth < 6) {
        const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length <= 40 && COUNT_AND_WORD.test(text)) {
          if (
            !element.closest('[dir="auto"], [data-testid="tweetText"]') &&
            !element.closest(PROFILE_LINKS)
          ) {
            mark(element, /views?|impressions?/i.test(text) ? 'views' : 'profile');
          }
          break;
        }
        element = element.parentElement;
        depth++;
      }
    }
  }

  // ---------------------------------------------------------------- process

  function process(root) {
    if (!root || root.nodeType !== 1) return;

    if (state.engagement) {
      markCounters(root, 'engagement', METRIC_BUTTONS);
      markCounters(root, 'engagement', NEW_ACTIONS);
      markCounters(root, 'engagement', ENGAGEMENT_TILES);
      for (const button of qsa(root, METRIC_BUTTONS)) scrubAria(button);
    }

    if (state.views) {
      markCounters(root, 'views', VIEWS_LINK);
      markCounters(root, 'views', VIEWS_ACTION);
      markCounters(root, 'views', IMPRESSION_TILES);
      for (const link of qsa(root, VIEWS_LINK)) scrubAria(link);
    }

    if (state.profile) {
      markProfileCounts(root);
    }

    if (state.views || state.profile) {
      markCountLabels(root);
    }

    if (state.engagement || state.views) {
      for (const group of qsa(root, '[role="group"]')) {
        if (group.querySelector(METRIC_BUTTONS)) scrubAria(group);
      }
    }
  }

  // --------------------------------------------------------------- observer

  const pending = new Set();
  let frameId = 0;
  let timerId = 0;

  function flush() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (timerId) {
      clearTimeout(timerId);
      timerId = 0;
    }
    const nodes = [];
    for (const node of pending) {
      if (!node.isConnected) continue;
      const nested = nodes.some((other) => other.contains(node));
      if (!nested) nodes.push(node);
    }
    pending.clear();
    for (const node of nodes) process(node);
  }

  // requestAnimationFrame is suspended while the tab is in the background, so
  // a timer is used as well: otherwise the counts stay visible until the tab
  // is focused again.
  function schedule() {
    if (!frameId) frameId = requestAnimationFrame(flush);
    if (!timerId) timerId = setTimeout(flush, 50);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.attributeName === 'aria-label' && record.target.nodeType === 1) {
          pending.add(record.target);
        }
      } else if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) pending.add(node);
        }
      }
    }
    schedule();
  });

  function observe() {
    const target = document.body || document.documentElement;
    if (!target) return;
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    if (document.body) process(document.body);
  }

  // ------------------------------------------------------------------ menus

  let menuIds = [];

  function refreshMenus() {
    for (const id of menuIds) {
      try {
        if (typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(id);
      } catch (e) {}
    }
    menuIds = [];
    if (typeof GM_registerMenuCommand !== 'function') return;
    for (const group of GROUP_ORDER) {
      try {
        menuIds.push(
          GM_registerMenuCommand(
            GROUP_LABELS[group] + ': ' + (state[group] ? 'ON' : 'OFF'),
            () => toggle(group),
          ),
        );
      } catch (e) {}
    }
    try {
      menuIds.push(
        GM_registerMenuCommand('Reset all groups to ON', () => {
          for (const group of GROUP_ORDER) state[group] = true;
          persist();
          applyCss();
          refreshMenus();
          rescan();
        }),
      );
    } catch (e) {}
  }

  function toggle(group) {
    state[group] = !state[group];
    persist();
    applyCss();
    refreshMenus();
    rescan();
  }

  // ------------------------------------------------------------------- boot

  const style = document.createElement('style');
  style.id = 'x-hide-stats';

  function applyCss() {
    let css = '';
    for (const group of GROUP_ORDER) {
      if (state[group]) css += CSS[group] + '\n';
    }
    style.textContent = css;
  }

  function rescan() {
    if (document.body) process(document.body);
  }

  restore();
  applyCss();
  (document.head || document.documentElement).appendChild(style);
  refreshMenus();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe, { once: true });
  } else {
    observe();
  }
})();
