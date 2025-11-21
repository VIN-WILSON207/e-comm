import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

// ============================================
// FORM SWITCHING
// ============================================
// Toggle between login and signup forms
document.querySelectorAll(".toggle-form").forEach(btn => {
  btn.addEventListener("click", () => {
    document.getElementById("loginForm").classList.toggle("active");
    document.getElementById("signupForm").classList.toggle("active");
    clearFormMessages();
  });
});

const loginError = document.getElementById("loginError");
const signupError = document.getElementById("signupError");

/**
 * SET FORM MESSAGE
 * Displays error or success message in the specified element
 * @param {HTMLElement} el - Target element to display message
 * @param {string} message - Message text
 * @param {string} variant - 'error' or 'success'
 */
function setFormMessage(el, message, variant = "error") {
  if (!el) return;
  el.textContent = message;
  el.classList.remove("error", "success");
  if (variant === "success") {
    el.classList.add("success");
  } else {
    el.classList.add("error");
  }
}

/**
 * CLEAR FORM MESSAGES
 * Removes all error/success messages from forms
 */
function clearFormMessages() {
  if (loginError) loginError.textContent = "";
  if (signupError) signupError.textContent = "";
}

/**
 * VALIDATE EMAIL
 * Checks if email format is valid
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
function validateEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

/**
 * AUTH ERROR MESSAGE
 * Maps Firebase error codes to user-friendly messages
 * @param {string} code - Firebase error code
 * @returns {string} - User-friendly error message
 */
function authErrorMessage(code) {
  const map = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "That email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
  };
  return map[code] || "Something went wrong. Please try again.";
}

/**
 * SET BUTTON LOADING
 * Disables button and shows loading state during auth requests
 * @param {HTMLElement} btn - Button element
 * @param {boolean} isLoading - Loading state
 */
function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  
  // Store original text on first load
  if (!btn.dataset.originalText) {
    btn.dataset.originalText = btn.textContent;
  }
  
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Loading..." : btn.dataset.originalText;
}

// ============================================
// LOGIN FORM SUBMISSION
// ============================================
/**
 * LOGIN FORM
 * Handles user login with email and password
 * Validates input, authenticates with Firebase, and redirects on success
 */
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const loginBtn = e.target.querySelector("button[type='submit']");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  
  // VALIDATION: Check email and password
  if (!validateEmail(email)) {
    return setFormMessage(loginError, "Enter a valid email address.");
  }
  if (!password) {
    return setFormMessage(loginError, "Password is required.");
  }

  setButtonLoading(loginBtn, true);
  try {
    // AUTHENTICATE: Sign in user with email and password
    await signInWithEmailAndPassword(auth, email, password);
    
    console.log("✅ Login successful");
    
    // SUCCESS: Show success message and redirect
    setFormMessage(loginError, "✅ Login successful! Redirecting...", "success");
    
    // REDIRECT: Go to home page after successful login
    // Use a longer timeout to ensure auth state updates propagate
    setTimeout(() => {
      console.log("🔄 Redirecting to index.html");
      window.location.href = "index.html";
    }, 1200);

  } catch (err) {
    // ERROR: Display error message and re-enable button
    console.error("❌ Login error:", err.code, err.message);
    setFormMessage(loginError, authErrorMessage(err.code), "error");
    setButtonLoading(loginBtn, false);
  }
});

// ============================================
// SIGNUP FORM SUBMISSION
// ============================================
/**
 * SIGNUP FORM
 * Handles user registration with email and password
 * Creates Firebase account and Firestore user profile
 */
document.getElementById("signupForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const signupBtn = e.target.querySelector("button[type='submit']");
  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  
  // VALIDATION: Check all fields
  if (!fullName) return setFormMessage(signupError, "Full name is required.");
  if (!validateEmail(email)) return setFormMessage(signupError, "Enter a valid email address.");
  if (password.length < 6) return setFormMessage(signupError, "Password must be at least 6 characters.");

  setButtonLoading(signupBtn, true);
  try {
    // CREATE USER: Register new account in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    console.log("✅ User created:", user.uid);

    // SAVE USER DATA: Store user profile in Firestore database
    await setDoc(doc(db, "users", user.uid), {
      fullName, 
      email, 
      createdAt: new Date()
    });

    console.log("✅ User profile saved to Firestore");

    // SUCCESS: Show success message
    setFormMessage(signupError, "✅ Account created successfully! Redirecting...", "success");
    
    // REDIRECT: Go to home page after successful signup
    setTimeout(() => {
      console.log("🔄 Redirecting to index.html");
      window.location.href = "index.html";
    }, 1500);

  } catch (err) {
    // ERROR: Display error message and re-enable button
    console.error("❌ Signup error:", err.code, err.message);
    setFormMessage(signupError, authErrorMessage(err.code), "error");
    setButtonLoading(signupBtn, false);
  }
});

// ============================================
// AUTO REDIRECT (FIXED: Only if NOT already redirecting)
// ============================================
let isRedirecting = false;

setTimeout(() => {
  const isLoginPage = window.location.pathname.includes("login.html");
  
  onAuthStateChanged(auth, (user) => {
    if (user && isLoginPage && !isRedirecting) {
      // USER LOGGED IN + ON LOGIN PAGE: Redirect to home
      isRedirecting = true;
      console.log("✅ User already logged in:", user.email);
      console.log("🔄 Redirecting to index.html");
      window.location.href = "index.html";
    } else if (user) {
      console.log("✅ User authenticated:", user.email);
    } else {
      console.log("❌ User not logged in - login form ready");
    }
  });
}, 500); // Wait 500ms for page to fully load

// ============================================
// FORGOT PASSWORD
// ============================================
/**
 * FORGOT PASSWORD
 * Sends password reset email to user's registered email
 * User clicks link in email to reset their password
 */
document.getElementById("forgotPasswordBtn")?.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value.trim();
  const btn = document.getElementById("forgotPasswordBtn");
  
  // VALIDATION: Check email field is filled
  if (!validateEmail(email)) {
    return setFormMessage(loginError, "Enter your email above before resetting.", "error");
  }

  setButtonLoading(btn, true);
  try {
    // SEND RESET EMAIL: Firebase sends password reset link to user's email
    await sendPasswordResetEmail(auth, email);
    
    console.log("✅ Password reset email sent to:", email);
    
    // SUCCESS: Confirm email sent
    setFormMessage(loginError, "✅ Reset link sent to your email. Check your inbox.", "success");
  } catch (err) {
    // ERROR: Handle reset email errors
    console.error("❌ Reset password error:", err.code, err.message);
    setFormMessage(loginError, authErrorMessage(err.code), "error");
  } finally {
    setButtonLoading(btn, false);
  }
});
