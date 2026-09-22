// ===== MOREC Admin Panel =====
const API = '';
let TOKEN = localStorage.getItem('morec_admin_token') || '';

// ===== UTILITY =====
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// escapeHTML n'échappe pas les guillemets : indispensable dans un attribut
function escapeAttr(str) {
    return escapeHTML(str).replace(/"/g, '&quot;');
}

function notify(msg, type = 'success') {
    const existing = document.querySelector('.admin-notification');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = `admin-notification ${type}`;
    el.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${escapeHTML(msg)}`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3500);
}

async function apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
    const res = await fetch(API + url, { ...options, headers });
    if (res.status === 401) { logout(); throw new Error('Session expirée'); }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        // L'API répond désormais toujours en JSON (404 et erreurs compris).
        // Une réponse non-JSON signale donc un serveur injoignable ou en
        // cours de démarrage, et non une simple erreur de requête.
        throw new Error(`Réponse inattendue du serveur (HTTP ${res.status}). `
            + "S'il vient de démarrer, patientez quelques secondes et réessayez.");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
}

// ===== AUTH =====
const loginScreen = document.getElementById('loginScreen');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

function showLogin() { loginScreen.classList.remove('hidden'); adminPanel.classList.add('hidden'); }
function showPanel() { loginScreen.classList.add('hidden'); adminPanel.classList.remove('hidden'); }

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    try {
        const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        TOKEN = data.token;
        localStorage.setItem('morec_admin_token', TOKEN);
        document.getElementById('adminName').textContent = data.username;
        showPanel();
        loadSection('dashboard');
    } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.remove('hidden');
    }
});

function logout() {
    TOKEN = '';
    localStorage.removeItem('morec_admin_token');
    showLogin();
}

document.getElementById('btnLogout').addEventListener('click', logout);

// Check token on load
(async () => {
    if (TOKEN) {
        try {
            const me = await apiFetch('/api/auth/me');
            document.getElementById('adminName').textContent = me.username;
            showPanel();
            loadSection('dashboard');
        } catch { showLogin(); }
    } else { showLogin(); }
})();

// ===== SIDEBAR NAV =====
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function setSidebar(ouvert) {
    sidebar.classList.toggle('open', ouvert);
    if (sidebarOverlay) {
        sidebarOverlay.hidden = !ouvert;
        sidebarOverlay.classList.toggle('visible', ouvert);
    }
    // Empêche le défilement du contenu pendant que le tiroir est ouvert
    document.body.style.overflow = ouvert ? 'hidden' : '';
}

document.getElementById('sidebarToggle').addEventListener('click', () => {
    setSidebar(!sidebar.classList.contains('open'));
});
if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => setSidebar(false));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) setSidebar(false);
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        setSidebar(false);
        loadSection(item.dataset.section);
    });
});

// ===== SECTION LOADING =====
const content = document.getElementById('adminContent');
const pageTitle = document.getElementById('pageTitle');

const sectionTitles = {
    dashboard: 'Tableau de bord', hero_slides: 'Carousel Hero', stats: 'Statistiques Hero', citations: 'Citations',
    formations: 'Formations', evenements: 'Événements', playlists: 'Playlists',
    videos: 'Vidéos', quiz: 'Questions Quiz', pourquoi: 'Pourquoi Nous',
    temoignages: 'Témoignages', equipe: 'Équipe', albums: 'Galerie Photos', cours_pdfs: 'Documents PDF', cours_live: 'Cours Live',
    inscriptions: 'Inscriptions', membres: 'Membres', messages: 'Messages', scores: 'Scores Quiz',
    comptes: 'Comptes Administrateurs',
    site_textes: 'Textes du site', section_entetes: 'En-têtes de sections',
    apropos_blocs: 'À Propos — Blocs de texte', apropos_valeurs: 'À Propos — Valeurs',
    contact_infos: 'Coordonnées', reseaux_sociaux: 'Réseaux sociaux',
    footer_liens: 'Liens du pied de page', page_seo: 'Référencement des pages'
};

async function loadSection(section) {
    pageTitle.textContent = sectionTitles[section] || section;
    content.innerHTML = '<p style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    try {
        switch (section) {
            case 'dashboard': await renderDashboard(); break;
            case 'hero_slides': await renderHeroSlides(); break;
            case 'albums': await renderAlbums(); break;
            case 'inscriptions': await renderReadOnly('inscriptions', ['id','evenement_nom','nom','email','telephone','organisation','date_inscription']); break;
            case 'membres': await renderMembres(); break;
            case 'messages': await renderMessages(); break;
            case 'scores': await renderReadOnly('scores', ['id','playlist_nom','nom','email','score','total','pourcentage','date_passage']); break;
            case 'comptes': await renderComptes(); break;
            case 'site_textes': await renderSiteTextes(); break;
            default: await renderCrudSection(section); break;
        }
    } catch (err) {
        content.innerHTML = `<p style="color:var(--red);text-align:center;padding:40px">${escapeHTML(err.message)}</p>`;
    }
}

// ===== DASHBOARD =====
async function renderDashboard() {
    const d = await apiFetch('/api/admin/dashboard');
    content.innerHTML = `
        <div class="dashboard-grid">
            <div class="dash-card"><div class="dash-card-icon gold"><i class="fas fa-graduation-cap"></i></div><div class="dash-card-info"><h3>${d.formations}</h3><p>Formations</p></div></div>
            <div class="dash-card"><div class="dash-card-icon blue"><i class="fas fa-calendar-alt"></i></div><div class="dash-card-info"><h3>${d.evenements}</h3><p>Événements</p></div></div>
            <div class="dash-card"><div class="dash-card-icon green"><i class="fas fa-user-plus"></i></div><div class="dash-card-info"><h3>${d.inscriptions}</h3><p>Inscriptions</p></div></div>
            <div class="dash-card"><div class="dash-card-icon red"><i class="fas fa-envelope"></i></div><div class="dash-card-info"><h3>${d.messages}</h3><p>Messages (${d.messagesNonLus} non lus)</p></div></div>
            <div class="dash-card"><div class="dash-card-icon gold"><i class="fas fa-comments"></i></div><div class="dash-card-info"><h3>${d.temoignages}</h3><p>Témoignages</p></div></div>
            <div class="dash-card"><div class="dash-card-icon blue"><i class="fas fa-trophy"></i></div><div class="dash-card-info"><h3>${d.scores}</h3><p>Scores Quiz</p></div></div>
            <div class="dash-card"><div class="dash-card-icon green"><i class="fas fa-id-card"></i></div><div class="dash-card-info"><h3>${d.membres}</h3><p>Membres</p></div></div>
            <div class="dash-card"><div class="dash-card-icon blue"><i class="fas fa-images"></i></div><div class="dash-card-info"><h3>${d.heroSlides}</h3><p>Slides Hero</p></div></div>
            <div class="dash-card"><div class="dash-card-icon gold"><i class="fas fa-camera-retro"></i></div><div class="dash-card-info"><h3>${d.albums}</h3><p>Albums (${d.photos} photos)</p></div></div>
            <div class="dash-card"><div class="dash-card-icon green"><i class="fas fa-file-pdf"></i></div><div class="dash-card-info"><h3>${d.coursPdfs || 0}</h3><p>Documents PDF</p></div></div>
            <div class="dash-card"><div class="dash-card-icon red"><i class="fas fa-broadcast-tower"></i></div><div class="dash-card-info"><h3>${d.coursLive || 0}</h3><p>Cours Live</p></div></div>
        </div>
    `;
}

// ===== TEXTES DU SITE (écran sur-mesure) =====
// Ces textes sont des singletons dispersés (héros, CTA, pied de page…).
// Un tableau CRUD avec un bouton « Ajouter » n'aurait aucun sens : on les
// présente groupés, avec un enregistrement par groupe en une seule requête.
const LIBELLES_GROUPES = {
    hero: "Bandeau d'accueil",
    citation: 'Citation du jour',
    apropos: 'Encart À Propos',
    cta: "Bloc d'appel à l'action",
    footer: 'Pied de page'
};

async function renderSiteTextes() {
    const textes = await apiFetch('/api/admin/site-textes');

    const groupes = {};
    textes.forEach(t => { (groupes[t.groupe] = groupes[t.groupe] || []).push(t); });

    content.innerHTML = `
        <p class="admin-hint">
            <i class="fas fa-info-circle"></i>
            Mise en forme disponible dans les textes :
            <strong>*surligné en doré*</strong> · <strong>**gras**</strong> · <strong>_italique_</strong>.
            Chaque bloc s'enregistre séparément.
        </p>
        ${Object.keys(groupes).map(groupe => `
            <form class="textes-groupe" data-groupe="${escapeAttr(groupe)}">
                <h3 class="textes-groupe-titre">
                    ${escapeHTML(LIBELLES_GROUPES[groupe] || groupe)}
                </h3>
                ${groupes[groupe].map(t => `
                    <div class="form-group">
                        <label for="texte-${t.id}">${escapeHTML(t.libelle)}</label>
                        ${t.multiligne
                            ? `<textarea id="texte-${t.id}" rows="3" data-cle="${escapeAttr(t.cle)}">${escapeHTML(t.valeur || '')}</textarea>`
                            : `<input type="text" id="texte-${t.id}" data-cle="${escapeAttr(t.cle)}" value="${escapeAttr(t.valeur || '')}">`}
                        <small class="textes-cle">${escapeHTML(t.cle)}</small>
                    </div>`).join('')}
                <button type="submit" class="btn-admin-primary btn-sm">
                    <i class="fas fa-save"></i> Enregistrer ce bloc
                </button>
            </form>`).join('')}`;

    content.querySelectorAll('.textes-groupe').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const bouton = form.querySelector('button[type="submit"]');
            const libelleInitial = bouton.innerHTML;
            bouton.disabled = true;
            bouton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
            try {
                const charge = {};
                form.querySelectorAll('[data-cle]').forEach(champ => { charge[champ.dataset.cle] = champ.value; });
                const res = await apiFetch('/api/admin/site-textes', {
                    method: 'PUT',
                    body: JSON.stringify({ textes: charge })
                });
                notify(`${res.misAJour} texte(s) enregistré(s)`);
            } catch (err) {
                notify(err.message, 'error');
            } finally {
                bouton.disabled = false;
                bouton.innerHTML = libelleInitial;
            }
        });
    });
}

// ===== COMPTES ADMINISTRATEURS =====
// La table admins n'était pilotable par aucune interface : un seul compte
// existait, créé au premier démarrage, sans moyen d'en ajouter un autre.
async function renderComptes() {
    const comptes = await apiFetch('/api/admin/comptes');
    content.innerHTML = `
        <div class="table-header">
            <h2>Comptes administrateurs (${comptes.length})</h2>
            <button class="btn-admin-primary btn-sm" id="btnNouveauCompte"><i class="fas fa-plus"></i> Nouveau compte</button>
        </div>
        <form id="formCompte" class="compte-form hidden">
            <div class="form-row">
                <div class="form-group">
                    <label for="compteUser">Identifiant</label>
                    <input type="text" id="compteUser" required autocomplete="off">
                </div>
                <div class="form-group">
                    <label for="comptePass">Mot de passe (6 caractères minimum)</label>
                    <input type="password" id="comptePass" required minlength="6" autocomplete="new-password">
                </div>
            </div>
            <div class="compte-form-actions">
                <button type="submit" class="btn-admin-primary btn-sm"><i class="fas fa-check"></i> Créer</button>
                <button type="button" class="btn-admin-secondary" id="btnAnnulerCompte">Annuler</button>
            </div>
        </form>
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>ID</th><th>Identifiant</th><th>Créé le</th><th>Actions</th></tr></thead>
                <tbody>
                    ${comptes.map(c => `
                        <tr>
                            <td data-label="ID">${c.id}</td>
                            <td data-label="Identifiant"><strong>${escapeHTML(c.username)}</strong></td>
                            <td data-label="Créé le">${escapeHTML(c.created_at || '')}</td>
                            <td data-label="Actions" class="actions-cell">
                                <button class="btn-icon-sm danger btn-suppr-compte" title="Supprimer"
                                        data-id="${c.id}" data-user="${escapeAttr(c.username)}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <p class="admin-hint">
            <i class="fas fa-info-circle"></i>
            Le dernier compte et celui avec lequel vous êtes connecté ne peuvent pas être supprimés.
            Pour changer votre propre mot de passe, utilisez le bouton dédié en haut de page.
        </p>`;

    content.querySelectorAll('.btn-suppr-compte').forEach(btn => {
        btn.addEventListener('click', () => supprimerCompte(Number(btn.dataset.id), btn.dataset.user));
    });

    const form = document.getElementById('formCompte');
    document.getElementById('btnNouveauCompte').addEventListener('click', () => {
        form.classList.remove('hidden');
        document.getElementById('compteUser').focus();
    });
    document.getElementById('btnAnnulerCompte').addEventListener('click', () => {
        form.classList.add('hidden');
        form.reset();
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await apiFetch('/api/admin/comptes', {
                method: 'POST',
                body: JSON.stringify({
                    username: document.getElementById('compteUser').value.trim(),
                    password: document.getElementById('comptePass').value
                })
            });
            notify('Compte créé');
            loadSection('comptes');
        } catch (err) { notify(err.message, 'error'); }
    });
}

async function supprimerCompte(id, username) {
    if (!confirm(`Supprimer le compte « ${username} » ?`)) return;
    try {
        await apiFetch(`/api/admin/comptes/${id}`, { method: 'DELETE' });
        notify('Compte supprimé');
        loadSection('comptes');
    } catch (err) { notify(err.message, 'error'); }
}

// ===== CRUD CONFIG =====
const crudConfig = {
    stats: {
        endpoint: '/api/admin/stats',
        columns: ['id', 'nombre', 'suffixe', 'label', 'ordre'],
        fields: [
            { name: 'nombre', label: 'Nombre', type: 'number', required: true },
            { name: 'suffixe', label: 'Suffixe (+, etc.)', type: 'text' },
            { name: 'label', label: 'Label', type: 'text', required: true },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    citations: {
        endpoint: '/api/admin/citations',
        columns: ['id', 'texte', 'auteur'],
        fields: [
            { name: 'texte', label: 'Citation', type: 'textarea', required: true },
            { name: 'auteur', label: 'Auteur', type: 'text', required: true }
        ]
    },
    formations: {
        endpoint: '/api/admin/formations',
        columns: ['id', 'icon', 'titre', 'duree', 'places', 'populaire', 'ordre'],
        fields: [
            { name: 'icon', label: 'Icône (classe FA)', type: 'text', required: true, placeholder: 'fas fa-crown' },
            { name: 'titre', label: 'Titre', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'duree', label: 'Durée', type: 'text', required: true, placeholder: '40 heures' },
            { name: 'certificat', label: 'Certificat (1=Oui, 0=Non)', type: 'number' },
            { name: 'places', label: 'Places max', type: 'number', required: true },
            { name: 'populaire', label: 'Populaire (1=Oui, 0=Non)', type: 'number' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    evenements: {
        endpoint: '/api/admin/evenements',
        columns: ['id', 'categorie', 'titre', 'date_event', 'lieu', 'places', 'image', 'ordre'],
        hasImage: true,
        fields: [
            { name: 'categorie', label: 'Catégorie', type: 'select', options: ['formation','conference','coaching','masterclass'], required: true },
            { name: 'icon', label: 'Icône (classe FA)', type: 'text', required: true, placeholder: 'fas fa-chalkboard-teacher' },
            { name: 'titre', label: 'Titre', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'date_event', label: 'Date', type: 'text', required: true, placeholder: '15 Avr 2026' },
            { name: 'lieu', label: 'Lieu', type: 'text', required: true },
            { name: 'places', label: 'Places', type: 'number', required: true },
            { name: 'image', label: 'Image de l\'événement', type: 'file', accept: 'image/*' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    playlists: {
        endpoint: '/api/admin/playlists',
        columns: ['id', 'slug', 'nom', 'formateur', 'duree_totale', 'ordre'],
        fields: [
            { name: 'slug', label: 'Slug (identifiant unique)', type: 'text', required: true, placeholder: 'leadership' },
            { name: 'nom', label: 'Nom', type: 'text', required: true },
            { name: 'icon', label: 'Icône (classe FA)', type: 'text', required: true },
            { name: 'icon_class', label: 'Classe CSS icône (optionnel)', type: 'text' },
            { name: 'formateur', label: 'Formateur', type: 'text', required: true },
            { name: 'duree_totale', label: 'Durée totale', type: 'text', required: true, placeholder: '2h 20min' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    videos: {
        endpoint: '/api/admin/videos',
        columns: ['id', 'playlist_id', 'titre', 'duree', 'vues', 'ordre'],
        fields: [
            { name: 'playlist_id', label: 'ID Playlist', type: 'number', required: true },
            { name: 'titre', label: 'Titre', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'duree', label: 'Durée', type: 'text', required: true, placeholder: '45 min' },
            { name: 'vues', label: 'Vues', type: 'text', placeholder: '1.2K' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    quiz: {
        endpoint: '/api/admin/quiz',
        columns: ['id', 'playlist_id', 'question', 'correct_index', 'ordre'],
        fields: [
            { name: 'playlist_id', label: 'ID Playlist', type: 'number', required: true },
            { name: 'question', label: 'Question', type: 'textarea', required: true },
            { name: 'option_a', label: 'Option A', type: 'text', required: true },
            { name: 'option_b', label: 'Option B', type: 'text', required: true },
            { name: 'option_c', label: 'Option C', type: 'text', required: true },
            { name: 'option_d', label: 'Option D', type: 'text', required: true },
            { name: 'correct_index', label: 'Index correct (0=A, 1=B, 2=C, 3=D)', type: 'number', required: true },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    pourquoi: {
        endpoint: '/api/admin/pourquoi',
        columns: ['id', 'numero', 'titre', 'ordre'],
        fields: [
            { name: 'numero', label: 'Numéro (01, 02...)', type: 'text', required: true },
            { name: 'titre', label: 'Titre', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    temoignages: {
        endpoint: '/api/admin/temoignages',
        columns: ['id', 'nom', 'role', 'initiales', 'etoiles'],
        fields: [
            { name: 'nom', label: 'Nom', type: 'text', required: true },
            { name: 'role', label: 'Rôle / Poste', type: 'text', required: true },
            { name: 'texte', label: 'Témoignage', type: 'textarea', required: true },
            { name: 'initiales', label: 'Initiales', type: 'text', required: true, placeholder: 'JK' },
            { name: 'etoiles', label: 'Étoiles (0-5)', type: 'number' }
        ]
    },
    equipe: {
        endpoint: '/api/admin/equipe',
        columns: ['id', 'nom', 'role', 'ordre'],
        fields: [
            { name: 'nom', label: 'Nom', type: 'text', required: true },
            { name: 'role', label: 'Rôle', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'linkedin', label: 'LinkedIn URL', type: 'text' },
            { name: 'facebook', label: 'Facebook URL', type: 'text' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    cours_pdfs: {
        endpoint: '/api/admin/cours-pdfs',
        columns: ['id', 'titre', 'categorie', 'fichier_nom', 'taille', 'formation_id', 'ordre'],
        hasFile: true,
        fields: [
            { name: 'titre', label: 'Titre du document', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'categorie', label: 'Catégorie', type: 'select', options: ['general', 'leadership', 'management', 'developpement', 'coaching', 'autre'] },
            { name: 'fichier', label: 'Fichier PDF', type: 'file', accept: '.pdf,application/pdf' },
            { name: 'formation_id', label: 'ID Formation liée (optionnel)', type: 'number' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    cours_live: {
        endpoint: '/api/admin/cours-live',
        hasImage: true,
        columns: ['id', 'titre', 'formateur', 'date_cours', 'heure_debut', 'statut', 'plateforme', 'image', 'ordre'],
        fields: [
            { name: 'titre', label: 'Titre du cours', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea', required: true },
            { name: 'formateur', label: 'Formateur', type: 'text', required: true },
            { name: 'date_cours', label: 'Date (AAAA-MM-JJ)', type: 'text', required: true, placeholder: '2026-04-15' },
            { name: 'heure_debut', label: 'Heure début (HH:MM)', type: 'text', required: true, placeholder: '18:00' },
            { name: 'heure_fin', label: 'Heure fin (HH:MM)', type: 'text', required: true, placeholder: '20:00' },
            { name: 'lien', label: 'Lien Zoom/Meet (visible membres uniquement)', type: 'text', placeholder: 'https://zoom.us/j/...' },
            { name: 'plateforme', label: 'Plateforme', type: 'select', options: ['Zoom', 'Google Meet', 'Microsoft Teams', 'YouTube Live', 'Autre'] },
            { name: 'statut', label: 'Statut', type: 'select', options: ['planifie', 'en_cours', 'termine'], required: true },
            { name: 'max_participants', label: 'Max participants', type: 'number' },
            { name: 'image', label: 'Image de couverture', type: 'file', accept: 'image/*' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },

    // ===== CONTENU ÉDITORIAL DES PAGES =====
    // Rappel de la convention de mise en forme, reprise dans chaque aide :
    //   *texte* surligné en doré · **texte** gras · _texte_ italique
    section_entetes: {
        endpoint: '/api/admin/section-entetes',
        noCreate: true,
        noDelete: true,
        aide: 'Liste fixe : ces en-têtes correspondent aux sections du site. '
            + 'Dans un titre, <strong>*texte*</strong> apparaît surligné en doré.',
        columns: ['id', 'cle', 'tag', 'titre', 'description', 'ordre'],
        fields: [
            { name: 'tag', label: 'Petit libellé au-dessus du titre', type: 'text' },
            { name: 'titre', label: 'Titre (utilisez *mot* pour surligner)', type: 'text', required: true },
            { name: 'description', label: 'Phrase de présentation', type: 'textarea' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    apropos_blocs: {
        endpoint: '/api/admin/apropos-blocs',
        aide: 'Blocs de texte de la page À Propos. <strong>**gras**</strong>, <strong>_italique_</strong>, <strong>*surligné*</strong>.',
        columns: ['id', 'titre', 'texte', 'ordre'],
        fields: [
            { name: 'titre', label: 'Titre du bloc', type: 'text', required: true },
            { name: 'texte', label: 'Texte', type: 'textarea', required: true },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    apropos_valeurs: {
        endpoint: '/api/admin/apropos-valeurs',
        aide: 'Les valeurs affichées en regard du texte À Propos (Guider, Motiver…).',
        columns: ['id', 'icon', 'titre', 'texte', 'ordre'],
        fields: [
            { name: 'icon', label: 'Icône (classe Font Awesome)', type: 'text', required: true, placeholder: 'fas fa-compass' },
            { name: 'titre', label: 'Intitulé', type: 'text', required: true },
            { name: 'texte', label: 'Description courte', type: 'text', required: true },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    contact_infos: {
        endpoint: '/api/admin/contact-infos',
        aide: 'Coordonnées affichées sur la page Contact.',
        columns: ['id', 'icon', 'label', 'valeur', 'ordre'],
        fields: [
            { name: 'icon', label: 'Icône (classe Font Awesome)', type: 'text', required: true, placeholder: 'fas fa-phone' },
            { name: 'label', label: 'Libellé', type: 'text', required: true, placeholder: 'Téléphone' },
            { name: 'valeur', label: 'Valeur', type: 'text', required: true },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    reseaux_sociaux: {
        endpoint: '/api/admin/reseaux-sociaux',
        aide: 'Liens affichés dans le pied de page et sur la page Contact.',
        columns: ['id', 'icon', 'nom', 'url', 'ordre'],
        fields: [
            { name: 'icon', label: 'Icône (classe Font Awesome)', type: 'text', required: true, placeholder: 'fab fa-facebook-f' },
            { name: 'nom', label: 'Nom du réseau', type: 'text', required: true },
            { name: 'url', label: 'Adresse du profil', type: 'text', placeholder: 'https://...' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    footer_liens: {
        endpoint: '/api/admin/footer-liens',
        aide: 'Liens des deux colonnes du pied de page. Le groupe détermine la colonne.',
        columns: ['id', 'groupe', 'libelle', 'url', 'ordre'],
        fields: [
            { name: 'groupe', label: 'Colonne', type: 'select', options: ['liens', 'formations'], required: true },
            { name: 'libelle', label: 'Texte du lien', type: 'text', required: true },
            { name: 'url', label: 'Destination', type: 'text', placeholder: '/formations' },
            { name: 'ordre', label: 'Ordre', type: 'number' }
        ]
    },
    page_seo: {
        endpoint: '/api/admin/page-seo',
        noCreate: true,
        noDelete: true,
        aide: 'Liste fixe : une ligne par page du site. Ces textes apparaissent dans '
            + "l'onglet du navigateur et dans les résultats de recherche.",
        columns: ['id', 'page', 'titre', 'description'],
        fields: [
            { name: 'titre', label: 'Titre de la page', type: 'text', required: true },
            { name: 'description', label: 'Description (environ 160 caractères)', type: 'textarea' }
        ]
    }
};

// ===== CRUD SECTION RENDERER =====
let currentSection = '';
let currentEditId = null;

async function renderCrudSection(section) {
    const config = crudConfig[section];
    if (!config) { content.innerHTML = '<p>Section inconnue</p>'; return; }
    currentSection = section;

    const data = await apiFetch(config.endpoint);

    // Listes fixes : le jeu de lignes appartient aux gabarits du site, l'admin
    // n'en modifie que le contenu. On masque donc Ajouter et Supprimer plutôt
    // que de laisser l'utilisateur buter sur un refus du serveur.
    let tableHTML = `
        <div class="table-header">
            <h2>${sectionTitles[section]} (${data.length})</h2>
            ${config.noCreate ? '' : '<button class="btn-admin-primary btn-sm" onclick="openCrudModal()"><i class="fas fa-plus"></i> Ajouter</button>'}
        </div>
        ${config.aide ? `<p class="admin-hint"><i class="fas fa-info-circle"></i> ${config.aide}</p>` : ''}
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr>`;

    config.columns.forEach(col => { tableHTML += `<th>${escapeHTML(col)}</th>`; });
    tableHTML += `<th>Actions</th></tr></thead><tbody>`;

    data.forEach(row => {
        tableHTML += '<tr>';
        config.columns.forEach(col => {
            let val = row[col] != null ? String(row[col]) : '';
            if (col === 'image' && row[col]) {
                tableHTML += `<td><img src="${escapeHTML(row[col])}" alt="img" style="height:40px;border-radius:4px;"></td>`;
            } else {
                if (val.length > 60) val = val.substring(0, 57) + '...';
                tableHTML += `<td title="${escapeHTML(String(row[col] || ''))}">${escapeHTML(val)}</td>`;
            }
        });
        tableHTML += `<td class="actions-cell">
            <button class="btn-icon edit" title="Modifier" onclick="openCrudModal(${row.id})"><i class="fas fa-pen"></i></button>
            ${config.noDelete ? '' : `<button class="btn-icon delete" title="Supprimer" onclick="openDeleteModal(${row.id})"><i class="fas fa-trash"></i></button>`}
        </td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    content.innerHTML = tableHTML;
}

// ===== READ-ONLY SECTION =====
async function renderReadOnly(section, columns) {
    const data = await apiFetch(`/api/admin/${section}`);
    let tableHTML = `
        <div class="table-header">
            <h2>${sectionTitles[section]} (${data.length})</h2>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr>`;

    columns.forEach(col => { tableHTML += `<th>${escapeHTML(col)}</th>`; });
    tableHTML += `<th>Actions</th></tr></thead><tbody>`;

    data.forEach(row => {
        tableHTML += '<tr>';
        columns.forEach(col => {
            let val = row[col] != null ? String(row[col]) : '';
            if (val.length > 60) val = val.substring(0, 57) + '...';
            tableHTML += `<td title="${escapeHTML(String(row[col] || ''))}">${escapeHTML(val)}</td>`;
        });
        tableHTML += `<td class="actions-cell">
            <button class="btn-icon delete" title="Supprimer" onclick="deleteReadOnly('${section}', ${row.id})"><i class="fas fa-trash"></i></button>
        </td></tr>`;
    });

    tableHTML += '</tbody></table></div>';
    content.innerHTML = tableHTML;
}

async function deleteReadOnly(section, id) {
    if (!confirm('Supprimer cet élément ?')) return;
    try {
        await apiFetch(`/api/admin/${section}/${id}`, { method: 'DELETE' });
        notify('Supprimé avec succès');
        loadSection(section);
    } catch (err) { notify(err.message, 'error'); }
}

// ===== MESSAGES SECTION =====
async function renderMessages() {
    const data = await apiFetch('/api/admin/messages');
    let html = `<div class="table-header"><h2>Messages (${data.length})</h2></div><div class="table-wrapper"><table class="data-table">
        <thead><tr><th>ID</th><th>Nom</th><th>Email</th><th>Formation</th><th>Date</th><th>Statut</th><th>Actions</th></tr></thead><tbody>`;

    data.forEach(row => {
        const badge = row.lu ? '<span class="badge badge-green">Lu</span>' : '<span class="badge badge-red">Non lu</span>';
        html += `<tr>
            <td>${row.id}</td>
            <td>${escapeHTML(row.nom)}</td>
            <td>${escapeHTML(row.email)}</td>
            <td>${escapeHTML(row.formation || '-')}</td>
            <td>${escapeHTML(row.date_envoi || '')}</td>
            <td>${badge}</td>
            <td class="actions-cell">
                <button class="btn-icon view" title="Voir" onclick="viewMessage(${row.id})"><i class="fas fa-eye"></i></button>
                ${!row.lu ? `<button class="btn-icon edit" title="Marquer lu" onclick="markRead(${row.id})"><i class="fas fa-check"></i></button>` : ''}
                <button class="btn-icon delete" title="Supprimer" onclick="deleteReadOnly('messages', ${row.id})"><i class="fas fa-trash"></i></button>
            </td></tr>`;
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

async function viewMessage(id) {
    try {
        const msgs = await apiFetch('/api/admin/messages');
        const msg = msgs.find(m => m.id === id);
        if (!msg) return;
        alert(`De: ${msg.nom} (${msg.email})\nTel: ${msg.telephone || '-'}\nFormation: ${msg.formation || '-'}\n\n${msg.message}`);
    } catch (err) { notify(err.message, 'error'); }
}

async function markRead(id) {
    try {
        await apiFetch(`/api/admin/messages/${id}/read`, { method: 'PUT' });
        notify('Message marqué comme lu');
        loadSection('messages');
    } catch (err) { notify(err.message, 'error'); }
}

// ===== MEMBRES SECTION =====
const typeMembreLabels = {
    sympathisant: 'Sympathisant',
    actif: 'Actif',
    tres_actif: 'Très Actif',
    honoraire: 'Honoraire'
};
const typeMembreBadge = {
    sympathisant: 'badge-gray',
    actif: 'badge-blue',
    tres_actif: 'badge-green',
    honoraire: 'badge-gold'
};

async function renderMembres() {
    const data = await apiFetch('/api/admin/membres');
    let html = `<div class="table-header"><h2>Membres (${data.length})</h2></div><div class="table-wrapper"><table class="data-table">
        <thead><tr><th>ID</th><th>Nom</th><th>Prénom</th><th>Email</th><th>Téléphone</th><th>Type</th><th>Ville</th><th>Profession</th><th>Date</th><th>Actions</th></tr></thead><tbody>`;

    data.forEach(row => {
        const label = typeMembreLabels[row.type_membre] || row.type_membre;
        const badge = typeMembreBadge[row.type_membre] || 'badge-gray';
        html += `<tr>
            <td>${row.id}</td>
            <td>${escapeHTML(row.nom)}</td>
            <td>${escapeHTML(row.prenom)}</td>
            <td>${escapeHTML(row.email)}</td>
            <td>${escapeHTML(row.telephone)}</td>
            <td><span class="badge ${badge}">${escapeHTML(label)}</span></td>
            <td>${escapeHTML(row.ville || '-')}</td>
            <td>${escapeHTML(row.profession || '-')}</td>
            <td>${escapeHTML(row.date_inscription || '')}</td>
            <td class="actions-cell">
                <button class="btn-icon edit" title="Changer type" onclick="changeMembreType(${row.id}, '${escapeHTML(row.type_membre)}')"><i class="fas fa-exchange-alt"></i></button>
                <button class="btn-icon delete" title="Supprimer" onclick="deleteReadOnly('membres', ${row.id})"><i class="fas fa-trash"></i></button>
            </td></tr>`;
    });

    html += '</tbody></table></div>';
    content.innerHTML = html;
}

async function changeMembreType(id, currentType) {
    const types = ['sympathisant', 'actif', 'tres_actif', 'honoraire'];
    const labels = ['Sympathisant', 'Actif', 'Très Actif', 'Honoraire'];
    const choice = prompt(`Type actuel : ${typeMembreLabels[currentType]}\n\nChoisir un nouveau type :\n1 - Sympathisant\n2 - Actif\n3 - Très Actif\n4 - Honoraire\n\nEntrez le numéro :`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx > 3) { notify('Choix invalide', 'error'); return; }
    try {
        await apiFetch(`/api/admin/membres/${id}`, { method: 'PUT', body: JSON.stringify({ type_membre: types[idx] }) });
        notify(`Type changé en ${labels[idx]}`);
        loadSection('membres');
    } catch (err) { notify(err.message, 'error'); }
}

// ===== HERO SLIDES SECTION =====
async function renderHeroSlides() {
    const data = await apiFetch('/api/admin/hero-slides');
    let html = `
        <div class="table-header">
            <h2><i class="fas fa-images"></i> Carousel Hero (${data.length})</h2>
            <label class="btn-admin-primary btn-sm" style="cursor:pointer"><i class="fas fa-plus"></i> Ajouter des images
                <input type="file" accept="image/*" id="heroSlideUpload" style="display:none" multiple>
            </label>
        </div>
        <p style="color:#666;margin-bottom:16px;font-size:0.9rem">Ces images s'affichent en diaporama dans la section d'accueil. Ajoutez plusieurs images pour créer un défilement automatique.</p>`;

    if (data.length === 0) {
        html += `<div class="empty-state"><i class="fas fa-image" style="font-size:3rem;color:#ccc;margin-bottom:12px"></i><p>Aucune image dans le carousel.<br>Cliquez sur "Ajouter des images" pour commencer.</p></div>`;
    } else {
        html += `<table class="admin-table hero-table">
            <thead>
                <tr>
                    <th style="width:60px">#</th>
                    <th style="width:120px">Aperçu</th>
                    <th>URL de l'image</th>
                    <th style="width:100px">Ordre</th>
                    <th style="width:140px">Actions</th>
                </tr>
            </thead>
            <tbody>`;
        data.forEach((slide, idx) => {
            html += `<tr>
                <td><strong>${idx + 1}</strong></td>
                <td><img src="${escapeHTML(slide.image)}" alt="Slide ${idx + 1}" class="hero-table-thumb"></td>
                <td class="hero-url-cell"><span class="hero-url-text" title="${escapeHTML(slide.image)}">${escapeHTML(slide.image)}</span></td>
                <td>
                    <input type="number" class="hero-order-input" value="${slide.ordre}" min="0"
                        onchange="updateHeroSlideOrder(${slide.id}, this.value)">
                </td>
                <td>
                    <div class="hero-action-btns">
                        <button class="btn-icon-sm primary" title="Monter" onclick="moveHeroSlide(${slide.id}, 'up')" ${idx === 0 ? 'disabled' : ''}>
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button class="btn-icon-sm primary" title="Descendre" onclick="moveHeroSlide(${slide.id}, 'down')" ${idx === data.length - 1 ? 'disabled' : ''}>
                            <i class="fas fa-arrow-down"></i>
                        </button>
                        <button class="btn-icon-sm danger" title="Supprimer" onclick="deleteHeroSlide(${slide.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
    }

    content.innerHTML = html;

    document.getElementById('heroSlideUpload').addEventListener('change', async function() {
        const files = this.files;
        if (!files.length) return;
        notify('Upload en cours...', 'info');
        let reussis = 0;
        const echecs = [];
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData();
            fd.append('image', files[i]);
            fd.append('ordre', data.length + i);
            const token = localStorage.getItem('morec_admin_token');
            try {
                const res = await fetch('/api/admin/hero-slides', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: fd
                });
                // Sans cette vérification, un rejet (type de fichier, taille)
                // était annoncé comme un succès.
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    echecs.push(`${files[i].name} : ${err.error || 'refusé (' + res.status + ')'}`);
                } else {
                    reussis++;
                }
            } catch (err) { echecs.push(`${files[i].name} : ${err.message}`); }
        }
        if (echecs.length) notify(`${reussis} ajoutée(s), ${echecs.length} refusée(s). ${echecs[0]}`, 'error');
        else notify(`${reussis} image(s) ajoutée(s) avec succès`);
        loadSection('hero_slides');
    });
}

async function updateHeroSlideOrder(id, newOrder) {
    try {
        const fd = new FormData();
        fd.append('ordre', parseInt(newOrder));
        const token = localStorage.getItem('morec_admin_token');
        const res = await fetch(`/api/admin/hero-slides/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        notify('Ordre mis à jour');
        loadSection('hero_slides');
    } catch (err) { notify(err.message, 'error'); }
}

// Permutation avec le voisin, et non « ordre ± 1 » sur une seule ligne :
// l'ancienne version produisait deux slides de même ordre, donc un tri instable.
async function moveHeroSlide(id, direction) {
    try {
        const slides = await apiFetch('/api/admin/hero-slides');
        const index = slides.findIndex(s => s.id === id);
        if (index === -1) return;
        const voisin = slides[direction === 'up' ? index - 1 : index + 1];
        if (!voisin) return; // déjà en bout de liste
        await apiFetch(`/api/admin/hero-slides/${id}/swap/${voisin.id}`, { method: 'PUT' });
        notify('Ordre mis à jour');
        loadSection('hero_slides');
    } catch (err) { notify(err.message, 'error'); }
}

async function deleteHeroSlide(id) {
    if (!confirm('Supprimer cette image du carousel ?')) return;
    try {
        await apiFetch(`/api/admin/hero-slides/${id}`, { method: 'DELETE' });
        notify('Image supprimée');
        loadSection('hero_slides');
    } catch (err) { notify(err.message, 'error'); }
}

// ===== ALBUMS / GALERIE SECTION =====
let currentAdminAlbumId = null;

async function renderAlbums() {
    const data = await apiFetch('/api/admin/albums');
    let html = `
        <div class="table-header">
            <h2>Galerie Photos — Albums (${data.length})</h2>
            <button class="btn-admin-primary btn-sm" onclick="openAlbumForm()"><i class="fas fa-plus"></i> Nouvel Album</button>
        </div>
        <div class="albums-admin-grid">`;

    data.forEach(album => {
        html += `<div class="admin-album-card">
            <div class="admin-album-cover">
                ${album.cover_image ? `<img src="${escapeHTML(album.cover_image)}" alt="${escapeHTML(album.titre)}">` : '<div class="admin-album-placeholder"><i class="fas fa-images"></i></div>'}
            </div>
            <div class="admin-album-info">
                <h4>${escapeHTML(album.titre)}</h4>
                <p>${escapeHTML(album.description || '')}</p>
                <span class="admin-album-meta"><i class="fas fa-camera"></i> ${album.photoCount || 0} photos ${album.date_album ? '• ' + escapeHTML(album.date_album) : ''}</span>
            </div>
            <div class="admin-album-actions">
                <button class="btn-admin-primary btn-sm" onclick="openAlbumPhotos(${album.id}, '${escapeHTML(album.titre).replace(/'/g, "\\'")}')"><i class="fas fa-images"></i> Photos</button>
                <button class="btn-icon edit" title="Modifier" onclick="openAlbumForm(${album.id})"><i class="fas fa-pen"></i></button>
                <button class="btn-icon delete" title="Supprimer" onclick="deleteAlbum(${album.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    });

    html += '</div>';
    // Hidden album form
    html += `<div id="albumFormContainer" class="hidden" style="margin-top:24px;background:var(--gray-50);padding:24px;border-radius:12px;">
        <h3 id="albumFormTitle">Nouvel Album</h3>
        <form id="albumForm" style="display:grid;gap:12px;max-width:500px;">
            <div class="form-group"><label>Titre *</label><input type="text" name="titre" required></div>
            <div class="form-group"><label>Description</label><textarea name="description" rows="2"></textarea></div>
            <div class="form-group"><label>Date</label><input type="text" name="date_album" placeholder="Avr 2026"></div>
            <div class="form-group"><label>Image de couverture</label><input type="file" name="cover_image" accept="image/*"></div>
            <div class="form-group"><label>Ordre</label><input type="number" name="ordre" value="0"></div>
            <div style="display:flex;gap:8px">
                <button type="submit" class="btn-admin-primary btn-sm"><i class="fas fa-save"></i> Enregistrer</button>
                <button type="button" class="btn-admin-secondary btn-sm" onclick="document.getElementById('albumFormContainer').classList.add('hidden')">Annuler</button>
            </div>
        </form>
    </div>`;

    // Album photos panel
    html += `<div id="albumPhotosPanel" class="hidden" style="margin-top:24px;background:var(--gray-50);padding:24px;border-radius:12px;">
        <div class="table-header" style="margin-bottom:16px">
            <h3 id="albumPhotosTitle">Photos de l'album</h3>
            <label class="btn-admin-primary btn-sm" style="cursor:pointer"><i class="fas fa-plus"></i> Ajouter des photos
                <input type="file" accept="image/*" id="albumPhotoUpload" style="display:none" multiple>
            </label>
        </div>
        <div id="albumPhotosGrid" class="admin-photos-grid"></div>
        <button type="button" class="btn-admin-secondary btn-sm" style="margin-top:12px" onclick="document.getElementById('albumPhotosPanel').classList.add('hidden')">Fermer</button>
    </div>`;

    content.innerHTML = html;

    // Album form submit
    document.getElementById('albumForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const fd = new FormData(form);
        const token = localStorage.getItem('morec_admin_token');
        const editId = form.dataset.editId;
        try {
            const url = editId ? `/api/admin/albums/${editId}` : '/api/admin/albums';
            const res = await fetch(url, {
                method: editId ? 'PUT' : 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
            notify(editId ? 'Album modifié' : 'Album créé');
            loadSection('albums');
        } catch (err) { notify(err.message, 'error'); }
    });
}

async function openAlbumForm(editId = null) {
    const container = document.getElementById('albumFormContainer');
    const form = document.getElementById('albumForm');
    const title = document.getElementById('albumFormTitle');
    document.getElementById('albumPhotosPanel').classList.add('hidden');
    container.classList.remove('hidden');
    form.reset();
    form.dataset.editId = editId || '';
    title.textContent = editId ? 'Modifier l\'Album' : 'Nouvel Album';

    if (editId) {
        try {
            const album = await apiFetch(`/api/admin/albums/${editId}`);
            form.querySelector('[name="titre"]').value = album.titre || '';
            form.querySelector('[name="description"]').value = album.description || '';
            form.querySelector('[name="date_album"]').value = album.date_album || '';
            form.querySelector('[name="ordre"]').value = album.ordre || 0;
        } catch {}
    }
}

async function deleteAlbum(id) {
    if (!confirm('Supprimer cet album et toutes ses photos ?')) return;
    try {
        await apiFetch(`/api/admin/albums/${id}`, { method: 'DELETE' });
        notify('Album supprimé');
        loadSection('albums');
    } catch (err) { notify(err.message, 'error'); }
}

async function openAlbumPhotos(albumId, albumTitle) {
    currentAdminAlbumId = albumId;
    document.getElementById('albumFormContainer').classList.add('hidden');
    const panel = document.getElementById('albumPhotosPanel');
    const title = document.getElementById('albumPhotosTitle');
    const grid = document.getElementById('albumPhotosGrid');
    panel.classList.remove('hidden');
    title.textContent = 'Photos — ' + albumTitle;

    try {
        const photos = await apiFetch(`/api/admin/album-photos?album_id=${albumId}`);
        if (photos.length === 0) {
            grid.innerHTML = '<p style="color:#888">Aucune photo. Ajoutez-en !</p>';
        } else {
            grid.innerHTML = photos.map(p =>
                `<div class="admin-photo-card">
                    <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.legende || '')}">
                    ${p.legende ? `<span class="admin-photo-legende">${escapeHTML(p.legende)}</span>` : ''}
                    <button class="btn-icon primary admin-photo-edit" title="Modifier la légende" onclick="editAlbumPhotoLegende(${p.id})"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon delete admin-photo-delete" title="Supprimer" onclick="deleteAlbumPhoto(${p.id})"><i class="fas fa-trash"></i></button>
                </div>`
            ).join('');
        }
    } catch (err) { grid.innerHTML = `<p style="color:red">${escapeHTML(err.message)}</p>`; }

    // Setup upload handler
    const uploadInput = document.getElementById('albumPhotoUpload');
    const newInput = uploadInput.cloneNode(true);
    uploadInput.parentNode.replaceChild(newInput, uploadInput);
    newInput.addEventListener('change', async function() {
        const files = this.files;
        const token = localStorage.getItem('morec_admin_token');
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData();
            fd.append('image', files[i]);
            fd.append('album_id', albumId);
            fd.append('ordre', i);
            try {
                const res = await fetch('/api/admin/album-photos', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: fd
                });
                if (!res.ok) throw new Error('Erreur upload');
            } catch (err) { notify('Erreur: ' + err.message, 'error'); }
        }
        notify('Photo(s) ajoutée(s)');
        openAlbumPhotos(albumId, albumTitle);
    });
}

// La légende d'une photo n'était écrite qu'à l'envoi et n'était plus modifiable,
// faute de route PUT côté serveur.
async function editAlbumPhotoLegende(id) {
    try {
        const photo = await apiFetch(`/api/admin/album-photos/${id}`);
        const legende = prompt('Légende de la photo :', photo.legende || '');
        if (legende === null) return; // annulé
        await apiFetch(`/api/admin/album-photos/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ legende })
        });
        notify('Légende mise à jour');
        const title = document.getElementById('albumPhotosTitle').textContent.replace('Photos — ', '');
        openAlbumPhotos(currentAdminAlbumId, title);
    } catch (err) { notify(err.message, 'error'); }
}

async function deleteAlbumPhoto(id) {
    if (!confirm('Supprimer cette photo ?')) return;
    try {
        await apiFetch(`/api/admin/album-photos/${id}`, { method: 'DELETE' });
        notify('Photo supprimée');
        // Refresh current album photos
        const title = document.getElementById('albumPhotosTitle').textContent.replace('Photos — ', '');
        openAlbumPhotos(currentAdminAlbumId, title);
    } catch (err) { notify(err.message, 'error'); }
}

// ===== CRUD MODAL =====
const crudModal = document.getElementById('crudModal');
const crudForm = document.getElementById('crudForm');
const crudFields = document.getElementById('crudFields');
const crudModalTitle = document.getElementById('crudModalTitle');

document.getElementById('closeCrudModal').addEventListener('click', closeCrudModal);
document.getElementById('cancelCrud').addEventListener('click', closeCrudModal);
crudModal.addEventListener('click', (e) => { if (e.target === crudModal) closeCrudModal(); });

function closeCrudModal() { crudModal.classList.add('hidden'); }

async function openCrudModal(editId = null) {
    const config = crudConfig[currentSection];
    if (!config) return;
    currentEditId = editId;

    crudModalTitle.textContent = editId ? 'Modifier' : 'Ajouter';

    let existingData = {};
    if (editId) {
        try { existingData = await apiFetch(`${config.endpoint}/${editId}`); } catch { }
    }

    let html = '';
    config.fields.forEach(f => {
        const val = existingData[f.name] != null ? existingData[f.name] : '';
        if (f.type === 'file') {
            html += `<div class="form-group"><label>${escapeHTML(f.label)}</label>`;
            if (val && f.accept && f.accept.includes('pdf')) {
                html += `<div style="margin-bottom:8px"><a href="${escapeHTML(String(val))}" target="_blank" style="color:var(--gold)"><i class="fas fa-file-pdf"></i> Fichier actuel</a></div>`;
            } else if (val) {
                html += `<div class="image-preview" style="margin-bottom:8px"><img src="${escapeHTML(String(val))}" alt="preview" style="max-height:120px;border-radius:6px;"></div>`;
            }
            html += `<input type="file" name="${f.name}" accept="${f.accept || 'image/*'}"></div>`;
        } else if (f.type === 'textarea') {
            html += `<div class="form-group"><label>${escapeHTML(f.label)}${f.required ? ' *' : ''}</label><textarea name="${f.name}" ${f.required ? 'required' : ''} rows="3">${escapeHTML(String(val))}</textarea></div>`;
        } else if (f.type === 'select') {
            html += `<div class="form-group"><label>${escapeHTML(f.label)}${f.required ? ' *' : ''}</label><select name="${f.name}" ${f.required ? 'required' : ''}>`;
            (f.options || []).forEach(opt => {
                html += `<option value="${escapeHTML(opt)}" ${val === opt ? 'selected' : ''}>${escapeHTML(opt)}</option>`;
            });
            html += `</select></div>`;
        } else {
            html += `<div class="form-group"><label>${escapeHTML(f.label)}${f.required ? ' *' : ''}</label><input type="${f.type}" name="${f.name}" value="${escapeHTML(String(val))}" ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${escapeHTML(f.placeholder)}"` : ''}></div>`;
        }
    });

    crudFields.innerHTML = html;
    crudModal.classList.remove('hidden');
}

crudForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const config = crudConfig[currentSection];
    if (!config) return;

    const hasFile = (config.hasImage || config.hasFile) && crudForm.querySelector('input[type="file"]');
    const fileInput = hasFile ? crudForm.querySelector('input[type="file"]') : null;
    const hasNewFile = fileInput && fileInput.files.length > 0;

    let fetchOptions;
    if (hasNewFile) {
        // Use FormData for multipart upload
        const fd = new FormData(crudForm);
        fetchOptions = { method: currentEditId ? 'PUT' : 'POST', body: fd };
    } else {
        // Use JSON (exclude file fields)
        const formData = Object.fromEntries(
            [...new FormData(crudForm).entries()].filter(([k]) => {
                const field = config.fields.find(f => f.name === k);
                return !field || field.type !== 'file';
            })
        );
        config.fields.forEach(f => {
            if (f.type === 'number' && formData[f.name] !== undefined && formData[f.name] !== '') {
                formData[f.name] = Number(formData[f.name]);
            }
        });
        fetchOptions = { method: currentEditId ? 'PUT' : 'POST', body: JSON.stringify(formData) };
    }

    try {
        const url = currentEditId ? `${config.endpoint}/${currentEditId}` : config.endpoint;
        if (hasNewFile) {
            // Direct fetch for multipart (no Content-Type header)
            const token = localStorage.getItem('morec_admin_token');
            const res = await fetch(url, {
                ...fetchOptions,
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: res.statusText }));
                throw new Error(err.error || 'Erreur serveur');
            }
        } else {
            await apiFetch(url, fetchOptions);
        }
        notify(currentEditId ? 'Modifié avec succès' : 'Ajouté avec succès');
        closeCrudModal();
        loadSection(currentSection);
    } catch (err) { notify(err.message, 'error'); }
});

// ===== DELETE MODAL =====
const deleteModal = document.getElementById('deleteModal');
let deleteTargetId = null;

document.getElementById('cancelDelete').addEventListener('click', () => deleteModal.classList.add('hidden'));
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) deleteModal.classList.add('hidden'); });

function openDeleteModal(id) {
    deleteTargetId = id;
    deleteModal.classList.remove('hidden');
}

document.getElementById('confirmDelete').addEventListener('click', async () => {
    const config = crudConfig[currentSection];
    if (!config || !deleteTargetId) return;
    try {
        await apiFetch(`${config.endpoint}/${deleteTargetId}`, { method: 'DELETE' });
        notify('Supprimé avec succès');
        deleteModal.classList.add('hidden');
        loadSection(currentSection);
    } catch (err) { notify(err.message, 'error'); }
});

// ===== ESCAPE KEY =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCrudModal();
        deleteModal.classList.add('hidden');
    }
});
