// ============================================================
//  MOREC — code commun à toutes les pages publiques
//  Chargé en defer : le DOM est prêt, pas besoin de DOMContentLoaded.
//  Tout est dans une IIFE, pour ne pas entrer en collision avec
//  cours-live.js qui déclare ses propres constantes globales.
// ============================================================
(function () {
    'use strict';

    const API = '';
    const CLE_TOKEN_MEMBRE = 'morec_member_token';
    const CLE_DONNEES_MEMBRE = 'morec_member_data';
    const CLE_TOKEN_ADMIN = 'morec_admin_token';

    // ===== Utilitaires =====
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return escapeHTML(str).replace(/"/g, '&quot;');
    }

    function notify(message, type = 'success') {
        const existant = document.querySelector('.notification');
        if (existant) existant.remove();
        const el = document.createElement('div');
        el.className = `notification ${type}`;
        el.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                        <span>${escapeHTML(message)}</span>`;
        document.body.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 4000);
    }

    function ouvrirModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('active');
    }

    function fermerModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.remove('active');
    }

    // ===== Session =====
    function getSession() {
        const tokenAdmin = localStorage.getItem(CLE_TOKEN_ADMIN);
        if (tokenAdmin) return { role: 'admin', token: tokenAdmin, espace: '/admin' };

        const tokenMembre = localStorage.getItem(CLE_TOKEN_MEMBRE);
        if (tokenMembre) {
            let membre = null;
            try { membre = JSON.parse(localStorage.getItem(CLE_DONNEES_MEMBRE) || 'null'); } catch (e) { membre = null; }
            return { role: 'membre', token: tokenMembre, membre, espace: '/cours-live' };
        }
        return null;
    }

    function clearSession() {
        localStorage.removeItem(CLE_TOKEN_ADMIN);
        localStorage.removeItem(CLE_TOKEN_MEMBRE);
        localStorage.removeItem(CLE_DONNEES_MEMBRE);
    }

    // ===== Navigation =====
    // Les écouteurs ne sont posés qu'après vérification de l'élément : dans
    // l'ancien script.js, trois appels au niveau du module (navToggle, navLinks,
    // scrollTop) levaient un TypeError qui interrompait TOUT le fichier dès
    // qu'un de ces éléments manquait.
    function initNav() {
        const navbar = document.getElementById('navbar');
        const navToggle = document.getElementById('navToggle');
        const navLinks = document.getElementById('navLinks');

        if (navToggle && navLinks) {
            navToggle.addEventListener('click', () => {
                navLinks.classList.toggle('active');
                navToggle.classList.toggle('active');
            });
            navLinks.querySelectorAll('a').forEach(lien => {
                lien.addEventListener('click', () => {
                    navLinks.classList.remove('active');
                    navToggle.classList.remove('active');
                });
            });
        }

        // data-solid : sur les pages internes la barre reste opaque. Sans cela
        // elle redeviendrait transparente en haut de page, donc invisible sur
        // un fond clair. Plus de calcul du lien actif : EJS pose la classe.
        if (navbar && !navbar.dataset.solid) {
            window.addEventListener('scroll', () => {
                navbar.classList.toggle('scrolled', window.scrollY > 50);
            }, { passive: true });
        }
    }

    function initScrollTop() {
        const bouton = document.getElementById('scrollTop');
        if (!bouton) return;
        window.addEventListener('scroll', () => {
            bouton.classList.toggle('visible', window.scrollY > 500);
        }, { passive: true });
        bouton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    function initFermetureModals() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        });
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        });
    }

    function initAnimationsScroll() {
        const cibles = document.querySelectorAll(
            '.formation-card, .pourquoi-card, .temoignage-card, .equipe-card, .apropos-grid, ' +
            '.contact-grid, .event-card, .playlist-block, .citation-card, .album-card, .pdf-card'
        );
        if (!cibles.length) return;
        cibles.forEach(el => el.classList.add('fade-up'));
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        cibles.forEach(el => observer.observe(el));
    }

    // ===== Zone de connexion dans la barre de navigation =====
    function renderNavAuth() {
        const conteneur = document.getElementById('navAuth');
        if (!conteneur) return;

        const session = getSession();
        if (!session) {
            conteneur.innerHTML = `
                <a href="#" class="btn-nav btn-login nav-icon" id="btnSeConnecter" data-tooltip="Se connecter" aria-label="Se connecter">
                    <i class="fas fa-sign-in-alt"></i><span class="nav-label">Se connecter</span>
                </a>`;
            return;
        }

        const label = session.role === 'admin' ? 'Admin' : (session.membre?.prenom || 'Mon espace');
        conteneur.innerHTML = `
            <div class="nav-user">
                <a href="${session.espace}" class="btn-nav btn-login nav-icon" data-tooltip="Mon espace — ${escapeAttr(label)}" aria-label="Mon espace — ${escapeAttr(label)}">
                    <i class="fas fa-user-circle"></i><span class="nav-label">${escapeHTML(label)}</span>
                </a>
                <button class="nav-logout" id="btnLogout" title="Se déconnecter" aria-label="Se déconnecter">
                    <i class="fas fa-sign-out-alt"></i>
                </button>
            </div>`;
    }

    // Un token expire (8 h admin, 24 h membre) : sans cette vérification la
    // barre afficherait « Bonjour Marie » avec une session morte.
    async function validateSession() {
        const session = getSession();
        if (!session) return;
        const url = session.role === 'admin' ? `${API}/api/auth/me` : `${API}/api/membres/me`;
        try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } });
            if (res.status === 401 || res.status === 403) {
                clearSession();
                renderNavAuth();
            }
        } catch (e) {
            // Hors ligne : on garde la session plutôt que de la perdre à tort
        }
    }

    // ===== Modal de connexion (membre ou admin, détection automatique) =====
    async function tenterLogin(endpoint, charge) {
        const res = await fetch(`${API}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(charge)
        });
        if (!res.ok) return null;
        return res.json();
    }

    function initLoginModal() {
        const modal = document.getElementById('modalLogin');
        const form = document.getElementById('formLogin');
        if (!modal || !form) return;

        const erreur = document.getElementById('loginErrorMsg');
        const submit = document.getElementById('btnSubmitLogin');
        const fermer = document.getElementById('closeModalLogin');
        const identifiant = document.getElementById('loginIdentifiant');

        function ouvrir() {
            if (erreur) erreur.classList.add('hidden');
            modal.classList.add('active');
            if (identifiant) identifiant.focus();
        }
        function fermerLogin() {
            modal.classList.remove('active');
            form.reset();
            if (erreur) erreur.classList.add('hidden');
        }

        // Délégation : la zone #navAuth est re-rendue selon l'état de connexion
        document.addEventListener('click', (e) => {
            if (e.target.closest('#btnSeConnecter')) { e.preventDefault(); ouvrir(); return; }
            if (e.target.closest('#btnLogout')) {
                e.preventDefault();
                clearSession();
                renderNavAuth();
                notify('Vous êtes déconnecté.');
            }
        });

        if (fermer) fermer.addEventListener('click', fermerLogin);

        const lienInscription = document.getElementById('linkVersInscription');
        if (lienInscription) {
            lienInscription.addEventListener('click', (e) => {
                e.preventDefault();
                fermerLogin();
                ouvrirModal('modalMembre');
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const motDePasse = document.getElementById('loginMotDePasse');
            const id = identifiant ? identifiant.value.trim() : '';
            const mdp = motDePasse ? motDePasse.value : '';
            if (!id || !mdp) return;

            if (erreur) erreur.classList.add('hidden');
            const labelInitial = submit ? submit.innerHTML : '';
            if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...'; }

            // Un email pointe vers un membre, un identifiant simple vers l'admin.
            // On tente l'autre endpoint en secours si le premier refuse.
            const essais = id.includes('@')
                ? [{ ep: '/api/membres/login', charge: { email: id, password: mdp }, role: 'membre' },
                   { ep: '/api/auth/login', charge: { username: id, password: mdp }, role: 'admin' }]
                : [{ ep: '/api/auth/login', charge: { username: id, password: mdp }, role: 'admin' },
                   { ep: '/api/membres/login', charge: { email: id, password: mdp }, role: 'membre' }];

            try {
                let resultat = null;
                for (const essai of essais) {
                    const data = await tenterLogin(essai.ep, essai.charge);
                    if (data && data.token) { resultat = { role: essai.role, data }; break; }
                }
                if (!resultat) {
                    if (erreur) {
                        erreur.textContent = 'Identifiants incorrects. Vérifiez votre email et votre mot de passe.';
                        erreur.classList.remove('hidden');
                    }
                    return;
                }
                if (resultat.role === 'admin') {
                    localStorage.setItem(CLE_TOKEN_ADMIN, resultat.data.token);
                    window.location.href = '/admin';
                } else {
                    localStorage.setItem(CLE_TOKEN_MEMBRE, resultat.data.token);
                    localStorage.setItem(CLE_DONNEES_MEMBRE, JSON.stringify(resultat.data.membre));
                    window.location.href = '/cours-live';
                }
            } catch (err) {
                if (erreur) {
                    erreur.textContent = 'Connexion au serveur impossible. Réessayez dans un instant.';
                    erreur.classList.remove('hidden');
                }
            } finally {
                if (submit) { submit.disabled = false; submit.innerHTML = labelInitial; }
            }
        });
    }

    // ===== Modal « Devenir Membre » =====
    function initMembreModal() {
        const bouton = document.getElementById('btnDevenirMembre');
        const modal = document.getElementById('modalMembre');
        const form = document.getElementById('formMembre');
        if (!bouton || !modal || !form) return;

        const fermer = document.getElementById('closeModalMembre');
        const succes = document.getElementById('membreSuccess');
        const fermerSucces = document.getElementById('btnFermerSuccesMembre');

        bouton.addEventListener('click', (e) => {
            e.preventDefault();
            if (succes) succes.classList.add('hidden');
            form.classList.remove('hidden');
            modal.classList.add('active');
        });
        if (fermer) fermer.addEventListener('click', () => modal.classList.remove('active'));
        if (fermerSucces) {
            fermerSucces.addEventListener('click', () => {
                modal.classList.remove('active');
                if (succes) succes.classList.add('hidden');
                form.classList.remove('hidden');
                form.reset();
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submit = form.querySelector('button[type="submit"]');
            const labelInitial = submit ? submit.innerHTML : '';
            if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...'; }
            try {
                const donnees = Object.fromEntries(new FormData(form).entries());
                const res = await fetch(`${API}/api/membres`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(donnees)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Enregistrement impossible');
                form.classList.add('hidden');
                if (succes) succes.classList.remove('hidden');
            } catch (err) {
                notify(err.message, 'error');
            } finally {
                if (submit) { submit.disabled = false; submit.innerHTML = labelInitial; }
            }
        });
    }

    // ===== Exposition pour les scripts de page =====
    window.MOREC = { API, escapeHTML, escapeAttr, notify, ouvrirModal, fermerModal, getSession };

    // ===== Démarrage =====
    initNav();
    initScrollTop();
    initFermetureModals();
    initAnimationsScroll();
    initLoginModal();
    initMembreModal();
    renderNavAuth();
    validateSession();
})();
