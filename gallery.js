/**
 * Photo Gallery Component
 * Supports Grid, List, and Fullscreen viewing modes
 */

class PhotoGallery {
    constructor(photos, containerId) {
        this.photos = photos;
        this.container = document.getElementById(containerId);
        this.currentView = 'grid'; // grid, list, or fullscreen
        this.currentPhotoIndex = 0;
        this.init();
    }

    init() {
        this.renderViewToggle();
        this.renderGallery();
        this.setupKeyboardNavigation();
    }

    renderViewToggle() {
        const toggleHTML = `
            <div class="view-toggle">
                <button class="view-btn ${this.currentView === 'grid' ? 'active' : ''}" data-view="grid">
                    <span>⊞</span> Grid
                </button>
                <button class="view-btn ${this.currentView === 'list' ? 'active' : ''}" data-view="list">
                    <span>☰</span> List
                </button>
            </div>
        `;

        const toggleDiv = document.createElement('div');
        toggleDiv.innerHTML = toggleHTML;
        this.container.insertBefore(toggleDiv.firstElementChild, this.container.firstChild);

        // Add event listeners
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.closest('.view-btn').dataset.view);
            });
        });
    }

    switchView(view) {
        this.currentView = view;

        // Update active button
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        this.renderGallery();
    }

    renderGallery() {
        const galleryContainer = this.container.querySelector('.gallery-container') ||
            document.createElement('div');
        galleryContainer.className = `gallery-container ${this.currentView}-view`;
        galleryContainer.innerHTML = '';

        this.photos.forEach((photo, index) => {
            const photoCard = this.createPhotoCard(photo, index);
            galleryContainer.appendChild(photoCard);
        });

        if (!this.container.querySelector('.gallery-container')) {
            this.container.appendChild(galleryContainer);
        }
    }

    createPhotoCard(photo, index) {
        const card = document.createElement('div');
        card.className = 'photo-card';

        card.innerHTML = `
            <div class="photo-wrapper">
                <img src="${photo.src}" alt="${photo.title}" loading="lazy">
                <div class="photo-overlay">
                    <button class="fullscreen-btn" data-index="${index}">
                        <span>⛶</span> View Fullscreen
                    </button>
                </div>
            </div>
            ${this.currentView === 'list' ? `
                <div class="photo-info">
                    <h3>${photo.title}</h3>
                    <p>${photo.description || ''}</p>
                </div>
            ` : ''}
        `;

        // Add click handler for fullscreen
        card.querySelector('.fullscreen-btn').addEventListener('click', () => {
            this.openFullscreen(index);
        });

        // Also allow clicking the image itself
        card.querySelector('img').addEventListener('click', () => {
            this.openFullscreen(index);
        });

        return card;
    }

    openFullscreen(index) {
        this.currentPhotoIndex = index;
        const lightbox = this.createLightbox();
        document.body.appendChild(lightbox);
        document.body.style.overflow = 'hidden';
    }

    createLightbox() {
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.id = 'photo-lightbox';

        const photo = this.photos[this.currentPhotoIndex];

        lightbox.innerHTML = `
            <div class="lightbox-content">
                <button class="lightbox-close">&times;</button>
                <button class="lightbox-nav lightbox-prev" ${this.currentPhotoIndex === 0 ? 'disabled' : ''}>
                    ‹
                </button>
                <div class="lightbox-image-container">
                    <img src="${photo.src}" alt="${photo.title}">
                    <div class="lightbox-caption">
                        <h3>${photo.title}</h3>
                        <p class="photo-counter">${this.currentPhotoIndex + 1} / ${this.photos.length}</p>
                    </div>
                </div>
                <button class="lightbox-nav lightbox-next" ${this.currentPhotoIndex === this.photos.length - 1 ? 'disabled' : ''}>
                    ›
                </button>
            </div>
        `;

        // Event listeners
        lightbox.querySelector('.lightbox-close').addEventListener('click', () => this.closeLightbox());
        lightbox.querySelector('.lightbox-prev').addEventListener('click', () => this.navigateLightbox(-1));
        lightbox.querySelector('.lightbox-next').addEventListener('click', () => this.navigateLightbox(1));

        // Click outside to close
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                this.closeLightbox();
            }
        });

        return lightbox;
    }

    navigateLightbox(direction) {
        const newIndex = this.currentPhotoIndex + direction;

        if (newIndex >= 0 && newIndex < this.photos.length) {
            this.currentPhotoIndex = newIndex;
            this.updateLightbox();
        }
    }

    updateLightbox() {
        const lightbox = document.getElementById('photo-lightbox');
        const photo = this.photos[this.currentPhotoIndex];

        lightbox.querySelector('img').src = photo.src;
        lightbox.querySelector('img').alt = photo.title;
        lightbox.querySelector('.lightbox-caption h3').textContent = photo.title;
        lightbox.querySelector('.photo-counter').textContent =
            `${this.currentPhotoIndex + 1} / ${this.photos.length}`;

        // Update button states
        lightbox.querySelector('.lightbox-prev').disabled = this.currentPhotoIndex === 0;
        lightbox.querySelector('.lightbox-next').disabled =
            this.currentPhotoIndex === this.photos.length - 1;
    }

    closeLightbox() {
        const lightbox = document.getElementById('photo-lightbox');
        if (lightbox) {
            lightbox.remove();
            document.body.style.overflow = '';
        }
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            const lightbox = document.getElementById('photo-lightbox');
            if (!lightbox) return;

            switch (e.key) {
                case 'Escape':
                    this.closeLightbox();
                    break;
                case 'ArrowLeft':
                    this.navigateLightbox(-1);
                    break;
                case 'ArrowRight':
                    this.navigateLightbox(1);
                    break;
            }
        });
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PhotoGallery;
}
