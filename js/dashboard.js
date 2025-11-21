import { auth, db } from "./firebase.js";
import { collection, addDoc, query, where, getDocs, doc, deleteDoc, updateDoc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { CLOUD_NAME, UPLOAD_PRESET } from "./cloudinaryConfig.js";
import { MAX_UPLOAD_SIZE, validationCopy, showToast } from "./utils.js";

// Sidebar Navigation
const sidebarItems = document.querySelectorAll(".sidebar li");
const pageContent = document.getElementById("pageContent");
const contentTitle = document.getElementById("contentTitle");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

sidebarItems.forEach(item => {
  item.addEventListener("click", () => {
    sidebarItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    loadPage(item.getAttribute("data-page"));
  });
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth).then(() => window.location.href = "index.html");
});

// Ensure Authenticated
onAuthStateChanged(auth, user => {
  if (!user) window.location.href = "login.html";
  else loadPage("overview");
});

// Load Sidebar Pages
function loadPage(page) {
  if (contentTitle) contentTitle.textContent = titleFor(page);
  if (page === "overview") return loadOverview();
  if (page === "myProducts") return loadMyProducts();
  if (page === "addProduct") return loadAddProductForm();
  if (page === "orders") return loadOrders();
  if (page === "analytics") return loadAnalytics();
  if (page === "profile") return loadProfile();
  if (page === "messages") return loadMessages();
}

function titleFor(page) {
  const map = { overview: "Dashboard", myProducts: "My Products", addProduct: "Add Product", orders: "Orders", analytics: "Analytics", profile: "Profile", messages: "Messages" };
  return map[page] || "Dashboard";
}

function loadOverview() {
  pageContent.innerHTML = `
    <div class="cards">
      <div class="card stat"><h3>Total Products</h3><p id="statProducts">—</p></div>
      <div class="card stat"><h3>Total Orders</h3><p id="statOrders">—</p></div>
      <div class="card stat"><h3>Total Revenue</h3><p id="statRevenue">—</p></div>
      <div class="card stat"><h3>Recent Activity</h3><p>Recent events will show here.</p></div>
    </div>
  `;
  (async () => {
    const user = auth.currentUser; if (!user) return;
    // Products count
    const pq = query(collection(db, "products"), where("ownerId", "==", user.uid));
    const productsSnap = await getDocs(pq);
    document.getElementById("statProducts").textContent = String(productsSnap.size);

    // Orders count + revenue (assumes orders docs with fields: sellerId, total, status)
    const oq = query(collection(db, "orders"), where("sellerId", "==", user.uid));
    const ordersSnap = await getDocs(oq);
    let revenue = 0;
    ordersSnap.forEach(d => { const t = Number(d.data().total || 0); revenue += isNaN(t) ? 0 : t; });
    document.getElementById("statOrders").textContent = String(ordersSnap.size);
    document.getElementById("statRevenue").textContent = `${revenue} FCFA`;
  })();
}

function loadOrders() {
  pageContent.innerHTML = `
    <div class="filters">
      <input id="ordersSearch" placeholder="Search orders...">
      <select id="ordersStatus">
        <option value="all">All Status</option>
        <option value="pending">Pending</option>
        <option value="completed">Completed</option>
        <option value="canceled">Canceled</option>
      </select>
    </div>
    <table class="table">
      <thead><tr><th>Order ID</th><th>Product</th><th>Customer</th><th>Status</th><th>Date</th><th>Total</th></tr></thead>
      <tbody id="ordersTable"><tr><td colspan="6">No orders yet.</td></tr></tbody>
    </table>
  `;
  initOrders();
}

