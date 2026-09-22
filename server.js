require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { db, seedIfEmpty } = require('./database');
const authMiddleware = require('./middleware/auth');
const memberAuthMiddleware = require('./middleware/memberAuth');

// JWT secret with fallback default
const JWT_SECRET = process.env.JWT_SECRET || 'morec-school-default-secret-2026';

// Seed database on first run
seedIfEmpty();

// ============================================================
//  CLOUDINARY CONFIG
// ============================================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer memory storage (files stay in RAM buffer, then upload to Cloudinary)
const memStorage = multer.memoryStorage();
const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé'));
};
const uploadMemory = multer({ storage: memStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// Multer for PDFs (allows PDF + images)
const allowedPdfExts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
const pdfFileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedPdfExts.includes(ext)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé. Seuls les PDF et images sont acceptés.'));
};
const uploadPdf = multer({ storage: memStorage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: pdfFileFilter });

// Helper: upload buffer to Cloudinary
function uploadToCloudinary(fileBuffer, folder) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: `morec/${folder}`, resource_type: 'image' },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
}

// Helper: upload raw file (PDF) to Cloudinary
function uploadRawToCloudinary(fileBuffer, folder, originalName) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: `morec/${folder}`, resource_type: 'raw', public_id: originalName.replace(/\.[^.]+$/, '') },
            (error, result) => {
                if (error) reject(error);
                else resolve(result);
            }
        );
        stream.end(fileBuffer);
    });
}

