(() => {
  const switcher = document.querySelector(".language-switch");
  const options = [...switcher.querySelectorAll("[data-language]")];
  const current = document.documentElement.lang;
  const storageKey = "inkstone.website.language";
  const focusKey = "inkstone.website.language-focus";

  // Explicit page URLs always win. The directory entry remembers a visitor's choice.
  if (location.pathname.endsWith("/")) {
    let preferred = navigator.language.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en";
    try {
      preferred = localStorage.getItem(storageKey) || preferred;
    } catch {}
    if (preferred === "zh-CN" && current !== preferred) {
      location.replace(new URL(`zh.html${location.hash}`, location.href));
      return;
    }
  }

  function updateLinks() {
    for (const option of options) {
      const file = option.dataset.language === "en" ? "index.html" : "zh.html";
      option.href = `${file}${location.hash}`;
    }
  }
  updateLinks();
  addEventListener("hashchange", updateLinks);
  let navigating = false;
  for (const option of options) {
    option.addEventListener("click", (event) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      event.preventDefault();
      if (navigating || option.dataset.language === current) return;
      navigating = true;
      const language = option.dataset.language;
      switcher.dataset.language = language;
      try {
        localStorage.setItem(storageKey, language);
        sessionStorage.setItem(focusKey, "true");
      } catch {}
      const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 160;
      setTimeout(() => location.assign(option.href), delay);
    });
    option.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const target =
        options[event.key === "ArrowLeft" || event.key === "Home" ? 0 : 1];
      target.focus();
      target.click();
    });
  }
  let restoreLanguageFocus = false;
  try {
    if (sessionStorage.getItem(focusKey)) {
      sessionStorage.removeItem(focusKey);
      restoreLanguageFocus = true;
    }
  } catch {}
  // The back/forward cache can restore the outgoing slider's animation state.
  addEventListener("pageshow", () => {
    navigating = false;
    switcher.dataset.language = current;
    // Restore focus after the browser has followed the current section's fragment.
    if (restoreLanguageFocus) {
      restoreLanguageFocus = false;
      requestAnimationFrame(() => {
        options
          .find((option) => option.dataset.language === current)
          ?.focus({ preventScroll: true });
      });
    }
  });

  // Keep separators equally light in English and Chinese typography.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      node.nodeValue.includes("·") &&
      !node.parentElement.closest(".mono, .tree, kbd, script")
    )
      hits.push(node);
  }
  for (const node of hits) {
    const fragment = document.createDocumentFragment();
    node.nodeValue.split(/\s*·\s*/).forEach((part, index) => {
      if (index) {
        const dot = document.createElement("i");
        dot.className = "ms";
        dot.textContent = "·";
        fragment.append(dot, document.createElement("wbr"));
      }
      fragment.append(part);
    });
    node.replaceWith(fragment);
  }
})();
