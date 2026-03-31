// ============================================================
//  COURS LIVE — Member-only page logic
// ============================================================

const API = window.location.origin;
const MEMBER_TOKEN_KEY = 'morec_member_token';
const MEMBER_DATA_KEY = 'morec_member_data';

// ===== State =====
let memberToken = localStorage.getItem(MEMBER_TOKEN_KEY);
let memberData = JSON.parse(localStorage.getItem(MEMBER_DATA_KEY) || 'null');
let allCours = [];

// ===== Toast =====
function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    toast.className = 'cl-toast ' + type;
    toastMsg.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ===== Auth helpers =====
function saveMember(token, data) {
    memberToken = token;
    memberData = data;
    localStorage.setItem(MEMBER_TOKEN_KEY, token);
    localStorage.setItem(MEMBER_DATA_KEY, JSON.stringify(data));
}

function clearMember() {
    memberToken = null;
    memberData = null;
    localStorage.removeItem(MEMBER_TOKEN_KEY);
    localStorage.removeItem(MEMBER_DATA_KEY);
}

function getInitials(nom, prenom) {
    return ((prenom?.[0] || '') + (nom?.[0] || '')).toUpperCase();
}

function getTypeBadge(type) {
    const labels = {
        sympathisant: 'Sympathisant',
        actif: 'Membre Actif',
        tres_actif: 'Membre Très Actif',
        honoraire: 'Membre Honoraire'
    };
    return labels[type] || type;
}

