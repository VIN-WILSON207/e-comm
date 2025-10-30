const sidebarItems = document.querySelectorAll(".sidebar li");
const pageContent = document.getElementById("pageContent");

// Simple page switcher (will later load components)
sidebarItems.forEach(item => {
  item.addEventListener("click", () => {
    // Remove 'active' class from all items
    sidebarItems.forEach(i => i.classList.remove("active"));
    // Add 'active' class to clicked item
    item.classList.add("active");

    // Get page identifier and load corresponding page
    const page = item.getAttribute("data-page");
    loadPage(page);
  });
});

function loadPage(page) {
  if (page === "myProducts") {
    loadMyProducts();
  } else if (page === "addProduct") {
    loadAddProduct();
  } else if (page === "profile") {
    loadProfile();
  }
}

async function loadMyProducts() {
  pageContent.innerHTML = `
    <h2>My Products</h2>
    <div id="productsGrid" class="products-grid">Loading your products...</div>
  `;

  const user = auth.currentUser;
  if (!user) return;

  const q = query(
    collection(db, "products"),
    where("ownerId", "==", user.uid)
  );

  const snapshot = await getDocs(q);

  const container = document.getElementById("productsGrid");
  container.innerHTML = ""; // clear

  if (snapshot.empty) {
    container.innerHTML = "<p>You haven't added any products yet.</p>";
    return;
  }

  snapshot.forEach(doc => {
    const product = doc.data();
    container.innerHTML += `
      <div class="product-card">
        <img src="${product.imageURL}" alt="">
        <h3>${product.name}</h3>
        <p class="price">${product.price} FCFA</p>
        <button class="edit-btn" data-id="${doc.id}">Edit</button>
        <button class="delete-btn" data-id="${doc.id}">Delete</button>
      </div>
    `;
  });
}

