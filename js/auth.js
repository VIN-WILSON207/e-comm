import { auth, db } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// Form Switching
document.querySelectorAll(".toggle-form").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("loginForm").classList.toggle("active");
    document.getElementById("signupForm").classList.toggle("active");
  });
});

// LOGIN
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // On successful login, redirect to homepage
    location.href = "index.html"; 

  } catch (err) {
    alert("❌ " + err.message);
  }
});

// SIGNUP
document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await setDoc(doc(db, "users", user.uid), {
      fullName, email, createdAt: new Date()
    });

    alert("✅ Account created successfully!");
    // After signup, go to homepage
    location.href = "index.html"; 

  } catch (err) {
    alert("❌ " + err.message);
  }
});

// Auto redirect if already logged in
onAuthStateChanged(auth, user => {
  if (!user) return;
  // If already logged in, send them to homepage instead of dashboard
  location.href = "index.html"; 
});
