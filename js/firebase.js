
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
  import { getAuth } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
  import { getFirestore } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

  // Your web app's Firebase configuration
  const firebaseConfig = {
    apiKey: "AIzaSyAPln8-TSSebj2fCk1Kqekxq3dur_b5V3M",
    authDomain: "electronics-hub-willy.firebaseapp.com",
    projectId: "electronics-hub-willy",
    storageBucket: "electronics-hub-willy.firebasestorage.app",
    messagingSenderId: "935812070675",
    appId: "1:935812070675:web:4f50cde15b3cc163336ee6"
};

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  // Export for other modules to import
  export { auth, db };
