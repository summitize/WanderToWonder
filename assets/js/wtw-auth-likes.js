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
            console.log('Attempting popup sign-in with provider:', providerName);
            await auth.signInWithPopup(provider);
            closeAuthModal();
        } catch (error) {
            console.error('Sign-in failed - Full error details:', {
                code: error.code,
                message: error.message,
                customData: error.customData,
                fullError: error
            });
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

    function makePhotoId(pageId, photoSrc) {
        const rawKey = `${pageId || 'page'}|${String(photoSrc || '').trim()}`;
        let bytes = [];

        if (typeof TextEncoder !== 'undefined') {
            bytes = new TextEncoder().encode(rawKey);
        } else {
            bytes = unescape(encodeURIComponent(rawKey)).split('').map((char) => char.charCodeAt(0));
        }

        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        const base64 = btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        return `photo-${base64}`;
    }

    function getPhotoDocRef(photoId) {
        return db.collection('photoEngagement').doc(photoId);
    }

    function getPhotoUserDocRef(photoId, userId) {
        return getPhotoDocRef(photoId).collection('users').doc(userId);
    }

    function getPhotoCommentsCollection(photoId) {
        return getPhotoDocRef(photoId).collection('comments');
    }

    async function fetchPhotoState(photoId, userId) {
        if (!db) return null;

        try {
            const photoRef = getPhotoDocRef(photoId);
            const [photoSnap, userSnap] = await Promise.all([
                photoRef.get(),
                userId ? getPhotoUserDocRef(photoId, userId).get() : Promise.resolve(null)
            ]);

            const photoData = photoSnap.exists ? photoSnap.data() : {};
            const userData = userSnap?.exists ? userSnap.data() : {};

            return {
                likes: Number(photoData.likes || 0),
                dislikes: Number(photoData.dislikes || 0),
                commentCount: Number(photoData.commentCount || 0),
                liked: Boolean(userData.liked),
                disliked: Boolean(userData.disliked)
            };
        } catch (error) {
            console.warn('Failed to fetch photo state', error);
            return null;
        }
    }

    function updatePhotoEngagementUi(card, state) {
        if (!card || !state) return;

        const likeButton = card.querySelector('[data-photo-action="like"]');
        const dislikeButton = card.querySelector('[data-photo-action="dislike"]');
        const commentButton = card.querySelector('[data-photo-action="comment"]');
        const likeCount = card.querySelector('[data-photo-like-count]');
        const dislikeCount = card.querySelector('[data-photo-dislike-count]');
        const commentCount = card.querySelector('[data-photo-comment-count]');

        if (likeCount) likeCount.textContent = String(state.likes);
        if (dislikeCount) dislikeCount.textContent = String(state.dislikes);
        if (commentCount) commentCount.textContent = String(state.commentCount);

        if (likeButton) {
            likeButton.classList.toggle('is-selected', state.liked);
            likeButton.setAttribute('aria-pressed', state.liked ? 'true' : 'false');
        }

        if (dislikeButton) {
            dislikeButton.classList.toggle('is-selected', state.disliked);
            dislikeButton.setAttribute('aria-pressed', state.disliked ? 'true' : 'false');
        }
    }

    async function refreshAllPhotoButtons() {
        const cards = document.querySelectorAll('[data-photo-id]');
        const photoIds = Array.from(cards).map((card) => card.dataset.photoId).filter(Boolean);
        if (!photoIds.length) return;

        const userId = currentUser?.uid || null;
        await Promise.all(photoIds.map(async (photoId) => {
            const state = await fetchPhotoState(photoId, userId);
            const card = document.querySelector(`[data-photo-id="${photoId}"]`);
            if (card) {
                updatePhotoEngagementUi(card, state || {
                    likes: 0,
                    dislikes: 0,
                    commentCount: 0,
                    liked: false,
                    disliked: false
                });
            }
        }));
    }

    async function fetchPhotoComments(photoId, limit = 5) {
        try {
            const commentsQuery = await getPhotoCommentsCollection(photoId)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            return commentsQuery.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.warn('Failed to load photo comments', error);
            return [];
        }
    }

    async function refreshPhotoComments(photoId) {
        const comments = await fetchPhotoComments(photoId);
        const card = document.querySelector(`[data-photo-id="${photoId}"]`);
        if (!card) return;

        const commentList = card.querySelector('.photo-comment-list');
        if (!commentList) return;

        if (!comments.length) {
            commentList.innerHTML = '<div class="photo-comment-empty">No comments yet. Be the first to share.</div>';
            return;
        }

        commentList.innerHTML = comments
            .map((comment) => {
                const timestamp = comment.createdAt?.toDate
                    ? comment.createdAt.toDate().toLocaleString()
                    : '';
                return `
                    <div class="photo-comment-item">
                        <div class="photo-comment-meta">
                            <span class="photo-comment-author">${comment.userName || 'Traveler'}</span>
                            ${timestamp ? `<span class="photo-comment-time">${timestamp}</span>` : ''}
                        </div>
                        <p class="photo-comment-text">${String(comment.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                    </div>
                `;
            })
            .join('');
    }

    async function ensureUserAuth() {
        if (currentUser) return true;
        openAuthModal();
        setAuthNote('Please sign in to engage with photos.', true);
        return false;
    }

    async function togglePhotoLike(photoId) {
        if (!firebaseReady || !db) {
            setAuthNote('Sign-in is not available. Configure Firebase first.', true);
            return;
        }
        if (!(await ensureUserAuth())) return;

        const photoRef = getPhotoDocRef(photoId);
        const userRef = getPhotoUserDocRef(photoId, currentUser.uid);

        try {
            await db.runTransaction(async (transaction) => {
                const [photoSnap, userSnap] = await Promise.all([
                    transaction.get(photoRef),
                    transaction.get(userRef)
                ]);

                const photoData = photoSnap.exists ? photoSnap.data() : {};
                const userData = userSnap.exists ? userSnap.data() : {};

                const likes = Number(photoData.likes || 0);
                const dislikes = Number(photoData.dislikes || 0);
                const currentlyLiked = Boolean(userData.liked);
                const currentlyDisliked = Boolean(userData.disliked);
                const newLiked = !currentlyLiked;
                const newDisliked = currentlyDisliked && newLiked ? false : currentlyDisliked;

                let newLikes = likes;
                let newDislikes = dislikes;

                if (newLiked && !currentlyLiked) {
                    newLikes += 1;
                } else if (!newLiked && currentlyLiked) {
                    newLikes = Math.max(0, newLikes - 1);
                }

                if (currentlyDisliked && newLiked) {
                    newDislikes = Math.max(0, newDislikes - 1);
                }

                transaction.set(photoRef, {
                    likes: newLikes,
                    dislikes: newDislikes,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                transaction.set(userRef, {
                    liked: newLiked,
                    disliked: newDisliked,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            await refreshAllPhotoButtons();
        } catch (error) {
            console.warn('Failed to toggle photo like', error);
            setAuthNote('Unable to update like. Please try again.', true);
        }
    }

    async function togglePhotoDislike(photoId) {
        if (!firebaseReady || !db) {
            setAuthNote('Sign-in is not available. Configure Firebase first.', true);
            return;
        }
        if (!(await ensureUserAuth())) return;

        const photoRef = getPhotoDocRef(photoId);
        const userRef = getPhotoUserDocRef(photoId, currentUser.uid);

        try {
            await db.runTransaction(async (transaction) => {
                const [photoSnap, userSnap] = await Promise.all([
                    transaction.get(photoRef),
                    transaction.get(userRef)
                ]);

                const photoData = photoSnap.exists ? photoSnap.data() : {};
                const userData = userSnap.exists ? userSnap.data() : {};

                const likes = Number(photoData.likes || 0);
                const dislikes = Number(photoData.dislikes || 0);
                const currentlyLiked = Boolean(userData.liked);
                const currentlyDisliked = Boolean(userData.disliked);
                const newDisliked = !currentlyDisliked;
                const newLiked = currentlyLiked && newDisliked ? false : currentlyLiked;

                let newLikes = likes;
                let newDislikes = dislikes;

                if (newDisliked && !currentlyDisliked) {
                    newDislikes += 1;
                } else if (!newDisliked && currentlyDisliked) {
                    newDislikes = Math.max(0, newDislikes - 1);
                }

                if (currentlyLiked && newDisliked) {
                    newLikes = Math.max(0, newLikes - 1);
                }

                transaction.set(photoRef, {
                    likes: newLikes,
                    dislikes: newDislikes,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

                transaction.set(userRef, {
                    liked: newLiked,
                    disliked: newDisliked,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            });

            await refreshAllPhotoButtons();
        } catch (error) {
            console.warn('Failed to toggle photo dislike', error);
            setAuthNote('Unable to update dislike. Please try again.', true);
        }
    }

    async function addPhotoComment(photoId, commentText) {
        if (!firebaseReady || !db) {
            setAuthNote('Sign-in is not available. Configure Firebase first.', true);
            return;
        }
        if (!(await ensureUserAuth())) return;

        const trimmed = String(commentText || '').trim();
        if (!trimmed) return;

        try {
            const photoRef = getPhotoDocRef(photoId);
            const commentsCollection = getPhotoCommentsCollection(photoId);

            await commentsCollection.add({
                text: trimmed,
                userUid: currentUser.uid,
                userName: currentUser.displayName || currentUser.email || 'Traveler',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await photoRef.set({
                commentCount: firebase.firestore.FieldValue.increment(1),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            setAuthNote('Comment submitted.');
            await refreshAllPhotoButtons();
        } catch (error) {
            console.warn('Failed to add photo comment', error);
            setAuthNote('Unable to submit comment. Please try again.', true);
        }
    }

    function openCommentPrompt(photoId) {
        const comment = window.prompt('Add a comment for this photo:');
        if (comment !== null && String(comment).trim().length > 0) {
            void addPhotoComment(photoId, comment);
        }
    }

    window.WTWPhotoEngagement = {
        makePhotoId,
        refreshAllPhotoButtons,
        refreshPhotoComments,
        togglePhotoLike,
        togglePhotoDislike,
        addPhotoComment,
        openCommentPrompt
    };

    async function start() {
        bindAuthUi();
        bindLikeButtons();

        const ready = await initFirebase();
        if (ready && auth) {
            auth.onAuthStateChanged((user) => {
                currentUser = user;
                updateHeaderAuth(user);
                refreshAllLikeButtons();
                refreshAllPhotoButtons();
            });
        } else {
            updateHeaderAuth(null);
            refreshAllLikeButtons();
            refreshAllPhotoButtons();
        }
    }

    window.WTWAuthLikes = {
        openAuthModal,
        refreshAllLikeButtons,
        refreshAllPhotoButtons
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
