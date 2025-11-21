import { auth, db } from "./firebase.js";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { cartStore } from "./stores.js";
import { showToast, friendlyError, upsertItem } from "./utils.js";
import { searchManager } from "./search.js";

const grid = document.querySelector(".product-grid");
const searchInput = document.getElementById("searchInput");
const homeSearchInput = document.getElementById("homeSearchInput");
const productsPageSearch = document.getElementById("productsPageSearch");
const categoryFilter = document.getElementById("categoryFilter");
const sortFilter = document.getElementById("sortFilter");
const modalState = {
  element: null,
  refs: {},
  product: null,
};
let modalKeyListenerBound = false;

let allProducts = [];
let userFavorites = new Set();
let currentQuery = "";
const reviewCache = new Map();

if (categoryFilter) categoryFilter.addEventListener("change", renderProducts);
if (sortFilter) sortFilter.addEventListener("change", renderProducts);

window.addEventListener("app:search:change", ({ detail }) => {
  currentQuery = (detail?.query || "").toLowerCase();
  renderProducts();
});
window.addEventListener("app:search:submit", ({ detail }) => {
  currentQuery = (detail?.query || "").toLowerCase();
  renderProducts();
});

loadProducts();

async function loadProducts() {
  if (!grid) return;
  renderLoadingState();
  try {
    const snapshot = await getDocs(collection(db, "products"));
    if (snapshot.empty) {
      grid.innerHTML = emptyState("No products yet.", true);
      return;
    }
    allProducts = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      allProducts.push({
        id: docSnap.id,
        name: data.name || "Unnamed",
        imageUrl: data.imageUrl || "https://via.placeholder.com/300x200?text=No+Image",
        price: Number(data.price) || 0,
        category: data.category || "Other",
        sellerEmail: data.sellerEmail || "Unknown",
        description: data.description || "",
        createdAtMs: data.createdAt && typeof data.createdAt.toMillis === "function" ? data.createdAt.toMillis() : 0,
      });
    });
    if (searchManager) {
      const suggestions = allProducts.map((p) => ({ label: p.name, meta: p.category }));
      searchManager.setSuggestions(suggestions);
    }
    await loadUserFavorites();
    renderProducts();
    attachGridHandlers();
  } catch (error) {
    console.error(error);
    grid.innerHTML = errorState(friendlyError(error, "Failed to load products."));
  }
}

async function loadUserFavorites() {
  if (!auth.currentUser) {
    userFavorites = new Set();
    return;
  }
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  if (!snap.exists()) {
    userFavorites = new Set();
    return;
  }
  const data = snap.data() || {};
  const favs = Array.isArray(data.favorites) ? data.favorites : [];
  userFavorites = new Set(favs.map((item) => (typeof item === "string" ? item : item.productId)));
}

