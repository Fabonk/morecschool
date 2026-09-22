// Page Contact : envoi du formulaire et préselection de la formation via ?formation=
(function () {
    'use strict';
    const { API, notify } = window.MOREC;

    // Les cartes de formation renvoient vers /contact?formation=…
    const params = new URLSearchParams(window.location.search);
    const formationDemandee = params.get('formation');
    const select = document.getElementById('contactFormation');
    if (formationDemandee && select) {
        const option = [...select.options].find(o => o.value === formationDemandee);
        if (option) select.value = formationDemandee;
    }

    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        const labelInitial = submit ? submit.innerHTML : '';
        if (submit) { submit.disabled = true; submit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }
        try {
            const donnees = Object.fromEntries(new FormData(form).entries());
            const res = await fetch(`${API}/api/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(donnees)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "L'envoi a échoué");
            notify('Message envoyé. Nous vous répondrons rapidement.');
            form.reset();
        } catch (err) {
            notify(err.message, 'error');
        } finally {
            if (submit) { submit.disabled = false; submit.innerHTML = labelInitial; }
        }
    });
})();
