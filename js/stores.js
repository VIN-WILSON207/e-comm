import { db } from "./firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import {
  readCartFromStorage,
  writeCartToStorage,
  upsertItem,
  toNumber,
  showToast,
  friendlyError,
} from "./utils.js";

/**
 * Centralized cart state with optimistic updates + persistence.
 */
class CartStore {
  constructor() {
    this.items = [];
    this.listeners = new Set();
    this.user = null;
    this.syncing = false;
  }

  /**
   * Syncs the current Firebase user with the local cache.
   * @param {object|null} user
   */
  async setUser(user) {
    this.user = user;
    this.items = readCartFromStorage(user?.uid);
    this.notify();
    if (user) {
      await this.syncFromRemote();
    }
  }

  /**
   * @param {(items: any[]) => void} listener
   */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.items);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.items));
  }

  persist() {
    writeCartToStorage(this.user?.uid, this.items);
  }

  get userCartRef() {
    if (!this.user) return null;
    return doc(db, "users", this.user.uid);
  }

  merge(remote = []) {
    const map = new Map();
    remote.forEach((item) => map.set(item.productId, { ...item }));
    this.items.forEach((item) => {
      const existing = map.get(item.productId);
      if (existing) {
        existing.quantity = toNumber(existing.quantity || 1) + toNumber(item.quantity || 1);
      } else {
        map.set(item.productId, { ...item });
      }
    });
    return Array.from(map.values());
  }

  async syncFromRemote() {
    const ref = this.userCartRef;
    if (!ref) return;
    try {
      const snap = await getDoc(ref);
      const remote = snap.exists() && Array.isArray(snap.data().cart) ? snap.data().cart : [];
      this.items = this.merge(remote);
      await setDoc(ref, { cart: this.items }, { merge: true });
      this.persist();
      this.notify();
    } catch (error) {
      console.error(error);
      showToast(friendlyError(error, "Unable to sync cart from server."), "error");
    }
  }

  async flushToRemote() {
    const ref = this.userCartRef;
    if (!ref || this.syncing) return;
    this.syncing = true;
    try {
      await setDoc(ref, { cart: this.items }, { merge: true });
    } catch (error) {
      console.error(error);
      showToast(friendlyError(error, "Unable to update cart."), "error");
    } finally {
      this.syncing = false;
    }
  }

  addItem(summary) {
    const normalized = {
      quantity: 1,
      ...summary,
      price: toNumber(summary.price),
    };
    this.items = upsertItem(
      this.items,
      (item) => item.productId === normalized.productId,
      (existing) => ({
        ...(existing || {}),
        ...normalized,
        quantity: toNumber(existing?.quantity || 0) + toNumber(normalized.quantity || 1),
      }),
    );
    this.persist();
    this.notify();
    this.flushToRemote();
  }

  updateQuantity(productId, quantity) {
    this.items = this.items.map((item) =>
      item.productId === productId ? { ...item, quantity: Math.max(1, toNumber(quantity)) } : item,
    );
    this.persist();
    this.notify();
    this.flushToRemote();
  }

  removeItem(productId) {
    this.items = this.items.filter((item) => item.productId !== productId);
    this.persist();
    this.notify();
    this.flushToRemote();
  }

  clear() {
    this.items = [];
    this.persist();
    this.notify();
    this.flushToRemote();
  }

  total() {
    return this.items.reduce((sum, item) => {
      return sum + toNumber(item.price) * toNumber(item.quantity || 1);
    }, 0);
  }
}

export const cartStore = new CartStore();

