// Filtres d'événements et modal d'inscription.
// Inclus sur /evenements et sur l'accueil (qui affiche un aperçu).
(function () {
    'use strict';
    const { API, notify } = window.MOREC;

    // ===== Filtres par catégorie =====
    const filtres = document.querySelectorAll('.event-filter');
    if (filtres.length) {
        filtres.forEach(bouton => {
            bouton.addEventListener('click', () => {
                filtres.forEach(b => b.classList.remove('active'));
                bouton.classList.add('active');
                const cible = bouton.dataset.filter;
                document.querySelectorAll('.event-card').forEach(carte => {
                    const visible = cible === 'all' || carte.dataset.category === cible;
                    carte.classList.toggle('hidden', !visible);
                });
            });
        });
    }

    // ===== Modal d'inscription =====
    const modal = document.getElementById('modalInscription');
    if (!modal) return;

    const form = document.getElementById('formInscription');
    const fermer = document.getElementById('closeInscription');
    const nomEvent = document.getElementById('modalEventName');
    const dateEvent = document.getElementById('modalEventDate');
    const lieuEvent = document.getElementById('modalEventLieu');

    // Délégation : les boutons viennent du rendu serveur, mais la délégation
    // reste robuste si la liste est un jour rafraîchie côté client.
    document.addEventListener('click', (e) => {
        const bouton = e.target.closest('.btn-inscription');
        if (!bouton) return;
        if (nomEvent) nomEvent.textContent = bouton.dataset.event || '';
        if (dateEvent) dateEvent.textContent = bouton.dataset.date || '';
        if (lieuEvent) lieuEvent.textContent = bouton.dataset.lieu || '';
        modal.dataset.eventId = bouton.dataset.eventId || '';
        modal.classList.add('active');
    });

    if (fermer) fermer.addEventListener('click', () => modal.classList.remove('active'));
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        const labelInitial = submit ? submit.innerHTML : '';
        if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }
        try {
            const donnees = Object.fromEntries(new FormData(form).entries());
            donnees.evenement_nom = nomEvent ? nomEvent.textContent : '';
            if (modal.dataset.eventId) donnees.evenement_id = modal.dataset.eventId;
            const res = await fetch(`${API}/api/inscriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(donnees)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "L'inscription a échoué");
            notify('Inscription enregistrée. À bientôt !');
            form.reset();
            modal.classList.remove('active');
        } catch (err) {
            notify(err.message, 'error');
        } finally {
            if (submit) { submit.disabled = false; submit.innerHTML = labelInitial; }
        }
    });
})();
