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
function deleteRawFromCloudinary(fileUrl) {
    if (!fileUrl || !fileUrl.includes('cloudinary')) return Promise.resolve();
    const parts = fileUrl.split('/upload/');
    if (parts.length < 2) return Promise.resolve();
    const afterUpload = parts[1].replace(/^v\d+\//, '');
    const publicId = afterUpload;
    return cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {});
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
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not set!');
            return res.status(500).json({ error: 'Configuration serveur manquante (JWT_SECRET)' });
        }
        const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: '8h' });
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
        process.env.JWT_SECRET,
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

// --- Generic CRUD helper ---
function crudRoutes(tableName, fields, orderBy = 'id') {
    const router = express.Router();

    router.get('/', (req, res) => {
        const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY ${orderBy}`).all();
        res.json(rows);
    });

    router.get('/:id', (req, res) => {
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.post('/', (req, res) => {
        const cols = fields.filter(f => req.body[f] !== undefined);
        if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
        const placeholders = cols.map(() => '?').join(',');
        const values = cols.map(f => req.body[f]);
        const result = db.prepare(`INSERT INTO ${tableName} (${cols.join(',')}) VALUES (${placeholders})`).run(...values);
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(result.lastInsertRowid);
        res.json(row);
    });

    router.put('/:id', (req, res) => {
        const cols = fields.filter(f => req.body[f] !== undefined);
        if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
        const sets = cols.map(f => `${f} = ?`).join(', ');
        const values = cols.map(f => req.body[f]);
        values.push(req.params.id);
        db.prepare(`UPDATE ${tableName} SET ${sets} WHERE id = ?`).run(...values);
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.delete('/:id', (req, res) => {
        const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
        res.json({ success: true });
    });

    return router;
}

// Mount CRUD routes
app.use('/api/admin/stats', authMiddleware, crudRoutes('stats', ['nombre', 'suffixe', 'label', 'ordre'], 'ordre'));
app.use('/api/admin/citations', authMiddleware, crudRoutes('citations', ['texte', 'auteur']));
app.use('/api/admin/formations', authMiddleware, crudRoutes('formations', ['icon', 'titre', 'description', 'duree', 'certificat', 'places', 'populaire', 'ordre'], 'ordre'));
app.use('/api/admin/evenements', authMiddleware, (() => {
    const router = express.Router();
    const fields = ['categorie', 'icon', 'titre', 'description', 'date_event', 'lieu', 'places', 'image', 'ordre'];

    router.get('/', (req, res) => {
        res.json(db.prepare('SELECT * FROM evenements ORDER BY ordre').all());
    });

    router.get('/:id', (req, res) => {
        const row = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.post('/', uploadMemory.single('image'), async (req, res) => {
        try {
            const body = req.body;
            if (req.file) {
                const result = await uploadToCloudinary(req.file.buffer, 'events');
                body.image = result.secure_url;
            }
            const cols = fields.filter(f => body[f] !== undefined);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const placeholders = cols.map(() => '?').join(',');
            const values = cols.map(f => body[f]);
            const r = db.prepare(`INSERT INTO evenements (${cols.join(',')}) VALUES (${placeholders})`).run(...values);
            res.json(db.prepare('SELECT * FROM evenements WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/:id', uploadMemory.single('image'), async (req, res) => {
        try {
            const body = req.body;
            if (req.file) {
                const old = db.prepare('SELECT image FROM evenements WHERE id = ?').get(req.params.id);
                if (old && old.image) await deleteFromCloudinary(old.image);
                const result = await uploadToCloudinary(req.file.buffer, 'events');
                body.image = result.secure_url;
            }
            const cols = fields.filter(f => body[f] !== undefined);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(f => `${f} = ?`).join(', ');
            const values = cols.map(f => body[f]);
            values.push(req.params.id);
            db.prepare(`UPDATE evenements SET ${sets} WHERE id = ?`).run(...values);
            const row = db.prepare('SELECT * FROM evenements WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const row = db.prepare('SELECT image FROM evenements WHERE id = ?').get(req.params.id);
            if (row && row.image) await deleteFromCloudinary(row.image);
            const result = db.prepare('DELETE FROM evenements WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
})());
app.use('/api/admin/playlists', authMiddleware, crudRoutes('playlists', ['slug', 'nom', 'icon', 'icon_class', 'formateur', 'duree_totale', 'ordre'], 'ordre'));
app.use('/api/admin/videos', authMiddleware, crudRoutes('videos', ['playlist_id', 'titre', 'description', 'duree', 'vues', 'ordre'], 'playlist_id, ordre'));
app.use('/api/admin/quiz', authMiddleware, crudRoutes('quiz_questions', ['playlist_id', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_index', 'ordre'], 'playlist_id, ordre'));
app.use('/api/admin/pourquoi', authMiddleware, crudRoutes('pourquoi', ['numero', 'titre', 'description', 'ordre'], 'ordre'));
app.use('/api/admin/temoignages', authMiddleware, crudRoutes('temoignages', ['nom', 'role', 'texte', 'initiales', 'etoiles']));
app.use('/api/admin/equipe', authMiddleware, crudRoutes('equipe', ['nom', 'role', 'description', 'linkedin', 'facebook', 'ordre'], 'ordre'));
app.use('/api/admin/cours-live', authMiddleware, crudRoutes('cours_live', ['titre', 'description', 'formateur', 'date_cours', 'heure_debut', 'heure_fin', 'lien', 'plateforme', 'statut', 'max_participants', 'image', 'ordre'], 'date_cours, heure_debut'));

// --- Cours PDFs (admin CRUD with Cloudinary raw upload) ---
app.use('/api/admin/cours-pdfs', authMiddleware, (() => {
    const router = express.Router();
    const fields = ['titre', 'description', 'categorie', 'fichier_url', 'fichier_nom', 'taille', 'formation_id', 'ordre'];

    router.get('/', (req, res) => {
        res.json(db.prepare('SELECT * FROM cours_pdfs ORDER BY ordre, date_ajout DESC').all());
    });

    router.get('/:id', (req, res) => {
        const row = db.prepare('SELECT * FROM cours_pdfs WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.post('/', uploadPdf.single('fichier'), async (req, res) => {
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
            const cols = fields.filter(f => body[f] !== undefined);
            const placeholders = cols.map(() => '?').join(',');
            const values = cols.map(f => body[f]);
            const r = db.prepare(`INSERT INTO cours_pdfs (${cols.join(',')}) VALUES (${placeholders})`).run(...values);
            res.json(db.prepare('SELECT * FROM cours_pdfs WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/:id', uploadPdf.single('fichier'), async (req, res) => {
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
            const cols = fields.filter(f => body[f] !== undefined);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(f => `${f} = ?`).join(', ');
            const values = cols.map(f => body[f]);
            values.push(req.params.id);
            db.prepare(`UPDATE cours_pdfs SET ${sets} WHERE id = ?`).run(...values);
            const row = db.prepare('SELECT * FROM cours_pdfs WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const row = db.prepare('SELECT fichier_url FROM cours_pdfs WHERE id = ?').get(req.params.id);
            if (row && row.fichier_url && row.fichier_url.includes('cloudinary')) {
                await deleteRawFromCloudinary(row.fichier_url);
            }
            const result = db.prepare('DELETE FROM cours_pdfs WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
})());

// --- Hero Slides (admin CRUD with Cloudinary upload) ---
app.use('/api/admin/hero-slides', authMiddleware, (() => {
    const router = express.Router();

    router.get('/', (req, res) => {
        res.json(db.prepare('SELECT * FROM hero_slides ORDER BY ordre').all());
    });

    router.get('/:id', (req, res) => {
        const row = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.post('/', uploadMemory.single('image'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Image requise' });
            const result = await uploadToCloudinary(req.file.buffer, 'hero');
            const image = result.secure_url;
            const ordre = req.body.ordre || 0;
            const r = db.prepare('INSERT INTO hero_slides (image, ordre) VALUES (?, ?)').run(image, ordre);
            res.json(db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/:id', uploadMemory.single('image'), async (req, res) => {
        try {
            const body = req.body;
            if (req.file) {
                const old = db.prepare('SELECT image FROM hero_slides WHERE id = ?').get(req.params.id);
                if (old && old.image) await deleteFromCloudinary(old.image);
                const result = await uploadToCloudinary(req.file.buffer, 'hero');
                body.image = result.secure_url;
            }
            const sets = [];
            const values = [];
            if (body.image) { sets.push('image = ?'); values.push(body.image); }
            if (body.ordre !== undefined) { sets.push('ordre = ?'); values.push(body.ordre); }
            if (sets.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            values.push(req.params.id);
            db.prepare(`UPDATE hero_slides SET ${sets.join(', ')} WHERE id = ?`).run(...values);
            const row = db.prepare('SELECT * FROM hero_slides WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const row = db.prepare('SELECT image FROM hero_slides WHERE id = ?').get(req.params.id);
            if (row && row.image) await deleteFromCloudinary(row.image);
            const result = db.prepare('DELETE FROM hero_slides WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
})());

// --- Albums (admin CRUD with Cloudinary cover image) ---
app.use('/api/admin/albums', authMiddleware, (() => {
    const router = express.Router();

    router.get('/', (req, res) => {
        const albums = db.prepare('SELECT * FROM albums ORDER BY ordre').all();
        albums.forEach(a => {
            a.photoCount = db.prepare('SELECT COUNT(*) as c FROM album_photos WHERE album_id = ?').get(a.id).c;
        });
        res.json(albums);
    });

    router.get('/:id', (req, res) => {
        const row = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Non trouvé' });
        res.json(row);
    });

    router.post('/', uploadMemory.single('cover_image'), async (req, res) => {
        try {
            const { titre, description, date_album, ordre } = req.body;
            if (!titre) return res.status(400).json({ error: 'Titre requis' });
            let cover = null;
            if (req.file) {
                const result = await uploadToCloudinary(req.file.buffer, 'gallery');
                cover = result.secure_url;
            }
            const r = db.prepare('INSERT INTO albums (titre, description, cover_image, date_album, ordre) VALUES (?,?,?,?,?)')
                .run(titre, description || null, cover, date_album || null, ordre || 0);
            res.json(db.prepare('SELECT * FROM albums WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/:id', uploadMemory.single('cover_image'), async (req, res) => {
        try {
            const body = req.body;
            if (req.file) {
                const old = db.prepare('SELECT cover_image FROM albums WHERE id = ?').get(req.params.id);
                if (old && old.cover_image) await deleteFromCloudinary(old.cover_image);
                const result = await uploadToCloudinary(req.file.buffer, 'gallery');
                body.cover_image = result.secure_url;
            }
            const fields = ['titre', 'description', 'cover_image', 'date_album', 'ordre'];
            const cols = fields.filter(f => body[f] !== undefined);
            if (cols.length === 0) return res.status(400).json({ error: 'Aucune donnée fournie' });
            const sets = cols.map(f => `${f} = ?`).join(', ');
            const values = cols.map(f => body[f]);
            values.push(req.params.id);
            db.prepare(`UPDATE albums SET ${sets} WHERE id = ?`).run(...values);
            const row = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
            if (!row) return res.status(404).json({ error: 'Non trouvé' });
            res.json(row);
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const album = db.prepare('SELECT cover_image FROM albums WHERE id = ?').get(req.params.id);
            if (album && album.cover_image) await deleteFromCloudinary(album.cover_image);
            // Delete all album photos from Cloudinary
            const photos = db.prepare('SELECT image FROM album_photos WHERE album_id = ?').all(req.params.id);
            await Promise.all(photos.map(p => deleteFromCloudinary(p.image)));
            db.prepare('DELETE FROM album_photos WHERE album_id = ?').run(req.params.id);
            const result = db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
})());

// --- Album Photos (admin CRUD with Cloudinary upload) ---
app.use('/api/admin/album-photos', authMiddleware, (() => {
    const router = express.Router();

    router.get('/', (req, res) => {
        const albumId = req.query.album_id;
        if (albumId) {
            res.json(db.prepare('SELECT * FROM album_photos WHERE album_id = ? ORDER BY ordre').all(albumId));
        } else {
            res.json(db.prepare('SELECT * FROM album_photos ORDER BY album_id, ordre').all());
        }
    });

    router.post('/', uploadMemory.single('image'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Image requise' });
            const { album_id, legende, ordre } = req.body;
            if (!album_id) return res.status(400).json({ error: 'album_id requis' });
            const result = await uploadToCloudinary(req.file.buffer, 'gallery');
            const image = result.secure_url;
            const r = db.prepare('INSERT INTO album_photos (album_id, image, legende, ordre) VALUES (?,?,?,?)')
                .run(album_id, image, legende || null, ordre || 0);
            res.json(db.prepare('SELECT * FROM album_photos WHERE id = ?').get(r.lastInsertRowid));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const row = db.prepare('SELECT image FROM album_photos WHERE id = ?').get(req.params.id);
            if (row && row.image) await deleteFromCloudinary(row.image);
            const result = db.prepare('DELETE FROM album_photos WHERE id = ?').run(req.params.id);
            if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    return router;
})());

// --- Membres (read + delete for admin) ---
app.get('/api/admin/membres', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM membres ORDER BY date_inscription DESC').all();
    res.json(rows);
});
app.get('/api/admin/membres/:id', authMiddleware, (req, res) => {
    const row = db.prepare('SELECT * FROM membres WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Non trouvé' });
    res.json(row);
});
app.put('/api/admin/membres/:id', authMiddleware, (req, res) => {
    const { type_membre } = req.body;
    if (type_membre) {
        db.prepare('UPDATE membres SET type_membre = ? WHERE id = ?').run(type_membre, req.params.id);
    }
    const row = db.prepare('SELECT * FROM membres WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Non trouvé' });
    res.json(row);
});
app.delete('/api/admin/membres/:id', authMiddleware, (req, res) => {
    const result = db.prepare('DELETE FROM membres WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Non trouvé' });
    res.json({ success: true });
});

// --- Inscriptions (read-only + delete for admin) ---
app.get('/api/admin/inscriptions', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM inscriptions ORDER BY date_inscription DESC').all();
    res.json(rows);
});
app.delete('/api/admin/inscriptions/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM inscriptions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Messages (read + mark as read + delete) ---
app.get('/api/admin/messages', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM messages ORDER BY date_envoi DESC').all();
    res.json(rows);
});
app.put('/api/admin/messages/:id/read', authMiddleware, (req, res) => {
    db.prepare('UPDATE messages SET lu = 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});
app.delete('/api/admin/messages/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

// --- Scores (read + delete) ---
app.get('/api/admin/scores', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM scores_quiz ORDER BY date_passage DESC').all();
    res.json(rows);
});
app.delete('/api/admin/scores/:id', authMiddleware, (req, res) => {
    db.prepare('DELETE FROM scores_quiz WHERE id = ?').run(req.params.id);
    res.json({ success: true });
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

app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
//  START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MOREC Structure server running on http://localhost:${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin`);
});
