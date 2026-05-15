/**
 * WanderToWonder — Firebase Authentication (Google, Facebook, Apple) and page likes.
 */
(function () {
    const FIREBASE_VERSION = '10.14.1';
    const SCRIPT_IDS = {
        app: 'wtw-firebase-app',
        auth: 'wtw-firebase-auth',
        firestore: 'wtw-firebase-firestore'
    };

    let auth = null;
    let db = null;
    let currentUser = null;
    let firebaseReady = false;

    function loadScript(src, id) {
        return new Promise((resolve, reject) => {
            if (document.getElementById(id)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    async function loadFirebaseSdk() {
        if (typeof firebase !== 'undefined' && firebase.apps?.length) {
            return;
        }
        const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
        await loadScript(`${base}/firebase-app-compat.js`, SCRIPT_IDS.app);
        await loadScript(`${base}/firebase-auth-compat.js`, SCRIPT_IDS.auth);
        await loadScript(`${base}/firebase-firestore-compat.js`, SCRIPT_IDS.firestore);
    }

    async function initFirebase() {
        if (!window.WTW_FIREBASE_ENABLED) {
            return false;
        }
        try {
            await loadFirebaseSdk();
            if (!firebase.apps.length) {
                firebase.initializeApp(window.WTW_FIREBASE_CONFIG);
            }
            auth = firebase.auth();
            db = firebase.firestore();
            firebaseReady = true;
            return true;
        } catch (error) {
            console.warn('WanderToWonder: Firebase init failed', error);
            return false;
        }
    }

    function getPageId() {
        const engagement = document.querySelector('[data-page-id]');
        if (engagement?.dataset.pageId) {
            return engagement.dataset.pageId;
        }
        const path = window.location.pathname.split('/').pop() || 'index.html';
        return path.replace(/\.html$/, '') || 'home';
    }

    function setAuthNote(message, isError) {
        const note = document.getElementById('auth-modal-note');
        if (!note) return;
        note.textContent = message || '';
        note.classList.toggle('is-error', Boolean(isError));
    }

    function openAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-modal-open');
        setAuthNote(
            window.WTW_FIREBASE_ENABLED
                ? ''
                : 'Sign-in is not configured yet. Add your Firebase keys in assets/js/firebase-config.js.'
        );
    }

    function closeAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-modal-open');
        setAuthNote('');
    }

    function updateHeaderAuth(user) {
        const signInBtn = document.getElementById('auth-open-btn');
        const userMenu = document.getElementById('auth-user-menu');
        const userName = document.getElementById('auth-user-name');
        const userPhoto = document.getElementById('auth-user-photo');

        if (!signInBtn || !userMenu) return;

        if (user) {
            signInBtn.hidden = true;
            userMenu.hidden = false;
            const displayName = user.displayName || user.email || 'Traveler';
            if (userName) userName.textContent = displayName;
            if (userPhoto) {
                if (user.photoURL) {
                    userPhoto.src = user.photoURL;
                    userPhoto.alt = displayName;
                    userPhoto.hidden = false;
                } else {
                    userPhoto.hidden = true;
                }
            }
        } else {
            signInBtn.hidden = false;
            userMenu.hidden = true;
        }
    }

    async function signInWithProvider(providerName) {
        if (!firebaseReady) {
            setAuthNote('Sign-in is not available. Configure Firebase first.', true);
            return;
        }

        let provider;
        try {
            if (providerName === 'google') {
                provider = new firebase.auth.GoogleAuthProvider();
            } else if (providerName === 'facebook') {
                provider = new firebase.auth.FacebookAuthProvider();
            } else if (providerName === 'apple') {
                provider = new firebase.auth.OAuthProvider('apple.com');
            } else {
                return;
            }
            setAuthNote('Signing in...');
            await auth.signInWithPopup(provider);
            closeAuthModal();
        } catch (error) {
            console.warn('Sign-in failed', error);
            setAuthNote(error.message || 'Sign-in failed. Please try again.', true);
        }
    }

    async function signOut() {
        if (!auth) return;
        await auth.signOut();
    }

    function setLikeButtonState(button, liked, count) {
        button.setAttribute('aria-pressed', liked ? 'true' : 'false');
        button.classList.toggle('is-liked', liked);
        const icon = button.querySelector('.like-icon');
        const label = button.querySelector('.like-label');
        const countEl = button.querySelector('[data-like-count]');
        if (icon) icon.textContent = liked ? '\u2665' : '\u2661';
        if (label) label.textContent = liked ? 'Liked' : 'Like';
        if (countEl) countEl.textContent = String(count);
    }

    async function fetchLikeState(pageId, userId) {
        const pageRef = db.collection('pageLikes').doc(pageId);
        const [pageSnap, userSnap] = await Promise.all([
            pageRef.get(),
            userId ? pageRef.collection('users').doc(userId).get() : Promise.resolve(null)
        ]);
        const count = pageSnap.exists ? pageSnap.data().count || 0 : 0;
        const liked = userSnap?.exists ? Boolean(userSnap.data().liked) : false;
        return { count, liked };
    }

    async function toggleLike(pageId, button) {
        if (!firebaseReady) {
            openAuthModal();
            setAuthNote('Configure Firebase to enable likes.', true);
            return;
        }
        if (!currentUser) {
            openAuthModal();
            return;
        }

        const pageRef = db.collection('pageLikes').doc(pageId);
        const userRef = pageRef.collection('users').doc(currentUser.uid);
        const liked = button.getAttribute('aria-pressed') === 'true';

        button.disabled = true;
        try {
            await db.runTransaction(async (transaction) => {
                const pageDoc = await transaction.get(pageRef);
                const userDoc = await transaction.get(userRef);
                let count = pageDoc.exists ? pageDoc.data().count || 0 : 0;
                const currentlyLiked = userDoc.exists ? Boolean(userDoc.data().liked) : false;

                if (liked && currentlyLiked) {
                    count = Math.max(0, count - 1);
                    transaction.set(userRef, { liked: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    transaction.set(pageRef, { count }, { merge: true });
                } else if (!liked && !currentlyLiked) {
                    count += 1;
                    transaction.set(userRef, { liked: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    transaction.set(pageRef, { count }, { merge: true });
                }
            });

            const state = await fetchLikeState(pageId, currentUser.uid);
            setLikeButtonState(button, state.liked, state.count);
        } catch (error) {
            console.warn('Like update failed', error);
        } finally {
            button.disabled = false;
        }
    }

    async function refreshAllLikeButtons() {
        const buttons = document.querySelectorAll('[data-like-btn]');
        if (!buttons.length) return;

        const pageId = getPageId();
        const userId = currentUser?.uid || null;

        if (!firebaseReady) {
            buttons.forEach((button) => setLikeButtonState(button, false, 0));
            return;
        }

        try {
            const state = await fetchLikeState(pageId, userId);
            buttons.forEach((button) => setLikeButtonState(button, state.liked, state.count));
        } catch (error) {
            console.warn('Could not load likes', error);
        }
    }

    function bindLikeButtons() {
        document.querySelectorAll('[data-like-btn]').forEach((button) => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';
            button.addEventListener('click', () => {
                const pageId = button.closest('[data-page-id]')?.dataset.pageId || getPageId();
                toggleLike(pageId, button);
            });
        });
    }

    function bindAuthUi() {
        if (document.body.dataset.authUiBound === 'true') return;
        document.body.dataset.authUiBound = 'true';

        document.addEventListener('click', (event) => {
            if (event.target.closest('#auth-open-btn')) {
                event.preventDefault();
                openAuthModal();
                return;
            }
            if (event.target.closest('#auth-sign-out-btn')) {
                event.preventDefault();
                signOut();
                return;
            }
            if (event.target.closest('[data-auth-close]')) {
                event.preventDefault();
                closeAuthModal();
                return;
            }
            const providerBtn = event.target.closest('[data-auth-provider]');
            if (providerBtn) {
                event.preventDefault();
                signInWithProvider(providerBtn.dataset.authProvider);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeAuthModal();
        });
    }

    async function start() {
        bindAuthUi();
        bindLikeButtons();

        const ready = await initFirebase();
        if (ready && auth) {
            auth.onAuthStateChanged((user) => {
                currentUser = user;
                updateHeaderAuth(user);
                refreshAllLikeButtons();
            });
        } else {
            updateHeaderAuth(null);
            refreshAllLikeButtons();
        }
    }

    window.WTWAuthLikes = { openAuthModal, refreshAllLikeButtons };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
