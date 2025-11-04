import { auth, db } from "./firebase.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const grid = document.querySelector(".product-grid");
const searchInput = document.getElementById("searchInput");
const homeSearchInput = document.getElementById("homeSearchInput");
const productsNavSearch = document.getElementById("productsNavSearch");
const categoryFilter = document.getElementById("categoryFilter");
const sortFilter = document.getElementById("sortFilter");

let allProducts = [];
let userFavorites = new Set();

async function loadProducts() {
  if (!grid) return;
  grid.innerHTML = "Loading products...";

  try {
    const snapshot = await getDocs(collection(db, "products"));

    if (snapshot.empty) {
      grid.innerHTML = "<p>No products yet.</p>";
      return;
    }

    allProducts = [];
    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      const id = docSnap.id;
      const createdAtMs = p.createdAt && typeof p.createdAt.toMillis === "function" ? p.createdAt.toMillis() : 0;

      allProducts.push({
        id,
        name: p.name || "Unnamed",
        imageUrl: p.imageUrl || "https://via.placeholder.com/300x200?text=No+Image",
        price: typeof p.price === "number" ? p.price : Number(p.price) || 0,
        category: p.category || "Other",
        sellerEmail: p.sellerEmail || "Unknown",
        description: p.description || "",
        createdAtMs
      });
    });

    await loadUserState();
    renderProducts();
    attachGridHandlers();

  } catch (err) {
    console.error(err);
    grid.innerHTML = "<p>Failed to load products.</p>";
  }
}

loadProducts();