// Helper: delete raw file from Cloudinary
// uploadRawToCloudinary retire l'extension du public_id, mais d'anciens fichiers
// ont pu être envoyés avec. On tente les deux formes, et on journalise l'échec
// au lieu de l'avaler : sinon des PDF restent indéfiniment sur Cloudinary.
async function deleteRawFromCloudinary(fileUrl) {
    if (!fileUrl || !fileUrl.includes('cloudinary')) return;
    const parts = fileUrl.split('/upload/');
    if (parts.length < 2) return;
    const afterUpload = parts[1].replace(/^v\d+\//, '');
    const candidates = [afterUpload, afterUpload.replace(/\.[^.]+$/, '')]
        .filter((v, i, arr) => arr.indexOf(v) === i);

    for (const publicId of candidates) {
        try {
            const res = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
            if (res && res.result === 'ok') return;
        } catch (err) {
            console.error(`Cloudinary: échec de suppression de « ${publicId} » :`, err.message);
            return;
        }
    }
    console.warn(`Cloudinary: fichier introuvable, non supprimé (${afterUpload}).`);
}

// Helper: extract public_id from Cloudinary URL and destroy
function deleteFromCloudinary(imageUrl) {
    if (!imageUrl || !imageUrl.includes('cloudinary')) return Promise.resolve();
    // URL format: https://res.cloudinary.com/<cloud>/image/upload/v123/morec/folder/filename.ext
    const parts = imageUrl.split('/upload/');
    if (parts.length < 2) return Promise.resolve();
    // Remove version prefix (v123/) and file extension
    const afterUpload = parts[1].replace(/^v\d+\//, '');
    const publicId = afterUpload.replace(/\.[^.]+$/, '');
    return cloudinary.uploader.destroy(publicId).catch(() => {});
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  PUBLIC API ROUTES
// ============================================================

// --- Stats ---
app.get('/api/stats', (req, res) => {
    const rows = db.prepare('SELECT * FROM stats ORDER BY ordre').all();
    res.json(rows);
});

// --- Hero Slides ---
app.get('/api/hero-slides', (req, res) => {
    const rows = db.prepare('SELECT * FROM hero_slides ORDER BY ordre').all();
    res.json(rows);
});

// --- Albums (galerie) ---
app.get('/api/albums', (req, res) => {
    const albums = db.prepare('SELECT * FROM albums ORDER BY ordre').all();
    albums.forEach(a => {
        a.photos = db.prepare('SELECT * FROM album_photos WHERE album_id = ? ORDER BY ordre').all(a.id);
    });
    res.json(albums);
});

// --- Citations ---
app.get('/api/citations', (req, res) => {
    const rows = db.prepare('SELECT * FROM citations').all();
    res.json(rows);
});

app.get('/api/citations/today', (req, res) => {
    const all = db.prepare('SELECT * FROM citations').all();
    if (all.length === 0) return res.json(null);
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    res.json(all[dayOfYear % all.length]);
});

// --- Formations ---
app.get('/api/formations', (req, res) => {
    const rows = db.prepare('SELECT * FROM formations ORDER BY ordre').all();
    res.json(rows);
});

// --- Événements ---
app.get('/api/evenements', (req, res) => {
    const rows = db.prepare('SELECT * FROM evenements ORDER BY ordre').all();
    res.json(rows);
});

// --- Playlists (with videos) ---
app.get('/api/playlists', (req, res) => {
    const playlists = db.prepare('SELECT * FROM playlists ORDER BY ordre').all();
    playlists.forEach(pl => {
        pl.videos = db.prepare('SELECT * FROM videos WHERE playlist_id = ? ORDER BY ordre').all(pl.id);
    });
    res.json(playlists);
});

// --- Quiz questions for a playlist ---
app.get('/api/quiz/:playlistId', (req, res) => {
    const rows = db.prepare('SELECT * FROM quiz_questions WHERE playlist_id = ? ORDER BY ordre').all(req.params.playlistId);
    res.json(rows);
});

// --- Pourquoi ---
app.get('/api/pourquoi', (req, res) => {
    const rows = db.prepare('SELECT * FROM pourquoi ORDER BY ordre').all();
    res.json(rows);
});

// --- Témoignages ---
app.get('/api/temoignages', (req, res) => {
    const rows = db.prepare('SELECT * FROM temoignages').all();
    res.json(rows);
});

// --- Équipe ---
app.get('/api/equipe', (req, res) => {
    const rows = db.prepare('SELECT * FROM equipe ORDER BY ordre').all();
    res.json(rows);
});

// --- Contenu éditorial (public) ---
// Rassemblé en un seul endpoint : ces données sont toutes nécessaires au rendu
// d'une page, et les gabarits EJS les liront directement en base à l'Étape 3.
app.get('/api/contenu', (req, res, next) => {
    try {
        const textes = {};
        for (const t of db.prepare('SELECT cle, valeur FROM site_textes').all()) textes[t.cle] = t.valeur;

        const entetes = {};
        for (const e of db.prepare('SELECT cle, tag, titre, description FROM section_entetes').all()) {
            entetes[e.cle] = { tag: e.tag, titre: e.titre, description: e.description };
        }

        res.json({
            textes,
            entetes,
            aproposBlocs: db.prepare('SELECT * FROM apropos_blocs ORDER BY ordre, id').all(),
            aproposValeurs: db.prepare('SELECT * FROM apropos_valeurs ORDER BY ordre, id').all(),
            contactInfos: db.prepare('SELECT * FROM contact_infos ORDER BY ordre, id').all(),
            reseauxSociaux: db.prepare('SELECT * FROM reseaux_sociaux ORDER BY ordre, id').all(),
            footerLiens: db.prepare('SELECT * FROM footer_liens ORDER BY groupe, ordre, id').all()
        });
    } catch (err) { next(err); }
});

// --- Inscriptions (public POST) ---
app.post('/api/inscriptions', (req, res) => {
    const { evenement_id, evenement_nom, nom, email, telephone, organisation } = req.body;
    if (!nom || !email || !telephone || !evenement_nom) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    const result = db.prepare(
        'INSERT INTO inscriptions (evenement_id, evenement_nom, nom, email, telephone, organisation) VALUES (?,?,?,?,?,?)'
    ).run(evenement_id || null, evenement_nom, nom, email, telephone, organisation || null);
    res.json({ success: true, id: result.lastInsertRowid });
});

// --- Messages (public POST) ---
app.post('/api/messages', (req, res) => {
    const { nom, email, telephone, formation, message } = req.body;
    if (!nom || !email || !message) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    const result = db.prepare(
        'INSERT INTO messages (nom, email, telephone, formation, message) VALUES (?,?,?,?,?)'
    ).run(nom, email, telephone || null, formation || null, message);
    res.json({ success: true, id: result.lastInsertRowid });
});

// --- Quiz Scores (public POST) ---
app.post('/api/scores', (req, res) => {
    const { playlist_id, playlist_nom, nom, email, score, total, pourcentage } = req.body;
    if (!nom || !email || score == null || !total) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    const result = db.prepare(
        'INSERT INTO scores_quiz (playlist_id, playlist_nom, nom, email, score, total, pourcentage) VALUES (?,?,?,?,?,?,?)'
    ).run(playlist_id || null, playlist_nom, nom, email, score, total, pourcentage || Math.round((score / total) * 100));
    res.json({ success: true, id: result.lastInsertRowid });
});

// --- Membres (public POST) ---
app.post('/api/membres', (req, res) => {
    const { nom, prenom, email, telephone, type_membre, ville, profession, password } = req.body;
    if (!nom || !prenom || !email || !telephone || !type_membre || !password) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
    }
    const validTypes = ['sympathisant', 'actif', 'tres_actif', 'honoraire'];
    if (!validTypes.includes(type_membre)) {
        return res.status(400).json({ error: 'Type de membre invalide' });
    }
    // Check if email already registered
    const existing = db.prepare('SELECT id FROM membres WHERE email = ?').get(email);
    if (existing) {
        return res.status(409).json({ error: 'Cet email est déjà enregistré comme membre' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
        'INSERT INTO membres (nom, prenom, email, telephone, type_membre, ville, profession, password) VALUES (?,?,?,?,?,?,?,?)'
    ).run(nom, prenom, email, telephone, type_membre, ville || null, profession || null, hash);
    res.json({ success: true, id: result.lastInsertRowid });
});

// ============================================================
//  AUTH
// ============================================================

app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Identifiants requis' });
        }
        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
        if (!admin || !bcrypt.compareSync(password, admin.password)) {
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }
        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ token, username: admin.username });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({ id: req.admin.id, username: req.admin.username });
});

// ============================================================
//  MEMBER AUTH & COURS LIVE (member-only)
// ============================================================

app.post('/api/membres/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email et mot de passe requis' });
    }
    const membre = db.prepare('SELECT * FROM membres WHERE email = ?').get(email);
    if (!membre || !membre.password || !bcrypt.compareSync(password, membre.password)) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const token = jwt.sign(
        { id: membre.id, email: membre.email, nom: membre.nom, prenom: membre.prenom, role: 'membre' },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
    res.json({ token, membre: { id: membre.id, nom: membre.nom, prenom: membre.prenom, email: membre.email, type_membre: membre.type_membre } });
});

app.get('/api/membres/me', memberAuthMiddleware, (req, res) => {
    const membre = db.prepare('SELECT id, nom, prenom, email, telephone, type_membre, ville, profession, date_inscription FROM membres WHERE id = ?').get(req.membre.id);
    if (!membre) return res.status(404).json({ error: 'Membre non trouvé' });
    res.json(membre);
});

// --- Cours Live (public: list upcoming / member-only: get link) ---
app.get('/api/cours-live', (req, res) => {
    const rows = db.prepare("SELECT id, titre, description, formateur, date_cours, heure_debut, heure_fin, plateforme, statut, max_participants, image, ordre FROM cours_live ORDER BY date_cours, heure_debut").all();
    res.json(rows);
});