function renderLoadingState() {
  grid.innerHTML = `
    <div class="loading-grid">
      ${Array.from({ length: 6 })
        .map(
          () => `
        <div class="product-card skeleton">
          <div class="skeleton-image"></div>
          <div class="skeleton-line w-80"></div>
          <div class="skeleton-line w-60"></div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderProducts() {
  if (!grid) return;
  const cat = (categoryFilter?.value || "all").toLowerCase();
  const sort = sortFilter?.value || "newest";
  let list = allProducts.slice();

  if (cat !== "all") {
    list = list.filter((product) => product.category?.toLowerCase().includes(cat));
  }

  if (currentQuery) {
    list = list.filter((product) =>
      `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(currentQuery),
    );
  }

  if (sort === "newest") {
    list.sort((a, b) => b.createdAtMs - a.createdAtMs);
  } else if (sort === "low-high") {
    list.sort((a, b) => a.price - b.price);
  } else if (sort === "high-low") {
    list.sort((a, b) => b.price - a.price);
  }

  if (!list.length) {
    grid.innerHTML = emptyState("No products match your filters.", true);
    return;
  }

  grid.innerHTML = list.map(productCardHtml).join("");
}

function productCardHtml(product) {
  const favActive = userFavorites.has(product.id);
  return `
    <div class="product-card" data-id="${product.id}">
      <img src="${product.imageUrl}" alt="${product.name}" onerror="handleImageError(event)">
      <div class="card-body">
        <h3>${product.name}</h3>
        <div class="rating-pill" id="rating-${product.id}">Awaiting reviews</div>
        <p class="price">${product.price} FCFA</p>
      <div class="actions">
        <button class="btn-cart" title="Add to cart">🛒</button>
          <button class="btn-fav ${favActive ? "active" : ""}" title="Add to favorites">${favActive ? "💖" : "❤️"}</button>
        <button class="btn-details" title="Details">Details</button>
        </div>
      </div>
    </div>
  `;
}

function emptyState(copy, showButton = false) {
  return `
    <div class="empty-state">
      <img src="images/electronics1.png" alt="Illustration">
      <p>${copy}</p>
      ${showButton ? '<button class="btn-primary js-browse-products" type="button">Browse Products</button>' : ""}
    </div>
  `;
}

function errorState(copy) {
  return `<div class="empty-state"><p>${copy}</p></div>`;
}

function attachGridHandlers() {
  if (!grid) return;
  grid.addEventListener("click", async (event) => {
    const card = event.target.closest(".product-card");
    if (!card) return;
    const productId = card.getAttribute("data-id");

    if (event.target.classList.contains("btn-details")) {
      showProductModal(productId);
      return;
    }

    if (event.target.classList.contains("btn-cart")) {
      if (!auth.currentUser) return showLoginPopup();
      const summary = getProductSummary(card, productId);
      cartStore.addItem(summary);
      showToast("Added to cart", "success");
      return;
    }

    if (event.target.classList.contains("btn-fav")) {
      if (!auth.currentUser) return showLoginPopup();
      await toggleFavorite(productId, card);
    }
  });
}

function getProductSummary(card, productId, fallbackProduct) {
  if (card) {
    const name = card.querySelector("h3")?.textContent || "Product";
    const price = Number(card.querySelector(".price")?.textContent.replace(/\D/g, "")) || 0;
    const imageUrl = card.querySelector("img")?.getAttribute("src") || "";
    return { productId, name, price, imageUrl, quantity: 1 };
  }
  const product = fallbackProduct || allProducts.find((item) => item.id === productId);
  return summaryFromProduct(product, productId);
}

function summaryFromProduct(product, fallbackId = "") {
  if (!product) return { productId: fallbackId, name: "Product", price: 0, imageUrl: "", quantity: 1 };
  return {
    productId: product.id || fallbackId,
    name: product.name || "Product",
    price: Number(product.price) || 0,
    imageUrl: product.imageUrl || "",
    quantity: 1,
  };
}

/**
 * Adds or removes a product from the authenticated user's favorites.
 * @param {string} productId
 * @param {HTMLElement} card
 */
async function toggleFavorite(productId, card, productData) {
  const summary = getProductSummary(card, productId, productData);
  const ref = doc(db, "users", auth.currentUser.uid);
  const snap = await getDoc(ref);
  const data = snap.data() || {};
  const arr = Array.isArray(data.favorites) ? data.favorites : [];
  const isRemoving = userFavorites.has(productId);

  if (isRemoving) {
    const next = arr.filter((item) => item.productId !== productId);
    await updateDoc(ref, { favorites: next });
          userFavorites.delete(productId);
    showToast("Removed from favorites", "info");
        } else {
    const next = upsertItem(arr, (item) => item.productId === productId, (existing) => existing || summary);
    await updateDoc(ref, { favorites: next });
          userFavorites.add(productId);
    showToast("Added to favorites", "success");
  }

  updateFavoriteButtons(productId);
        }

function updateFavoriteButtons(productId) {
  document.querySelectorAll(`.product-card[data-id="${productId}"] .btn-fav`).forEach((btn) => {
          const active = userFavorites.has(productId);
    btn.classList.toggle("active", active);
    if (btn.textContent.includes("Favorite")) {
      btn.textContent = active ? "💖 Favorite" : "❤️ Favorite";
    } else {
      btn.textContent = active ? "💖" : "❤️";
    }
  });
  updateModalFavoriteState(productId);
}

/**
 * Fetches reviews for a product with a simple in-memory cache.
 * @param {string} productId
 */
async function renderReviews(productId) {
  if (!modalState.refs.reviewsList) return;
  modalState.refs.reviewsList.innerHTML = "<p>Loading reviews...</p>";
  if (reviewCache.has(productId)) {
    paintReviews(productId, reviewCache.get(productId));
    return;
  }
  try {
    const list = [];
    const snap = await getDocs(collection(db, "products", productId, "reviews"));
    snap.forEach((docSnap) => list.push(docSnap.data()));
    reviewCache.set(productId, list);
    paintReviews(productId, list);
  } catch (error) {
    console.error(error);
  }
}

function paintReviews(productId, reviews) {
  if (modalState.refs.reviewsList) {
    if (!reviews.length) {
      modalState.refs.reviewsList.innerHTML = "<p>Be the first to review this product.</p>";
    } else {
      modalState.refs.reviewsList.innerHTML = reviews
        .map(
          (review) => `
        <article class="review-item">
          <strong>${"★".repeat(review.rating || 0)}</strong>
          <p>${review.comment || ""}</p>
          <small>${review.userEmail || "Anonymous"}</small>
        </article>
      `,
        )
        .join("");
    }
  }
  const avg = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / (reviews.length || 1);
  const badge = document.getElementById(`rating-${productId}`);
  if (badge) {
    badge.textContent = reviews.length ? `${avg.toFixed(1)} ★ • ${reviews.length} reviews` : "Awaiting reviews";
  }
  if (modalState.refs.ratingPill && modalState.product?.id === productId) {
    modalState.refs.ratingPill.textContent = reviews.length ? `${avg.toFixed(1)} ★ • ${reviews.length} reviews` : "Customer reviews";
  }
}

async function handleReviewSubmit(productId, form) {
  if (!auth.currentUser) return showLoginPopup();
  const rating = Number(form.rating.value);
  const comment = form.comment.value.trim();
  if (!rating || !comment) return showToast("Add a rating and comment.", "info");
  try {
    await setDoc(doc(collection(db, "products", productId, "reviews"), auth.currentUser.uid), {
      rating,
      comment,
      userEmail: auth.currentUser.email,
      createdAt: new Date(),
    });
    form.reset();
    reviewCache.delete(productId);
    await renderReviews(productId);
    showToast("Review submitted", "success");
  } catch (error) {
    console.error(error);
    showToast(friendlyError(error, "Unable to submit review."), "error");
  }
}

function showLoginPopup() {
  const popup = document.getElementById("loginPopup");
  if (!popup) return alert("Please sign in to continue.");
  popup.classList.add("show");
  setTimeout(() => popup.classList.remove("show"), 3000);
}

function ensureProductModal() {
  if (modalState.element) return modalState.element;
  const modal = document.createElement("div");
  modal.id = "productDetailModal";
  modal.className = "product-modal hidden";
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" aria-label="Close details">✕</button>
      <div class="modal-grid">
        <div class="modal-image">
          <img alt="Product">
        </div>
        <div class="modal-info">
          <h3 id="modalProductName"></h3>
          <p class="modal-price" id="modalProductPrice"></p>
          <p class="modal-meta" id="modalProductMeta"></p>
          <p class="modal-desc" id="modalProductDesc"></p>
          <div class="modal-actions">
            <button class="btn-primary" id="modalAddCart">Add to cart</button>
            <button class="btn-secondary" id="modalToggleFav">Favorite</button>
          </div>
          <section class="modal-reviews">
            <h4 id="modalRatingPill">Customer reviews</h4>
            <div class="reviews-list" id="modalReviewsList"></div>
            <form id="modalReviewForm">
              <label for="modalRatingSelect">Rate this product</label>
              <select id="modalRatingSelect" name="rating" required>
                <option value="">Select rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Great</option>
                <option value="3">3 - Good</option>
                <option value="2">2 - Fair</option>
                <option value="1">1 - Poor</option>
              </select>
              <textarea name="comment" rows="3" placeholder="Share your experience" required></textarea>
              <button type="submit" class="btn-primary">Submit review</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modalState.element = modal;
  modalState.refs = {
    image: modal.querySelector(".modal-image img"),
    name: modal.querySelector("#modalProductName"),
    price: modal.querySelector("#modalProductPrice"),
    meta: modal.querySelector("#modalProductMeta"),
    desc: modal.querySelector("#modalProductDesc"),
    favBtn: modal.querySelector("#modalToggleFav"),
    cartBtn: modal.querySelector("#modalAddCart"),
    reviewsList: modal.querySelector("#modalReviewsList"),
    reviewForm: modal.querySelector("#modalReviewForm"),
    ratingPill: modal.querySelector("#modalRatingPill"),
  };
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.classList.contains("modal-close")) {
      hideProductModal();
    }
  });
  modalState.refs.reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!modalState.product) return;
    await handleReviewSubmit(modalState.product.id, modalState.refs.reviewForm);
  });
  modalState.refs.cartBtn.addEventListener("click", () => {
    if (!modalState.product) return;
    if (!auth.currentUser) return showLoginPopup();
    cartStore.addItem(summaryFromProduct(modalState.product));
    showToast("Added to cart", "success");
  });
  modalState.refs.favBtn.addEventListener("click", async () => {
    if (!modalState.product) return;
    if (!auth.currentUser) return showLoginPopup();
    await toggleFavorite(modalState.product.id, null, modalState.product);
    updateFavoriteButtons(modalState.product.id);
  });
  if (!modalKeyListenerBound) {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideProductModal();
    });
    modalKeyListenerBound = true;
  }
  return modal;
}

function showProductModal(productId) {
  const product = allProducts.find((item) => item.id === productId);
  if (!product) return;
  const modal = ensureProductModal();
  modalState.product = product;
  modalState.refs.image.src = product.imageUrl;
  modalState.refs.image.alt = product.name;
  modalState.refs.name.textContent = product.name;
  modalState.refs.price.textContent = `${product.price} FCFA`;
  modalState.refs.meta.textContent = `${product.category} • ${product.sellerEmail}`;
  modalState.refs.desc.textContent = product.description;
  updateModalFavoriteState(product.id);
  renderReviews(product.id);
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("open"));
}

function hideProductModal() {
  if (!modalState.element) return;
  modalState.element.classList.remove("open");
  setTimeout(() => modalState.element.classList.add("hidden"), 160);
}

function updateModalFavoriteState(productId) {
  if (!modalState.product || modalState.product.id !== productId) return;
  if (!modalState.refs.favBtn) return;
  const isActive = userFavorites.has(productId);
  modalState.refs.favBtn.textContent = isActive ? "Favorited" : "Favorite";
  modalState.refs.favBtn.classList.toggle("active", isActive);
}
