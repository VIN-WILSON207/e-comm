import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const signinLink = document.getElementById("signinLink");
const sellBtn = document.getElementById("sellBtn");
const profileMenu = document.getElementById("profileMenu");
const profileIcon = document.getElementById("profileIcon");
const profileDropdown = document.getElementById("profileDropdown");
const logoutUser = document.getElementById("logoutUser");
const loginPopup = document.getElementById("loginPopup");
// Only lock the Sell button when unauthenticated
const userEmailDisplay = document.getElementById("userEmailDisplay");
const cartLink = document.querySelector('a[href="cart.html"], a[data-target="cart.html"]');
const favoritesLink = document.querySelector('a[href="favorites.html"], a[data-target="favorites.html"]');
const cartPanel = document.getElementById("cartPanel");
const favoritesPanel = document.getElementById("favoritesPanel");
const cartItems = document.getElementById("cartItems");
const favoritesItems = document.getElementById("favoritesItems");

// Hide popup initially
loginPopup.classList.add("hidden");

// Auth State Listener
onAuthStateChanged(auth, async user => {
  if (user) {
    // Show profile menu
    signinLink.style.display = "none";
    profileMenu.classList.remove("hidden");
    userEmailDisplay.textContent = user.email;

    // Toggle dropdown
    profileIcon.onclick = () => {
      profileDropdown.classList.toggle("hidden");
    };

    // Check if user is seller
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const isSeller = userDoc.exists() && userDoc.data().role === "seller";

    // Unlock sell button
    sellBtn.classList.remove("locked");
    sellBtn.href = "dashboard.html"; // Regardless, dashboard helps them start selling

  } else {
    // User logged out
    signinLink.style.display = "block";
    profileMenu.classList.add("hidden");

    // Lock Sell button
    sellBtn.classList.add("locked");
    sellBtn.href = "#";
  }
});

// Logout Function
logoutUser.onclick = async () => {
  await signOut(auth);
  location.reload();
};

// Show login popup for locked Sell action
function showPopup() {
  loginPopup.classList.add("show");
  setTimeout(() => loginPopup.classList.remove("show"), 3000);
}

sellBtn.addEventListener("click", e => {
  if (!auth.currentUser) {
    e.preventDefault();
    showPopup();
  }
});

// Side panel helpers
function openPanel(panel) {
  if (panel) panel.classList.add("open");
}

function closePanel(panel) {
  if (panel) panel.classList.remove("open");
}

document.querySelectorAll('.panel-close').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-target');
    closePanel(document.getElementById(id));
  });
});

// Intercept Cart / Favorites links to open panels
if (cartLink) {
  cartLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return showPopup();
    await ensureUserDoc();
    await renderCart();
    openPanel(cartPanel);
  });
}

if (favoritesLink) {
  favoritesLink.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return showPopup();
    await ensureUserDoc();
    await renderFavorites();
    openPanel(favoritesPanel);
  });
}

async function ensureUserDoc() {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { cart: [], favorites: [] }, { merge: true });
  } else {
    const data = snap.data() || {};
    if (!Array.isArray(data.cart) || !Array.isArray(data.favorites)) {
      await setDoc(ref, { cart: data.cart || [], favorites: data.favorites || [] }, { merge: true });
    }
  }
}

async function renderCart() {
  const user = auth.currentUser;
  if (!user || !cartItems) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const raw = Array.isArray(data.cart) ? data.cart : [];
  const cart = await enrichWithProducts(raw);
  if (!cart.length) { cartItems.innerHTML = '<p>Your cart is empty.</p>'; updateCartTotal(0); return; }
  cartItems.innerHTML = cart.map(item => panelItemHtml({
    productId: item.productId,
    name: item.product?.name || item.name,
    price: item.product?.price ?? item.price,
    imageUrl: item.product?.imageUrl || item.imageUrl,
    quantity: item.quantity || 1
  })).join('');
  attachQtyHandlers();
  attachRemoveHandlers('cart');
  updateCartTotal(sumCart(cart));
}

