// Page Cours : progression des playlists, lecteur vidéo et évaluations.
// Le balisage des playlists est rendu par le serveur ; ce script ne gère que
// l'interaction. Tous les branchements passent par la délégation, et chaque
// élément est vérifié avant usage : dans l'ancien script.js, un sous-élément
// de modal absent (closeBtn, retryBtn…) provoquait un TypeError malgré la garde
// posée sur le conteneur principal.
(function () {
    'use strict';
    const { API, escapeHTML, notify } = window.MOREC;
    const CLE_PROGRESSION = 'morecPlaylistProgress';

    // ===== Progression, conservée dans le navigateur =====
    let progression = {};
    try {
        const sauvegarde = localStorage.getItem(CLE_PROGRESSION);
        if (sauvegarde) progression = JSON.parse(sauvegarde) || {};
    } catch (e) { progression = {}; }

    function enregistrerProgression() {
        try { localStorage.setItem(CLE_PROGRESSION, JSON.stringify(progression)); } catch (e) { /* mode privé */ }
    }

    function majProgression(slug) {
        const bloc = document.getElementById('playlist-' + slug);
        if (!bloc) return;
        const total = bloc.querySelectorAll('.video-item').length;
        const vues = (progression[slug] || []).length;
        const pct = total > 0 ? Math.round((vues / total) * 100) : 0;

        const barre = bloc.querySelector('.progress-fill');
        const texte = bloc.querySelector('.progress-text');
        const boutonEval = bloc.querySelector('.btn-eval');
        if (barre) barre.style.width = pct + '%';
        if (texte) texte.textContent = `${vues}/${total} vus`;
        if (boutonEval) boutonEval.disabled = vues < total;
    }

    function majToutes() {
        document.querySelectorAll('.playlist-block').forEach(bloc => {
            majProgression(bloc.id.replace('playlist-', ''));
        });
    }

    function marquerVue(slug, index) {
        if (!progression[slug]) progression[slug] = [];
        if (!progression[slug].includes(index)) progression[slug].push(index);
        const item = document.querySelector(`.video-item[data-playlist="${slug}"][data-index="${index}"]`);
        if (item) item.classList.add('watched');
        enregistrerProgression();
        majProgression(slug);
    }

    // Restaure l'état au chargement
    document.querySelectorAll('.video-item').forEach(item => {
        const slug = item.dataset.playlist;
        const index = parseInt(item.dataset.index, 10);
        if (progression[slug] && progression[slug].includes(index)) item.classList.add('watched');
    });
    majToutes();

    // ===== Lecteur vidéo =====
    const modalVideo = document.getElementById('modalVideo');
    if (modalVideo) {
        const titre = document.getElementById('videoPlayerTitle');
        const desc = document.getElementById('videoPlayerDesc');
        const fermer = document.getElementById('closeVideo');
        const marquer = document.getElementById('btnMarkWatched');
        let slugCourant = '';
        let indexCourant = 0;

        document.addEventListener('click', (e) => {
            const item = e.target.closest('.video-item, .btn-watch');
            if (!item) return;
            const ligne = item.closest('.video-item');
            if (!ligne) return;

            slugCourant = ligne.dataset.playlist;
            indexCourant = parseInt(ligne.dataset.index, 10);
            const h4 = ligne.querySelector('h4');
            const p = ligne.querySelector('.video-info p');
            if (titre) titre.textContent = h4 ? h4.textContent : '';
            if (desc) desc.textContent = p ? p.textContent : '';
            modalVideo.classList.add('active');
        });

        if (fermer) fermer.addEventListener('click', () => modalVideo.classList.remove('active'));
        if (marquer) {
            marquer.addEventListener('click', () => {
                marquerVue(slugCourant, indexCourant);
                modalVideo.classList.remove('active');
                notify('Vidéo marquée comme vue.');
            });
        }
    }

    // ===== Évaluations =====
    const modalQuiz = document.getElementById('modalEvaluation');
    if (!modalQuiz) return;

    const nomPlaylist = document.getElementById('quizPlaylistName');
    const compteur = document.getElementById('quizCounter');
    const corps = document.getElementById('quizBody');
    const enonce = document.getElementById('quizQuestion');
    const optionsEl = document.getElementById('quizOptions');
    const barreProgression = document.getElementById('quizProgressFill');
    const zoneBarre = modalQuiz.querySelector('.quiz-progress-bar');
    const zoneNav = modalQuiz.querySelector('.quiz-nav');
    const resultat = document.getElementById('quizResult');
    const fermerQuiz = document.getElementById('closeEvaluation');
    const precedent = document.getElementById('quizPrev');
    const suivant = document.getElementById('quizNext');
    const recommencer = document.getElementById('quizRetry');

    let questions = [];
    let reponses = [];
    let indexQuestion = 0;
    let slugQuiz = '';
    let idPlaylist = null;
    let nomQuiz = '';

    function afficherQuestion() {
        const q = questions[indexQuestion];
        if (!q) return;
        const total = questions.length;

        if (compteur) compteur.textContent = `Question ${indexQuestion + 1} / ${total}`;
        if (barreProgression) barreProgression.style.width = ((indexQuestion + 1) / total * 100) + '%';
        if (enonce) enonce.textContent = q.question;

        const lettres = ['A', 'B', 'C', 'D'];
        const options = [q.option_a, q.option_b, q.option_c, q.option_d];
        if (optionsEl) {
            optionsEl.innerHTML = options.map((opt, i) =>
                `<div class="quiz-option${reponses[indexQuestion] === i ? ' selected' : ''}" data-index="${i}">
                    <span class="option-letter">${lettres[i]}</span><span>${escapeHTML(opt)}</span>
                </div>`).join('');

            optionsEl.querySelectorAll('.quiz-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    optionsEl.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    reponses[indexQuestion] = parseInt(opt.dataset.index, 10);
                });
            });
        }

        if (precedent) precedent.disabled = indexQuestion === 0;
        if (suivant) {
            suivant.innerHTML = indexQuestion === total - 1
                ? '<i class="fas fa-check-circle"></i> Terminer'
                : 'Suivant <i class="fas fa-arrow-right"></i>';
        }
    }

    function afficherResultats() {
        let justes = 0;
        questions.forEach((q, i) => { if (reponses[i] === q.correct_index) justes++; });
        const total = questions.length;
        const pct = Math.round((justes / total) * 100);

        if (corps) corps.style.display = 'none';
        if (compteur) compteur.style.display = 'none';
        if (zoneBarre) zoneBarre.style.display = 'none';
        if (zoneNav) zoneNav.style.display = 'none';
        if (resultat) resultat.classList.remove('hidden');

        const score = document.getElementById('resultScore');
        const cercle = document.getElementById('resultCircle');
        const titreRes = document.getElementById('resultTitle');
        const messageRes = document.getElementById('resultMessage');

        if (score) score.textContent = pct + '%';
        if (cercle) cercle.classList.toggle('fail', pct < 50);
        if (titreRes && messageRes) {
            if (pct >= 80) {
                titreRes.textContent = 'Excellent !';
                messageRes.textContent = `Vous maîtrisez parfaitement ce module. Score : ${justes}/${total}`;
            } else if (pct >= 50) {
                titreRes.textContent = 'Bien joué !';
                messageRes.textContent = `Vous avez une bonne compréhension. Score : ${justes}/${total}. Continuez à progresser !`;
            } else {
                titreRes.textContent = 'À améliorer';
                messageRes.textContent = `Score : ${justes}/${total}. Nous vous recommandons de revoir les vidéos avant de réessayer.`;
            }
        }

        fetch(`${API}/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                playlist_id: idPlaylist,
                playlist_nom: nomQuiz || slugQuiz,
                nom: 'Anonyme',
                email: 'anonyme@morec.com',
                score: justes,
                total,
                pourcentage: pct
            })
        }).catch(() => { /* l'enregistrement du score ne doit pas bloquer l'affichage */ });
    }

    async function demarrerQuiz(slug, playlistId, nom) {
        try {
            const res = await fetch(`${API}/api/quiz/${playlistId}`);
            if (!res.ok) throw new Error('Chargement impossible');
            questions = await res.json();
            if (!questions.length) {
                notify('Aucune question disponible pour cette évaluation.', 'error');
                return;
            }

            slugQuiz = slug;
            idPlaylist = playlistId;
            nomQuiz = nom;
            indexQuestion = 0;
            reponses = new Array(questions.length).fill(-1);

            if (nomPlaylist) nomPlaylist.textContent = nom || slug;
            if (resultat) resultat.classList.add('hidden');
            if (corps) corps.style.display = '';
            if (compteur) compteur.style.display = '';
            if (zoneBarre) zoneBarre.style.display = '';
            if (zoneNav) zoneNav.style.display = '';

            afficherQuestion();
            modalQuiz.classList.add('active');
        } catch (err) {
            notify("Erreur lors du chargement de l'évaluation.", 'error');
        }
    }

    // Délégation plutôt qu'un branchement direct sur chaque .btn-eval :
    // l'ancien code exigeait que le rendu soit terminé avant l'initialisation.
    document.addEventListener('click', (e) => {
        const bouton = e.target.closest('.btn-eval');
        if (!bouton || bouton.disabled) return;
        const bloc = bouton.closest('.playlist-block');
        const h3 = bloc ? bloc.querySelector('h3') : null;
        demarrerQuiz(bouton.dataset.playlist, bouton.dataset.playlistId, h3 ? h3.textContent : '');
    });

    if (fermerQuiz) fermerQuiz.addEventListener('click', () => modalQuiz.classList.remove('active'));
    if (precedent) {
        precedent.addEventListener('click', () => {
            if (indexQuestion > 0) { indexQuestion--; afficherQuestion(); }
        });
    }
    if (suivant) {
        suivant.addEventListener('click', () => {
            if (reponses[indexQuestion] === -1) {
                notify('Veuillez sélectionner une réponse.', 'error');
                return;
            }
            if (indexQuestion < questions.length - 1) { indexQuestion++; afficherQuestion(); }
            else afficherResultats();
        });
    }
    if (recommencer) {
        recommencer.addEventListener('click', () => demarrerQuiz(slugQuiz, idPlaylist, nomQuiz));
    }
})();
