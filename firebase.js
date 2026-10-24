// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA1o7s9hsJpkMXPPvm1IUO6shgHNrPJeFI",
  authDomain: "ouroxchange-web-app.firebaseapp.com",
  projectId: "ouroxchange-web-app",
  storageBucket: "ouroxchange-web-app.firebasestorage.app",
  messagingSenderId: "553132506746",
  appId: "1:553132506746:web:1324cf0b351494a76f85c3",
  measurementId: "G-YSXNMVRQ3M"

};

import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js")
  .then(async (appModule) => {
    const authModule = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
    );

    const app = appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);

    window.FB = { auth, authModule };
    window.onFirebaseReady?.();
  });