async function renderFavorites() {
  const user = auth.currentUser;
  if (!user || !favoritesItems) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const raw = Array.isArray(data.favorites) ? data.favorites : [];
  const favs = await enrichWithProducts(raw);
  if (!favs.length) { favoritesItems.innerHTML = '<p>No favorites yet.</p>'; return; }
  favoritesItems.innerHTML = favs.map(item => panelItemHtml({
    productId: item.productId,
    name: item.product?.name || item.name,
    price: item.product?.price ?? item.price,
    imageUrl: item.product?.imageUrl || item.imageUrl,
    quantity: 1
  })).join('');
  attachRemoveHandlers('favorites');
}

function panelItemHtml(item) {
  const price = typeof item.price === 'number' ? item.price : Number(item.price) || 0;
  return `
    <div class="panel-item" data-id="${item.productId}">
      <img src="${item.imageUrl || 'https://via.placeholder.com/64'}" alt="${item.name || 'Product'}">
      <div>
        <h4>${item.name || 'Product'}</h4>
        <div class="price">${price} FCFA</div>
      </div>
      ${typeof item.quantity === 'number' ? `
      <div>
        <button class="qty-dec">-</button>
        <input type="number" class="qty" value="${item.quantity}" min="1" style="width:50px;">
        <button class="qty-inc">+</button>
      </div>
      ` : ''}
      <button class="remove-btn">Remove</button>
    </div>
  `;
}

async function enrichWithProducts(arr) {
  // arr may be [{productId, quantity?, name, price, imageUrl}] or just ids
  const list = Array.isArray(arr) ? arr : [];
  const results = [];
  for (const item of list) {
    const productId = typeof item === 'string' ? item : item.productId;
    if (!productId) continue;
    try {
      const psnap = await getDoc(doc(db, 'products', productId));
      results.push({ ... (typeof item === 'string' ? { productId } : item), product: psnap.exists() ? psnap.data() : null });
    } catch { results.push({ ...(typeof item === 'string' ? { productId } : item), product: null }); }
  }
  return results;
}

function sumCart(cart) {
  return cart.reduce((sum, it) => {
    const price = Number((it.product?.price ?? it.price) || 0);
    const qty = Number(it.quantity || 1);
    return sum + price * qty;
  }, 0);
}

function updateCartTotal(amount) {
  const el = document.getElementById('cartTotal');
  if (el) el.textContent = `${amount} FCFA`;
}

function attachQtyHandlers() {
  if (!cartItems) return;
  cartItems.querySelectorAll('.panel-item').forEach(row => {
    const productId = row.getAttribute('data-id');
    const dec = row.querySelector('.qty-dec');
    const inc = row.querySelector('.qty-inc');
    const input = row.querySelector('.qty');
    async function set(qty) {
      const user = auth.currentUser; if (!user) return;
      const ref = doc(db, 'users', user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const data = snap.data() || {}; const arr = Array.isArray(data.cart) ? data.cart : [];
      const next = arr.map(x => x.productId === productId ? { ...x, quantity: qty } : x);
      await updateDoc(ref, { cart: next });
      await renderCart();
    }
    if (dec) dec.addEventListener('click', () => { const v = Math.max(1, Number(input.value || 1) - 1); input.value = v; set(v); });
    if (inc) inc.addEventListener('click', () => { const v = Number(input.value || 1) + 1; input.value = v; set(v); });
    if (input) input.addEventListener('change', () => { const v = Math.max(1, Number(input.value || 1)); input.value = v; set(v); });
  });
}

// Checkout button
const checkoutBtn = document.getElementById('checkoutBtn');
if (checkoutBtn) {
  checkoutBtn.addEventListener('click', async () => {
    if (!auth.currentUser) return showPopup();
    // Placeholder flow: confirm and clear cart
    if (!confirm('Proceed to checkout?')) return;
    const ref = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(ref, { cart: [] });
    await renderCart();
    alert('Checkout complete (demo).');
  });
}

function attachRemoveHandlers(kind) {
  const container = kind === 'cart' ? cartItems : favoritesItems;
  if (!container) return;
  container.querySelectorAll('.panel-item .remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.panel-item');
      const productId = itemEl.getAttribute('data-id');
      await removeItem(kind, productId);
      if (kind === 'cart') await renderCart(); else await renderFavorites();
    });
  });
}

async function removeItem(kind, productId) {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  const arr = Array.isArray(data[kind]) ? data[kind] : [];
  const next = arr.filter(x => x.productId !== productId);
  await updateDoc(ref, { [kind]: next });
}
