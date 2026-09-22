// ============================================================
//  CONTENU ÉDITORIAL — lecture et mise en forme
//  Utilisé par les gabarits EJS, qui reçoivent les données déjà
//  prêtes plutôt que d'appeler l'API depuis le navigateur.
// ============================================================

const { db } = require('../database');

function echapper(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Convertit la convention de saisie de l'admin en HTML.
// L'échappement vient EN PREMIER : sans lui, un texte saisi dans le panneau
// d'administration pourrait injecter du script dans toutes les pages.
//   *texte*    -> surligné en doré
//   **texte**  -> gras
//   _texte_    -> italique
function formatTexte(str) {
    return echapper(str)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<span class="highlight">$1</span>')
        .replace(/_([^_]+)_/g, '<em>$1</em>');
}

// Version multiligne : les sauts de ligne deviennent des paragraphes.
function formatParagraphes(str) {
    return String(str || '')
        .split(/\n{2,}/)
        .filter(p => p.trim())
        .map(p => `<p>${formatTexte(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

// Rassemble tout ce dont un gabarit a besoin, en une seule lecture.
function chargerContenu() {
    const textes = {};
    for (const t of db.prepare('SELECT cle, valeur FROM site_textes').all()) {
        textes[t.cle] = t.valeur;
    }

    const entetes = {};
    for (const e of db.prepare('SELECT cle, tag, titre, description FROM section_entetes').all()) {
        entetes[e.cle] = e;
    }

    const liens = db.prepare('SELECT * FROM footer_liens ORDER BY groupe, ordre, id').all();

    return {
        textes,
        entetes,
        aproposBlocs: db.prepare('SELECT * FROM apropos_blocs ORDER BY ordre, id').all(),
        aproposValeurs: db.prepare('SELECT * FROM apropos_valeurs ORDER BY ordre, id').all(),
        contactInfos: db.prepare('SELECT * FROM contact_infos ORDER BY ordre, id').all(),
        reseauxSociaux: db.prepare('SELECT * FROM reseaux_sociaux ORDER BY ordre, id').all(),
        footerLiens: {
            liens: liens.filter(l => l.groupe === 'liens'),
            formations: liens.filter(l => l.groupe === 'formations')
        }
    };
}

// Métadonnées de référencement d'une page, avec un repli sûr si la ligne manque.
function chargerSeo(page) {
    return db.prepare('SELECT titre, description FROM page_seo WHERE page = ?').get(page)
        || { titre: 'MOREC Structure & MOREC School', description: null };
}

// Les 6 entrées du menu. Elles restent ici et non en base : chacune correspond
// à une route Express, et les rendre administrables permettrait de créer un
// lien vers une page inexistante.
const MENU = [
    { url: '/', libelle: 'Accueil', page: 'accueil' },
    { url: '/a-propos', libelle: 'À Propos', page: 'a-propos' },
    { url: '/formations', libelle: 'Formations', page: 'formations' },
    { url: '/evenements', libelle: 'Événements', page: 'evenements' },
    { url: '/cours', libelle: 'Cours', page: 'cours', icone: 'fas fa-book-open' },
    { url: '/galerie', libelle: 'Galerie', page: 'galerie', icone: 'fas fa-images' },
    { url: '/temoignages', libelle: 'Témoignages', page: 'temoignages', icone: 'fas fa-quote-right' }
];

module.exports = { echapper, formatTexte, formatParagraphes, chargerContenu, chargerSeo, MENU };
