(() => {
  const root = document.documentElement;
  const store = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        /* storage may be unavailable */
      }
    },
  };

  /* ------------------------------------------------------------- theme */

  const themeButton = document.querySelector('[data-action="theme"]');
  const savedTheme = store.get("dp-theme", "light");
  const applyTheme = (dark) => {
    root.classList.toggle("dark", dark);
    if (themeButton) {
      themeButton.setAttribute("aria-pressed", String(dark));
      themeButton.setAttribute("aria-label", dark ? "Gaišais režīms" : "Tumšais režīms");
      themeButton.innerHTML = dark
        ? '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-634l-112-112 56-58 112 112-56 58Zm452 452-112-112 56-58 112 112-56 58ZM196-196l-56-58 112-112 56 58-112 112Zm568-568-58-56 112-112 58 56-112 112Z"/></svg>'
        : '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M481-140q-142 0-241-99t-99-241q0-142 99-241t241-99q11 0 21 .5t20 2.5q-32 35-49.5 78.5T455-480q0 92 33.5 172T583-172q-24 16-50 24t-52 8Z"/></svg>';
    }
  };
  applyTheme(savedTheme === "dark");

  /* --------------------------------------------------------- font size */

  const MIN_FONT = 14;
  const MAX_FONT = 20;
  let fontSize = Number(store.get("dp-font", "16")) || 16;
  const applyFont = () => {
    fontSize = Math.min(MAX_FONT, Math.max(MIN_FONT, fontSize));
    root.style.fontSize = `${fontSize}px`;
  };
  applyFont();

  /* ------------------------------------------------------------ drawer */

  const drawer = document.querySelector(".drawer");
  const overlay = document.querySelector(".overlay");
  const menuButton = document.querySelector('[data-action="menu"]');
  const filterInput = document.querySelector("#toc-filter");

  const setDrawer = (open) => {
    if (!drawer) return;
    drawer.classList.toggle("open", open);
    overlay?.classList.toggle("open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    menuButton?.setAttribute("aria-expanded", String(open));
    if (open) {
      window.setTimeout(() => filterInput?.focus(), 120);
    }
  };

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action], [data-font]");
    if (!target) return;
    const action = target.getAttribute("data-action");
    const font = target.getAttribute("data-font");
    if (font === "up" || font === "down") {
      fontSize += font === "up" ? 1 : -1;
      applyFont();
      store.set("dp-font", String(fontSize));
      return;
    }
    if (action === "menu") {
      setDrawer(!drawer.classList.contains("open"));
    } else if (action === "close") {
      setDrawer(false);
    } else if (action === "search") {
      setDrawer(true);
      window.setTimeout(() => filterInput?.focus(), 140);
    } else if (action === "theme") {
      const dark = !root.classList.contains("dark");
      applyTheme(dark);
      store.set("dp-theme", dark ? "dark" : "light");
    } else if (action === "fullscreen") {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen?.();
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setDrawer(false);
  });

  /* ------------------------------------------------------------ filter */

  filterInput?.addEventListener("input", () => {
    const query = filterInput.value.trim().toLowerCase();
    const nav = document.querySelector(".drawer-nav");
    if (!nav) return;
    nav.querySelectorAll("li").forEach((item) => {
      const text = item.textContent.toLowerCase();
      item.hidden = Boolean(query) && !text.includes(query);
    });
    nav.querySelectorAll(".drawer-part").forEach((group) => {
      const visible = Array.from(group.querySelectorAll("li")).some((item) => !item.hidden);
      group.hidden = Boolean(query) && !visible;
    });
  });

  /* --------------------------------------------------------- bookmarks */

  const BOOKMARK_KEY = "dp-bookmarks";
  const bookmarkButton = document.querySelector("[data-bookmark]");
  const bookmarkList = document.querySelector(".bookmark-list");
  const bookmarkGroup = document.querySelector(".drawer-bookmarks");

  const readBookmarks = () => {
    try {
      return JSON.parse(store.get(BOOKMARK_KEY, "[]")) || [];
    } catch (error) {
      return [];
    }
  };
  const renderBookmarks = () => {
    if (!bookmarkList || !bookmarkGroup) return;
    const marks = readBookmarks();
    bookmarkGroup.hidden = marks.length === 0;
    bookmarkList.innerHTML = marks
      .map((mark) => `<li><a href="${mark.url}">${mark.title}</a></li>`)
      .join("");
  };
  const syncBookmarkButton = () => {
    if (!bookmarkButton) return;
    const url = bookmarkButton.getAttribute("data-bookmark");
    const saved = readBookmarks().some((mark) => mark.url === url);
    bookmarkButton.setAttribute("aria-pressed", String(saved));
    bookmarkButton.classList.toggle("saved", saved);
    bookmarkButton.setAttribute("aria-label", saved ? "Noņemt grāmatzīmi" : "Pievienot grāmatzīmēm");
  };
  bookmarkButton?.addEventListener("click", () => {
    const url = bookmarkButton.getAttribute("data-bookmark");
    const title = bookmarkButton.getAttribute("data-title") || document.title;
    const marks = readBookmarks();
    const index = marks.findIndex((mark) => mark.url === url);
    if (index >= 0) marks.splice(index, 1);
    else marks.push({ url, title });
    store.set(BOOKMARK_KEY, JSON.stringify(marks));
    renderBookmarks();
    syncBookmarkButton();
  });
  renderBookmarks();
  syncBookmarkButton();

  /* ------------------------------------------------------ text versions */

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-variant]");
    if (!button) return;
    const bar = button.closest(".variant-bar");
    const holder = bar.parentElement;
    const value = button.dataset.variant;
    bar.querySelectorAll("[data-variant]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    holder.querySelectorAll("[data-variant-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.variantPanel !== value;
    });
  });

  const initialVariant = { "#original": "original", "#diff": "diff" }[window.location.hash];
  if (initialVariant) {
    document.querySelector(`[data-variant="${initialVariant}"]`)?.click();
  }
})();
