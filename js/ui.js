import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { handleImageError, showToast, getCart, saveCart, showError, showSuccess } from "./utils.js";

// ============================================
// UI REFERENCES
// ============================================
const refs = {
  signinLink: document.getElementById("signinLink"),
  sellBtn: document.getElementById("sellBtn"),
  profileMenu: document.getElementById("profileMenu"),
  profileIcon: document.getElementById("profileIcon"),
  profileDropdown: document.getElementById("profileDropdown"),
  profileHelpBtn: document.getElementById("profileHelpBtn"),
  profileSettingsBtn: document.getElementById("profileSettingsBtn"),
  profileLogoutBtn: document.getElementById("profileLogoutBtn"),
  loginPopup: document.getElementById("loginPopup"),
  userEmailDisplay: document.getElementById("userEmailDisplay"),
  cartPanel: document.getElementById("cartPanel"),
  favoritesPanel: document.getElementById("favoritesPanel"),
  cartItems: document.getElementById("cartItems"),
  favoritesItems: document.getElementById("favoritesItems"),
  cartTotal: document.getElementById("cartTotal"),
  checkoutBtn: document.getElementById("checkoutBtn"),
  authArea: document.getElementById("authArea"),
  authLinks: document.getElementById("authLinks"),
};

// ============================================
// STATE
// ============================================
const state = {
  profile: null,
  orders: [],
  cart: [],
  favorites: [],
  authReady: false,
  currentUser: null,
  handlersAttached: false,
};

window.handleImageError = handleImageError;

// ============================================
// INIT
// ============================================
function init() {
  setupPanelClosers();
  setupPanelOpeners();
  setupProfileActions();
  attachCheckoutHandler();
  attachNavbarHandlers();
  updateCartDisplay();
  updateCartUI();
}

// ============================================
// AUTH STATE LISTENER
// ============================================
onAuthStateChanged(auth, async (user) => {
  state.authReady = true;
  state.currentUser = user;

  console.log("🔐 Auth state changed:", user ? user.email : "logged out");

  toggleAuthUI(Boolean(user));

  if (user) {
    console.log("✅ User logged in:", user.uid);
    await ensureUserDoc(user.uid);
    await hydrateProfile(user);
    await loadCartFromFirebase(user.uid);
    await renderFavorites();
  } else {
    console.log("❌ User logged out");
    state.profile = null;
    state.cart = [];
    state.favorites = [];
    renderLoggedOutProfile();
    if (refs.favoritesItems) {
      refs.favoritesItems.innerHTML = emptyState({
        title: "No favorites yet",
        message: "Sign in to start saving your wish list.",
      });
    }
  }
});

// ============================================
// SETUP FUNCTIONS
// ============================================
function setupProfileActions() {
  console.log("📱 Setting up profile actions...");

  // Logout button
  if (refs.profileLogoutBtn) {
    refs.profileLogoutBtn.addEventListener("click", signOutUser);
    console.log("✅ Logout button attached");
  }

  // Help button
  refs.profileHelpBtn?.addEventListener("click", () => {
    hideProfileDropdown();
    showToast("Help & feedback are coming soon.", "info");
  });

  // Settings button
  refs.profileSettingsBtn?.addEventListener("click", () => {
    hideProfileDropdown();
    showToast("Settings will be available shortly.", "info");
  });
}

function setupPanelClosers() {
  document.querySelectorAll(".panel-close").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = btn.closest(".side-panel");
      if (panel) {
        console.log("🔴 Closing panel:", panel.id);
        closePanel(panel);
      }
    });
  });
}

function setupPanelOpeners() {
  document.querySelectorAll("[data-open-panel]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      const requiresAuth = btn.dataset.requiresAuth === "true";
      if (requiresAuth && !auth.currentUser) return showLoginPopup(btn.dataset.openPanel);
      const panelId = btn.dataset.openPanel;
      const panel = document.getElementById(panelId);
      if (!panel) return;
      openPanel(panel);
    });
  });
}

function attachCheckoutHandler() {
  refs.checkoutBtn?.addEventListener("click", async () => {
    if (!auth.currentUser) return showLoginPopup("checkout");
    if (!state.cart.length) return showToast("Add items before checkout.", "info");
    if (!confirm("Proceed to checkout?")) return;
    
    // Clear cart from Firebase
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      await updateDoc(userRef, { cart: [] });
      state.cart = [];
      updateCartUI();
      updateCartDisplay();
      showSuccess("Checkout complete!");
    } catch (error) {
      showError("Checkout failed");
      console.error(error);
    }
  });
}

