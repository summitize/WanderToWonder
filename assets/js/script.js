function isNestedPage() {
    return window.location.pathname.includes('/pages/');
}

function resolveComponentBase() {
    return isNestedPage() ? '../components/' : 'components/';
}

function adjustRelativePaths(rootElement) {
    if (!isNestedPage() || !rootElement) return;

    rootElement.querySelectorAll('[href], [src]').forEach((element) => {
        const attr = element.hasAttribute('href') ? 'href' : 'src';
        const value = element.getAttribute(attr);
        if (!value || /^(?:data:|https?:|mailto:|tel:|#|\/|\.\.)/.test(value)) return;

        if (value.startsWith('pages/')) {
            element.setAttribute(attr, value.replace(/^pages\//, ''));
            return;
        }

        if (value === 'index.html') {
            element.setAttribute(attr, '../index.html');
            return;
        }

        element.setAttribute(attr, `../${value}`);
    });
}

async function loadComponent(id, file) {
    const element = document.getElementById(id);
    if (!element) return;

    try {
        const response = await fetch(file);
        const html = await response.text();
        element.innerHTML = html;
        adjustRelativePaths(element);

        if (id === 'header-placeholder') {
            initializeNavigation();
        }
        if (id === 'auth-modal-placeholder') {
            if (window.WTWAuthLikes?.refreshAllLikeButtons) {
                window.WTWAuthLikes.refreshAllLikeButtons();
            }
        }
        if (id === 'footer-placeholder') {
            initializeTheme();
        }
    } catch (error) {
        console.error(`Error loading component ${file}:`, error);
    }
}

function initializeNavigation() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link, .dropdown-item, .footer-group a');

    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Mobile Menu Toggle
    const hamburger = document.querySelector('.hamburger');
    const nav = document.querySelector('.nav');

    if (hamburger && nav) {
        const closeMobileNav = () => {
            nav.classList.remove('active');
            hamburger.classList.remove('active');
            document.body.classList.remove('nav-open');
        };

        hamburger.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('active');
            hamburger.classList.toggle('active', isOpen);
            document.body.classList.toggle('nav-open', isOpen);
        });

        nav.querySelectorAll('a.nav-link, .dropdown-item').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    closeMobileNav();
                }
            });
        });
    }

    // Dropdown toggle for mobile
    const dropdowns = document.querySelectorAll('.has-dropdown');
    dropdowns.forEach(dropdown => {
        const link = dropdown.querySelector('.nav-link');
        link.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                e.preventDefault();
                dropdown.classList.toggle('open');
            }
        });
    });
}

function resolveAssetBase() {
    return isNestedPage() ? '../assets/' : 'assets/';
}

function loadAuthStack() {
    const base = resolveAssetBase();
    const configScript = document.createElement('script');
    configScript.src = `${base}js/firebase-config.js`;
    configScript.onload = () => {
        const authScript = document.createElement('script');
        authScript.src = `${base}js/wtw-auth-likes.js`;
        document.body.appendChild(authScript);
    };
    document.body.appendChild(configScript);
}

document.addEventListener('DOMContentLoaded', () => {
    // Load components
    loadComponent('header-placeholder', resolveComponentBase() + 'header.html');
    loadComponent('footer-placeholder', resolveComponentBase() + 'footer.html');

    if (!document.getElementById('auth-modal-placeholder')) {
        const authHost = document.createElement('div');
        authHost.id = 'auth-modal-placeholder';
        document.body.appendChild(authHost);
    }
    loadComponent('auth-modal-placeholder', resolveComponentBase() + 'auth-modal.html');
    loadAuthStack();

    // Smooth scrolling for navigation links (using event delegation for dynamic links)
    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' && e.target.getAttribute('href')?.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(e.target.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        }
    });

    // Scroll Animation Observer
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.about-card, .service-item').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });

    const themePreference = localStorage.getItem('theme') || 'system';
    applyThemePreference(themePreference);

});

function resolveThemeFromPreference(pref) {
    if (pref === 'dark' || pref === 'light') {
        return pref;
    }
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return darkMode ? 'dark' : 'light';
}

function applyThemePreference(pref) {
    const theme = resolveThemeFromPreference(pref);
    document.documentElement.setAttribute('data-theme', theme);
    const select = document.getElementById('theme-select');
    if (select) {
        select.value = pref;
    }
}

function initializeTheme() {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) return;

    const systemMedia = window.matchMedia('(prefers-color-scheme: dark)');

    const updateSystemTheme = () => {
        const savedTheme = localStorage.getItem('theme') || 'system';
        if (savedTheme === 'system') {
            applyThemePreference('system');
        }
    };

    systemMedia.addEventListener?.('change', updateSystemTheme);

    themeSelect.addEventListener('change', () => {
        const selected = themeSelect.value;
        localStorage.setItem('theme', selected);
        applyThemePreference(selected);
    });
}