app.get('/api/cours-live/:id', memberAuthMiddleware, (req, res) => {
    const row = db.prepare('SELECT * FROM cours_live WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Cours non trouvé' });
    res.json(row);
});

// --- Cours PDFs (public listing) ---
app.get('/api/cours-pdfs', (req, res) => {
    const rows = db.prepare('SELECT * FROM cours_pdfs ORDER BY ordre, date_ajout DESC').all();
    res.json(rows);
});

// ============================================================
//  ADMIN ROUTES (protected)
// ============================================================

// --- Dashboard summary ---
app.get('/api/admin/dashboard', authMiddleware, (req, res) => {
    const formations = db.prepare('SELECT COUNT(*) as c FROM formations').get().c;
    const evenements = db.prepare('SELECT COUNT(*) as c FROM evenements').get().c;
    const inscriptions = db.prepare('SELECT COUNT(*) as c FROM inscriptions').get().c;
    const messages = db.prepare('SELECT COUNT(*) as c FROM messages').get().c;
    const messagesNonLus = db.prepare('SELECT COUNT(*) as c FROM messages WHERE lu = 0').get().c;
    const temoignages = db.prepare('SELECT COUNT(*) as c FROM temoignages').get().c;
    const scores = db.prepare('SELECT COUNT(*) as c FROM scores_quiz').get().c;
    const membres = db.prepare('SELECT COUNT(*) as c FROM membres').get().c;
    const heroSlides = db.prepare('SELECT COUNT(*) as c FROM hero_slides').get().c;
    const albums = db.prepare('SELECT COUNT(*) as c FROM albums').get().c;
    const photos = db.prepare('SELECT COUNT(*) as c FROM album_photos').get().c;
    const coursLive = db.prepare('SELECT COUNT(*) as c FROM cours_live').get().c;
    const coursPdfs = db.prepare('SELECT COUNT(*) as c FROM cours_pdfs').get().c;
    res.json({ formations, evenements, inscriptions, messages, messagesNonLus, temoignages, scores, membres, heroSlides, albums, photos, coursLive, coursPdfs });
});

// ============================================================
//  CHAMPS : DESCRIPTEURS, CONVERSION ET POLITIQUE DU VIDE
// ============================================================

function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Un descripteur est soit 'nom', soit { name, cast, empty }.
//   cast  : 'int' | 'float' | 'bool'  -> conversion + 400 si la valeur est invalide
//   empty : que faire d'une valeur vide ('' ou null) reçue du client
//           'skip'  (défaut) -> colonne omise : le DEFAULT SQL s'applique à l'INSERT,
//                               et la valeur existante est conservée à l'UPDATE
//           'null'           -> NULL explicite, pour pouvoir vider un champ
//           'blank'          -> chaîne vide explicite (colonnes dont le DEFAULT est '')
function pickFields(body, schema) {
    const out = {};
    for (const raw of schema) {
        const f = typeof raw === 'string' ? { name: raw } : raw;
        let v = body[f.name];
        if (v === undefined) continue;
        if (typeof v === 'string') v = v.trim();

        if (v === '' || v === null) {
            const mode = f.empty || 'skip';
            if (mode === 'skip') continue;
            out[f.name] = mode === 'blank' ? '' : null;
            continue;
        }

        if (f.cast === 'int') {
            const n = Number(v);
            if (!Number.isInteger(n)) throw httpError(400, `Le champ « ${f.name} » attend un nombre entier.`);
            v = n;
        } else if (f.cast === 'float') {
            const n = Number(v);
            if (Number.isNaN(n)) throw httpError(400, `Le champ « ${f.name} » attend un nombre.`);
            v = n;
        } else if (f.cast === 'bool') {
            v = (v === 1 || v === true || v === '1' || v === 'true') ? 1 : 0;
        }
        out[f.name] = v;
    }
    return out;
}

// Source de vérité unique des champs acceptés, partagée par crudRoutes
// et par les routeurs sur-mesure (evenements, cours-pdfs, hero-slides, albums).
const SCHEMAS = {
    stats: ['label', { name: 'nombre', cast: 'int' }, 'suffixe', { name: 'ordre', cast: 'int' }],
    citations: ['texte', 'auteur'],
    formations: ['icon', 'titre', 'description', 'duree',
        { name: 'certificat', cast: 'bool' }, { name: 'places', cast: 'int' },
        { name: 'populaire', cast: 'bool' }, { name: 'ordre', cast: 'int' }],
    evenements: ['categorie', 'icon', 'titre', 'description', 'date_event', 'lieu',
        { name: 'places', cast: 'int' }, { name: 'image', empty: 'null' },
        { name: 'ordre', cast: 'int' }],
    playlists: ['slug', 'nom', 'icon', { name: 'icon_class', empty: 'blank' },
        'formateur', 'duree_totale', { name: 'ordre', cast: 'int' }],
    videos: [{ name: 'playlist_id', cast: 'int' }, 'titre', 'description', 'duree',
        'vues', { name: 'ordre', cast: 'int' }],
    quiz_questions: [{ name: 'playlist_id', cast: 'int' }, 'question',
        'option_a', 'option_b', 'option_c', 'option_d',
        { name: 'correct_index', cast: 'int' }, { name: 'ordre', cast: 'int' }],
    pourquoi: ['numero', 'titre', 'description', { name: 'ordre', cast: 'int' }],
    temoignages: ['nom', 'role', 'texte', 'initiales', { name: 'etoiles', cast: 'float' }],
    equipe: ['nom', 'role', 'description', 'linkedin', 'facebook', { name: 'ordre', cast: 'int' }],
    cours_live: ['titre', 'description', 'formateur', 'date_cours', 'heure_debut', 'heure_fin',
        { name: 'lien', empty: 'null' }, 'plateforme', 'statut',
        { name: 'max_participants', cast: 'int' }, { name: 'image', empty: 'null' },
        { name: 'ordre', cast: 'int' }],
    cours_pdfs: ['titre', { name: 'description', empty: 'null' }, 'categorie',
        'fichier_url', 'fichier_nom', 'taille',
        { name: 'formation_id', cast: 'int', empty: 'null' }, { name: 'ordre', cast: 'int' }],
    hero_slides: ['image', { name: 'ordre', cast: 'int' }],
    albums: ['titre', { name: 'description', empty: 'null' }, 'cover_image',
        { name: 'date_album', empty: 'null' }, { name: 'ordre', cast: 'int' }],
    album_photos: [{ name: 'album_id', cast: 'int' }, 'image',
        { name: 'legende', empty: 'null' }, { name: 'ordre', cast: 'int' }],

    // --- Contenu éditorial des pages ---
    site_textes: [{ name: 'valeur', empty: 'blank' }, 'libelle', 'groupe',
        { name: 'multiligne', cast: 'bool' }, { name: 'ordre', cast: 'int' }],
    section_entetes: [{ name: 'tag', empty: 'null' }, 'titre',
        { name: 'description', empty: 'null' }, { name: 'ordre', cast: 'int' }],
    apropos_blocs: ['titre', 'texte', { name: 'ordre', cast: 'int' }],
    apropos_valeurs: ['icon', 'titre', 'texte', { name: 'ordre', cast: 'int' }],
    contact_infos: ['icon', 'label', 'valeur', { name: 'ordre', cast: 'int' }],
    reseaux_sociaux: ['icon', 'nom', 'url', { name: 'ordre', cast: 'int' }],
    footer_liens: ['groupe', 'libelle', 'url', { name: 'ordre', cast: 'int' }],
    page_seo: ['titre', { name: 'description', empty: 'null' }]
};

