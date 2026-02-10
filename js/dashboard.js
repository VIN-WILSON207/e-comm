import { auth, db } from "./firebase.js";
import { collection, addDoc, query, where, getDocs, doc, deleteDoc, updateDoc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { CLOUD_NAME, UPLOAD_PRESET } from "./cloudinaryConfig.js";
import { MAX_UPLOAD_SIZE, validationCopy, showToast } from "./utils.js";
import { OrderService } from "./services/orders.js";

const PROFANITY_LIST = ["xxx", "fuck", "sex", "stupid", "fool"];

function isProfane(text) {
  const lower = text.toLowerCase();
  return PROFANITY_LIST.some(word => lower.includes(word));
}

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

// Logout (Safe check)
const legacyLogout = document.getElementById("logoutBtn");
if (legacyLogout) {
  legacyLogout.addEventListener("click", () => {
    signOut(auth).then(() => window.location.href = "index.html");
  });
}

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
      <div class="card stat"><h3>Total Products</h3><p id="statProducts">...</p></div>
      <div class="card stat"><h3>Total Orders</h3><p id="statOrders">...</p></div>
      <div class="card stat"><h3>Total Revenue</h3><p id="statRevenue">...</p></div>
      <div class="card stat"><h3>Recent Activity</h3><p>Recent events will show here.</p></div>
    </div>
  `;
  (async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const pq = query(collection(db, "products"), where("ownerId", "==", user.uid));
      const oq = query(collection(db, "orders"), where("sellerId", "==", user.uid));

      const [productsSnap, ordersSnap] = await Promise.all([
        getDocs(pq),
        getDocs(oq)
      ]);

      let revenue = 0;
      ordersSnap.forEach(d => {
        const t = Number(d.data().totalAmount || d.data().total || 0);
        revenue += isNaN(t) ? 0 : t;
      });

      document.getElementById("statProducts").textContent = String(productsSnap.size);
      document.getElementById("statOrders").textContent = String(ordersSnap.size);
      document.getElementById("statRevenue").textContent = `${revenue.toLocaleString()} FCFA`;
    } catch (err) {
      console.error("Dashboard overview load failed:", err);
      showToast("Failed to load dashboard statistics", "error");
    }
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
      product: o.productSnapshot?.name || "—",
      customer: o.buyerId || "—",
      status: (o.status || "pending").toLowerCase(),
      date: o.createdAt && typeof o.createdAt.toDate === "function" ? o.createdAt.toDate() : null,
      total: Number(o.totalAmount || 0),
      escrowStatus: o.escrowStatus || "none"
    });
  });

  function render() {
    const q = (searchEl.value || "").toLowerCase();
    const st = (statusEl.value || "all");
    let list = orders.slice();

    if (st !== "all") list = list.filter(o => o.status === st);
    if (q) {
      list = list.filter(o =>
        o.id.toLowerCase().includes(q) ||
        o.product.toLowerCase().includes(q)
      );
    }

    if (!list.length) { tb.innerHTML = '<tr><td colspan="6">No matching orders.</td></tr>'; return; }
    tb.innerHTML = list.map(o => `
      <tr>
        <td>${o.id.substring(0, 8)}</td>
        <td>${o.product}</td>
        <td>${o.customer.substring(0, 8)}</td>
        <td>
          <span class="status-badge ${o.status}">${o.status}</span>
          ${o.status === 'paid' ? `<button class="btn-sm btn-primary mark-shipped" data-id="${o.id}">Mark Shipped</button>` : ''}
          <br><small>Escrow: ${o.escrowStatus}</small>
        </td>
        <td>${o.date ? o.date.toLocaleDateString() : '—'}</td>
        <td>${o.total} FCFA</td>
      </tr>
    `).join("");

    tb.querySelectorAll(".mark-shipped").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (confirm("Have you shipped this product?")) {
          await OrderService.markAsShipped(btn.dataset.id);
          initOrders(); // Refresh table
        }
      });
    });
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
  const user = auth.currentUser;
  if (!user) return;

  (async () => {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const data = userDoc.data() || {};
    const isVerified = data.isVerified || false;
    const vStatus = data.verificationStatus || (isVerified ? 'approved' : 'none');

    let statusBadgeHTML = '';
    if (vStatus === 'approved') {
      statusBadgeHTML = `<div class="badge" style="background: #3498db; color: white; padding: 6px 16px; border-radius: 20px; font-weight: 600;">✓ Verified Seller</div>`;
    } else if (vStatus === 'pending') {
      statusBadgeHTML = `<div class="badge" style="background: #e67e22; color: white; padding: 6px 16px; border-radius: 20px; font-weight: 600;">⌛ Verification Pending</div>`;
    } else {
      statusBadgeHTML = `
        <div class="badge" style="background: #f1c40f; color: white; padding: 6px 16px; border-radius: 20px; font-weight: 600;">Unverified Seller</div>
        <button class="btn-sm btn-primary" id="startVerifyBtn">Verify Now</button>
      `;
    }

    const profilePic = data.photoURL || '';

    pageContent.innerHTML = `
      <div class="profile-view" id="profileView" style="position: relative;">
        <div class="profile-header" style="text-align: center; border-bottom: 2px solid #eee; padding-bottom: 2rem;">
          <div class="profile-avatar-container" style="position: relative; width: 120px; margin: 0 auto 1rem;">
             <div id="profileAvatar" class="profile-avatar" style="font-size: 80px; width: 120px; height: 120px; border-radius: 50%; background: #f8f9fa; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 3px solid ${isVerified ? '#3498db' : '#f1c40f'}; overflow: hidden;">
                ${profilePic ? `<img src="${profilePic}" style="width: 100%; height: 100%; object-fit: cover;">` : '👤'}
             </div>
             <div style="position: absolute; bottom: 5px; right: 5px; background: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer;" id="changePhotoTrigger">📷</div>
             <input type="file" id="profilePhotoInput" hidden accept="image/*">
          </div>
          
          <div class="badge-row" style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1rem;">
            ${statusBadgeHTML}
          </div>

          <h2>${data.fullName || "User"}</h2>
          <p style="color: #666;">${data.email}</p>
        </div>

        <div class="profile-details" style="margin-top: 2rem;">
          <label>Phone Number</label>
          <p>+237 ${data.phoneNumber || "Not set"}</p>
          <hr style="opacity: 0.1; margin: 1rem 0;">
          <label>Business Address</label>
          <p>${data.address || "Not set"}</p>
        </div>
        
        <div class="profile-actions" style="margin-top: 2.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
          <button class="btn-primary" id="editProfileBtn">Edit Profile</button>
          
          <div style="display: flex; justify-content: flex-end; margin-top: 1rem;">
             <button id="profileLogoutBtn" class="btn-logout-small">Logout Account</button>
          </div>
        </div>
      </div>

      <form class="profile-form hidden" id="profileForm">
        <h3>Edit Profile</h3>
        
        <label>Full Name</label>
        <div id="profNameError" class="form-message"></div>
        <input id="profName" value="${data.fullName || ""}">
        
        <label>Personal Email (Disabled)</label>
        <input id="profEmail" value="${data.email}" disabled>
        
        <label>Phone Number</label>
        <small class="helper-text">Format: 237 6...</small>
        <div id="profPhoneError" class="form-message"></div>
        <input id="profPhone" value="${data.phoneNumber || ""}" maxlength="9" placeholder="237 6">
        
        <label>Business Address</label>
        <div id="profAddressError" class="form-message"></div>
        <input id="profAddress" value="${data.address || ""}">
        
        <div class="form-actions" style="margin-top: 1.5rem; display: flex; gap: 1rem;">
          <button type="button" class="btn-primary" id="saveProfile" style="flex: 1;">Save Changes</button>
          <button type="button" class="btn-secondary" id="cancelEdit" style="flex: 1;">Cancel</button>
        </div>
      </form>
    `;

    // Handle Top Bar Photo
    const topPhoto = document.getElementById("topProfilePhoto");
    if (topPhoto) {
      topPhoto.innerHTML = profilePic ? `<img src="${profilePic}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : '👤';
      topPhoto.style.background = profilePic ? 'none' : badgeColor;
      topPhoto.style.color = "white";
    }

    // Photo Upload Handler
    document.getElementById("changePhotoTrigger").addEventListener("click", () => document.getElementById("profilePhotoInput").click());
    document.getElementById("profilePhotoInput").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      showToast("Uploading photo...", "info");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET); // Use dynamic preset

      try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData
        });
        const result = await res.json();
        await updateDoc(doc(db, "users", user.uid), { photoURL: result.secure_url });
        showToast("Profile photo updated!", "success");
        loadProfile();
      } catch (err) {
        showToast("Photo upload failed", "error");
      }
    });

    document.getElementById("profileLogoutBtn").addEventListener("click", () => {
      if (confirm("Are you sure you want to logout?")) {
        auth.signOut().then(() => {
          window.location.href = "login.html";
        });
      }
    });

    document.getElementById("editProfileBtn").addEventListener("click", () => {
      document.getElementById("profileView").classList.add("hidden");
      document.getElementById("profileForm").classList.remove("hidden");
    });

    document.getElementById("cancelEdit").addEventListener("click", () => {
      document.getElementById("profileForm").classList.add("hidden");
      document.getElementById("profileView").classList.remove("hidden");
    });

    document.getElementById("saveProfile").addEventListener("click", async () => {
      const fullName = document.getElementById("profName").value;
      const phone = document.getElementById("profPhone").value;
      const address = document.getElementById("profAddress").value;

      if (!/^6[0-9]{8}$/.test(phone)) return showToast("Invalid phone format (6XXXXXXXX)", "error");

      try {
        await updateDoc(doc(db, "users", user.uid), { fullName, phoneNumber: phone, address });
        showToast("Profile updated!", "success");
        loadProfile();
      } catch (err) {
        showToast("Save failed", "error");
      }
    });

    // --- Verification Modal Logic ---
    const vModal = document.getElementById("verificationModal");
    const closeVerifBtn = document.getElementById("closeVerifModal");
    const startVerifBtn = document.getElementById("startVerifyBtn");

    if (startVerifBtn) {
      startVerifBtn.onclick = () => vModal.classList.remove("hidden");
    }

    if (closeVerifBtn) {
      closeVerifBtn.onclick = () => vModal.classList.add("hidden");
    }

    // Modal Image Previews
    const setupPreview = (inputSelector, previewSelector) => {
      const input = document.getElementById(inputSelector);
      const preview = document.getElementById(previewSelector);
      if (input && preview) {
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
              preview.src = re.target.result;
              preview.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
          }
        };
      }
    };

    setupPreview("nidFront", "frontPreview");
    setupPreview("nidBack", "backPreview");

    // Unified Submission Logic
    const submitBtn = document.getElementById("submitVerification");
    if (submitBtn) {
      submitBtn.onclick = async () => {
        const nidNum = document.getElementById("nidNumber").value.trim();
        const frontInput = document.getElementById("nidFront");
        const backInput = document.getElementById("nidBack");

        if (!nidNum || !frontInput.files[0] || !backInput.files[0]) {
          return showToast("Please fill all details and capture both ID photos.", "error");
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Uploading Documents...";

        try {
          // Internal helper to upload to Cloudinary
          const uploadToCloud = async (file, side) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", UPLOAD_PRESET);
            const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: formData });
            const data = await r.json();
            return data.secure_url;
          };

          const [frontUrl, backUrl] = await Promise.all([
            uploadToCloud(frontInput.files[0], "Front"),
            uploadToCloud(backInput.files[0], "Back")
          ]);

          await updateDoc(doc(db, "users", user.uid), {
            verificationStatus: 'pending',
            verificationData: {
              nid: nidNum,
              front: frontUrl,
              back: backUrl,
              submittedAt: new Date()
            }
          });

          showToast("Verification submitted successfully!", "success");
          vModal.classList.add("hidden");
          setTimeout(() => loadProfile(), 1000);
        } catch (err) {
          console.error(err);
          showToast("Submission failed. Try again.", "error");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit for Review";
        }
      };
    }
  })();
}

