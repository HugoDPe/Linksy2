# 🕷️ Scrapers - Documentation

Ce dossier contient les scrapers spécialisés pour chaque fournisseur.

## 📁 Structure

```
scrapers/
├── index.js              # Gestionnaire principal - détecte et route vers le bon scraper
├── fitandrack.js         # Scraper pour FitAndRack (Odoo eCommerce)
├── titaniumstrength.js   # Scraper pour Titanium Strength (Magento/PrestaShop)
└── README.md            # Cette documentation
```

## 🎯 Fournisseurs supportés

### 1. **FitAndRack** (`fitandrack.js`)
- **URL**: `https://www.fitandrack.com`
- **Plateforme**: Odoo eCommerce
- **Spécificités**:
  - Variants sous forme de boutons radio (`input[type="radio"].js_variant_change`)
  - Prix individuels pour chaque variant
  - Carousel d'images Odoo (`#o-carousel-product`)
  - Attributs data-value_id, data-value_name

### 2. **Titanium Strength** (`titaniumstrength.js`)
- **URL**: `https://www.titaniumstrength.fr`
- **Plateforme**: Magento/PrestaShop (détecté)
- **Spécificités**:
  - Swatch options pour les variants
  - Select dropdowns pour les attributs
  - Images avec galerie standard e-commerce
  - SKU et disponibilité extraits

### 3. **Générique** (`index.js`)
- Scraper de secours pour les sites non supportés
- Extraction basique : titre, description, prix, images
- Variants simples (select uniquement)

## 🔧 Comment ajouter un nouveau fournisseur

### Étape 1 : Créer le fichier du scraper

Créez un fichier `nouveaufournisseur.js` dans `scrapers/` :

```javascript
/**
 * Scraper pour [Nom du fournisseur]
 * Site: https://www.example.com
 */

export function isNouveauFournisseur(url) {
  return url.includes('example.com');
}

export async function scrapeNouveauFournisseur(page) {
  console.log('   🏷️  Scraper: Nouveau Fournisseur');

  const productData = await page.evaluate(() => {
    // Votre logique d'extraction ici
    
    return {
      title: '...',
      description: '...',
      images: [...],
      price: 0,
      variants: [...],
      variantsCount: 0,
      sourceUrl: window.location.href,
      supplier: 'NouveauFournisseur',
      metadata: {}
    };
  });

  return productData;
}
```

### Étape 2 : Enregistrer dans index.js

Ajoutez votre scraper dans `index.js` :

```javascript
import { isNouveauFournisseur, scrapeNouveauFournisseur } from './nouveaufournisseur.js';

export function detectSupplier(url) {
  if (isFitAndRack(url)) {
    return { supplier: 'FitAndRack', scraper: scrapeFitAndRack };
  }
  
  if (isTitaniumStrength(url)) {
    return { supplier: 'TitaniumStrength', scraper: scrapeTitaniumStrength };
  }
  
  // AJOUTEZ ICI
  if (isNouveauFournisseur(url)) {
    return { supplier: 'NouveauFournisseur', scraper: scrapeNouveauFournisseur };
  }

  return { supplier: 'Generic', scraper: scrapeGeneric };
}
```

## 📊 Format de retour obligatoire

Chaque scraper **DOIT** retourner un objet avec cette structure :

```javascript
{
  title: string,              // Titre du produit (requis)
  description: string,        // Description HTML/texte
  images: string[],           // Tableau d'URLs d'images
  price: number,              // Prix de base
  variants: [                 // Tableau de variants
    {
      id: string,             // ID unique du variant
      name: string,           // Nom du variant (ex: "5KG - Noir")
      price: number,          // Prix du variant
      sku: string,            // SKU/référence
      type: string,           // Type: 'radio', 'select', 'button', 'default'
      isDefault?: boolean,    // Si c'est le variant par défaut
      attributeName?: string  // Nom de l'attribut (ex: "Poids")
    }
  ],
  variantsCount: number,      // Nombre de variants
  sourceUrl: string,          // URL source
  supplier: string,           // Nom du fournisseur
  metadata: {                 // Métadonnées optionnelles
    platform: string,         // Plateforme e-commerce
    sku: string,              // SKU principal
    ...                       // Autres données spécifiques
  }
}
```

## 🧪 Tester un nouveau scraper

### Méthode 1 : Via l'API

```bash
curl -X POST http://localhost:3000/api/scrap \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://www.example.com/produit"]}'
```

### Méthode 2 : Via le front-end

1. Démarrez l'application : `docker compose up`
2. Accédez à http://localhost:5173
3. Collez l'URL du produit
4. Cliquez sur "Lancer le scraping"

### Méthode 3 : Script de test direct

```javascript
import { chromium } from 'playwright';
import { scrapeNouveauFournisseur } from './scrapers/nouveaufournisseur.js';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://www.example.com/produit');

const data = await scrapeNouveauFournisseur(page);
console.log(data);

await browser.close();
```

## 🐛 Debugging

Pour déboguer un scraper :

1. **Affichez la structure HTML** :
```javascript
const html = await page.content();
console.log(html);
```

2. **Prenez des screenshots** :
```javascript
await page.screenshot({ path: '/tmp/debug.png' });
```

3. **Vérifiez les sélecteurs** :
```javascript
const exists = await page.$('votre-selecteur');
console.log('Élément trouvé:', exists !== null);
```

4. **Logs dans l'évaluation** :
```javascript
await page.evaluate(() => {
  console.log('HTML body:', document.body.innerHTML);
});
```

## 📝 Bonnes pratiques

1. ✅ **Toujours retourner un objet avec la structure complète**
2. ✅ **Gérer les cas où les éléments n'existent pas** (optional chaining `?.`)
3. ✅ **Nettoyer les données** (trim, conversions, validation)
4. ✅ **Utiliser des URLs absolues** pour les images
5. ✅ **Limiter le nombre d'images** (max 10 recommandé)
6. ✅ **Extraire les prix en float** (remplacer virgules par points)
7. ✅ **Créer un SKU unique** pour chaque variant
8. ✅ **Documenter les spécificités** du site dans les commentaires

## 🔗 Ressources utiles

- [Playwright Documentation](https://playwright.dev)
- [CSS Selectors Reference](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)

---

**💡 Astuce** : Utilisez les DevTools de Chrome (`F12`) pour inspecter la structure HTML et identifier les bons sélecteurs avant de coder votre scraper.