async function initOrders() {
  const user = auth.currentUser; if (!user) return;
  const tb = document.getElementById("ordersTable");
  const searchEl = document.getElementById("ordersSearch");
  const statusEl = document.getElementById("ordersStatus");

  // Load seller orders (assumes orders have sellerId)
  const oq = query(collection(db, "orders"), where("sellerId", "==", user.uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(oq);
  let orders = [];
  snap.forEach(s => {
    const o = s.data();
    orders.push({
      id: s.id,
      product: o.productName || o.product || "—",
      customer: o.customerEmail || o.customer || "—",
      status: (o.status || "pending").toLowerCase(),
      date: o.createdAt && typeof o.createdAt.toDate === "function" ? o.createdAt.toDate() : null,
      total: Number(o.total || 0)
    });
  });

  function render() {
    const q = (searchEl.value || "").toLowerCase();
    const st = (statusEl.value || "all");
    let list = orders.slice();
    if (st !== "all") list = list.filter(o => o.status === st);
    if (q) list = list.filter(o => (o.id + " " + o.product + " " + o.customer).toLowerCase().includes(q));
    if (!list.length) { tb.innerHTML = '<tr><td colspan="6">No matching orders.</td></tr>'; return; }
    tb.innerHTML = list.map(o => `
      <tr>
        <td>${o.id}</td>
        <td>${o.product}</td>
        <td>${o.customer}</td>
        <td>${o.status}</td>
        <td>${o.date ? o.date.toLocaleDateString() : '—'}</td>
        <td>${o.total} FCFA</td>
      </tr>
    `).join("");
  }

  searchEl.addEventListener("input", render);
  statusEl.addEventListener("change", render);
  searchEl.addEventListener("keydown", (e) => { if (e.key === 'Enter') render(); });
  render();
}

function loadAnalytics() {
  pageContent.innerHTML = `
    <div class="cards">
      <div class="card"><h3>Sales Over Time</h3><div class="chart" id="chartSales"></div></div>
      <div class="card"><h3>Top Products</h3><div class="chart" id="chartTop"></div></div>
      <div class="card"><h3>Revenue by Category</h3><div class="chart" id="chartCategory"></div></div>
    </div>
  `;
}

function loadProfile() {
  pageContent.innerHTML = `
    <form class="profile-form">
      <div class="grid2">
        <div><label>Full Name</label><input id="profName" placeholder="Full Name"></div>
        <div><label>Email</label><input id="profEmail" placeholder="Email" disabled></div>
      </div>
      <div class="grid2">
        <div><label>Phone</label><input id="profPhone" placeholder="Phone"></div>
        <div><label>Address</label><input id="profAddress" placeholder="Address"></div>
      </div>
      <div><label>Profile Picture</label><input type="file" id="profAvatar" accept="image/*"></div>
      <button type="button" class="btn-primary" id="saveProfile">Save Changes</button>
    </form>
  `;
}

// Sidebar interactions
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => {
    if (window.innerWidth <= 900) {
      sidebar.classList.toggle('hide');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });
}

function loadMessages() {
  pageContent.innerHTML = `
    <div class="messages">
      <div class="message-item">No messages yet.</div>
    </div>
  `;
}

//  MY PRODUCTS PAGE 
async function loadMyProducts() {
  pageContent.innerHTML = `
    <h2>My Products</h2>
    <div id="productsGrid" class="products-grid">Loading...</div>
  `;

  const container = document.getElementById("productsGrid");
  const user = auth.currentUser;
  try {
    const q = query(collection(db, "products"), where("ownerId", "==", user.uid));
    const snapshot = await getDocs(q);
    container.innerHTML = "";
    if (snapshot.empty) {
      container.innerHTML = "<p>You haven't added any products yet.</p>";
      return;
    }
    snapshot.forEach(docSnap => {
      const p = docSnap.data();
      const productId = docSnap.id;
      container.innerHTML += `
        <div class="product-card">
          <img src="${p.imageUrl}" alt="">
          <h3>${p.name}</h3>
          <p class="price">${p.price} FCFA</p>
          <button class="edit-btn" data-id="${productId}">Edit</button>
          <button class="delete-btn" data-id="${productId}">Delete</button>
        </div>
      `;
    });
    container.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this product?")) return;
        try {
          await deleteDoc(doc(db, "products", btn.dataset.id));
          showToast("Product deleted", "success");
          loadMyProducts();
        } catch (error) {
          console.error(error);
          showToast("Unable to delete product.", "error");
        }
      });
    });
    container.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", () => loadAddProductForm(btn.dataset.id));
    });
  } catch (error) {
    console.error(error);
    container.innerHTML = "<p>Unable to load products right now.</p>";
    showToast("Unable to load products.", "error");
  }
}

