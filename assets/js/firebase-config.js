/**
 * Firebase Web App config for WanderToWonder auth and likes.
 * Create a project at https://console.firebase.google.com/
 * Enable Authentication (Google, Facebook, Apple) and Cloud Firestore.
 * Add authorized domains: wandertowonder.in, www.wandertowonder.in, summitize.github.io
 */
window.WTW_FIREBASE_CONFIG = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',
    appId: 'YOUR_APP_ID'
};

window.WTW_FIREBASE_ENABLED = (() => {
    const config = window.WTW_FIREBASE_CONFIG || {};
    return Object.values(config).every(
        (value) => typeof value === 'string' && value.trim() && !value.includes('PASTE_')
    );
})();
