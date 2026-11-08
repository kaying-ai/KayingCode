import { copy, stages } from "./content.js";

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 偏好无法持久化时，页面继续使用内存中的状态。
    }
  },
};

const state = {
  theme: storage.get("kayingcode-site-theme") === "light" ? "light" : "dark",
  locale: storage.get("kayingcode-site-locale") === "en" ? "en" : "zh",
  activeStage: "create",
  menuOpen: false,
};
const stagesInOrder = ["create", "preview", "verify", "iterate"];
const select = (selector) => document.querySelector(selector);
const selectAll = (selector) => [...document.querySelectorAll(selector)];

function renderTheme() {
  document.documentElement.dataset.theme = state.theme;
  select('meta[name="theme-color"]').content = state.theme === "dark" ? "#090a0b" : "#f7f8fa";
  const toggle = select("#theme-toggle");
  toggle.textContent = copy[state.locale][state.theme === "dark" ? "themeLight" : "themeDark"];
  toggle.setAttribute(
    "aria-label",
    copy[state.locale][state.theme === "dark" ? "themeLight" : "themeDark"],
  );
}

function renderMenu() {
  const nav = select("#site-navigation");
  nav.classList.toggle("is-open", state.menuOpen);
  const toggle = select("#menu-toggle");
  toggle.setAttribute("aria-expanded", String(state.menuOpen));
  toggle.setAttribute("aria-label", copy[state.locale][state.menuOpen ? "menuClose" : "menuOpen"]);
  toggle.textContent = copy[state.locale][state.menuOpen ? "menuClose" : "menuOpen"];
}

function renderStage({ focus = false } = {}) {
  const [title, description, first, second, third] = stages[state.locale][state.activeStage];
  select("#stage-title").textContent = title;
  select("#stage-description").textContent = description;
  select("#stage-log-1").textContent = first;
  select("#stage-log-2").textContent = second;
  select("#stage-log-3").textContent = third;
  for (const tab of selectAll('[role="tab"]')) {
    const selected = tab.dataset.stage === state.activeStage;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) select("#stage-panel").setAttribute("aria-labelledby", tab.id);
  }
  if (focus) select('[role="tab"][aria-selected="true"]').focus();
}

function renderLocale() {
  const text = copy[state.locale];
  document.documentElement.lang = state.locale === "zh" ? "zh-CN" : "en";
  document.title = text.title;
  select('meta[name="description"]').content = text.description;
  for (const element of selectAll("[data-i18n]")) {
    element.textContent = text[element.dataset.i18n];
  }
  for (const element of selectAll("[data-i18n-aria]")) {
    element.setAttribute("aria-label", text[element.dataset.i18nAria]);
  }
  for (const element of selectAll("[data-i18n-alt]")) {
    element.alt = text[element.dataset.i18nAlt];
  }
  const language = select("#language-toggle");
  language.textContent = state.locale === "zh" ? "EN" : "中文";
  language.setAttribute("aria-label", text.languageSwitch);
  renderTheme();
  renderMenu();
  renderStage();
}

select("#theme-toggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  storage.set("kayingcode-site-theme", state.theme);
  renderTheme();
});
select("#language-toggle").addEventListener("click", () => {
  state.locale = state.locale === "zh" ? "en" : "zh";
  storage.set("kayingcode-site-locale", state.locale);
  renderLocale();
});
select("#menu-toggle").addEventListener("click", () => {
  state.menuOpen = !state.menuOpen;
  renderMenu();
});
for (const link of selectAll("#site-navigation a")) {
  link.addEventListener("click", () => {
    state.menuOpen = false;
    renderMenu();
  });
}
for (const tab of selectAll('[role="tab"]')) {
  tab.addEventListener("click", () => {
    state.activeStage = tab.dataset.stage;
    renderStage();
  });
  tab.addEventListener("keydown", (event) => {
    let index = stagesInOrder.indexOf(state.activeStage);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      index = (index + 1) % stagesInOrder.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      index = (index - 1 + stagesInOrder.length) % stagesInOrder.length;
    } else if (event.key === "Home") {
      index = 0;
    } else if (event.key === "End") {
      index = stagesInOrder.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    state.activeStage = stagesInOrder[index];
    renderStage({ focus: true });
  });
}
for (const button of selectAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const command = select("#command-" + button.dataset.copy).textContent.trim();
    const text = copy[state.locale];
    try {
      await navigator.clipboard.writeText(command);
      select("#copy-status").textContent = text.copied;
      button.setAttribute("aria-label", text.copiedLabel);
    } catch {
      select("#copy-status").textContent = text.copyFailed;
    }
  });
}
window.addEventListener("resize", () => {
  if (window.innerWidth > 820 && state.menuOpen) {
    state.menuOpen = false;
    renderMenu();
  }
});

renderLocale();
