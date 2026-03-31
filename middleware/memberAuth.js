const jwt = require('jsonwebtoken');

function memberAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Connexion requise' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'membre') {
            return res.status(403).json({ error: 'Accès réservé aux membres' });
        }
        req.membre = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

module.exports = memberAuthMiddleware;
