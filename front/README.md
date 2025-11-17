# 🔗 Linksy Front - Interface de Scrapping Shopify

Application Vue.js 3 avec serveur Node.js pour scraper des fiches produits et les importer automatiquement sur Shopify.

## 🚀 Technologies

- **Vue.js 3** + **Vite** - Framework frontend moderne
- **Tailwind CSS** - Framework CSS utility-first
- **Express.js** - Serveur API Node.js
- **Playwright** - Scrapping de pages web (navigateur Chromium headless)
- **Axios** - Client HTTP

## 📁 Architecture

```
front/
├── Dockerfile              # Image Docker Node.js avec Playwright
├── package.json            # Dépendances npm
├── server.js               # Serveur Express pour le scrapping
├── vite.config.js          # Configuration Vite
├── tailwind.config.js      # Configuration Tailwind
├── index.html              # Point d'entrée HTML
└── src/
    ├── main.js             # Bootstrap Vue
    ├── App.vue             # Composant racine
    ├── style.css           # Styles globaux Tailwind
    └── components/
        ├── UrlInput.vue    # Saisie des URLs à scraper
        ├── Progress.vue    # Barre de progression animée
        └── Logs.vue        # Console de logs en temps réel
```

## 🛠️ Installation locale (hors Docker)

```bash
cd front
npm install
```

## 🐳 Utilisation avec Docker

Le service `front` est défini dans `docker-compose.yml`. Pour le lancer :

```bash
# Démarrer tous les services (y compris front)
docker-compose up -d

# Voir les logs du front
docker-compose logs -f front

# Reconstruire l'image
docker-compose build front
```

## 🌐 Accès

- **Interface Vue.js** : http://localhost:5173
- **API Scrapping** : http://localhost:3000/api/scrap
- **Health check** : http://localhost:3000/health

## 📝 Fonctionnement

1. L'utilisateur colle des URLs de fiches produits dans l'interface
2. Le front envoie les URLs à `/api/scrap` (serveur Node local)
3. Le serveur lance Playwright pour scraper chaque page :
   - Titre
   - Description
   - Images
   - Prix
   - Variants
4. Les données sont envoyées à l'API Symfony (`http://api:8000/api/shopify/import`)
5. L'API crée les produits sur Shopify
6. Le résultat est affiché dans l'interface

## 🔧 Variables d'environnement

Définies dans `docker/env/front.env` :

- `API_URL` : URL de l'API Symfony (ex: `http://api:8000`)
- `NODE_ENV` : Mode d'exécution (`development` ou `production`)
- `EXPRESS_PORT` : Port du serveur Express (défaut: 3000)
- `VITE_PORT` : Port Vite dev server (défaut: 5173)

## 🎨 Composants Vue

### UrlInput.vue
Zone de saisie multi-lignes pour coller les URLs. Validation automatique et compteur d'URLs détectées.

### Progress.vue
Barre de progression animée avec étapes détaillées :
- 🌐 Initialisation du navigateur
- 🔍 Scrapping des fiches
- 📤 Envoi à Shopify
- ✅ Import terminé

### Logs.vue
Console style terminal avec logs colorés par type (info, success, error, warning). Défilement automatique.

## 🐛 Debug

Pour voir les logs Playwright en direct :

```bash
docker-compose exec front sh
# Dans le conteneur :
node server.cjs
```

## 📦 Build de production

```bash
npm run build
# Les fichiers sont générés dans dist/
```

## ⚠️ Notes importantes

- Playwright est configuré en mode **headless** pour Docker
- Le navigateur Chromium est préinstallé dans l'image Docker
- Le scrapping peut prendre du temps selon le nombre d'URLs
- Les sélecteurs CSS pour l'extraction sont génériques et peuvent nécessiter des ajustements selon les sites cibles

## 🤝 Communication avec le back

Le serveur Express communique avec l'API Symfony via le réseau Docker interne :

```javascript
const API_URL = process.env.API_URL || 'http://api:8000'
await axios.post(`${API_URL}/api/shopify/import`, { products })
```

## 📄 Licence

Propriétaire - Linksy © 2025

