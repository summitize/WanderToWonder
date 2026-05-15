/**
 * Firebase Web App config for WanderToWonder auth and likes.
 * Create a project at https://console.firebase.google.com/
 * Enable Authentication (Google, Facebook, Apple) and Cloud Firestore.
 * Add authorized domains: wandertowonder.in, www.wandertowonder.in, summitize.github.io
 */
window.WTW_FIREBASE_CONFIG = {
    apiKey: 'PASTE_FIREBASE_API_KEY',
    authDomain: 'PASTE_FIREBASE_AUTH_DOMAIN',
    projectId: 'PASTE_FIREBASE_PROJECT_ID',
    storageBucket: 'PASTE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'PASTE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'PASTE_FIREBASE_APP_ID'
};

window.WTW_FIREBASE_ENABLED = (() => {
    const config = window.WTW_FIREBASE_CONFIG || {};
    return Object.values(config).every(
        (value) => typeof value === 'string' && value.trim() && !value.includes('PASTE_')
    );
})();