// ============================================
// NAVBAR HANDLERS
// ============================================
function attachNavbarHandlers() {
  if (state.handlersAttached) return;
  state.handlersAttached = true;

  const signinLink = document.getElementById("signinLink");
  const profileIcon = document.getElementById("profileIcon");
  const profileDropdown = document.getElementById("profileDropdown");
  const sellBtn = document.getElementById("sellBtn");
  const cartToggle = document.getElementById("cartToggle");
  const favoritesToggle = document.getElementById("favoritesToggle");

  // Sign in link
  if (signinLink) {
    signinLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "login.html";
    });
  }

  // Cart button
  if (cartToggle) {
    cartToggle.addEventListener("click", (e) => {
      e.preventDefault();
      if (!auth.currentUser) {
        showLoginPopup("cart");
        return;
      }
      const cartPanel = document.getElementById("cartPanel");
      const favPanel = document.getElementById("favoritesPanel");
      if (cartPanel) {
        cartPanel.classList.toggle("open");
        if (favPanel) favPanel.classList.remove("open");
      }
    });
  }

  // Favorites button
  if (favoritesToggle) {
    favoritesToggle.addEventListener("click", (e) => {
      e.preventDefault();
      if (!auth.currentUser) {
        showLoginPopup("favorites");
        return;
      }
      const favPanel = document.getElementById("favoritesPanel");
      const cartPanel = document.getElementById("cartPanel");
      if (favPanel) {
        favPanel.classList.toggle("open");
        if (cartPanel) cartPanel.classList.remove("open");
      }
    });
  }

  // Sell button
  if (sellBtn) {
    sellBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!state.authReady) {
        setTimeout(() => {
          if (state.currentUser) {
            window.location.href = "dashboard.html";
          } else {
            showLoginPopup("sell");
          }
        }, 250);
        return;
      }
      if (!state.currentUser) {
        showLoginPopup("sell");
        return;
      }
      window.location.href = "dashboard.html";
    });
  }

  // Profile icon
  if (profileIcon) {
    profileIcon.addEventListener("click", (e) => {
      e.preventDefault();
      if (profileDropdown) {
        profileDropdown.classList.toggle("hidden");
      }
    });
  }

  // Close profile dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (profileDropdown && !e.target.closest("#profileMenu")) {
      profileDropdown.classList.add("hidden");
    }
  });

  // Close panels when clicking outside
  document.addEventListener("click", (e) => {
    const cartPanel = document.getElementById("cartPanel");
    const favPanel = document.getElementById("favoritesPanel");

    if (cartPanel && !e.target.closest("#cartPanel") && !e.target.matches("#cartToggle")) {
      cartPanel.classList.remove("open");
    }
    if (favPanel && !e.target.closest("#favoritesPanel") && !e.target.matches("#favoritesToggle")) {
      favPanel.classList.remove("open");
    }
  });
}

// ============================================
// LOGIN POPUP
// ============================================
function showLoginPopup(action = "action") {
  const popup = document.getElementById("loginPopup");
  if (!popup) {
    alert("Please sign in to continue.");
    window.location.href = "login.html";
    return;
  }

  const messages = {
    cart: "Sign in to view your cart",
    favorites: "Sign in to save your favorites",
    sell: "Sign in to start selling",
    checkout: "Sign in to proceed with checkout",
  };

  popup.innerHTML = `
    <div class="popup-content" role="dialog" aria-modal="true">
      <button class="popup-close" aria-label="Close popup">✕</button>
      <h3>${messages[action] || "Sign in to continue"}</h3>
      <p>You need to be logged in to access this feature.</p>
      <div class="popup-buttons">
        <a href="login.html" class="btn-primary">Sign In</a>
        <button class="btn-secondary" type="button">Cancel</button>
      </div>
    </div>
  `;

  popup.classList.remove("hidden");
  popup.style.display = "flex";

  const closeBtn = popup.querySelector(".popup-close");
  const cancelBtn = popup.querySelector(".btn-secondary");

  const closePop = () => {
    popup.classList.add("hidden");
    popup.style.display = "none";
  };

  if (closeBtn) closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closePop();
  });

  if (cancelBtn) cancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closePop();
  });

  popup.addEventListener("click", (e) => {
    if (e.target === popup) closePop();
  });
}

// ============================================
// UI HELPERS
// ============================================
function toggleAuthUI(isAuthenticated) {
  if (!refs.authLinks || !refs.profileMenu) return;

  if (isAuthenticated) {
    refs.authLinks.classList.add("hidden");
    refs.profileMenu.classList.remove("hidden");
    if (refs.userEmailDisplay) refs.userEmailDisplay.textContent = auth.currentUser?.email || "";
    if (refs.sellBtn) refs.sellBtn.classList.remove("locked");
  } else {
    refs.authLinks.classList.remove("hidden");
    refs.profileMenu.classList.add("hidden");
    hideProfileDropdown();
    if (refs.sellBtn) refs.sellBtn.classList.add("locked");
  }
}

