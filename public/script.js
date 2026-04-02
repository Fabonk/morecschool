// ===== MOREC Structure — Dynamic Frontend =====

const API = '';

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showNotification(message, type) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${escapeHTML(message)}</span>
    `;

    Object.assign(notification.style, {
        position: 'fixed', top: '100px', right: '20px', padding: '16px 24px',
        borderRadius: '12px', background: type === 'success' ? '#27ae60' : '#e74c3c',
        color: 'white', fontFamily: "'Montserrat', sans-serif", fontWeight: '600',
        fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: '10000',
        transform: 'translateX(120%)', transition: 'transform 0.4s ease', maxWidth: '400px'
    });

    document.body.appendChild(notification);
    requestAnimationFrame(() => { notification.style.transform = 'translateX(0)'; });
    setTimeout(() => {
        notification.style.transform = 'translateX(120%)';
        setTimeout(() => notification.remove(), 400);
    }, 4000);
}

// ===== NAVBAR SCROLL =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ===== MOBILE MENU =====
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navLinks.classList.toggle('active');
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navLinks.classList.remove('active');
    });
});

// ===== SCROLL TO TOP =====
const scrollTopBtn = document.getElementById('scrollTop');
window.addEventListener('scroll', () => {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 500);
});
scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ===== COUNTER ANIMATION =====
function animateCounters() {
    document.querySelectorAll('.stat-number').forEach(counter => {
        const target = parseInt(counter.dataset.count);
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;
        const update = () => {
            current += step;
            if (current < target) {
                counter.textContent = Math.floor(current);
                requestAnimationFrame(update);
            } else {
                counter.textContent = target;
            }
        };
        update();
    });
}

// ===== FADE UP ANIMATIONS =====
function initScrollAnimations() {
    const elements = document.querySelectorAll(
        '.formation-card, .pourquoi-card, .temoignage-card, .equipe-card, .apropos-grid, .contact-grid, .event-card, .playlist-block, .citation-card'
    );
    elements.forEach(el => el.classList.add('fade-up'));

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    elements.forEach(el => observer.observe(el));
}

// ===== HERO COUNTER TRIGGER =====
function initHeroObserver() {
    const heroStats = document.querySelector('.hero-stats');
    if (!heroStats) return;
    const obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { animateCounters(); obs.unobserve(entry.target); }
        });
    }, { threshold: 0.3 });
    obs.observe(heroStats);
}

// ===== ACTIVE NAV LINK =====
const sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        if (window.scrollY >= section.offsetTop - 100) current = section.getAttribute('id');
    });
    navLinks.querySelectorAll('a:not(.btn-nav)').forEach(link => {
        link.style.opacity = link.getAttribute('href') === `#${current}` ? '1' : '0.7';
    });
});

// ============================================================
//  DATA LOADING FUNCTIONS
// ============================================================

// ===== HERO CAROUSEL =====
let heroSlideIndex = 0;
let heroSlideTimer = null;

async function loadHeroSlides() {
    try {
        const res = await fetch(`${API}/api/hero-slides`);
        const slides = await res.json();
        const carousel = document.getElementById('heroCarousel');
        const dots = document.getElementById('heroCarouselDots');
        if (!carousel) return;

        // Si aucune slide, afficher un fond par défaut
        if (!slides || slides.length === 0) {
            carousel.innerHTML = '<div class="hero-slide active" style="background:linear-gradient(135deg, var(--red-dark) 0%, var(--red) 40%, #C0392B 100%)"></div>';
            return;
        }

        carousel.innerHTML = slides.map((s, i) =>
            `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${escapeHTML(s.image)}')"></div>`
        ).join('');

        if (dots && slides.length > 1) {
            dots.innerHTML = slides.map((_, i) =>
                `<button class="hero-dot${i === 0 ? ' active' : ''}" data-index="${i}"></button>`
            ).join('');

            dots.querySelectorAll('.hero-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    heroSlideIndex = parseInt(dot.dataset.index);
                    updateHeroSlide();
                    resetHeroTimer();
                });
            });

            startHeroTimer(slides.length);
        }
    } catch (e) { console.error('Error loading hero slides:', e); }
}

function startHeroTimer(count) {
    if (heroSlideTimer) clearInterval(heroSlideTimer);
    heroSlideTimer = setInterval(() => {
        heroSlideIndex = (heroSlideIndex + 1) % count;
        updateHeroSlide();
    }, 5000);
}

function updateHeroSlide() {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    slides.forEach((s, i) => s.classList.toggle('active', i === heroSlideIndex));
    dots.forEach((d, i) => d.classList.toggle('active', i === heroSlideIndex));
}

