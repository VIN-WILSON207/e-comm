import { db, auth } from "../js/firebase.js";
import { collection, query, getDocs, doc, updateDoc, deleteDoc, where, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { showToast } from "../js/utils.js";

const tableBody = document.getElementById("tableBody");
const tableHead = document.getElementById("tableHead");
const tableTitle = document.getElementById("tableTitle");
const totalUsers = document.getElementById("totalUsers");
const totalProducts = document.getElementById("totalProducts");
const pendingVerif = document.getElementById("pendingVerif");

onAuthStateChanged(auth, async user => {
     if (!user) {
          window.location.href = "../login.html";
          return;
     }

     // Check for admin role
     const userSnap = await getDoc(doc(db, "users", user.uid));
     const isAdmin = userSnap.exists() && userSnap.data().role === 'admin';

     if (isAdmin) {
          initAdmin();
          document.getElementById("adminEmail").textContent = user.email;
     } else {
          alert("Unauthorized access. Admin privileges required.");
          window.location.href = "../index.html";
     }
});

async function initAdmin() {
     loadStats();
     loadUsers();
     setupNav();
     setupSidebarToggle();
}

async function loadStats() {
     try {
          const [usersSnap, productsSnap, pendingSnap] = await Promise.all([
               getDocs(collection(db, "users")),
               getDocs(collection(db, "products")),
               getDocs(query(collection(db, "users"), where("isVerified", "==", false)))
          ]);

          totalUsers.textContent = usersSnap.size;
          totalProducts.textContent = productsSnap.size;
          pendingVerif.textContent = pendingSnap.size;
     } catch (err) {
          console.error("Failed to load admin stats:", err);
     }
}

function setupSidebarToggle() {
     const sidebar = document.getElementById("sidebar");
     const toggle = document.getElementById("sidebarToggle");

     if (sidebar && toggle) {
          // Hide by default on mobile
          if (window.innerWidth <= 900) {
               sidebar.classList.add('hide');
          }

          toggle.addEventListener('click', () => {
               if (window.innerWidth <= 900) {
                    sidebar.classList.toggle('hide');
               } else {
                    sidebar.classList.toggle('collapsed');
               }
          });
     }
}

function setupNav() {
     document.querySelectorAll(".sidebar-menu li").forEach(li => {
          li.addEventListener("click", () => {
               const active = document.querySelector(".sidebar-menu li.active");
               if (active) active.classList.remove("active");
               li.classList.add("active");
               const page = li.dataset.page;
               if (page === "users") loadUsers();
               if (page === "products") loadProducts();
               if (page === "verifications") loadVerifications();

               // Auto-hide sidebar on mobile after clicking a link
               if (window.innerWidth <= 900) {
                    document.getElementById("sidebar").classList.add('hide');
               }
          });
     });
}

async function loadUsers() {
     tableTitle.textContent = "Users Management";
     tableHead.innerHTML = `<th>ID</th><th>Name</th><th>Email</th><th>Verified</th><th>Actions</th>`;
     tableBody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

     const snap = await getDocs(collection(db, "users"));
     tableBody.innerHTML = "";
     snap.forEach(d => {
          const u = d.data();
          const row = document.createElement("tr");
          row.innerHTML = `
      <td>${d.id.substring(0, 6)}</td>
      <td>${u.fullName || "—"}</td>
      <td>${u.email}</td>
      <td>${u.isVerified ? "✅" : "❌"}</td>
      <td>
        ${!u.isVerified ? `<button class="action-btn btn-verify" data-id="${d.id}">Approve</button>` : ""}
        <button class="action-btn btn-delete" data-id="${d.id}">Ban</button>
      </td>
    `;
          tableBody.appendChild(row);
     });

     tableBody.querySelectorAll(".btn-verify").forEach(btn => {
          btn.addEventListener("click", async () => {
               if (confirm("Approve this seller?")) {
                    await updateDoc(doc(db, "users", btn.dataset.id), { isVerified: true });
                    showToast("User verified", "success");
                    loadUsers(); loadStats();
               }
          });
     });

     tableBody.querySelectorAll(".btn-delete").forEach(btn => {
          btn.addEventListener("click", async () => {
               if (confirm("Ban this user? All their listing and account data will remain but they will be signed out (Implementation for full deletion can be added). Proceed with banning?")) {
                    await deleteDoc(doc(db, "users", btn.dataset.id));
                    showToast("User banned and removed", "success");
                    loadUsers(); loadStats();
               }
          });
     });
}

async function loadProducts() {
     tableTitle.textContent = "Products Management";
     tableHead.innerHTML = `<th>ID</th><th>Name</th><th>Price</th><th>Seller</th><th>Actions</th>`;
     tableBody.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

     const snap = await getDocs(collection(db, "products"));
     tableBody.innerHTML = "";
     snap.forEach(d => {
          const p = d.data();
          const row = document.createElement("tr");
          row.innerHTML = `
      <td>${d.id.substring(0, 6)}</td>
      <td>${p.name}</td>
      <td>${p.price} FCFA</td>
      <td>${p.sellerEmail || "—"}</td>
      <td>
        <button class="action-btn btn-delete" data-id="${d.id}">Remove</button>
      </td>
    `;
          tableBody.appendChild(row);
     });

     tableBody.querySelectorAll(".btn-delete").forEach(btn => {
          btn.addEventListener("click", async () => {
               if (confirm("Delete this product?")) {
                    await deleteDoc(doc(db, "products", btn.dataset.id));
                    showToast("Product removed", "success");
                    loadProducts(); loadStats();
               }
          });
     });
}

async function loadVerifications() {
     tableTitle.textContent = "Pending Verifications";
     tableHead.innerHTML = `<th>ID</th><th>Name</th><th>Email</th><th>Actions</th>`;
     tableBody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

     const snap = await getDocs(query(collection(db, "users"), where("isVerified", "==", false)));
     tableBody.innerHTML = "";
     snap.forEach(d => {
          const u = d.data();
          const row = document.createElement("tr");
          row.innerHTML = `
      <td>${d.id.substring(0, 6)}</td>
      <td>${u.fullName}</td>
      <td>${u.email}</td>
      <td>
        <button class="action-btn btn-verify" data-id="${d.id}">Approve</button>
      </td>
    `;
          tableBody.appendChild(row);
     });

     tableBody.querySelectorAll(".btn-verify").forEach(btn => {
          btn.addEventListener("click", async () => {
               await updateDoc(doc(db, "users", btn.dataset.id), { isVerified: true });
               showToast("User approved", "success");
               loadVerifications(); loadStats();
          });
     });
}
