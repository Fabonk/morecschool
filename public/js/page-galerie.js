// Page Galerie : ouverture d'un album et visionneuse plein écran.
// Les albums sont rendus par le serveur ; seules les photos d'un album sont
// chargées à la demande, au clic — inutile de tout envoyer d'avance.
(function () {
    'use strict';
    const { API, escapeHTML, notify } = window.MOREC;

    let photos = [];
    let indexCourant = 0;

    const modal = document.getElementById('modalGalerie');
    const titre = document.getElementById('galerieAlbumTitle');
    const grille = document.getElementById('galeriePhotosGrid');
    const fermerAlbum = document.getElementById('closeModalGalerie');

    const visionneuse = document.getElementById('lightboxOverlay');
    const image = document.getElementById('lightboxImg');
    const legende = document.getElementById('lightboxCaption');
    const fermerVis = document.getElementById('lightboxClose');
    const precedent = document.getElementById('lightboxPrev');
    const suivant = document.getElementById('lightboxNext');

    // ===== Visionneuse =====
    function afficherPhoto() {
        if (!visionneuse || !photos.length) return;
        const photo = photos[indexCourant];
        if (image) { image.src = photo.image; image.alt = photo.legende || ''; }
        if (legende) legende.textContent = photo.legende || '';
        visionneuse.classList.add('active');
    }

    function naviguer(pas) {
        if (!photos.length) return;
        indexCourant = (indexCourant + pas + photos.length) % photos.length;
        afficherPhoto();
    }

    function fermerVisionneuse() {
        if (visionneuse) visionneuse.classList.remove('active');
    }

    if (fermerVis) fermerVis.addEventListener('click', fermerVisionneuse);
    if (precedent) precedent.addEventListener('click', () => naviguer(-1));
    if (suivant) suivant.addEventListener('click', () => naviguer(1));
    if (visionneuse) {
        visionneuse.addEventListener('click', (e) => {
            if (e.target === visionneuse) fermerVisionneuse();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (!visionneuse || !visionneuse.classList.contains('active')) return;
        if (e.key === 'Escape') fermerVisionneuse();
        else if (e.key === 'ArrowLeft') naviguer(-1);
        else if (e.key === 'ArrowRight') naviguer(1);
    });

    // ===== Ouverture d'un album =====
    function fermerModalAlbum() {
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (fermerAlbum) fermerAlbum.addEventListener('click', fermerModalAlbum);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) fermerModalAlbum();
        });
    }

    document.querySelectorAll('.album-card').forEach(carte => {
        carte.addEventListener('click', async () => {
            if (!modal || !grille) return;
            const id = carte.dataset.albumId;
            if (titre) {
                const h3 = carte.querySelector('h3');
                titre.textContent = h3 ? h3.textContent : '';
            }
            grille.innerHTML = '<p class="no-data"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';

            try {
                const res = await fetch(`${API}/api/albums`);
                if (!res.ok) throw new Error('Chargement impossible');
                const albums = await res.json();
                const album = albums.find(a => String(a.id) === String(id));
                photos = (album && album.photos) || [];

                if (!photos.length) {
                    grille.innerHTML = '<p class="no-data">Aucune photo dans cet album.</p>';
                    return;
                }

                grille.innerHTML = photos.map((p, i) =>
                    `<div class="galerie-photo" data-index="${i}">
                        <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.legende || '')}" loading="lazy">
                        ${p.legende ? `<span class="galerie-legende">${escapeHTML(p.legende)}</span>` : ''}
                    </div>`
                ).join('');

                grille.querySelectorAll('.galerie-photo').forEach(el => {
                    el.addEventListener('click', () => {
                        indexCourant = parseInt(el.dataset.index, 10);
                        afficherPhoto();
                    });
                });
            } catch (err) {
                grille.innerHTML = '<p class="no-data">Les photos n\'ont pas pu être chargées.</p>';
                notify(err.message, 'error');
            }
        });
    });
})();