function resetHeroTimer() {
    const slides = document.querySelectorAll('.hero-slide');
    if (slides.length > 1) {
        startHeroTimer(slides.length);
    }
}

async function loadStats() {
    try {
        const res = await fetch(`${API}/api/stats`);
        const stats = await res.json();
        const container = document.getElementById('heroStats');
        if (!container) return;

        container.innerHTML = stats.map(s =>
            `<div class="stat-item">
                <span class="stat-number" data-count="${s.nombre}">0</span><span class="stat-suffix">${escapeHTML(s.suffixe)}</span>
                <span class="stat-label">${escapeHTML(s.label)}</span>
            </div>`
        ).join('');

        initHeroObserver();
    } catch (e) { console.error('Error loading stats:', e); }
}

async function loadCitation() {
    try {
        const res = await fetch(`${API}/api/citations/today`);
        const c = await res.json();
        if (!c) return;
        const texte = document.getElementById('citationTexte');
        const auteur = document.getElementById('citationAuteur');
        if (texte) texte.textContent = '\u201C' + c.texte + '\u201D';
        if (auteur) auteur.textContent = '\u2014 ' + c.auteur;
    } catch (e) { console.error('Error loading citation:', e); }
}

async function loadFormations() {
    try {
        const res = await fetch(`${API}/api/formations`);
        const formations = await res.json();
        const grid = document.getElementById('formationsGrid');
        if (!grid) return;

        grid.innerHTML = formations.map(f =>
            `<div class="formation-card${f.populaire ? ' populaire' : ''}">
                ${f.populaire ? '<span class="badge-populaire"><i class="fas fa-fire"></i> Populaire</span>' : ''}
                <div class="formation-icon"><i class="${escapeHTML(f.icon)}"></i></div>
                <h3>${escapeHTML(f.titre)}</h3>
                <p>${escapeHTML(f.description)}</p>
                <div class="formation-meta">
                    <span><i class="fas fa-clock"></i> ${escapeHTML(f.duree)}</span>
                    ${f.certificat ? '<span><i class="fas fa-certificate"></i> Certificat</span>' : ''}
                    <span><i class="fas fa-users"></i> ${escapeHTML(String(f.places))} places</span>
                </div>
                <a href="#contact" class="btn btn-secondary">En savoir plus</a>
            </div>`
        ).join('');

        // Also populate the contact form select
        const select = document.getElementById('contactFormation');
        if (select) {
            const opts = formations.map(f =>
                `<option value="${escapeHTML(f.titre)}">${escapeHTML(f.titre)}</option>`
            ).join('');
            select.innerHTML = '<option value="">Choisir une formation</option>' + opts;
        }
    } catch (e) { console.error('Error loading formations:', e); }
}

async function loadEvenements() {
    try {
        const res = await fetch(`${API}/api/evenements`);
        const events = await res.json();
        const grid = document.getElementById('eventsGrid');
        if (!grid) return;

        grid.innerHTML = events.map(ev =>
            `<div class="event-card" data-category="${escapeHTML(ev.categorie)}">
                <div class="event-badge">${escapeHTML(ev.categorie)}</div>
                ${ev.image
                    ? `<div class="event-image"><img src="${escapeHTML(ev.image)}" alt="${escapeHTML(ev.titre)}"></div>`
                    : `<div class="event-icon"><i class="${escapeHTML(ev.icon)}"></i></div>`
                }
                <h3>${escapeHTML(ev.titre)}</h3>
                <p>${escapeHTML(ev.description)}</p>
                <div class="event-details">
                    <span><i class="fas fa-calendar-alt"></i> ${escapeHTML(ev.date_event)}</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${escapeHTML(ev.lieu)}</span>
                    <span><i class="fas fa-users"></i> ${escapeHTML(String(ev.places))} places</span>
                </div>
                <button class="btn btn-primary btn-inscription"
                    data-event="${escapeHTML(ev.titre)}"
                    data-date="${escapeHTML(ev.date_event)}"
                    data-lieu="${escapeHTML(ev.lieu)}"
                    data-event-id="${ev.id}">
                    <i class="fas fa-pen-to-square"></i> S'inscrire
                </button>
            </div>`
        ).join('');

        initEventFilters();
    } catch (e) { console.error('Error loading events:', e); }
}

// Store playlists data globally for quiz system
let playlistsData = [];