function hideProfileDropdown() {
  if (!refs.profileDropdown || refs.profileDropdown.classList.contains("hidden")) return;
  refs.profileDropdown.classList.add("hidden");
  refs.profileIcon?.setAttribute("aria-expanded", "false");
}

function openPanel(panel) {
  panel?.classList.add("open");
}

function closePanel(panel) {
  panel?.classList.remove("open");
}

// ============================================
// CART MANAGEMENT (Firebase)
// ============================================

/**
 * LOAD CART FROM FIREBASE
 * Retrieves user's cart from Firebase and stores in state
 */
async function loadCartFromFirebase(userId) {
  try {
    if (!userId) {
      state.cart = [];
      return;
    }

    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      state.cart = Array.isArray(data.cart) ? data.cart : [];
      console.log("✅ Cart loaded from Firebase:", state.cart.length, "items");
    } else {
      state.cart = [];
    }

    updateCartDisplay();
    updateCartUI();
  } catch (error) {
    console.error("❌ Error loading cart:", error);
    showError("Failed to load cart");
  }
}

/**
 * SAVE CART TO FIREBASE
 * Saves current cart state to Firebase
 */
async function saveCartToFirebase(userId, cart) {
  try {
    if (!userId) return;

    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, { cart: cart });
    console.log("✅ Cart saved to Firebase:", cart.length, "items");
  } catch (error) {
    console.error("❌ Error saving cart:", error);
    showError("Failed to save cart");
  }
}

/**
 * ADD TO CART
 * Adds product to cart or increments quantity if already exists
 * @param {string} productId
 * @param {string} productName
 * @param {number} productPrice
 * @param {string} productImage
 */
window.addToCart = async function (productId, productName, productPrice, productImage) {
  try {
    if (!auth.currentUser) {
      showLoginPopup("cart");
      return;
    }

    // Find existing item
    const existingItem = state.cart.find(item => item.id === productId);

    if (existingItem) {
      // INCREMENT quantity
      existingItem.quantity = (existingItem.quantity || 1) + 1;
      console.log(`📈 Incremented ${productName} to quantity ${existingItem.quantity}`);
    } else {
      // ADD NEW item
      state.cart.push({
        id: productId,
        name: productName,
        price: Number(productPrice) || 0,
        image: productImage,
        quantity: 1
      });
      console.log(`✅ Added ${productName} to cart`);
    }

    // SAVE to Firebase
    await saveCartToFirebase(auth.currentUser.uid, state.cart);

    // UPDATE UI
    updateCartDisplay();
    updateCartUI();
    showSuccess(`${productName} added to cart!`);
  } catch (error) {
    showError("Failed to add item to cart");
    console.error(error);
  }
};

/**
 * REMOVE FROM CART
 * Removes item from cart by ID
 */
window.removeFromCartUI = async function (productId) {
  try {
    if (!auth.currentUser) return;

    const itemName = state.cart.find(item => item.id === productId)?.name || "Item";
    state.cart = state.cart.filter(item => item.id !== productId);

    // SAVE to Firebase
    await saveCartToFirebase(auth.currentUser.uid, state.cart);

    // UPDATE UI
    updateCartDisplay();
    updateCartUI();
    showSuccess(`${itemName} removed from cart`);
    console.log("🗑️ Item removed from cart");
  } catch (error) {
    showError("Failed to remove item");
    console.error(error);
  }
};

/**
 * INCREMENT CART ITEM QUANTITY
 */
window.incrementCartItem = async function (productId) {
  try {
    if (!auth.currentUser) return;

    const item = state.cart.find(i => i.id === productId);
    if (item) {
      item.quantity = (item.quantity || 1) + 1;
      await saveCartToFirebase(auth.currentUser.uid, state.cart);
      updateCartUI();
      console.log("📈 Quantity incremented");
    }
  } catch (error) {
    console.error(error);
  }
};

/**
 * DECREMENT CART ITEM QUANTITY
 */
window.decrementCartItem = async function (productId) {
  try {
    if (!auth.currentUser) return;

    const item = state.cart.find(i => i.id === productId);
    if (item && item.quantity > 1) {
      item.quantity--;
      await saveCartToFirebase(auth.currentUser.uid, state.cart);
      updateCartUI();
      console.log("📉 Quantity decremented");
    }
  } catch (error) {
    console.error(error);
  }
};

function updateCartDisplay() {
  const cartToggle = document.getElementById("cartToggle");
  if (cartToggle) {
    const totalItems = state.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    cartToggle.textContent = `🛒 Cart (${totalItems})`;
    console.log("🛒 Cart display updated:", totalItems, "items");
  }
}

