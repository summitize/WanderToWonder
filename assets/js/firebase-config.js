/**
 * Firebase Web App config for WanderToWonder auth and likes.
 * Create a project at https://console.firebase.google.com/
 * Enable Authentication (Google, Facebook, Apple) and Cloud Firestore.
 * Add authorized domains: wandertowonder.in, www.wandertowonder.in, summitize.github.io
 */
window.WTW_FIREBASE_CONFIG = {
    apiKey: "AIzaSyD6MroetOcs4RNma7aT8gVSZA6orvJijEQ",
  authDomain: "wandertowonder-abf95.firebaseapp.com",
  projectId: "wandertowonder-abf95",
  storageBucket: "wandertowonder-abf95.firebasestorage.app",
  messagingSenderId: "817906144283",
  appId: "1:817906144283:web:6954cf4f2532825158d4be",
  measurementId: "G-R7W5MTKNL0"
};

window.WTW_FIREBASE_ENABLED = (() => {
    const config = window.WTW_FIREBASE_CONFIG || {};
    return Object.values(config).every(
        (value) => typeof value === 'string' && value.trim() && !value.includes('PASTE_')
    );
})();