async function loadPlaylists() {
    try {
        const res = await fetch(`${API}/api/playlists`);
        playlistsData = await res.json();
        const container = document.getElementById('playlistsContainer');
        if (!container) return;

        container.innerHTML = playlistsData.map(pl => {
            const videosHTML = pl.videos.map((v, idx) =>
                `<div class="video-item" data-playlist="${escapeHTML(pl.slug)}" data-index="${idx}" data-playlist-id="${pl.id}">
                    <div class="video-thumb">
                        <div class="video-placeholder"><i class="fas fa-play-circle"></i></div>
                        <span class="cours-duration"><i class="fas fa-clock"></i> ${escapeHTML(v.duree)}</span>
                    </div>
                    <div class="video-info">
                        <span class="video-number">${String(idx + 1).padStart(2, '0')}</span>
                        <div>
                            <h4>${escapeHTML(v.titre)}</h4>
                            <p>${escapeHTML(v.description)}</p>
                            <div class="video-stats"><span><i class="fas fa-eye"></i> ${escapeHTML(v.vues)} vues</span></div>
                        </div>
                    </div>
                    <button class="btn-watch" title="Regarder"><i class="fas fa-play"></i></button>
                </div>`
            ).join('');

            return `<div class="playlist-block" id="playlist-${escapeHTML(pl.slug)}">
                <div class="playlist-header">
                    <div class="playlist-info">
                        <span class="playlist-icon ${escapeHTML(pl.icon_class || '')}"><i class="${escapeHTML(pl.icon)}"></i></span>
                        <div>
                            <h3>${escapeHTML(pl.nom)}</h3>
                            <span class="playlist-count">${pl.videos.length} vidéos &bull; ${escapeHTML(pl.duree_totale)} &bull; ${escapeHTML(pl.formateur)}</span>
                        </div>
                    </div>
                    <div class="playlist-actions">
                        <div class="playlist-progress">
                            <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
                            <span class="progress-text">0/${pl.videos.length} vus</span>
                        </div>
                        <button class="btn btn-eval" data-playlist="${escapeHTML(pl.slug)}" data-playlist-id="${pl.id}" disabled>
                            <i class="fas fa-clipboard-check"></i> Évaluation
                        </button>
                    </div>
                </div>
                <div class="playlist-videos">${videosHTML}</div>
            </div>`;
        }).join('');

        initPlaylistSystem();
        initVideoPlayerModal();
        initQuizSystem();
    } catch (e) { console.error('Error loading playlists:', e); }
}

async function loadCoursPdfs() {
    try {
        const res = await fetch(`${API}/api/cours-pdfs`);
        const pdfs = await res.json();
        const grid = document.getElementById('coursPdfsGrid');
        if (!grid) return;

        if (pdfs.length === 0) {
            grid.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Aucun document PDF disponible pour le moment.</p>';
            return;
        }

        const catIcons = {
            general: 'fas fa-book',
            leadership: 'fas fa-crown',
            management: 'fas fa-briefcase',
            developpement: 'fas fa-seedling',
            coaching: 'fas fa-hands-helping',
            autre: 'fas fa-file-alt'
        };

        const catLabels = {
            general: 'Général',
            leadership: 'Leadership',
            management: 'Management',
            developpement: 'Développement',
            coaching: 'Coaching',
            autre: 'Autre'
        };

        grid.innerHTML = pdfs.map(pdf => {
            const icon = catIcons[pdf.categorie] || 'fas fa-file-pdf';
            const catLabel = catLabels[pdf.categorie] || pdf.categorie;
            return `<div class="pdf-card">
                <div class="pdf-icon"><i class="fas fa-file-pdf"></i></div>
                <div class="pdf-info">
                    <span class="pdf-categorie"><i class="${escapeHTML(icon)}"></i> ${escapeHTML(catLabel)}</span>
                    <h4>${escapeHTML(pdf.titre)}</h4>
                    ${pdf.description ? `<p>${escapeHTML(pdf.description)}</p>` : ''}
                    <div class="pdf-meta">
                        ${pdf.fichier_nom ? `<span><i class="fas fa-file"></i> ${escapeHTML(pdf.fichier_nom)}</span>` : ''}
                        ${pdf.taille ? `<span><i class="fas fa-weight-hanging"></i> ${escapeHTML(pdf.taille)}</span>` : ''}
                    </div>
                </div>
                <a href="${escapeHTML(pdf.fichier_url)}" target="_blank" class="btn btn-secondary btn-sm pdf-download" title="Télécharger">
                    <i class="fas fa-download"></i> Télécharger
                </a>
            </div>`;
        }).join('');
    } catch (e) { console.error('Error loading cours PDFs:', e); }
}

