import { auth, db } from "../js/firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const loginForm = document.getElementById("adminLoginForm");
const errorDiv = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

// Password visibility toggle
const toggleBtn = document.getElementById("togglePassword");
if (toggleBtn) {
     toggleBtn.addEventListener("click", () => {
          const passInput = document.getElementById("adminPassword");
          const type = passInput.getAttribute("type") === "password" ? "text" : "password";
          passInput.setAttribute("type", type);
          toggleBtn.textContent = type === "password" ? "👁️" : "👁️‍🗨️";
     });
}

loginForm.addEventListener("submit", async (e) => {
     e.preventDefault();
     const email = document.getElementById("adminEmail").value;
     const password = document.getElementById("adminPassword").value;

     errorDiv.style.display = "none";
     loginBtn.disabled = true;
     loginBtn.textContent = "Verifying...";

     try {
          const userCred = await signInWithEmailAndPassword(auth, email, password);
          const user = userCred.user;

          // Check for admin role
          let userSnap = await getDoc(doc(db, "users", user.uid));
          let userData = userSnap.exists() ? userSnap.data() : {};

          // Self-healing for owner
          if (email === 'abilatezie10@gmail.com' && userData.role !== 'admin') {
               await setDoc(doc(db, "users", user.uid), { role: 'admin' }, { merge: true });
               userData.role = 'admin'; // Update local state for immediate check
          }

          if (userData.role === 'admin') {
               window.location.href = "admin.html";
          } else {
               await auth.signOut();
               showError("Access denied. Admin privileges required.");
          }
     } catch (error) {
          showError("Login failed. Check your credentials.");
          console.error(error);
     } finally {
          loginBtn.disabled = false;
          loginBtn.textContent = "Log in to Dashboard";
     }
});

function showError(msg) {
     errorDiv.textContent = msg;
     errorDiv.style.display = "block";
     errorDiv.style.color = "#e74c3c";
}