// ===== Login Modal =====
function initLoginModal() {
    const modal = document.getElementById('loginModal');
    const btnShow = document.getElementById('btnShowLogin');
    const btnGuest = document.getElementById('btnGuestLogin');
    const btnClose = document.getElementById('closeLogin');
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');

    function openLogin() { modal.classList.add('active'); errorDiv.classList.add('hidden'); }
    function closeLogin() { modal.classList.remove('active'); }

    if (btnShow) btnShow.addEventListener('click', openLogin);
    if (btnGuest) btnGuest.addEventListener('click', openLogin);
    if (btnClose) btnClose.addEventListener('click', closeLogin);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeLogin(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            errorDiv.textContent = 'Veuillez remplir tous les champs.';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            const resp = await fetch(`${API}/api/membres/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await resp.json();

            if (resp.ok) {
                saveMember(data.token, data.membre);
                closeLogin();
                showToast(`Bienvenue, ${data.membre.prenom} !`, 'success');
                updateUI();
                loadCoursLive();
            } else {
                errorDiv.textContent = data.error || 'Identifiants incorrects.';
                errorDiv.classList.remove('hidden');
            }
        } catch (err) {
            errorDiv.textContent = 'Erreur de connexion au serveur.';
            errorDiv.classList.remove('hidden');
        }
    });
}

// ===== Logout =====
function initLogout() {
    document.getElementById('btnLogout').addEventListener('click', () => {
        clearMember();
        showToast('Déconnexion réussie.', 'info');
        updateUI();
    });
}

// ===== Update UI based on auth state =====
function updateUI() {
    const navRight = document.getElementById('navRight');
    const guestView = document.getElementById('guestView');
    const memberView = document.getElementById('memberView');

    if (memberToken && memberData) {
        // Logged in
        guestView.classList.add('hidden');
        memberView.classList.remove('hidden');

        // Update nav
        navRight.innerHTML = `
            <a href="/" class="cl-nav-link"><i class="fas fa-home"></i> Accueil</a>
            <span style="color: rgba(255,255,255,0.8); font-size: 0.9rem;">
                <i class="fas fa-user-circle" style="color: var(--gold);"></i> ${memberData.prenom} ${memberData.nom}
            </span>
        `;

        // Update welcome
        document.getElementById('memberAvatar').textContent = getInitials(memberData.nom, memberData.prenom);
        document.getElementById('memberGreeting').textContent = `Bienvenue, ${memberData.prenom} ${memberData.nom}`;
        document.getElementById('memberBadge').textContent = getTypeBadge(memberData.type_membre);
    } else {
        // Guest
        guestView.classList.remove('hidden');
        memberView.classList.add('hidden');

        navRight.innerHTML = `
            <a href="/" class="cl-nav-link"><i class="fas fa-home"></i> Accueil</a>
            <button class="btn-cl btn-login" id="btnShowLogin"><i class="fas fa-sign-in-alt"></i> Connexion Membre</button>
        `;
        // Re-bind event
        document.getElementById('btnShowLogin').addEventListener('click', () => {
            document.getElementById('loginModal').classList.add('active');
        });
    }
}

// ===== Load Cours Live =====
async function loadCoursLive() {
    try {
        const resp = await fetch(`${API}/api/cours-live`);
        allCours = await resp.json();
        updateStats();
        renderCours('all');
    } catch (err) {
        showToast('Erreur de chargement des cours.', 'error');
    }
}

function updateStats() {
    const now = new Date();
    let planifies = 0, enCours = 0, termines = 0;

    allCours.forEach(c => {
        if (c.statut === 'en_cours') enCours++;
        else if (c.statut === 'termine') termines++;
        else planifies++;
    });

    document.getElementById('statProchains').textContent = planifies;
    document.getElementById('statEnCours').textContent = enCours;
    document.getElementById('statTermines').textContent = termines;
}

function renderCours(filter) {
    const grid = document.getElementById('coursesGrid');
    const empty = document.getElementById('emptyState');

    let filtered = allCours;
    if (filter !== 'all') {
        filtered = allCours.filter(c => c.statut === filter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    grid.innerHTML = filtered.map(c => {
        const statusLabel = { planifie: 'Planifié', en_cours: 'En direct', termine: 'Terminé' }[c.statut] || c.statut;
        const dateFormatted = formatDate(c.date_cours);
        const isLive = c.statut === 'en_cours';
        const isTermine = c.statut === 'termine';

        return `
        <div class="cl-card" data-id="${c.id}">
            <div class="cl-card-header">
                <span class="cl-card-status ${c.statut}">${isLive ? '<span class="cl-live-dot"></span> ' : ''}${statusLabel}</span>
                <h3>${escapeHtml(c.titre)}</h3>
                <div class="cl-formateur"><i class="fas fa-user-tie"></i> ${escapeHtml(c.formateur)}</div>
            </div>
            <div class="cl-card-body">
                <p class="cl-desc">${escapeHtml(c.description)}</p>
                <div class="cl-card-meta">
                    <div class="cl-meta-row"><i class="fas fa-calendar-alt"></i> ${dateFormatted}</div>
                    <div class="cl-meta-row"><i class="fas fa-clock"></i> ${c.heure_debut} — ${c.heure_fin}</div>
                    <div class="cl-meta-row"><i class="fas fa-users"></i> ${c.max_participants} participants max</div>
                </div>
            </div>
            <div class="cl-card-footer">
                <span class="cl-plateforme"><i class="fas fa-video"></i> ${escapeHtml(c.plateforme)}</span>
                ${isLive ? `<button class="btn-cl btn-join" onclick="joinCours(${c.id})"><i class="fas fa-broadcast-tower"></i> Rejoindre</button>` :
                  isTermine ? `<span class="btn-cl btn-join disabled"><i class="fas fa-check"></i> Terminé</span>` :
                  `<button class="btn-cl btn-join" onclick="joinCours(${c.id})"><i class="fas fa-eye"></i> Voir détails</button>`}
            </div>
        </div>`;
    }).join('');
}

// ===== Join / view link (member-only) =====
async function joinCours(id) {
    if (!memberToken) {
        document.getElementById('loginModal').classList.add('active');
        return;
    }

    try {
        const resp = await fetch(`${API}/api/cours-live/${id}`, {
            headers: { 'Authorization': `Bearer ${memberToken}` }
        });

        if (resp.status === 401) {
            clearMember();
            showToast('Session expirée. Veuillez vous reconnecter.', 'error');
            updateUI();
            return;
        }

        const cours = await resp.json();

        if (cours.lien) {
            // Open the meeting link
            const confirmJoin = confirm(`Vous allez rejoindre "${cours.titre}" sur ${cours.plateforme}.\n\nLien : ${cours.lien}\n\nOuvrir le lien ?`);
            if (confirmJoin) {
                window.open(cours.lien, '_blank', 'noopener,noreferrer');
            }
        } else {
            showToast('Le lien de ce cours n\'est pas encore disponible. Il sera ajouté avant le début du cours.', 'info');
        }
    } catch (err) {
        showToast('Erreur lors de la récupération des détails.', 'error');
    }
}

// ===== Filters =====
function initFilters() {
    document.querySelectorAll('.cl-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cl-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCours(btn.dataset.filter);
        });
    });
}

// ===== Helpers =====
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// ===== Verify Token on load =====
async function verifyToken() {
    if (!memberToken) return;

    try {
        const resp = await fetch(`${API}/api/membres/me`, {
            headers: { 'Authorization': `Bearer ${memberToken}` }
        });

        if (!resp.ok) {
            clearMember();
        } else {
            const data = await resp.json();
            memberData = { id: data.id, nom: data.nom, prenom: data.prenom, email: data.email, type_membre: data.type_membre };
            localStorage.setItem(MEMBER_DATA_KEY, JSON.stringify(memberData));
        }
    } catch {
        clearMember();
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    await verifyToken();
    updateUI();
    initLoginModal();
    initLogout();
    initFilters();
    await loadCoursLive();
});
