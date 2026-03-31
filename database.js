const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'morec.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== CREATE TABLES =====
db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre INTEGER NOT NULL,
        suffixe TEXT DEFAULT '+',
        label TEXT NOT NULL,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS citations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        texte TEXT NOT NULL,
        auteur TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS formations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        icon TEXT NOT NULL,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        duree TEXT NOT NULL,
        certificat INTEGER DEFAULT 1,
        places INTEGER NOT NULL,
        populaire INTEGER DEFAULT 0,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS evenements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        categorie TEXT NOT NULL,
        icon TEXT NOT NULL,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        date_event TEXT NOT NULL,
        lieu TEXT NOT NULL,
        places INTEGER NOT NULL,
        image TEXT DEFAULT NULL,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evenement_id INTEGER,
        evenement_nom TEXT NOT NULL,
        nom TEXT NOT NULL,
        email TEXT NOT NULL,
        telephone TEXT NOT NULL,
        organisation TEXT,
        date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (evenement_id) REFERENCES evenements(id)
    );

    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        nom TEXT NOT NULL,
        icon TEXT NOT NULL,
        icon_class TEXT DEFAULT '',
        formateur TEXT NOT NULL,
        duree_totale TEXT NOT NULL,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        duree TEXT NOT NULL,
        vues TEXT DEFAULT '0',
        ordre INTEGER DEFAULT 0,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER NOT NULL,
        question TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_index INTEGER NOT NULL,
        ordre INTEGER DEFAULT 0,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scores_quiz (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playlist_id INTEGER,
        playlist_nom TEXT NOT NULL,
        nom TEXT NOT NULL,
        email TEXT NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        pourcentage INTEGER NOT NULL,
        date_passage DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (playlist_id) REFERENCES playlists(id)
    );

    CREATE TABLE IF NOT EXISTS pourquoi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS temoignages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        role TEXT NOT NULL,
        texte TEXT NOT NULL,
        initiales TEXT NOT NULL,
        etoiles REAL DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS equipe (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT NOT NULL,
        linkedin TEXT DEFAULT '#',
        facebook TEXT DEFAULT '#',
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        email TEXT NOT NULL,
        telephone TEXT,
        formation TEXT,
        message TEXT NOT NULL,
        lu INTEGER DEFAULT 0,
        date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS membres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        telephone TEXT NOT NULL,
        type_membre TEXT NOT NULL DEFAULT 'sympathisant',
        password TEXT,
        ville TEXT,
        profession TEXT,
        date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cours_live (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        description TEXT NOT NULL,
        formateur TEXT NOT NULL,
        date_cours TEXT NOT NULL,
        heure_debut TEXT NOT NULL,
        heure_fin TEXT NOT NULL,
        lien TEXT,
        plateforme TEXT DEFAULT 'Zoom',
        statut TEXT DEFAULT 'planifie',
        max_participants INTEGER DEFAULT 50,
        image TEXT,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cours_pdfs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        description TEXT,
        categorie TEXT DEFAULT 'general',
        fichier_url TEXT NOT NULL,
        fichier_nom TEXT,
        taille TEXT,
        formation_id INTEGER,
        ordre INTEGER DEFAULT 0,
        date_ajout DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (formation_id) REFERENCES formations(id)
    );

    CREATE TABLE IF NOT EXISTS hero_slides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image TEXT NOT NULL,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titre TEXT NOT NULL,
        description TEXT,
        cover_image TEXT,
        date_album TEXT,
        ordre INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS album_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id INTEGER NOT NULL,
        image TEXT NOT NULL,
        legende TEXT,
        ordre INTEGER DEFAULT 0,
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
    );