async function loadCoursLivePreview() {
    try {
        const res = await fetch(`${API}/api/cours-live`);
        const cours = await res.json();
        const container = document.getElementById('coursLivePreview');
        if (!container) return;

        const upcoming = cours.filter(c => c.statut !== 'termine').slice(0, 3);
        if (upcoming.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Aucun cours live prévu pour le moment.</p>';
            return;
        }

        const statusLabels = { planifie: 'Planifié', en_cours: 'En cours', termine: 'Terminé' };
        const statusClasses = { planifie: 'status-planifie', en_cours: 'status-encours', termine: 'status-termine' };

        container.innerHTML = `<div class="cours-live-cards">${upcoming.map(c => {
            const dateStr = c.date_cours ? new Date(c.date_cours + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            return `<div class="cours-live-card-preview">
                <div class="clp-status ${statusClasses[c.statut] || ''}">${escapeHTML(statusLabels[c.statut] || c.statut)}</div>
                <h4>${escapeHTML(c.titre)}</h4>
                <p>${escapeHTML(c.description.length > 100 ? c.description.substring(0, 100) + '...' : c.description)}</p>
                <div class="clp-meta">
                    <span><i class="fas fa-chalkboard-teacher"></i> ${escapeHTML(c.formateur)}</span>
                    <span><i class="fas fa-calendar"></i> ${escapeHTML(dateStr)}</span>
                    <span><i class="fas fa-clock"></i> ${escapeHTML(c.heure_debut)} - ${escapeHTML(c.heure_fin)}</span>
                    <span><i class="fas fa-video"></i> ${escapeHTML(c.plateforme)}</span>
                </div>
            </div>`;
        }).join('')}</div>`;
    } catch (e) { console.error('Error loading cours live preview:', e); }
}

async function loadPourquoi() {
    try {
        const res = await fetch(`${API}/api/pourquoi`);
        const items = await res.json();
        const grid = document.getElementById('pourquoiGrid');
        if (!grid) return;

        grid.innerHTML = items.map(p =>
            `<div class="pourquoi-card">
                <div class="pourquoi-number">${escapeHTML(p.numero)}</div>
                <h3>${escapeHTML(p.titre)}</h3>
                <p>${escapeHTML(p.description)}</p>
            </div>`
        ).join('');
    } catch (e) { console.error('Error loading pourquoi:', e); }
}

