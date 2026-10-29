// Firebase JS SDK v10 - modular CDN build
const firebaseConfig = {
    apiKey: "AIzaSyA1o7s9hsJpkMXPPvm1IUO6shgHNrPJeFI",
    authDomain: "ouroxchange-web-app.firebaseapp.com",
    projectId: "ouroxchange-web-app",
    storageBucket: "ouroxchange-web-app.firebasestorage.app",
    messagingSenderId: "553132506746",
    appId: "1:553132506746:web:1324cf0b351494a76f85c3",
    measurementId: "G-YSXNMVRQ3M"
};

Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
])
.then(([appMod, authMod, fsMod]) => {
    const app  = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db   = fsMod.getFirestore(app);

    // Keep user logged in across page refreshes
    authMod.setPersistence(auth, authMod.browserLocalPersistence);

    // Expose to app.js:
    //   FB.auth  - Auth instance
    //   FB.U     - Auth module (signInWithEmailAndPassword, etc.)
    //   FB.db    - Firestore instance
    //   FB.FS    - Firestore module (doc, collection, query, etc.)
    window.FB = { auth, U: authMod, db, FS: fsMod };

    // Relay auth-state changes to app.js handler
    authMod.onAuthStateChanged(auth, (user) => {
        if (window.onUser) window.onUser(user);
    });

    // Signal app.js that Firebase is fully ready
    if (window.onFirebaseReady) window.onFirebaseReady();
})
.catch((err) => {
    console.error("Firebase failed to load:", err);
});