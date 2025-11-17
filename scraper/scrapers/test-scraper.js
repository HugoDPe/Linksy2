#!/usr/bin/env node

/**
 * Script de test pour les scrapers
 * Usage: node test-scraper.js <URL>
 * Exemple: node test-scraper.js "https://www.fitandrack.com/shop/force-et-halterophilie-bumper-disque-poids-olympique-entrainement-2-0-6#attr=9"
 */

import { chromium } from 'playwright';
import { isFitAndRack, scrapeFitAndRack } from './fitandrack.js';
import { isTitaniumStrength, scrapeTitaniumStrength } from './titaniumstrength.js';

const url = process.argv[2];

if (!url) {
  console.error('❌ URL manquante');
  console.log('Usage: node test-scraper.js <URL>');
  console.log('Exemple: node test-scraper.js "https://www.fitandrack.com/shop/product-123"');
  process.exit(1);
}

console.log('🚀 Démarrage du test de scraping...');
console.log('📍 URL:', url);
console.log('');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigation vers l'URL
    console.log('⏳ Chargement de la page...');

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
    } catch (e) {
      console.log('⚠️  Timeout lors du chargement, on continue quand même...');
    }

    // Attendre un peu que le JS s'exécute
    await page.waitForTimeout(3000);
    console.log('✅ Page chargée');
    console.log('');

    // Déterminer le scraper à utiliser
    let productData;

    if (isFitAndRack(url)) {
      console.log('🏷️  Fournisseur détecté: FitAndRack');
      productData = await scrapeFitAndRack(page);
    } else if (isTitaniumStrength(url)) {
      console.log('🏷️  Fournisseur détecté: TitaniumStrength');
      productData = await scrapeTitaniumStrength(page);
    } else {
      console.error('❌ Fournisseur non reconnu');
      process.exit(1);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📦 RÉSULTATS DU SCRAPING');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📌 Titre:', productData.title);
    console.log('💰 Prix de base:', productData.price, '€');
    console.log('🏢 Fournisseur:', productData.supplier);
    console.log('🖼️  Images:', productData.images.length);
    console.log('📝 Description:', productData.description.substring(0, 100) + '...');
    console.log('');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`🎨 VARIANTS (${productData.variants.length})`);
    console.log('───────────────────────────────────────────────────────────');

    productData.variants.forEach((variant, index) => {
      console.log('');
      console.log(`Variant #${index + 1}:`);
      console.log('  • Nom:', variant.name);
      console.log('  • SKU:', variant.sku);
      console.log('  • Prix:', variant.price, '€');
      console.log('  • Par défaut:', variant.isDefault ? 'Oui' : 'Non');
      if (variant.attributeName) {
        console.log('  • Attribut:', variant.attributeName);
      }
    });

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📄 JSON complet:');
    console.log(JSON.stringify(productData, null, 2));

  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