`);

// Add password column to membres if missing (migration for existing DBs)
try {
    db.prepare("SELECT password FROM membres LIMIT 1").get();
} catch (e) {
    db.exec("ALTER TABLE membres ADD COLUMN password TEXT");
}

// ===== SEED DATA =====
function seedIfEmpty() {
    const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
    if (adminCount === 0) {
        const hash = bcrypt.hashSync(process.env.ADMIN_DEFAULT_PASS || 'Morec@2026', 10);
        db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)').run(
            process.env.ADMIN_DEFAULT_USER || 'admin', hash
        );
    }

    const statsCount = db.prepare('SELECT COUNT(*) as c FROM stats').get().c;
    if (statsCount === 0) {
        const insertStat = db.prepare('INSERT INTO stats (nombre, suffixe, label, ordre) VALUES (?, ?, ?, ?)');
        insertStat.run(500, '+', 'Apprenants formés', 1);
        insertStat.run(15, '+', 'Formations', 2);
        insertStat.run(10, '+', "Années d'expérience", 3);
    }

    const citCount = db.prepare('SELECT COUNT(*) as c FROM citations').get().c;
    if (citCount === 0) {
        const insertCit = db.prepare('INSERT INTO citations (texte, auteur) VALUES (?, ?)');
        const cits = [
            ["Le leadership, c'est l'art de donner aux gens une plateforme pour répandre des idées qui fonctionnent.", "Seth Godin"],
            ["Un leader est celui qui connaît le chemin, emprunte le chemin, et montre le chemin.", "John C. Maxwell"],
            ["Le plus grand leader n'est pas nécessairement celui qui fait les plus grandes choses. C'est celui qui pousse les gens à faire les plus grandes choses.", "Ronald Reagan"],
            ["Avant d'être un leader, le succès consiste à grandir soi-même. Quand vous devenez un leader, le succès consiste à faire grandir les autres.", "Jack Welch"],
            ["La fonction du leadership est de produire d'autres leaders, pas d'autres suiveurs.", "Ralph Nader"],
            ["Ne suivez pas là où le chemin peut mener. Allez là où il n'y a pas de chemin et laissez une trace.", "Ralph Waldo Emerson"],
            ["Le leadership et l'apprentissage sont indispensables l'un à l'autre.", "John F. Kennedy"],
            ["L'innovation fait la différence entre un leader et un suiveur.", "Steve Jobs"],
            ["Le courage est la première des qualités humaines car c'est celle qui garantit toutes les autres.", "Aristote"],
            ["Celui qui veut diriger l'orchestre doit tourner le dos à la foule.", "Max Lucado"],
            ["La vision sans action n'est qu'un rêve. L'action sans vision ne fait que passer le temps. La vision avec l'action peut changer le monde.", "Joel A. Barker"],
            ["L'exemple n'est pas le principal moyen d'influencer les autres, c'est le seul.", "Albert Einstein"]
        ];
        cits.forEach(c => insertCit.run(c[0], c[1]));
    }

    const formCount = db.prepare('SELECT COUNT(*) as c FROM formations').get().c;
    if (formCount === 0) {
        const ins = db.prepare('INSERT INTO formations (icon, titre, description, duree, certificat, places, populaire, ordre) VALUES (?,?,?,?,?,?,?,?)');
        ins.run('fas fa-crown', 'Leadership Fondamental', "Découvrez les principes essentiels du leadership, développez votre vision et apprenez à inspirer votre entourage.", '40 heures', 1, 20, 0, 1);
        ins.run('fas fa-chart-line', 'Leadership Stratégique', "Maîtrisez l'art de la stratégie, de la prise de décision et de la gestion d'équipes performantes.", '60 heures', 1, 15, 1, 2);
        ins.run('fas fa-handshake', 'Management & Communication', "Perfectionnez vos compétences en communication, gestion de conflits et management opérationnel.", '35 heures', 1, 25, 0, 3);
        ins.run('fas fa-brain', 'Développement Personnel', "Travaillez sur votre confiance en soi, votre intelligence émotionnelle et votre capacité de résilience.", '30 heures', 1, 30, 0, 4);
        ins.run('fas fa-briefcase', 'Entrepreneuriat & Leadership', "Combinez esprit entrepreneurial et compétences de leadership pour créer et diriger des projets impactants.", '50 heures', 1, 20, 0, 5);
        ins.run('fas fa-church', 'Leadership Spirituel', "Développez un leadership ancré dans les valeurs spirituelles, l'humilité et le service aux autres.", '45 heures', 1, 20, 0, 6);
    }

    const evtCount = db.prepare('SELECT COUNT(*) as c FROM evenements').get().c;
    if (evtCount === 0) {
        const ins = db.prepare('INSERT INTO evenements (categorie, icon, titre, description, date_event, lieu, places, image, ordre) VALUES (?,?,?,?,?,?,?,?,?)');
        ins.run('formation', 'fas fa-chalkboard-teacher', 'Formation Leadership Fondamental', "Programme intensif de 5 jours pour acquérir les bases du leadership transformationnel.", '15 Avr 2026', 'Abidjan, Cocody', 20, null, 1);
        ins.run('conference', 'fas fa-microphone-alt', 'Conférence : Le Leader du 21e Siècle', "Une soirée inspirante avec des intervenants de renom sur les défis du leadership moderne.", '22 Avr 2026', 'Abidjan, Plateau', 200, null, 2);
        ins.run('coaching', 'fas fa-hand-holding-heart', 'Session Coaching de Groupe', "Un atelier interactif pour développer votre intelligence émotionnelle et votre assertivité.", '05 Mai 2026', 'En ligne (Zoom)', 30, null, 3);
        ins.run('masterclass', 'fas fa-award', 'Masterclass : Diriger avec Vision', "Une journée exclusive avec Dr. Samuel Morec sur l'art de diriger avec clarté et impact.", '18 Mai 2026', 'Abidjan, Marcory', 50, null, 4);
        ins.run('formation', 'fas fa-briefcase', 'Entrepreneuriat & Leadership', "Apprenez à combiner vision entrepreneuriale et compétences de leadership en 5 semaines.", '02 Juin 2026', 'Abidjan, Cocody', 20, null, 5);
        ins.run('masterclass', 'fas fa-church', 'Masterclass Leadership Spirituel', "Comment intégrer la dimension spirituelle dans votre pratique du leadership au quotidien.", '20 Juin 2026', 'Abidjan, Yopougon', 40, null, 6);
    }

    const plCount = db.prepare('SELECT COUNT(*) as c FROM playlists').get().c;
    if (plCount === 0) {
        const insP = db.prepare('INSERT INTO playlists (slug, nom, icon, icon_class, formateur, duree_totale, ordre) VALUES (?,?,?,?,?,?,?)');
        insP.run('leadership', 'Leadership Fondamental', 'fas fa-crown', '', 'Dr. Samuel Morec', '2h 20min', 1);
        insP.run('coaching', 'Coaching & Développement Personnel', 'fas fa-hand-holding-heart', 'coaching', 'Coach Daniel Yao', '3h 30min', 2);
        insP.run('management', 'Management & Communication', 'fas fa-chart-line', 'management', 'Prof. Grace Atta', '2h 40min', 3);

        const pls = db.prepare('SELECT id, slug FROM playlists').all();
        const insV = db.prepare('INSERT INTO videos (playlist_id, titre, description, duree, vues, ordre) VALUES (?,?,?,?,?,?)');
        const insQ = db.prepare('INSERT INTO quiz_questions (playlist_id, question, option_a, option_b, option_c, option_d, correct_index, ordre) VALUES (?,?,?,?,?,?,?,?)');

        pls.forEach(pl => {
            if (pl.slug === 'leadership') {
                insV.run(pl.id, 'Les 5 Piliers du Leadership', "Découvrez les fondements essentiels pour devenir un leader inspirant et efficace.", '45 min', '1.2K', 1);
                insV.run(pl.id, 'Vision et Influence du Leader', "Apprenez à développer une vision claire et à influencer positivement votre entourage.", '50 min', '980', 2);
                insV.run(pl.id, 'Prise de Décision Stratégique', "Les méthodes éprouvées pour prendre des décisions justes sous pression.", '45 min', '870', 3);
                insQ.run(pl.id, "Quel est le rôle principal d'un leader selon le cours ?", "Donner des ordres", "Inspirer et guider les autres", "Contrôler les résultats", "Travailler seul", 1, 1);
                insQ.run(pl.id, "Combien de piliers du leadership sont présentés dans la première vidéo ?", "3", "4", "5", "7", 2, 2);
                insQ.run(pl.id, "Qu'est-ce qu'une vision stratégique ?", "Un plan à court terme", "Une direction claire pour l'avenir", "Un rapport financier", "Une liste de tâches", 1, 3);
                insQ.run(pl.id, "Quel élément est essentiel pour la prise de décision stratégique ?", "La rapidité uniquement", "L'analyse et l'intuition", "L'avis de la majorité", "L'ancienneté", 1, 4);
                insQ.run(pl.id, "Comment un leader influence-t-il positivement son entourage ?", "Par l'autorité", "Par la crainte", "Par l'exemple et la vision", "Par les récompenses uniquement", 2, 5);
            } else if (pl.slug === 'coaching') {
                insV.run(pl.id, 'Confiance en Soi : Les Clés', "Séance de coaching pour renforcer votre confiance et votre assertivité.", '1h 20min', '890', 1);
                insV.run(pl.id, 'Gestion du Stress et Résilience', "Stratégies pratiques pour gérer le stress et maintenir votre performance.", '1h 10min', '680', 2);
                insV.run(pl.id, 'Intelligence Émotionnelle', "Développez votre capacité à comprendre et gérer vos émotions et celles des autres.", '1h', '1.1K', 3);
                insQ.run(pl.id, "Quel est le premier pas pour développer la confiance en soi ?", "Ignorer ses défauts", "Se connaître et s'accepter", "S'isoler", "Comparer aux autres", 1, 1);
                insQ.run(pl.id, "Quelle stratégie est recommandée pour gérer le stress ?", "Éviter toute responsabilité", "La respiration et la pleine conscience", "Travailler plus", "Nier le stress", 1, 2);
                insQ.run(pl.id, "L'intelligence émotionnelle comprend la capacité à :", "Cacher ses émotions", "Reconnaître et gérer ses émotions et celles des autres", "Être toujours positif", "Éviter les conflits", 1, 3);
                insQ.run(pl.id, "Quel est l'objectif principal du coaching personnel ?", "Résoudre les problèmes à la place du coaché", "Aider à développer le potentiel du coaché", "Donner des instructions", "Évaluer la performance", 1, 4);
                insQ.run(pl.id, "La résilience, c'est :", "Ne jamais échouer", "La capacité de rebondir après une difficulté", "L'absence de stress", "L'évitement des risques", 1, 5);
            } else if (pl.slug === 'management') {
                insV.run(pl.id, "Management d'Équipe Performante", "Techniques avancées pour motiver, fédérer et diriger une équipe vers l'excellence.", '55 min', '750', 1);
                insV.run(pl.id, 'Communication Persuasive', "L'art de la communication persuasive et de la prise de parole en public.", '1h 05min', '1.5K', 2);
                insV.run(pl.id, 'Gestion des Conflits', "Méthodes pour résoudre les conflits au sein d'une équipe et renforcer la cohésion.", '40 min', '620', 3);
                insQ.run(pl.id, "Quel est l'élément clé d'une équipe performante ?", "La compétition entre membres", "La confiance et la cohésion", "Un chef autoritaire", "L'individualisme", 1, 1);
                insQ.run(pl.id, "La communication persuasive repose sur :", "Le volume de la voix", "La clarté, l'empathie et la conviction", "La manipulation", "Parler le plus longtemps possible", 1, 2);
                insQ.run(pl.id, "Comment résoudre efficacement un conflit au sein d'une équipe ?", "Ignorer le problème", "Écouter toutes les parties et chercher un compromis", "Sanctionner immédiatement", "Prendre parti", 1, 3);
                insQ.run(pl.id, "Quelle est la meilleure façon de motiver une équipe ?", "Les menaces", "La reconnaissance et les objectifs clairs", "L'augmentation salariale uniquement", "La surveillance constante", 1, 4);
                insQ.run(pl.id, "La prise de parole en public nécessite :", "De lire un texte mot à mot", "De la préparation, de la confiance et de l'authenticité", "De parler très vite", "D'éviter le contact visuel", 1, 5);
            }
        });
    }

    const pqCount = db.prepare('SELECT COUNT(*) as c FROM pourquoi').get().c;
    if (pqCount === 0) {
        const ins = db.prepare('INSERT INTO pourquoi (numero, titre, description, ordre) VALUES (?,?,?,?)');
        ins.run('01', 'Formateurs Expérimentés', "Nos formateurs sont des leaders reconnus avec une expérience terrain avérée dans leurs domaines de compétence.", 1);
        ins.run('02', 'Approche Pratique', "Nos formations combinent théorie et pratique avec des mises en situation réelles et des études de cas concrètes.", 2);
        ins.run('03', 'Suivi Personnalisé', "Chaque apprenant bénéficie d'un accompagnement individualisé pour maximiser son développement.", 3);
        ins.run('04', 'Certification Reconnue', "Nos certifications sont reconnues et valorisées par les entreprises et organisations partenaires.", 4);
        ins.run('05', 'Réseau Alumni', "Rejoignez une communauté active de leaders formés qui s'entraidement et créent des opportunités.", 5);
        ins.run('06', 'Flexibilité', "Des formations en présentiel, en ligne et en format hybride pour s'adapter à votre emploi du temps.", 6);
    }

    const temCount = db.prepare('SELECT COUNT(*) as c FROM temoignages').get().c;
    if (temCount === 0) {
        const ins = db.prepare('INSERT INTO temoignages (nom, role, texte, initiales, etoiles) VALUES (?,?,?,?,?)');
        ins.run('Jean Kouamé', 'Directeur Général, TechCorp', "La formation en Leadership Stratégique a complètement transformé ma vision. J'ai pu mettre en pratique les enseignements dès le lendemain dans mon entreprise.", 'JK', 5);
        ins.run('Marie Adjoua', 'Responsable RH, GroupeAfrica', "Grâce à MOREC School, j'ai découvert mon potentiel de leader. Les formateurs sont exceptionnels et le suivi post-formation est un vrai plus.", 'MA', 5);
        ins.run('Paul Dosso', 'Pasteur & Entrepreneur', "Une expérience enrichissante qui allie spiritualité et professionnalisme. Je recommande vivement les formations de MOREC School.", 'PD', 4.5);
    }

    const eqCount = db.prepare('SELECT COUNT(*) as c FROM equipe').get().c;
    if (eqCount === 0) {
        const ins = db.prepare('INSERT INTO equipe (nom, role, description, linkedin, facebook, ordre) VALUES (?,?,?,?,?,?)');
        ins.run('Dr. Samuel Morec', 'Fondateur & Directeur', "Expert en leadership avec plus de 15 ans d'expérience dans la formation et le développement des organisations.", '#', '#', 1);
        ins.run('Prof. Grace Atta', 'Formatrice en Management', "Spécialiste en management stratégique et en développement des compétences organisationnelles.", '#', '#', 2);
        ins.run('Coach Daniel Yao', 'Coach en Développement Personnel', "Coach certifié spécialisé en intelligence émotionnelle et en accompagnement de dirigeants.", '#', '#', 3);
    }

    const clCount = db.prepare('SELECT COUNT(*) as c FROM cours_live').get().c;
    if (clCount === 0) {
        const ins = db.prepare('INSERT INTO cours_live (titre, description, formateur, date_cours, heure_debut, heure_fin, lien, plateforme, statut, max_participants, ordre) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        ins.run('Leadership & Vision Stratégique', "Apprenez à développer une vision claire et à la communiquer efficacement à votre équipe pour créer un impact durable.", 'Dr. Samuel Morec', '2026-04-10', '18:00', '20:00', null, 'Zoom', 'planifie', 30, 1);
        ins.run('Gestion du Stress pour Leaders', "Techniques avancées de gestion du stress et de résilience pour maintenir votre performance au quotidien.", 'Coach Daniel Yao', '2026-04-15', '19:00', '21:00', null, 'Google Meet', 'planifie', 25, 2);
        ins.run('Communication Authentique', "Maîtrisez l'art de la communication authentique pour inspirer confiance et mobiliser votre entourage.", 'Prof. Grace Atta', '2026-04-22', '18:30', '20:30', null, 'Zoom', 'planifie', 40, 3);
    }

    // Seed sample PDFs
    const pdfCount = db.prepare('SELECT COUNT(*) as c FROM cours_pdfs').get().c;
    if (pdfCount === 0) {
        const ins = db.prepare('INSERT INTO cours_pdfs (titre, description, categorie, fichier_url, fichier_nom, taille, ordre) VALUES (?,?,?,?,?,?,?)');
        ins.run('Introduction au Leadership', 'Les fondamentaux du leadership selon le modèle MOREC.', 'leadership', '#', 'intro-leadership.pdf', '2.4 MB', 1);
        ins.run('Guide du Management Stratégique', 'Manuel complet sur les techniques de management stratégique.', 'management', '#', 'management-strategique.pdf', '3.1 MB', 2);
        ins.run('Développement Personnel - Workbook', 'Exercices pratiques pour votre développement personnel.', 'developpement', '#', 'workbook-dev-perso.pdf', '1.8 MB', 3);
    }
}

module.exports = { db, seedIfEmpty };
