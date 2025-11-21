import { debounce, emitAppEvent } from "./utils.js";

class SearchManager {
  constructor() {
    this.entries = new Set();
    this.value = "";
    this.suggestions = [];
  }

  register(input) {
    if (!input || input.dataset.searchRegistered) return;
    input.dataset.searchRegistered = "true";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    const entry = {
      input,
      list: this.createContainer(input),
    };
    const onInput = debounce(() => this.updateValue(entry, input.value), 180);
    input.addEventListener("input", onInput);
    input.addEventListener("focus", () => this.renderSuggestions(entry));
    input.addEventListener("blur", () => {
      setTimeout(() => entry.list.classList.remove("show"), 120);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        entry.list.classList.remove("show");
        emitAppEvent("search:submit", { query: this.value.trim() });
      }
    });
    this.entries.add(entry);
    if (this.value) input.value = this.value;
  }

  createContainer(input) {
    const container = document.createElement("div");
    container.className = "search-suggestions";
    input.insertAdjacentElement("afterend", container);
    return container;
  }

  updateValue(originEntry, value) {
    this.value = value.trimStart();
    this.entries.forEach((entry) => {
      if (entry !== originEntry) entry.input.value = this.value;
    });
    this.renderSuggestions(originEntry);
    emitAppEvent("search:change", { query: this.value });
  }

  setSuggestions(list = []) {
    this.suggestions = list;
    this.entries.forEach((entry) => this.renderSuggestions(entry));
  }

  renderSuggestions(entry) {
    const query = this.value.toLowerCase();
    if (!query || query.length < 2) {
      entry.list.classList.remove("show");
      entry.list.innerHTML = "";
      entry.input.setAttribute("aria-expanded", "false");
      return;
    }
    const matches = this.suggestions
      .filter((item) => item.label?.toLowerCase().includes(query) || item.meta?.toLowerCase().includes(query))
      .slice(0, 5);
    if (!matches.length) {
      entry.list.classList.remove("show");
      entry.list.innerHTML = "";
      entry.input.setAttribute("aria-expanded", "false");
      return;
    }
    entry.list.innerHTML = matches
      .map(
        (match) => `
        <button type="button" class="suggestion" data-value="${match.label}">
          <span>${match.label}</span>
          ${match.meta ? `<small>${match.meta}</small>` : ""}
        </button>
      `,
      )
      .join("");
    entry.list.querySelectorAll(".suggestion").forEach((btn) => {
      btn.addEventListener("mousedown", (event) => event.preventDefault());
      btn.addEventListener("click", () => {
        this.value = btn.dataset.value || "";
        entry.input.value = this.value;
        entry.list.classList.remove("show");
        emitAppEvent("search:change", { query: this.value });
        emitAppEvent("search:submit", { query: this.value });
      });
    });
    entry.list.classList.add("show");
    entry.input.setAttribute("aria-expanded", "true");
  }
}

export const searchManager = new SearchManager();
window.searchManager = searchManager;

