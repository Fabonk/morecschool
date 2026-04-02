// ===== MOREC Admin Panel =====
const API = '';
let TOKEN = localStorage.getItem('morec_admin_token') || '';

// ===== UTILITY =====
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
        throw new Error('Le serveur est en cours de démarrage. Veuillez patienter quelques secondes et réessayer.');
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
document.getElementById('sidebarToggle').addEventListener('click', () => sidebar.classList.toggle('open'));

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        sidebar.classList.remove('open');
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
    inscriptions: 'Inscriptions', membres: 'Membres', messages: 'Messages', scores: 'Scores Quiz'
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
        columns: ['id', 'titre', 'formateur', 'date_cours', 'heure_debut', 'statut', 'plateforme', 'ordre'],
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
            { name: 'ordre', label: 'Ordre', type: 'number' }
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

    let tableHTML = `
        <div class="table-header">
            <h2>${sectionTitles[section]} (${data.length})</h2>
            <button class="btn-admin-primary btn-sm" onclick="openCrudModal()"><i class="fas fa-plus"></i> Ajouter</button>
        </div>
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
            <button class="btn-icon delete" title="Supprimer" onclick="openDeleteModal(${row.id})"><i class="fas fa-trash"></i></button>
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
            <h2>Carousel Hero (${data.length})</h2>
            <label class="btn-admin-primary btn-sm" style="cursor:pointer"><i class="fas fa-plus"></i> Ajouter une image
                <input type="file" accept="image/*" id="heroSlideUpload" style="display:none" multiple>
            </label>
        </div>
        <p style="color:#666;margin-bottom:16px;font-size:0.9rem">Ces images s'affichent en arrière-plan de la section d'accueil (hero). Ajoutez plusieurs images pour créer un carousel automatique.</p>
        <div class="hero-slides-grid">`;

    data.forEach(slide => {
        html += `<div class="admin-slide-card">
            <img src="${escapeHTML(slide.image)}" alt="Slide">
            <div class="admin-slide-actions">
                <span class="admin-slide-order">Ordre: ${slide.ordre}</span>
                <button class="btn-icon delete" title="Supprimer" onclick="deleteHeroSlide(${slide.id})"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    });

    html += '</div>';
    content.innerHTML = html;

    document.getElementById('heroSlideUpload').addEventListener('change', async function() {
        const files = this.files;
        for (let i = 0; i < files.length; i++) {
            const fd = new FormData();
            fd.append('image', files[i]);
            fd.append('ordre', data.length + i);
            const token = localStorage.getItem('morec_admin_token');
            try {
                await fetch('/api/admin/hero-slides', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: fd
                });
            } catch (err) { notify('Erreur upload: ' + err.message, 'error'); }
        }
        notify('Image(s) ajoutée(s)');
        loadSection('hero_slides');
    });
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