//  ADD / EDIT PRODUCT PAGE 
function loadAddProductForm(editProductId = null) {
  pageContent.innerHTML = `
    <h2>${editProductId ? "Edit Product" : "Add New Product"}</h2>
    <form id="addProductForm" class="add-product-form">
      <div class="upload-area" id="uploadArea">
        <p>Drag & Drop product image here</p>
        <span>or</span>
        <button type="button" id="browseBtn">Browse File</button>
        <input type="file" id="fileInput" hidden accept="image/*">
        <img id="previewImage" style="display:none;">
        <p class="helper-text error" id="uploadError"></p>
      </div>

      <label for="productCategory">Category</label>
      <select id="productCategory" required>
        <option value="Phones">Phones</option>
        <option value="Laptops">Laptops</option>
        <option value="Computers">Computers</option>
        <option value="Tablets">Tablets</option>
        <option value="TVs">TVs</option>
        <option value="Audio">Audio</option>
        <option value="Gaming">Gaming</option>
        <option value="Accessories">Accessories</option>
        <option value="Smart Home">Smart Home</option>
        <option value="Cameras">Cameras</option>
        <option value="Networking">Networking</option>
        <option value="Other">Other</option>
      </select>

      <input type="text" id="productName" placeholder="Product Name" required>
      <textarea id="productDescription" placeholder="Description" required></textarea>
      <input type="number" id="productPrice" placeholder="Price (FCFA)" required>
      <button type="submit">${editProductId ? "Update" : "Add"}</button>
    </form>
  `;

  initUploadHandlers();
  const form = document.getElementById("addProductForm");

  // Load existing data if editing
  if (editProductId) {
    (async () => {
      try {
        const docSnap = await getDoc(doc(db, "products", editProductId));
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        if (data.category) document.getElementById("productCategory").value = data.category;
        document.getElementById("productName").value = data.name;
        document.getElementById("productDescription").value = data.description;
        document.getElementById("productPrice").value = data.price;
        const previewImage = document.getElementById("previewImage");
        previewImage.src = data.imageUrl;
        previewImage.style.display = "block";
      } catch (error) {
        console.error(error);
        showToast("Unable to load product.", "error");
      }
    })();
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const name = document.getElementById("productName").value;
      const category = document.getElementById("productCategory").value;
      const desc = document.getElementById("productDescription").value;
      const price = Number(document.getElementById("productPrice").value);
      let imageUrl = null;
      if (window.selectedFile) {
        const fd = new FormData();
        fd.append("file", window.selectedFile);
        fd.append("upload_preset", UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: fd });
        const upload = await res.json();
        if (upload.error) throw new Error(upload.error.message);
        imageUrl = upload.secure_url;
      }
      const user = auth.currentUser;
      if (editProductId) {
        await updateDoc(doc(db, "products", editProductId), {
          name, category, description: desc, price, ...(imageUrl && { imageUrl })
        });
        showToast("Product updated.", "success");
      } else {
        await addDoc(collection(db, "products"), {
          name, category, description: desc, price,
          imageUrl: imageUrl || "",
          ownerId: user.uid,
          sellerEmail: user.email,
          createdAt: new Date()
        });
        showToast("Product added.", "success");
      }
      loadMyProducts();
    } catch (error) {
      console.error(error);
      showToast("Unable to save product.", "error");
    }
  });
}

//  DRAG & DROP UPLOAD 
function initUploadHandlers() {
  const uploadArea = document.getElementById("uploadArea");
  const fileInput = document.getElementById("fileInput");
  const browseBtn = document.getElementById("browseBtn");
  const previewImage = document.getElementById("previewImage");
  const errorEl = document.getElementById("uploadError");

  const setError = (message = "") => {
    if (errorEl) errorEl.textContent = message;
  };

  browseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => handleFile(e.target));

  uploadArea.addEventListener("dragover", e => { e.preventDefault(); uploadArea.classList.add("dragging"); });
  uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragging"));
  uploadArea.addEventListener("drop", e => {
    e.preventDefault(); uploadArea.classList.remove("dragging");
    handleFile(e.dataTransfer);
  });

  function handleFile(source) {
    const file = source.files && source.files[0];
    if (!file) return;
     if (!file.type.startsWith("image/")) {
       setError(validationCopy.fileType);
       return;
     }
     if (file.size > MAX_UPLOAD_SIZE) {
       setError(validationCopy.fileSize);
       return;
     }
     setError("");
    previewImage.src = URL.createObjectURL(file);
    previewImage.style.display = "block";
    window.selectedFile = file;
  }
}