async function loadUserState() {
  if (!auth.currentUser) { userFavorites = new Set(); return; }
  const ref = doc(db, 'users', auth.currentUser.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const favs = Array.isArray(data.favorites) ? data.favorites : [];
  userFavorites = new Set(favs.map(x => typeof x === 'string' ? x : x.productId));
}

// Filters and sorting
if (searchInput) searchInput.addEventListener("input", renderProducts);
if (productsNavSearch) productsNavSearch.addEventListener("input", renderProducts);
if (homeSearchInput) homeSearchInput.addEventListener("input", renderProducts);
if (categoryFilter) categoryFilter.addEventListener("change", renderProducts);
if (sortFilter) sortFilter.addEventListener("change", renderProducts);

// Enter key triggers a render (explicit search)
function attachEnter(el) { if (!el) return; el.addEventListener('keydown', (e) => { if (e.key === 'Enter') renderProducts(); }); }
attachEnter(searchInput); attachEnter(productsNavSearch); attachEnter(homeSearchInput);

function renderProducts() {
  if (!grid) return;
  const q = ((searchInput?.value || productsNavSearch?.value || homeSearchInput?.value) || "").trim().toLowerCase();
  const cat = (categoryFilter?.value || "all").toLowerCase();
  const sort = (sortFilter?.value || "newest");

  let list = allProducts.slice();

  if (cat !== "all") {
    list = list.filter(p => normalize(p.category).includes(cat));
  }

  if (q) {
    list = list.filter(p => (p.name + " " + p.description + " " + p.category).toLowerCase().includes(q));
  }

  if (sort === "newest") {
    list.sort((a,b) => b.createdAtMs - a.createdAtMs);
  } else if (sort === "low-high") {
    list.sort((a,b) => a.price - b.price);
  } else if (sort === "high-low") {
    list.sort((a,b) => b.price - a.price);
  }

  if (!list.length) {
    grid.innerHTML = "<p>No products match your search.</p>";
    return;
  }

  grid.innerHTML = list.map(p => productCardHtml(p)).join("");
}

function normalize(s) {
  return String(s || "").toLowerCase();
}

function productCardHtml(p) {
  return `
    <div class="product-card" data-id="${p.id}">
      <img src="${p.imageUrl}" alt="${p.name}">
      <h3>${p.name}</h3>
      <p class="price">${p.price} FCFA</p>
      <div class="actions">
        <button class="btn-cart" title="Add to cart">🛒</button>
        <button class="btn-fav ${userFavorites.has(p.id) ? 'active' : ''}" title="Add to favorites">${userFavorites.has(p.id) ? '💖' : '❤️'}</button>
        <button class="btn-details" title="Details">Details</button>
      </div>

      <div class="product-details" style="display:none;">
        <div class="details-grid">
          <div class="details-image">
            <img src="${p.imageUrl}" alt="${p.name}">
          </div>
          <div class="details-info">
            <p><strong>Category:</strong> ${p.category}</p>
            <p><strong>Seller:</strong> ${p.sellerEmail}</p>
            <p><strong>Price:</strong> ${p.price} FCFA</p>
            <p class="desc">${p.description}</p>
            <div class="details-actions">
              <button class="btn-cart" title="Add to cart">🛒 Add to cart</button>
              <button class="btn-fav ${userFavorites.has(p.id) ? 'active' : ''}" title="Add to favorites">${userFavorites.has(p.id) ? '💖' : '❤️'} Favorite</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachGridHandlers() {
  grid.addEventListener("click", async (e) => {
    const card = e.target.closest(".product-card");
    if (!card) return;
    const productId = card.getAttribute("data-id");

    if (e.target.classList.contains("btn-details")) {
      const details = card.querySelector(".product-details");
      details.style.display = details.style.display === "none" ? "block" : "none";
      return;
    }

    if (e.target.classList.contains("btn-cart")) {
      if (!auth.currentUser) return showLoginPopup();
      try {
        await upsertCart(productId, card);
        toast("Added to cart");
      } catch (err) { console.error(err); toast("Failed to add to cart"); }
      return;
    }

    if (e.target.classList.contains("btn-fav")) {
      if (!auth.currentUser) return showLoginPopup();
      try {
        if (userFavorites.has(productId)) {
          await removeFromFavorites(productId);
          userFavorites.delete(productId);
        } else {
          await upsertFavorite(productId, card);
          userFavorites.add(productId);
        }
        const buttons = document.querySelectorAll(`.product-card[data-id="${productId}"] .btn-fav`);
        buttons.forEach(btn => {
          const active = userFavorites.has(productId);
          btn.classList.toggle('active', active);
          const isDetails = btn.textContent.includes('Favorite');
          btn.innerHTML = active ? (isDetails ? '💖 Favorite' : '💖') : (isDetails ? '❤️ Favorite' : '❤️');
        });
        toast(userFavorites.has(productId) ? "Added to favorites" : "Removed from favorites");
      } catch (err) { console.error(err); toast("Failed to add to favorites"); }
      return;
    }
  });
}

function showLoginPopup() {
  const popup = document.getElementById("loginPopup");
  if (!popup) return alert("Please sign in to continue.");
  popup.classList.add("show");
  setTimeout(() => popup.classList.remove("show"), 3000);
}

function toast(msg) {
  // Minimal inline toast using the loginPopup style if available
  const tmp = document.createElement("div");
  tmp.textContent = msg;
  tmp.style.position = "fixed";
  tmp.style.bottom = "20px";
  tmp.style.right = "20px";
  tmp.style.background = "#111827";
  tmp.style.color = "#fff";
  tmp.style.padding = "8px 12px";
  tmp.style.borderRadius = "6px";
  tmp.style.zIndex = "9999";
  document.body.appendChild(tmp);
  setTimeout(() => tmp.remove(), 1800);
}

async function upsertUserArray(kind, productId, cardEl) {
  const user = auth.currentUser;
  if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  // Gather product summary from card
  const name = cardEl.querySelector('h3')?.textContent || 'Product';
  const priceText = cardEl.querySelector('.price')?.textContent || '0';
  const price = Number((priceText.match(/\d+/g) || ['0']).join(''));
  const imageUrl = cardEl.querySelector('img')?.getAttribute('src') || '';

  const item = { productId, name, price, imageUrl };

  if (!snap.exists()) {
    await setDoc(ref, { [kind]: [item] }, { merge: true });
    return;
  }

  const data = snap.data() || {};
  const arr = Array.isArray(data[kind]) ? data[kind] : [];
  const exists = arr.some(x => x.productId === productId);
  const next = exists ? arr : [...arr, item];
  await updateDoc(ref, { [kind]: next });
}

async function upsertCart(productId, cardEl) {
  const user = auth.currentUser; if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  const name = cardEl.querySelector('h3')?.textContent || 'Product';
  const priceText = cardEl.querySelector('.price')?.textContent || '0';
  const price = Number((priceText.match(/\d+/g) || ['0']).join(''));
  const imageUrl = cardEl.querySelector('img')?.getAttribute('src') || '';

  if (!snap.exists()) {
    await setDoc(ref, { cart: [{ productId, name, price, imageUrl, quantity: 1 }] }, { merge: true });
    return;
  }
  const data = snap.data() || {}; const arr = Array.isArray(data.cart) ? data.cart : [];
  const idx = arr.findIndex(x => x.productId === productId);
  if (idx >= 0) arr[idx] = { ...arr[idx], quantity: (arr[idx].quantity || 1) + 1 };
  else arr.push({ productId, name, price, imageUrl, quantity: 1 });
  await updateDoc(ref, { cart: arr });
}

async function upsertFavorite(productId, cardEl) {
  const user = auth.currentUser; if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const name = cardEl.querySelector('h3')?.textContent || 'Product';
  const priceText = cardEl.querySelector('.price')?.textContent || '0';
  const price = Number((priceText.match(/\d+/g) || ['0']).join(''));
  const imageUrl = cardEl.querySelector('img')?.getAttribute('src') || '';
  if (!snap.exists()) {
    await setDoc(ref, { favorites: [{ productId, name, price, imageUrl }] }, { merge: true });
    return;
  }
  const data = snap.data() || {}; const arr = Array.isArray(data.favorites) ? data.favorites : [];
  if (!arr.some(x => x.productId === productId)) arr.push({ productId, name, price, imageUrl });
  await updateDoc(ref, { favorites: arr });
}

async function removeFromFavorites(productId) {
  const user = auth.currentUser; if (!user) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {}; const arr = Array.isArray(data.favorites) ? data.favorites : [];
  const next = arr.filter(x => x.productId !== productId);
  await updateDoc(ref, { favorites: next });
}

