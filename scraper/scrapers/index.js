/**
 * Gestionnaire de scrapers - Détecte automatiquement le fournisseur
 * et utilise le scraper approprié
 */

import { isFitAndRack, scrapeFitAndRack } from './fitandrack.js';
import { isTitaniumStrength, scrapeTitaniumStrength } from './titaniumstrength.js';

/**
 * Détecte le fournisseur à partir de l'URL
 * @param {string} url - URL du produit
 * @returns {Object} - { supplier: string, scraperFunction: Function }
 */
export function detectSupplier(url) {
  if (isFitAndRack(url)) {
    return {
      supplier: 'FitAndRack',
      scraper: scrapeFitAndRack
    };
  }

  if (isTitaniumStrength(url)) {
    return {
      supplier: 'TitaniumStrength',
      scraper: scrapeTitaniumStrength
    };
  }

  // Plus de fallback vers Generic: lever une erreur si fournisseur non supporté
  throw new Error(`Fournisseur non supporté pour l'URL: ${url}`);
}

/**
 * NOTE: Il n'y a plus de scraper générique dans ce projet.
 * Seuls les scrapers spécialisés sont supportés (FitAndRack, TitaniumStrength).
 */

/**
 * Scrape un produit en utilisant le scraper approprié
 * @param {Page} page - Page Playwright
 * @param {string} url - URL du produit
 * @returns {Object} - Données du produit
 */
export async function scrapeProduct(page, url) {
  let supplier, scraper;
  try {
    ({ supplier, scraper } = detectSupplier(url));
    console.log(`   🏭 Fournisseur détecté: ${supplier}`);
  } catch (err) {
    console.error(`   ❌ ${err.message}`);
    throw err; // remonter l'erreur — plus de scraper générique
  }

  // Vérifier que la page est accessible
  const pageTitle = await page.title().catch(() => 'N/A');
  console.log(`   📄 Titre de la page: ${pageTitle}`);

  try {
    const productData = await scraper(page);

    // Validation basique des données extraites
    if (!productData.title || productData.title === 'Produit sans titre') {
      console.log('   ⚠️  Données incomplètes, nouvelle tentative...');

      // Attendre un peu et réessayer
      await page.waitForTimeout(2000);
      const retryData = await scraper(page);

      if (retryData.title && retryData.title !== 'Produit sans titre') {
        return retryData;
      }
    }

    return productData;
  } catch (error) {
    console.error(`   ❌ Erreur avec le scraper ${supplier}:`, error.message);
    console.error(`   📍 Stack: ${error.stack?.split('\n')[0]}`);

    // Plus de fallback vers Generic — on remonte l'erreur
    throw error;
  }
}
