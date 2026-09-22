// Page d'accueil : rotation du carrousel et animation des compteurs.
// Le balisage est déjà rendu par le serveur, il n'y a rien à charger.
(function () {
    'use strict';

    // ===== Carrousel du héros =====
    const slides = document.querySelectorAll('.hero-slide');
    const points = document.querySelectorAll('.hero-dot');

    if (slides.length > 1) {
        let index = 0;
        let minuteur = null;

        function afficher(i) {
            index = (i + slides.length) % slides.length;
            slides.forEach((s, n) => s.classList.toggle('active', n === index));
            points.forEach((p, n) => p.classList.toggle('active', n === index));
        }

        function demarrer() {
            arreter();
            minuteur = setInterval(() => afficher(index + 1), 6000);
        }
        function arreter() {
            if (minuteur) clearInterval(minuteur);
            minuteur = null;
        }

        points.forEach(point => {
            point.addEventListener('click', () => {
                afficher(Number(point.dataset.index));
                demarrer(); // relance le compte à rebours après une action manuelle
            });
        });

        // Inutile de faire tourner le carrousel quand l'onglet est en arrière-plan
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) arreter(); else demarrer();
        });

        demarrer();
    }

    // ===== Compteurs des statistiques =====
    // Déclenchés à l'entrée dans le viewport, sinon l'animation passe inaperçue
    // sur un écran où la section n'est pas visible au chargement.
    const compteurs = document.querySelectorAll('.stat-number');
    if (compteurs.length) {
        function animer(el) {
            const cible = parseInt(el.dataset.target, 10);
            if (Number.isNaN(cible)) return;
            const duree = 1800;
            const pas = cible / (duree / 16);
            let courant = 0;
            (function avancer() {
                courant += pas;
                if (courant < cible) {
                    el.textContent = Math.floor(courant);
                    requestAnimationFrame(avancer);
                } else {
                    el.textContent = cible;
                }
            })();
        }

        const observer = new IntersectionObserver((entrees) => {
            entrees.forEach(entree => {
                if (entree.isIntersecting) {
                    animer(entree.target);
                    observer.unobserve(entree.target);
                }
            });
        }, { threshold: 0.5 });

        compteurs.forEach(c => observer.observe(c));
    }
})();