function updateCartUI() {
  if (!refs.cartItems) return;

  if (!state.cart.length) {
    refs.cartItems.innerHTML = `
      <div class="empty-state">
        <p>Your cart is empty</p>
        <a href="products.html" class="btn-secondary">Browse Products</a>
      </div>
    `;
  } else {
    refs.cartItems.innerHTML = state.cart.map((item) => `
      <div class="cart-item">
        <img src="${item.image || "https://via.placeholder.com/64"}" alt="${item.name}"
             onerror="this.src='https://via.placeholder.com/64'">
        <div class="item-info">
          <h4>${item.name}</h4>
          <p class="price">${item.price} FCFA</p>
          <div class="quantity-controls">
            <button class="qty-btn" onclick="window.decrementCartItem('${item.id}')">−</button>
            <span class="qty-display">${item.quantity || 1}</span>
            <button class="qty-btn" onclick="window.incrementCartItem('${item.id}')">+</button>
          </div>
        </div>
        <button onclick="window.removeFromCartUI('${item.id}')" class="remove-btn" aria-label="Remove item">✕</button>
      </div>
    `).join("");
  }

  updateCartTotal();
}

function updateCartTotal() {
  if (!refs.cartTotal) return;

  let total = 0;
  state.cart.forEach((item) => {
    const price = Number(item.price) || 0;
    const quantity = Number(item.quantity) || 1;
    total += price * quantity;
  });

  refs.cartTotal.textContent = `${total} FCFA`;
  console.log("💰 Cart total:", total, "FCFA");
}

// ============================================
// FAVORITES
// ============================================
async function renderFavorites() {
  if (!refs.favoritesItems || !auth.currentUser) return;

  try {
    const ref = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(ref);
    const data = snap.data() || {};
    const list = Array.isArray(data.favorites) ? data.favorites : [];

    state.favorites = list;

    if (!list.length) {
      refs.favoritesItems.innerHTML = emptyState({
        title: "No favorites yet",
        message: "Tap the heart icon on any product to save it here.",
        showAction: true,
      });
      return;
    }

    refs.favoritesItems.innerHTML = list
      .map(
        (item) => `
        <div class="panel-item" data-id="${item.productId}">
          <img src="${item.imageUrl || "https://via.placeholder.com/64"}" alt="${item.name || "Product"}"
               onerror="this.src='https://via.placeholder.com/64'">
          <div>
            <h4>${item.name || "Product"}</h4>
            <div class="price">${item.price || 0} FCFA</div>
            <div class="quantity-display">Qty: ${item.quantity || 1}</div>
          </div>
          <button class="remove-btn">Remove</button>
        </div>
      `,
      )
      .join("");

    refs.favoritesItems.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        const productId = event.target.closest(".panel-item")?.getAttribute("data-id");
        await removeFavorite(productId);
        await renderFavorites();
      });
    });
  } catch (error) {
    console.error(error);
    refs.favoritesItems.innerHTML = errorState("We couldn't load favorites right now.");
  }
}

async function removeFavorite(productId) {
  if (!productId || !auth.currentUser) return;

  const ref = doc(db, "users", auth.currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() || {};
  const favs = Array.isArray(data.favorites) ? data.favorites : [];
  const next = favs.filter((item) => item.productId !== productId);
  await updateDoc(ref, { favorites: next });
}

// ============================================
// PROFILE
// ============================================
async function ensureUserDoc(uid) {
  if (!uid) return;

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    console.log("📝 Creating user document for:", uid);
    await setDoc(ref, {
      cart: [],
      favorites: [],
      email: auth.currentUser?.email,
      createdAt: new Date()
    }, { merge: true });
  }
}

async function hydrateProfile(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    state.profile = snap.exists() ? snap.data() : null;
    console.log("👤 Profile hydrated");
  } catch (error) {
    console.error(error);
  }
}

function renderLoggedOutProfile() {
  // Profile logout state handled by ui
}

// ============================================
// HELPERS
// ============================================
function emptyState({ title, message, showAction }) {
  return `
    <div class="empty-state">
      <h4>${title}</h4>
      <p>${message}</p>
      ${showAction ? '<button type="button" class="btn-primary js-browse-products">Browse Products</button>' : ""}
    </div>
  `;
}

function errorState(copy) {
  return `<div class="empty-state"><p>${copy}</p></div>`;
}

async function signOutUser() {
  try {
    console.log("🔓 Signing out user...");
    await signOut(auth);
    showSuccess("Logged out successfully");
    console.log("✅ Logout successful");
    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  } catch (error) {
    showError("Failed to logout");
    console.error("❌ Logout error:", error);
  }
}

// ============================================
// EXPOSE GLOBALLY
// ============================================
window.showLoginPopup = showLoginPopup;
window.updateCartUI = updateCartUI;
window.updateCartDisplay = updateCartDisplay;
window.loadCartFromFirebase = loadCartFromFirebase;

// ============================================
// INITIALIZE
// ============================================
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { updateCartUI, showLoginPopup };