// Sidebar interactions
if (sidebarToggle && sidebar) {
  // Hide sidebar by default on mobile
  if (window.innerWidth <= 900) {
    sidebar.classList.add('hide');
  }

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
  if (!user) {
    if (container) container.innerHTML = "<p>Please login to view your products.</p>";
    return;
  }

  try {
    const q = query(collection(db, "products"), where("ownerId", "==", user.uid));
    const snapshot = await getDocs(q);
    if (!container) return;
    container.innerHTML = "";
    if (snapshot.empty) {
      container.innerHTML = "<p>You haven't added any products yet.</p>";
      return;
    }

    let products = [];
    snapshot.forEach(docSnap => {
      products.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Add search/filter controls for "My Products"
    pageContent.insertAdjacentHTML("afterbegin", `
      <div class="filters">
        <input id="myProductsSearch" placeholder="Search my products...">
        <select id="myProductsCat">
          <option value="all">All Categories</option>
          <option value="Phones">Phones</option>
          <option value="Laptops">Laptops</option>
          <option value="Audio">Audio</option>
        </select>
      </div>
    `);

    const sInput = document.getElementById("myProductsSearch");
    const catSel = document.getElementById("myProductsCat");

    function renderMyProductsGrid() {
      const qText = sInput.value.toLowerCase();
      const cat = catSel.value;

      let filtered = products.slice();
      if (cat !== "all") filtered = filtered.filter(p => p.category === cat);
      if (qText) filtered = filtered.filter(p => p.name.toLowerCase().includes(qText));

      const g = document.getElementById("productsGrid");
      if (!filtered.length) { g.innerHTML = "<p>No matching products.</p>"; return; }

      g.innerHTML = filtered.map(p => `
        <div class="product-card">
          <img src="${p.imageUrl}" alt="">
          <h3>${p.name}</h3>
          <p class="price">${p.price} FCFA</p>
          <button class="edit-btn" data-id="${p.id}">Edit</button>
          <button class="delete-btn" data-id="${p.id}">Delete</button>
        </div>
      `).join("");

      g.querySelectorAll(".delete-btn").forEach(btn => {
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

      g.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", () => loadAddProductForm(btn.dataset.id));
      });
    }

    sInput.addEventListener("input", renderMyProductsGrid);
    catSel.addEventListener("change", renderMyProductsGrid);
    renderMyProductsGrid();

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
        <p class="helper-text error" id="uploadError"></p>
        <p>Drag & Drop product image here</p>
        <span>or</span>
        <button type="button" id="browseBtn">Browse File</button>
        <input type="file" id="fileInput" hidden accept="image/*">
        <img id="previewImage" style="display:none;">
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

      <label>Product Name</label>
      <div id="productNameError" class="form-message"></div>
      <input type="text" id="productName" placeholder="Product Name" required>
      
      <label>Description</label>
      <div id="productDescError" class="form-message"></div>
      <textarea id="productDescription" placeholder="Description" required></textarea>
      
      <label>Price (FCFA)</label>
      <div id="productPriceError" class="form-message"></div>
      <input type="number" id="productPrice" placeholder="Price (FCFA)" required>
      
      <button type="submit" style="margin-top: 1rem;">${editProductId ? "Update" : "Add"}</button>
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
      const name = document.getElementById("productName").value.trim();
      const category = document.getElementById("productCategory").value;
      const desc = document.getElementById("productDescription").value.trim();
      const price = Number(document.getElementById("productPrice").value);

      // VALIDATION
      if (price <= 0) return showToast("Price must be greater than 0 FCFA.", "error");
      if (isProfane(name)) return showToast("Product name contains restricted words.", "error");

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
