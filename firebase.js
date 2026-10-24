/* Paste your Firebase web app config below (Firebase console > Project settings > Your apps). */
const cfg={apiKey:"YOUR_API_KEY",authDomain:"YOUR_PROJECT.firebaseapp.com",projectId:"YOUR_PROJECT_ID",appId:"YOUR_APP_ID"};
if(!cfg.apiKey.startsWith("YOUR")){
const A=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
const U=await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
const auth=U.getAuth(A.initializeApp(cfg));
window.FB={auth,U};
U.onAuthStateChanged(auth,u=>window.onUser(u));
}
