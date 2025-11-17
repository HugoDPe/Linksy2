const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

// Sert les fichiers statiques depuis le dossier dist
app.use(express.static(path.join(__dirname, 'dist')));

// Pour le mode SPA (Single Page Application) : redirige toutes les routes vers index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});