async function loadTemoignages() {
    try {
        const res = await fetch(`${API}/api/temoignages`);
        const items = await res.json();
        const grid = document.getElementById('temoignagesGrid');
        if (!grid) return;

        grid.innerHTML = items.map(t => {
            const fullStars = Math.floor(t.etoiles);
            const halfStar = t.etoiles % 1 >= 0.5;
            let starsHTML = '';
            for (let i = 0; i < fullStars; i++) starsHTML += '<i class="fas fa-star"></i>';
            if (halfStar) starsHTML += '<i class="fas fa-star-half-alt"></i>';

            return `<div class="temoignage-card">
                <div class="stars">${starsHTML}</div>
                <p>"${escapeHTML(t.texte)}"</p>
                <div class="temoignage-author">
                    <div class="author-avatar">${escapeHTML(t.initiales)}</div>
                    <div>
                        <strong>${escapeHTML(t.nom)}</strong>
                        <span>${escapeHTML(t.role)}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) { console.error('Error loading temoignages:', e); }
}

async function loadEquipe() {
    try {
        const res = await fetch(`${API}/api/equipe`);
        const members = await res.json();
        const grid = document.getElementById('equipeGrid');
        if (!grid) return;

        grid.innerHTML = members.map(m =>
            `<div class="equipe-card">
                <div class="equipe-avatar"><i class="fas fa-user"></i></div>
                <h3>${escapeHTML(m.nom)}</h3>
                <span class="equipe-role">${escapeHTML(m.role)}</span>
                <p>${escapeHTML(m.description)}</p>
                <div class="equipe-social">
                    <a href="${escapeHTML(m.linkedin)}" target="_blank" rel="noopener"><i class="fab fa-linkedin"></i></a>
                    <a href="${escapeHTML(m.facebook)}" target="_blank" rel="noopener"><i class="fab fa-facebook"></i></a>
                </div>
            </div>`
        ).join('');
    } catch (e) { console.error('Error loading equipe:', e); }
}

// ===== GALLERY / ALBUMS =====
let currentAlbumPhotos = [];
let currentLightboxIndex = 0;

async function loadAlbums() {
    try {
        const res = await fetch(`${API}/api/albums`);
        const albums = await res.json();
        const grid = document.getElementById('albumsGrid');
        if (!grid) return;

        if (albums.length === 0) {
            grid.innerHTML = '<p class="no-data">Aucun album pour le moment.</p>';
            return;
        }

        grid.innerHTML = albums.map(a => {
            const photoCount = a.photos ? a.photos.length : 0;
            const cover = a.cover_image || (a.photos && a.photos[0] ? a.photos[0].image : '');
            return `<div class="album-card" data-album-id="${a.id}">
                <div class="album-cover">
                    ${cover ? `<img src="${escapeHTML(cover)}" alt="${escapeHTML(a.titre)}" loading="lazy">` : '<div class="album-cover-placeholder"><i class="fas fa-images"></i></div>'}
                    <div class="album-overlay">
                        <span class="album-photo-count"><i class="fas fa-camera"></i> ${photoCount} photo${photoCount > 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div class="album-info">
                    <h3>${escapeHTML(a.titre)}</h3>
                    ${a.description ? `<p>${escapeHTML(a.description)}</p>` : ''}
                    ${a.date_album ? `<span class="album-date"><i class="fas fa-calendar-alt"></i> ${escapeHTML(a.date_album)}</span>` : ''}
                </div>
            </div>`;
        }).join('');

        // Click to open album
        grid.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', () => {
                const albumId = parseInt(card.dataset.albumId);
                const album = albums.find(a => a.id === albumId);
                if (album) openAlbumModal(album);
            });
        });
    } catch (e) { console.error('Error loading albums:', e); }
}

function openAlbumModal(album) {
    const modal = document.getElementById('modalGalerie');
    const title = document.getElementById('galerieAlbumTitle');
    const photosGrid = document.getElementById('galeriePhotosGrid');
    if (!modal) return;

    title.textContent = album.titre;
    currentAlbumPhotos = album.photos || [];

    if (currentAlbumPhotos.length === 0) {
        photosGrid.innerHTML = '<p class="no-data">Aucune photo dans cet album.</p>';
    } else {
        photosGrid.innerHTML = currentAlbumPhotos.map((p, i) =>
            `<div class="galerie-photo" data-index="${i}">
                <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.legende || '')}" loading="lazy">
                ${p.legende ? `<span class="galerie-legende">${escapeHTML(p.legende)}</span>` : ''}
            </div>`
        ).join('');

        photosGrid.querySelectorAll('.galerie-photo').forEach(photo => {
            photo.addEventListener('click', () => {
                currentLightboxIndex = parseInt(photo.dataset.index);
                openLightbox();
            });
        });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function openLightbox() {
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImg');
    const caption = document.getElementById('lightboxCaption');
    if (!overlay || currentAlbumPhotos.length === 0) return;

    const photo = currentAlbumPhotos[currentLightboxIndex];
    img.src = photo.image;
    caption.textContent = photo.legende || '';
    overlay.classList.add('active');
}

function initGalerieModals() {
    // Gallery album modal
    const modalGalerie = document.getElementById('modalGalerie');
    const closeGalerie = document.getElementById('closeModalGalerie');
    if (modalGalerie) {
        closeGalerie.addEventListener('click', () => {
            modalGalerie.classList.remove('active');
            document.body.style.overflow = '';
        });
        modalGalerie.addEventListener('click', (e) => {
            if (e.target === modalGalerie) {
                modalGalerie.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Lightbox
    const lightbox = document.getElementById('lightboxOverlay');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxPrev = document.getElementById('lightboxPrev');
    const lightboxNext = document.getElementById('lightboxNext');

    if (lightbox) {
        lightboxClose.addEventListener('click', () => lightbox.classList.remove('active'));
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) lightbox.classList.remove('active');
        });
        lightboxPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            currentLightboxIndex = (currentLightboxIndex - 1 + currentAlbumPhotos.length) % currentAlbumPhotos.length;
            openLightbox();
        });
        lightboxNext.addEventListener('click', (e) => {
            e.stopPropagation();
            currentLightboxIndex = (currentLightboxIndex + 1) % currentAlbumPhotos.length;
            openLightbox();
        });
        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') lightboxPrev.click();
            if (e.key === 'ArrowRight') lightboxNext.click();
            if (e.key === 'Escape') lightbox.classList.remove('active');
        });
    }
}

// ============================================================
//  EVENT FILTERS
// ============================================================

function initEventFilters() {
    const filters = document.querySelectorAll('.event-filter');
    const cards = document.querySelectorAll('.event-card');

    filters.forEach(filter => {
        filter.addEventListener('click', () => {
            filters.forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            const category = filter.dataset.filter;
            cards.forEach(card => {
                card.classList.toggle('hidden', category !== 'all' && card.dataset.category !== category);
            });
        });
    });
}

// ============================================================
//  INSCRIPTION MODAL
// ============================================================

function initInscriptionModal() {
    const modal = document.getElementById('modalInscription');
    const closeBtn = document.getElementById('closeInscription');
    const form = document.getElementById('formInscription');
    if (!modal) return;

    let currentEventId = null;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-inscription');
        if (!btn) return;
        currentEventId = btn.dataset.eventId || null;
        document.getElementById('modalEventName').textContent = btn.dataset.event || '';
        document.getElementById('modalEventDate').textContent = btn.dataset.date || '';
        document.getElementById('modalEventLieu').textContent = btn.dataset.lieu || '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());

        if (!data.nom || !data.email || !data.telephone) {
            showNotification('Veuillez remplir tous les champs obligatoires.', 'error');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            showNotification('Veuillez entrer un email valide.', 'error');
            return;
        }

        try {
            const eventName = document.getElementById('modalEventName').textContent;
            const resp = await fetch(`${API}/api/inscriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    evenement_id: currentEventId,
                    evenement_nom: eventName,
                    nom: data.nom,
                    email: data.email,
                    telephone: data.telephone,
                    organisation: data.organisation || null
                })
            });

            if (resp.ok) {
                showNotification('Inscription confirmée pour « ' + eventName + ' » ! Vous recevrez un email de confirmation.', 'success');
                form.reset();
                closeModal();
            } else {
                const err = await resp.json();
                showNotification(err.error || 'Erreur lors de l\'inscription.', 'error');
            }
        } catch (err) {
            showNotification('Erreur de connexion au serveur.', 'error');
        }
    });
}