// --- Generic CRUD helper ---
// options.noCreate / options.noDelete : pour les tables à lignes fixes, dont le
// jeu de lignes appartient aux gabarits et non à l'administrateur.
function crudRoutes(tableName, schema, orderBy = 'id', options = {}) {
    const router = express.Router();

    router.get('/', (req, res, next) => {
        try {
            res.json(db.prepare(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`).all());
        } catch (err) { next(err); }
    });

    router.get('/:id', (req, res, next) => {
        try {
            const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { next(err); }
    });

    router.post('/', (req, res, next) => {
        try {
            if (options.noCreate) {
                return res.status(405).json({ error: 'Cette liste est fixe : les lignes ne peuvent pas être ajoutées, seulement modifiées.' });
            }
            const data = pickFields(req.body, schema);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const placeholders = cols.map(() => '?').join(',');
            const result = db.prepare(`INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(result.lastInsertRowid));
        } catch (err) { next(err); }
    });

    router.put('/:id', (req, res, next) => {
        try {
            const data = pickFields(req.body, schema);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(c => `${c} = ?`).join(', ');
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE ${tableName} SET ${sets} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/:id', (req, res, next) => {
        try {
            if (options.noDelete) {
                return res.status(405).json({ error: 'Cette liste est fixe : les lignes ne peuvent pas être supprimées, seulement modifiées.' });
            }
            const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
}

// Mount CRUD routes
app.use('/api/admin/stats', authMiddleware, crudRoutes('stats', SCHEMAS.stats, 'ordre'));
app.use('/api/admin/citations', authMiddleware, crudRoutes('citations', SCHEMAS.citations));
app.use('/api/admin/formations', authMiddleware, crudRoutes('formations', SCHEMAS.formations, 'ordre'));
app.use('/api/admin/evenements', authMiddleware, (() => {
    const router = express.Router();
    const fields = SCHEMAS.evenements;

    router.get('/', (req, res) => {
        res.json(db.prepare('SELECT * FROM evenements ORDER BY ordre').all());
    });

    router.get('/:id', (req, res) => {
        const row = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.post('/', uploadMemory.single('image'), async (req, res, next) => {
        try {
            const body = req.body;
            if (req.file) {
                const result = await uploadToCloudinary(req.file.buffer, 'events');
                body.image = result.secure_url;
            }
            const data = pickFields(body, fields);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const placeholders = cols.map(() => '?').join(',');
            const r = db.prepare(`INSERT INTO evenements (${cols.join(',')}) VALUES (${placeholders})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare('SELECT * FROM evenements WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { next(err); }
    });

    router.put('/:id', uploadMemory.single('image'), async (req, res, next) => {
        try {
            const body = req.body;
            if (req.file) {
                const old = db.prepare('SELECT image FROM evenements WHERE id = ?').get(req.params.id);
                if (old && old.image) await deleteFromCloudinary(old.image);
                const result = await uploadToCloudinary(req.file.buffer, 'events');
                body.image = result.secure_url;
            }
            const data = pickFields(body, fields);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(c => `${c} = ?`).join(', ');
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE evenements SET ${sets} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const row = db.prepare('SELECT image FROM evenements WHERE id = ?').get(req.params.id);
            const result = db.prepare('DELETE FROM evenements WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            if (row && row.image) await deleteFromCloudinary(row.image);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
})());
app.use('/api/admin/playlists', authMiddleware, crudRoutes('playlists', SCHEMAS.playlists, 'ordre'));
app.use('/api/admin/videos', authMiddleware, crudRoutes('videos', SCHEMAS.videos, 'playlist_id, ordre'));
app.use('/api/admin/quiz', authMiddleware, crudRoutes('quiz_questions', SCHEMAS.quiz_questions, 'playlist_id, ordre'));
app.use('/api/admin/pourquoi', authMiddleware, crudRoutes('pourquoi', SCHEMAS.pourquoi, 'ordre'));
app.use('/api/admin/temoignages', authMiddleware, crudRoutes('temoignages', SCHEMAS.temoignages));
app.use('/api/admin/equipe', authMiddleware, crudRoutes('equipe', SCHEMAS.equipe, 'ordre'));

// --- Contenu éditorial des pages ---
app.use('/api/admin/apropos-blocs', authMiddleware, crudRoutes('apropos_blocs', SCHEMAS.apropos_blocs, 'ordre'));
app.use('/api/admin/apropos-valeurs', authMiddleware, crudRoutes('apropos_valeurs', SCHEMAS.apropos_valeurs, 'ordre'));
app.use('/api/admin/contact-infos', authMiddleware, crudRoutes('contact_infos', SCHEMAS.contact_infos, 'ordre'));
app.use('/api/admin/reseaux-sociaux', authMiddleware, crudRoutes('reseaux_sociaux', SCHEMAS.reseaux_sociaux, 'ordre'));
app.use('/api/admin/footer-liens', authMiddleware, crudRoutes('footer_liens', SCHEMAS.footer_liens, 'groupe, ordre'));

// Listes fixes : l'admin modifie le contenu des lignes, sans en ajouter ni supprimer.
app.use('/api/admin/section-entetes', authMiddleware,
    crudRoutes('section_entetes', SCHEMAS.section_entetes, 'ordre', { noCreate: true, noDelete: true }));
app.use('/api/admin/page-seo', authMiddleware,
    crudRoutes('page_seo', SCHEMAS.page_seo, 'id', { noCreate: true, noDelete: true }));

// --- Textes du site : lecture groupée + enregistrement en masse ---
// Ces textes sont des singletons dispersés (héros, CTA, footer…). Un tableau
// CRUD avec un bouton « Ajouter » n'aurait aucun sens : l'admin les édite par
// groupe, et l'enregistrement se fait en une seule requête.
app.get('/api/admin/site-textes', authMiddleware, (req, res, next) => {
    try {
        res.json(db.prepare('SELECT * FROM site_textes ORDER BY groupe, ordre, id').all());
    } catch (err) { next(err); }
});

app.put('/api/admin/site-textes', authMiddleware, (req, res, next) => {
    try {
        const textes = req.body.textes;
        if (!textes || typeof textes !== 'object') {
            return res.status(400).json({ error: 'Corps attendu : { textes: { "cle": "valeur", … } }' });
        }
        const cles = Object.keys(textes);
        if (cles.length === 0) return res.status(400).json({ error: 'Aucun texte fourni' });

        // On refuse une clé inconnue au lieu de l'ignorer : une faute de frappe
        // dans un gabarit resterait invisible si l'écriture était silencieuse.
        const connues = new Set(db.prepare('SELECT cle FROM site_textes').all().map(r => r.cle));
        const inconnues = cles.filter(c => !connues.has(c));
        if (inconnues.length) {
            return res.status(400).json({ error: `Clé(s) inconnue(s) : ${inconnues.join(', ')}` });
        }

        const upd = db.prepare('UPDATE site_textes SET valeur = ? WHERE cle = ?');
        db.transaction(() => {
            for (const cle of cles) upd.run(String(textes[cle] ?? '').trim(), cle);
        })();
        res.json({ success: true, misAJour: cles.length });
    } catch (err) { next(err); }
});

// --- Cours Live (CRUD + image de couverture sur Cloudinary) ---
// Routeur sur-mesure : la colonne cours_live.image existait déjà mais aucun
// endpoint n'acceptait de fichier, la rendant inexploitable depuis l'admin.
app.use('/api/admin/cours-live', authMiddleware, (() => {
    const router = express.Router();
    const fields = SCHEMAS.cours_live;
    const ORDER = 'date_cours, heure_debut';

    router.get('/', (req, res, next) => {
        try { res.json(db.prepare(`SELECT * FROM cours_live ORDER BY ${ORDER}`).all()); }
        catch (err) { next(err); }
    });

    router.get('/:id', (req, res, next) => {
        try {
            const row = db.prepare('SELECT * FROM cours_live WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { next(err); }
    });

    router.post('/', uploadMemory.single('image'), async (req, res, next) => {
        try {
            const body = req.body;
            if (req.file) {
                const result = await uploadToCloudinary(req.file.buffer, 'cours-live');
                body.image = result.secure_url;
            }
            const data = pickFields(body, fields);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const placeholders = cols.map(() => '?').join(',');
            const r = db.prepare(`INSERT INTO cours_live (${cols.join(',')}) VALUES (${placeholders})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare('SELECT * FROM cours_live WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { next(err); }
    });

    router.put('/:id', uploadMemory.single('image'), async (req, res, next) => {
        try {
            const body = req.body;
            if (req.file) {
                const old = db.prepare('SELECT image FROM cours_live WHERE id = ?').get(req.params.id);
                if (old && old.image) await deleteFromCloudinary(old.image);
                const result = await uploadToCloudinary(req.file.buffer, 'cours-live');
                body.image = result.secure_url;
            }
            const data = pickFields(body, fields);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(c => `${c} = ?`).join(', ');
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE cours_live SET ${sets} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare('SELECT * FROM cours_live WHERE id = ?').get(req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const row = db.prepare('SELECT image FROM cours_live WHERE id = ?').get(req.params.id);
            const result = db.prepare('DELETE FROM cours_live WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            if (row && row.image) await deleteFromCloudinary(row.image);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
})());

// --- Cours PDFs (admin CRUD with Cloudinary raw upload) ---
app.use('/api/admin/cours-pdfs', authMiddleware, (() => {
    const router = express.Router();
    const fields = SCHEMAS.cours_pdfs;

    router.get('/', (req, res, next) => {
        try { res.json(db.prepare('SELECT * FROM cours_pdfs ORDER BY ordre, date_ajout DESC').all()); }
        catch (err) { next(err); }
    });

    router.get('/:id', (req, res, next) => {
        try {
            const row = db.prepare('SELECT * FROM cours_pdfs WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { next(err); }
    });

    router.post('/', uploadPdf.single('fichier'), async (req, res, next) => {
        try {
            const body = req.body;
            if (req.file) {
                const ext = path.extname(req.file.originalname).toLowerCase();
                if (ext === '.pdf') {
                    const result = await uploadRawToCloudinary(req.file.buffer, 'pdfs', req.file.originalname);
                    body.fichier_url = result.secure_url;
                } else {
                    const result = await uploadToCloudinary(req.file.buffer, 'pdfs');
                    body.fichier_url = result.secure_url;
                }
                body.fichier_nom = req.file.originalname;
                body.taille = (req.file.size / (1024 * 1024)).toFixed(1) + ' MB';
            }
            if (!body.titre || !body.fichier_url) return res.status(400).json({ error: 'Titre et fichier requis' });
            const data = pickFields(body, fields);
            const cols = Object.keys(data);
            const placeholders = cols.map(() => '?').join(',');
            const r = db.prepare(`INSERT INTO cours_pdfs (${cols.join(',')}) VALUES (${placeholders})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare('SELECT * FROM cours_pdfs WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { next(err); }
    });

    router.put('/:id', uploadPdf.single('fichier'), async (req, res, next) => {
        try {
            const body = req.body;
            if (req.file) {
                const old = db.prepare('SELECT fichier_url FROM cours_pdfs WHERE id = ?').get(req.params.id);
                if (old && old.fichier_url && old.fichier_url.includes('cloudinary')) {
                    await deleteRawFromCloudinary(old.fichier_url);
                }
                const ext = path.extname(req.file.originalname).toLowerCase();
                if (ext === '.pdf') {
                    const result = await uploadRawToCloudinary(req.file.buffer, 'pdfs', req.file.originalname);
                    body.fichier_url = result.secure_url;
                } else {
                    const result = await uploadToCloudinary(req.file.buffer, 'pdfs');
                    body.fichier_url = result.secure_url;
                }
                body.fichier_nom = req.file.originalname;
                body.taille = (req.file.size / (1024 * 1024)).toFixed(1) + ' MB';
            }
            const data = pickFields(body, fields);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(c => `${c} = ?`).join(', ');
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE cours_pdfs SET ${sets} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare('SELECT * FROM cours_pdfs WHERE id = ?').get(req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const row = db.prepare('SELECT fichier_url FROM cours_pdfs WHERE id = ?').get(req.params.id);
            const result = db.prepare('DELETE FROM cours_pdfs WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            if (row && row.fichier_url) await deleteRawFromCloudinary(row.fichier_url);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
})());

// --- Hero Slides (admin CRUD with Cloudinary upload) ---
app.use('/api/admin/hero-slides', authMiddleware, (() => {
    const router = express.Router();

    router.get('/', (req, res, next) => {
        try { res.json(db.prepare('SELECT * FROM hero_slides ORDER BY ordre, id').all()); }
        catch (err) { next(err); }
    });

    router.get('/:id', (req, res, next) => {
        try {
            const row = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { next(err); }
    });

    router.post('/', uploadMemory.single('image'), async (req, res, next) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Image requise' });
            const result = await uploadToCloudinary(req.file.buffer, 'hero');
            const data = pickFields({ ...req.body, image: result.secure_url }, SCHEMAS.hero_slides);
            const cols = Object.keys(data);
            const r = db.prepare(`INSERT INTO hero_slides (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { next(err); }
    });

    router.put('/:id', uploadMemory.single('image'), async (req, res, next) => {
        try {
            const body = { ...req.body };
            if (req.file) {
                const old = db.prepare('SELECT image FROM hero_slides WHERE id = ?').get(req.params.id);
                if (old && old.image) await deleteFromCloudinary(old.image);
                const result = await uploadToCloudinary(req.file.buffer, 'hero');
                body.image = result.secure_url;
            }
            const data = pickFields(body, SCHEMAS.hero_slides);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE hero_slides SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id));
        } catch (err) { next(err); }
    });

    // Permutation de deux slides : une seule transaction, pour que les deux
    // valeurs d'ordre ne puissent jamais se retrouver identiques.
    router.put('/:id/swap/:otherId', (req, res, next) => {
        try {
            const a = db.prepare('SELECT id, ordre FROM hero_slides WHERE id = ?').get(req.params.id);
            const b = db.prepare('SELECT id, ordre FROM hero_slides WHERE id = ?').get(req.params.otherId);
            if (!a || !b) return res.status(404).json({ error: 'Slide non trouvé' });
            const upd = db.prepare('UPDATE hero_slides SET ordre = ? WHERE id = ?');
            db.transaction(() => { upd.run(b.ordre, a.id); upd.run(a.ordre, b.id); })();
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const row = db.prepare('SELECT image FROM hero_slides WHERE id = ?').get(req.params.id);
            const result = db.prepare('DELETE FROM hero_slides WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            if (row && row.image) await deleteFromCloudinary(row.image);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
})());

// --- Albums (admin CRUD with Cloudinary cover image) ---
app.use('/api/admin/albums', authMiddleware, (() => {
    const router = express.Router();

    router.get('/', (req, res, next) => {
        try {
            const albums = db.prepare('SELECT * FROM albums ORDER BY ordre, id').all();
            albums.forEach(a => {
                a.photoCount = db.prepare('SELECT COUNT(*) as c FROM album_photos WHERE album_id = ?').get(a.id).c;
            });
            res.json(albums);
        } catch (err) { next(err); }
    });

    router.get('/:id', (req, res, next) => {
        try {
            const row = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { next(err); }
    });

    router.post('/', uploadMemory.single('cover_image'), async (req, res, next) => {
        try {
            const body = { ...req.body };
            if (!body.titre) return res.status(400).json({ error: 'Titre requis' });
            if (req.file) {
                const result = await uploadToCloudinary(req.file.buffer, 'gallery');
                body.cover_image = result.secure_url;
            }
            const data = pickFields(body, SCHEMAS.albums);
            const cols = Object.keys(data);
            const r = db.prepare(`INSERT INTO albums (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare('SELECT * FROM albums WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { next(err); }
    });

    router.put('/:id', uploadMemory.single('cover_image'), async (req, res, next) => {
        try {
            const body = { ...req.body };
            if (req.file) {
                const old = db.prepare('SELECT cover_image FROM albums WHERE id = ?').get(req.params.id);
                if (old && old.cover_image) await deleteFromCloudinary(old.cover_image);
                const result = await uploadToCloudinary(req.file.buffer, 'gallery');
                body.cover_image = result.secure_url;
            }
            const data = pickFields(body, SCHEMAS.albums);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE albums SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const album = db.prepare('SELECT cover_image FROM albums WHERE id = ?').get(req.params.id);
            if (!album) return res.status(404).json({ error: 'Non trouvé' });
            const photos = db.prepare('SELECT image FROM album_photos WHERE album_id = ?').all(req.params.id);
            // La base d'abord : si la suppression échoue, les images distantes sont intactes.
            db.transaction(() => {
                db.prepare('DELETE FROM album_photos WHERE album_id = ?').run(req.params.id);
                db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
            })();
            if (album.cover_image) await deleteFromCloudinary(album.cover_image);
            await Promise.all(photos.map(p => deleteFromCloudinary(p.image)));
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
})());

// --- Album Photos (admin CRUD with Cloudinary upload) ---
app.use('/api/admin/album-photos', authMiddleware, (() => {
    const router = express.Router();

    router.get('/', (req, res, next) => {
        try {
            const albumId = req.query.album_id;
            if (albumId) {
                res.json(db.prepare('SELECT * FROM album_photos WHERE album_id = ? ORDER BY ordre, id').all(albumId));
            } else {
                res.json(db.prepare('SELECT * FROM album_photos ORDER BY album_id, ordre, id').all());
            }
        } catch (err) { next(err); }
    });

    router.get('/:id', (req, res, next) => {
        try {
            const row = db.prepare('SELECT * FROM album_photos WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { next(err); }
    });

    router.post('/', uploadMemory.single('image'), async (req, res, next) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Image requise' });
            if (!req.body.album_id) return res.status(400).json({ error: 'album_id requis' });
            const result = await uploadToCloudinary(req.file.buffer, 'gallery');
            const data = pickFields({ ...req.body, image: result.secure_url }, SCHEMAS.album_photos);
            const cols = Object.keys(data);
            const r = db.prepare(`INSERT INTO album_photos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
                .run(...cols.map(c => data[c]));
            res.json(db.prepare('SELECT * FROM album_photos WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { next(err); }
    });

    // Modification de la légende / de l'ordre (et remplacement optionnel de l'image).
    // Absent auparavant : une photo était figée dès son envoi.
    router.put('/:id', uploadMemory.single('image'), async (req, res, next) => {
        try {
            const body = { ...req.body };
            if (req.file) {
                const old = db.prepare('SELECT image FROM album_photos WHERE id = ?').get(req.params.id);
                if (old && old.image) await deleteFromCloudinary(old.image);
                const result = await uploadToCloudinary(req.file.buffer, 'gallery');
                body.image = result.secure_url;
            }
            const data = pickFields(body, SCHEMAS.album_photos);
            const cols = Object.keys(data);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const values = cols.map(c => data[c]);
            values.push(req.params.id);
            const result = db.prepare(`UPDATE album_photos SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json(db.prepare('SELECT * FROM album_photos WHERE id = ?').get(req.params.id));
        } catch (err) { next(err); }
    });

    router.delete('/:id', async (req, res, next) => {
        try {
            const row = db.prepare('SELECT image FROM album_photos WHERE id = ?').get(req.params.id);
            const result = db.prepare('DELETE FROM album_photos WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            if (row && row.image) await deleteFromCloudinary(row.image);
            res.json({ success: true });
        } catch (err) { next(err); }
    });

    return router;
})());

// --- Membres (lecture + modification + suppression) ---
// Colonnes listées explicitement : un SELECT * exposait le hash bcrypt du
// mot de passe au navigateur de l'admin.
const MEMBRE_COLS = 'id, nom, prenom, email, telephone, type_membre, ville, profession, date_inscription';
const TYPES_MEMBRE = ['sympathisant', 'actif', 'tres_actif', 'honoraire'];

app.get('/api/admin/membres', authMiddleware, (req, res, next) => {
    try { res.json(db.prepare(`SELECT ${MEMBRE_COLS} FROM membres ORDER BY date_inscription DESC`).all()); }
    catch (err) { next(err); }
});
app.get('/api/admin/membres/:id', authMiddleware, (req, res, next) => {
    try {
        const row = db.prepare(`SELECT ${MEMBRE_COLS} FROM membres WHERE id = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    } catch (err) { next(err); }
});
app.put('/api/admin/membres/:id', authMiddleware, (req, res, next) => {
    try {
        if (req.body.type_membre !== undefined && req.body.type_membre !== ''
            && !TYPES_MEMBRE.includes(req.body.type_membre)) {
            return res.status(400).json({ error: `Type de membre invalide. Valeurs acceptées : ${TYPES_MEMBRE.join(', ')}.` });
        }
        const data = pickFields(req.body, ['nom', 'prenom', 'email', 'telephone', 'type_membre',
            { name: 'ville', empty: 'null' }, { name: 'profession', empty: 'null' }]);
        const cols = Object.keys(data);
        if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
        const values = cols.map(c => data[c]);
        values.push(req.params.id);
        const result = db.prepare(`UPDATE membres SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...values);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json(db.prepare(`SELECT ${MEMBRE_COLS} FROM membres WHERE id = ?`).get(req.params.id));
    } catch (err) { next(err); }
});
app.delete('/api/admin/membres/:id', authMiddleware, (req, res, next) => {
    try {
        const result = db.prepare('DELETE FROM membres WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// --- Inscriptions (lecture + suppression) ---
app.get('/api/admin/inscriptions', authMiddleware, (req, res, next) => {
    try { res.json(db.prepare('SELECT * FROM inscriptions ORDER BY date_inscription DESC').all()); }
    catch (err) { next(err); }
});
app.delete('/api/admin/inscriptions/:id', authMiddleware, (req, res, next) => {
    try {
        const result = db.prepare('DELETE FROM inscriptions WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// --- Messages (lecture + marquer lu + suppression) ---
app.get('/api/admin/messages', authMiddleware, (req, res, next) => {
    try { res.json(db.prepare('SELECT * FROM messages ORDER BY date_envoi DESC').all()); }
    catch (err) { next(err); }
});
app.put('/api/admin/messages/:id/read', authMiddleware, (req, res, next) => {
    try {
        const result = db.prepare('UPDATE messages SET lu = 1 WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    } catch (err) { next(err); }
});
app.delete('/api/admin/messages/:id', authMiddleware, (req, res, next) => {
    try {
        const result = db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// --- Scores (lecture + suppression) ---
app.get('/api/admin/scores', authMiddleware, (req, res, next) => {
    try { res.json(db.prepare('SELECT * FROM scores_quiz ORDER BY date_passage DESC').all()); }
    catch (err) { next(err); }
});
app.delete('/api/admin/scores/:id', authMiddleware, (req, res, next) => {
    try {
        const result = db.prepare('DELETE FROM scores_quiz WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// --- Comptes administrateurs ---
// La table admins n'avait aucune route : impossible de lister ou d'ajouter un compte.
app.get('/api/admin/comptes', authMiddleware, (req, res, next) => {
    try { res.json(db.prepare('SELECT id, username, created_at FROM admins ORDER BY id').all()); }
    catch (err) { next(err); }
});
app.post('/api/admin/comptes', authMiddleware, (req, res, next) => {
    try {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';
        if (!username) return res.status(400).json({ error: 'Identifiant requis' });
        if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum' });
        const r = db.prepare('INSERT INTO admins (username, password) VALUES (?, ?)')
            .run(username, bcrypt.hashSync(password, 10));
        res.json(db.prepare('SELECT id, username, created_at FROM admins WHERE id = ?').get(r.lastInsertRowid));
    } catch (err) { next(err); }
});
app.delete('/api/admin/comptes/:id', authMiddleware, (req, res, next) => {
    try {
        const total = db.prepare('SELECT COUNT(*) AS c FROM admins').get().c;
        if (total <= 1) return res.status(409).json({ error: 'Impossible de supprimer le dernier compte administrateur.' });
        if (Number(req.params.id) === Number(req.admin.id)) {
            return res.status(409).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
        }
        const result = db.prepare('DELETE FROM admins WHERE id = ?').run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    } catch (err) { next(err); }
});

// --- Change admin password ---
app.put('/api/admin/password', authMiddleware, (req, res) => {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Mot de passe invalide (min 6 caractères)' });
    }
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
        return res.status(401).json({ error: 'Ancien mot de passe incorrect' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hash, req.admin.id);
    res.json({ success: true });
});

// ============================================================
//  SERVE HTML PAGES
// ============================================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/cours-live', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cours-live.html'));
});

// ============================================================
//  404 ET GESTION DES ERREURS
// ============================================================

// Une route d'API inconnue doit répondre du JSON. Sans ce garde-fou, le
// catch-all ci-dessous renvoie index.html en 200 : le panneau admin croit
// alors recevoir une page de démarrage et affiche un message trompeur.
app.use('/api', (req, res) => {
    res.status(404).json({ error: `Route d'API inconnue : ${req.method} ${req.originalUrl}` });
});

app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestionnaire d'erreurs centralisé : toujours du JSON, jamais la page HTML
// par défaut d'Express, et un message lisible à la place du code SQLite brut.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof multer.MulterError) {
        const messages = {
            LIMIT_FILE_SIZE: 'Fichier trop volumineux (5 Mo maximum pour une image, 20 Mo pour un PDF).',
            LIMIT_UNEXPECTED_FILE: `Champ de fichier inattendu : « ${err.field} ».`
        };
        return res.status(400).json({ error: messages[err.code] || `Envoi du fichier refusé (${err.code}).` });
    }

    // Les fileFilter de multer rejettent avec une Error simple
    if (err.message && err.message.startsWith('Type de fichier non autorisé')) {
        return res.status(400).json({ error: err.message });
    }

    const code = err.code || '';
    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(409).json({
            error: "Opération refusée : cet élément est lié à d'autres données. "
                 + 'Supprimez ou détachez ce qui en dépend, ou vérifiez que la référence saisie existe bien.'
        });
    }
    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        return res.status(409).json({ error: 'Cette valeur est déjà utilisée : elle doit être unique.' });
    }
    if (code === 'SQLITE_CONSTRAINT_NOTNULL') {
        return res.status(400).json({ error: 'Un champ obligatoire est manquant.' });
    }
    if (code.startsWith('SQLITE_')) {
        console.error('Erreur SQLite:', err);
        return res.status(500).json({ error: 'Erreur de base de données.' });
    }

    const status = err.status || 500;
    if (status >= 500) console.error('Erreur serveur:', err);
    res.status(status).json({ error: status >= 500 ? 'Erreur serveur.' : err.message });
});

// ============================================================
//  START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MOREC Structure server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
