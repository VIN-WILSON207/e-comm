const FALLBACK_IMAGE = "images/electronics1.png";
const LOCAL_CART_PREFIX = "eh-cart";
const TOAST_HIDE_DELAY = 2600;

/**
 * Creates a debounced version of a function.
 * @template T extends (...args: any[]) => void
 * @param {T} fn
 * @param {number} delay
 * @returns {T}
 */
export function debounce(fn, delay = 250) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Safely parses JSON from storage.
 * @param {string|null} raw
 * @returns {any}
 */
function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Builds the cart storage key.
 * @param {string} [userId]
 */
function cartKey(userId) {
  return `${LOCAL_CART_PREFIX}:${userId || "guest"}`;
}

/**
 * Reads cart items from localStorage.
 * @param {string} [userId]
 * @returns {Array}
 */
export function readCartFromStorage(userId) {
  if (typeof localStorage === "undefined") return [];
  return safeParse(localStorage.getItem(cartKey(userId))) || [];
}

/**
 * Writes cart items to localStorage.
 * @param {string} [userId]
 * @param {Array} value
 */
export function writeCartToStorage(userId, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(cartKey(userId), JSON.stringify(value));
}

/**
 * GET CART - Read cart from localStorage
 * @returns {Array}
 */
export function getCart() {
  return readCartFromStorage() || [];
}

/**
 * SAVE CART - Write cart to localStorage
 * @param {Array} cart
 */
export function saveCart(cart) {
  writeCartToStorage(undefined, cart);
}

/**
 * Ensures image fallbacks render consistently.
 * @param {Event} event
 */
export function handleImageError(event) {
  const target = event?.target;
  if (!target || target.dataset?.fallbackApplied) return;
  target.dataset.fallbackApplied = "true";
  target.src = FALLBACK_IMAGE;
  target.classList.add("img-fallback");
}

/**
 * Calculates a numeric value safely.
 * @param {any} value
 */
export function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Emits a browser event with a uniform prefix.
 * @param {string} name
 * @param {any} detail
 */
export function emitAppEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(`app:${name}`, { detail }));
}

/**
 * Displays a lightweight toast message.
 * @param {string} message
 * @param {"info"|"success"|"error"} variant
 */
export function showToast(message, variant = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${variant}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, TOAST_HIDE_DELAY);
}

/**
 * SHOW ERROR - Display error toast
 * @param {string} message
 */
export function showError(message) {
  showToast(message, "error");
}

/**
 * SHOW SUCCESS - Display success toast
 * @param {string} message
 */
export function showSuccess(message) {
  showToast(message, "success");
}

/**
 * Normalizes an array update by either creating or updating an item.
 * @template T
 * @param {T[]} list
 * @param {(item: T) => boolean} predicate
 * @param {(existing: T | undefined) => T} createOrMerge
 * @returns {T[]}
 */
export function upsertItem(list = [], predicate, createOrMerge) {
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.findIndex(predicate);
  if (index === -1) {
    next.push(createOrMerge(undefined));
  } else {
    next[index] = createOrMerge(next[index]);
  }
  return next;
}

/**
 * Formats human-friendly error messages.
 * @param {unknown} error
 * @param {string} fallback
 */
export function friendlyError(error, fallback = "Something went wrong.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object" && "message" in error) return error.message;
  return fallback;
}

export const validationCopy = {
  fileType: "Only image files (JPG, PNG, WEBP) are allowed.",
  fileSize: "Images must be smaller than 3MB.",
};

export const MAX_UPLOAD_SIZE = 3 * 1024 * 1024;

export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 1024,
};

export function isMobile() {
  return window.matchMedia(`(max-width: ${breakpoints.md}px)`).matches;
}