// ============================================================
//  CONTACT FORM
// ============================================================

function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(contactForm).entries());

        if (!data.nom || !data.email || !data.message) {
            showNotification('Veuillez remplir tous les champs obligatoires.', 'error');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            showNotification('Veuillez entrer un email valide.', 'error');
            return;
        }

        try {
            const resp = await fetch(`${API}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nom: data.nom,
                    email: data.email,
                    telephone: data.telephone || null,
                    formation: data.formation || null,
                    message: data.message
                })
            });

            if (resp.ok) {
                showNotification('Message envoyé avec succès ! Nous vous répondrons très bientôt.', 'success');
                contactForm.reset();
            } else {
                const err = await resp.json();
                showNotification(err.error || 'Erreur lors de l\'envoi.', 'error');
            }
        } catch (err) {
            showNotification('Erreur de connexion au serveur.', 'error');
        }
    });
}

// ============================================================
//  MEMBRE REGISTRATION
// ============================================================

function initMembreModal() {
    const btn = document.getElementById('btnDevenirMembre');
    const modal = document.getElementById('modalMembre');
    const closeBtn = document.getElementById('closeModalMembre');
    const form = document.getElementById('formMembre');
    const successDiv = document.getElementById('membreSuccess');
    if (!btn || !modal || !form) return;

    function openModal() { modal.classList.add('active'); }
    function closeModal() {
        modal.classList.remove('active');
        successDiv.classList.add('hidden');
        form.classList.remove('hidden');
    }

    btn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());

        if (!data.nom || !data.prenom || !data.email || !data.telephone || !data.type_membre || !data.password) {
            showNotification('Veuillez remplir tous les champs obligatoires.', 'error');
            return;
        }

        if (data.password.length < 6) {
            showNotification('Le mot de passe doit contenir au moins 6 caractères.', 'error');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            showNotification('Veuillez entrer un email valide.', 'error');
            return;
        }

        try {
            const resp = await fetch(`${API}/api/membres`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (resp.ok) {
                form.classList.add('hidden');
                successDiv.classList.remove('hidden');
                form.reset();
            } else {
                const err = await resp.json();
                showNotification(err.error || "Erreur lors de l'enregistrement.", 'error');
            }
        } catch (err) {
            showNotification('Erreur de connexion au serveur.', 'error');
        }
    });
}

// ============================================================
//  PLAYLIST SYSTEM
// ============================================================

const playlistProgress = {};

function initPlaylistSystem() {
    // Load progress from localStorage
    try {
        const saved = localStorage.getItem('morecPlaylistProgress');
        if (saved) Object.assign(playlistProgress, JSON.parse(saved));
    } catch (e) { /* ignore */ }

    // Restore watched states
    document.querySelectorAll('.video-item').forEach(item => {
        const pl = item.dataset.playlist;
        const idx = parseInt(item.dataset.index);
        if (playlistProgress[pl] && playlistProgress[pl].includes(idx)) {
            item.classList.add('watched');
        }
    });

    updateAllPlaylistProgress();
}

function markVideoWatched(playlistId, videoIndex) {
    if (!playlistProgress[playlistId]) playlistProgress[playlistId] = [];
    if (!playlistProgress[playlistId].includes(videoIndex)) {
        playlistProgress[playlistId].push(videoIndex);
    }

    const item = document.querySelector(`.video-item[data-playlist="${playlistId}"][data-index="${videoIndex}"]`);
    if (item) item.classList.add('watched');

    try {
        localStorage.setItem('morecPlaylistProgress', JSON.stringify(playlistProgress));
    } catch (e) { /* ignore */ }

    updatePlaylistProgress(playlistId);
}

function updatePlaylistProgress(playlistId) {
    const block = document.getElementById('playlist-' + playlistId);
    if (!block) return;

    const total = block.querySelectorAll('.video-item').length;
    const watched = (playlistProgress[playlistId] || []).length;
    const pct = total > 0 ? Math.round((watched / total) * 100) : 0;

    const fill = block.querySelector('.progress-fill');
    const text = block.querySelector('.progress-text');
    const evalBtn = block.querySelector('.btn-eval');

    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = watched + '/' + total + ' vus';
    if (evalBtn) evalBtn.disabled = watched < total;
}

function updateAllPlaylistProgress() {
    document.querySelectorAll('.playlist-block').forEach(block => {
        const id = block.id.replace('playlist-', '');
        updatePlaylistProgress(id);
    });
}

// ============================================================
//  VIDEO PLAYER MODAL
// ============================================================

function initVideoPlayerModal() {
    const modal = document.getElementById('modalVideo');
    const closeBtn = document.getElementById('closeVideo');
    const titleEl = document.getElementById('videoPlayerTitle');
    const descEl = document.getElementById('videoPlayerDesc');
    const markBtn = document.getElementById('btnMarkWatched');
    if (!modal) return;

    let currentPlaylist = '';
    let currentIndex = 0;

    document.addEventListener('click', (e) => {
        const watchBtn = e.target.closest('.btn-watch');
        const videoItem = e.target.closest('.video-item');

        if (watchBtn && videoItem) {
            e.stopPropagation();
            openVideoPlayer(videoItem);
        } else if (videoItem && !e.target.closest('.btn-watch')) {
            openVideoPlayer(videoItem);
        }
    });

    function openVideoPlayer(videoItem) {
        currentPlaylist = videoItem.dataset.playlist;
        currentIndex = parseInt(videoItem.dataset.index);

        const h4 = videoItem.querySelector('h4');
        const p = videoItem.querySelector('.video-info p');

        titleEl.textContent = h4 ? h4.textContent : '';
        descEl.textContent = p ? p.textContent : '';

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    markBtn.addEventListener('click', () => {
        markVideoWatched(currentPlaylist, currentIndex);
        showNotification('Vidéo marquée comme visionnée !', 'success');
        closeModal();
    });
}

// ============================================================
//  QUIZ / EVALUATION SYSTEM
// ============================================================

let currentQuiz = null;
let currentQuizPlaylistId = null;
let currentQuizQuestions = [];
let currentQuestionIndex = 0;
let quizAnswers = [];

function initQuizSystem() {
    const modal = document.getElementById('modalEvaluation');
    const closeBtn = document.getElementById('closeEvaluation');
    const prevBtn = document.getElementById('quizPrev');
    const nextBtn = document.getElementById('quizNext');
    const retryBtn = document.getElementById('quizRetry');
    if (!modal) return;

    document.querySelectorAll('.btn-eval').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const playlistSlug = btn.dataset.playlist;
            const playlistId = btn.dataset.playlistId;
            startQuiz(playlistSlug, playlistId);
        });
    });

    async function startQuiz(playlistSlug, playlistId) {
        try {
            const res = await fetch(`${API}/api/quiz/${playlistId}`);
            currentQuizQuestions = await res.json();

            if (currentQuizQuestions.length === 0) {
                showNotification('Aucune question disponible pour cette évaluation.', 'error');
                return;
            }

            currentQuiz = playlistSlug;
            currentQuizPlaylistId = playlistId;
            currentQuestionIndex = 0;
            quizAnswers = new Array(currentQuizQuestions.length).fill(-1);

            // Find playlist name
            const pl = playlistsData.find(p => p.slug === playlistSlug);
            document.getElementById('quizPlaylistName').textContent = pl ? pl.nom : playlistSlug;
            document.getElementById('quizResult').classList.add('hidden');
            document.getElementById('quizBody').style.display = '';
            document.getElementById('quizCounter').style.display = '';
            document.querySelector('.quiz-progress-bar').style.display = '';
            document.querySelector('.quiz-nav').style.display = '';

            renderQuestion();
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (e) {
            showNotification('Erreur lors du chargement du quiz.', 'error');
        }
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    prevBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) { currentQuestionIndex--; renderQuestion(); }
    });

    nextBtn.addEventListener('click', () => {
        if (quizAnswers[currentQuestionIndex] === -1) {
            showNotification('Veuillez sélectionner une réponse.', 'error');
            return;
        }
        if (currentQuestionIndex < currentQuizQuestions.length - 1) {
            currentQuestionIndex++;
            renderQuestion();
        } else {
            showResults();
        }
    });

    retryBtn.addEventListener('click', () => {
        startQuiz(currentQuiz, currentQuizPlaylistId);
    });

    function renderQuestion() {
        const q = currentQuizQuestions[currentQuestionIndex];
        const total = currentQuizQuestions.length;

        document.getElementById('quizCounter').textContent = 'Question ' + (currentQuestionIndex + 1) + ' / ' + total;
        document.getElementById('quizProgressFill').style.width = ((currentQuestionIndex + 1) / total * 100) + '%';
        document.getElementById('quizQuestion').textContent = q.question;

        const letters = ['A', 'B', 'C', 'D'];
        const options = [q.option_a, q.option_b, q.option_c, q.option_d];
        const optionsHTML = options.map((opt, i) => {
            const selected = quizAnswers[currentQuestionIndex] === i ? ' selected' : '';
            return `<div class="quiz-option${selected}" data-index="${i}"><span class="option-letter">${letters[i]}</span><span>${escapeHTML(opt)}</span></div>`;
        }).join('');

        document.getElementById('quizOptions').innerHTML = optionsHTML;

        document.querySelectorAll('.quiz-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                quizAnswers[currentQuestionIndex] = parseInt(opt.dataset.index);
            });
        });

        prevBtn.disabled = currentQuestionIndex === 0;
        nextBtn.innerHTML = currentQuestionIndex === total - 1
            ? '<i class="fas fa-check-circle"></i> Terminer'
            : 'Suivant <i class="fas fa-arrow-right"></i>';
    }

    function showResults() {
        let correct = 0;
        currentQuizQuestions.forEach((q, i) => {
            if (quizAnswers[i] === q.correct_index) correct++;
        });

        const total = currentQuizQuestions.length;
        const pct = Math.round((correct / total) * 100);

        document.getElementById('quizBody').style.display = 'none';
        document.getElementById('quizCounter').style.display = 'none';
        document.querySelector('.quiz-progress-bar').style.display = 'none';
        document.querySelector('.quiz-nav').style.display = 'none';

        const resultEl = document.getElementById('quizResult');
        resultEl.classList.remove('hidden');

        document.getElementById('resultScore').textContent = pct + '%';

        const circle = document.getElementById('resultCircle');
        circle.classList.toggle('fail', pct < 50);

        if (pct >= 80) {
            document.getElementById('resultTitle').textContent = 'Excellent !';
            document.getElementById('resultMessage').textContent = 'Vous maîtrisez parfaitement ce module. Score : ' + correct + '/' + total;
        } else if (pct >= 50) {
            document.getElementById('resultTitle').textContent = 'Bien joué !';
            document.getElementById('resultMessage').textContent = 'Vous avez une bonne compréhension. Score : ' + correct + '/' + total + '. Continuez à progresser !';
        } else {
            document.getElementById('resultTitle').textContent = 'À améliorer';
            document.getElementById('resultMessage').textContent = 'Score : ' + correct + '/' + total + '. Nous vous recommandons de revoir les vidéos avant de réessayer.';
        }

        // Save score to backend
        const pl = playlistsData.find(p => p.slug === currentQuiz);
        fetch(`${API}/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playlist_id: currentQuizPlaylistId,
                playlist_nom: pl ? pl.nom : currentQuiz,
                nom: 'Anonyme',
                email: 'anonyme@morec.com',
                score: correct,
                total: total,
                pourcentage: pct
            })
        }).catch(() => {});
    }
}

// ===== CLOSE MODALS ON ESCAPE =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        });
    }
});

// ============================================================
//  INIT — Load all data from API
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load all sections in parallel
    await Promise.all([
        loadHeroSlides(),
        loadStats(),
        loadCitation(),
        loadFormations(),
        loadEvenements(),
        loadPlaylists(),
        loadCoursPdfs(),
        loadCoursLivePreview(),
        loadPourquoi(),
        loadTemoignages(),
        loadEquipe(),
        loadAlbums()
    ]);

    // Init UI features that depend on loaded content
    initScrollAnimations();
    initInscriptionModal();
    initContactForm();
    initMembreModal();
    initGalerieModals();
});
