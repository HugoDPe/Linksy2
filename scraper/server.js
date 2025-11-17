/**
 * Serveur Express pour gérer le scrapping des fiches produits
 * Utilise Playwright pour extraire les données (titre, description, images, prix, variants)
 */

import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import axios from 'axios';
import { scrapeProduct } from './scrapers/index.js';

const app = express();
const PORT = process.env.PORT || 3000; // récupérer de l'env

// Configuration CORS pour permettre les requêtes depuis le front Vite
app.use(cors());
app.use(express.json());

// URL de l'API Symfony (via le réseau Docker interne)
const API_URL = process.env.SYMFONY_API_URL || 'http://localhost:8000';

/**
 * Endpoint principal de scrapping avec Server-Sent Events
 * GET /api/scrap-stream?urls=url1,url2,url3
 * Retourne: Stream d'événements avec progression en temps réel
 */
app.get('/api/scrap-stream', async (req, res) => {
  const urlsParam = req.query.urls;

  if (!urlsParam) {
    return res.status(400).json({
      success: false,
      message: 'Le paramètre "urls" est requis'
    });
  }

  const urls = Array.isArray(urlsParam) ? urlsParam : urlsParam.split(',').map(u => u.trim());

  if (urls.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Au moins une URL est requise'
    });
  }

  // Configuration SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Pour Nginx

  // Fonction helper pour envoyer des événements SSE
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    // Force le flush immédiat pour envoyer les données au client
    if (res.flush) {
      res.flush();
    }
  };

  console.log(`🚀 Démarrage du scrapping pour ${urls.length} URL(s)...`);
  sendEvent('start', { total: urls.length, message: 'Démarrage du scrapping...' });

  let browser = null;
  let successCount = 0;
  let errorCount = 0;

  try {
    // Initialisation du navigateur Chromium
    console.log('🌐 Lancement du navigateur Chromium...');
    sendEvent('progress', { message: '🌐 Lancement du navigateur...', current: 0, total: urls.length });

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-infobars',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        '--lang=fr-FR'
      ]
    });

    // Traitement de chaque URL individuellement
    for (const [index, url] of urls.entries()) {
      const current = index + 1;
      console.log(`\n📄 [${current}/${urls.length}] Scrapping de: ${url}`);

      sendEvent('progress', {
        message: `📄 Scrapping ${current}/${urls.length}: ${url}`,
        current,
        total: urls.length,
        url
      });

      try {
        const page = await browser.newPage();

        // Masquer le fait qu'on est un bot
        await page.addInitScript(() => {
          // Supprimer les traces de webdriver
          Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
          });

          // Masquer les propriétés Playwright/Puppeteer
          Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
          });

          Object.defineProperty(navigator, 'languages', {
            get: () => ['fr-FR', 'fr', 'en-US', 'en'],
          });

          // Chrome object
          window.chrome = {
            runtime: {},
          };

          // Permissions
          const originalQuery = window.navigator.permissions.query;
          window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
              Promise.resolve({ state: Notification.permission }) :
              originalQuery(parameters)
          );
        });

        // Configuration du viewport (simule un navigateur réel)
        await page.setViewportSize({ width: 1920, height: 1080 });

        // Configuration complète des headers pour contourner les protections anti-bot
        await page.setExtraHTTPHeaders({
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0'
        });

        console.log('   🌐 Navigation vers la page...');

        // Tentative de navigation avec plusieurs stratégies
        let navigationSuccess = false;
        const navigationStrategies = [
          { waitUntil: 'domcontentloaded', timeout: 45000 },
          { waitUntil: 'load', timeout: 45000 },
          { waitUntil: 'networkidle', timeout: 60000 }
        ];

        for (const [index, strategy] of navigationStrategies.entries()) {
          try {
            console.log(`   📡 Tentative ${index + 1}/${navigationStrategies.length} (${strategy.waitUntil})...`);
            await page.goto(url, strategy);
            navigationSuccess = true;
            console.log(`   ✓ Page chargée avec succès`);
            break;
          } catch (navError) {
            console.log(`   ⚠️  Tentative ${index + 1} échouée: ${navError.message}`);
            if (index === navigationStrategies.length - 1) {
              throw new Error(`Navigation impossible après ${navigationStrategies.length} tentatives: ${navError.message}`);
            }
          }
        }

        // Vérifier si on est sur une page de challenge Cloudflare
        const isCloudflareChallenge = await page.evaluate(() => {
          const title = document.title.toLowerCase();
          const bodyText = document.body?.innerText?.toLowerCase() || '';
          return title.includes('just a moment') ||
                 title.includes('attention required') ||
                 title.includes('please wait') ||
                 bodyText.includes('checking your browser') ||
                 bodyText.includes('cloudflare') ||
                 bodyText.includes('ddos');
        });

        if (isCloudflareChallenge) {
          console.log('   🛡️  Challenge Cloudflare détecté, attente de résolution (10 secondes)...');
          await page.waitForTimeout(10000); // Attendre que le challenge se résolve

          // Vérifier si toujours bloqué
          const stillBlocked = await page.evaluate(() => {
            const title = document.title.toLowerCase();
            return title.includes('just a moment') || title.includes('please wait');
          });

          if (stillBlocked) {
            console.log('   🛡️  Toujours bloqué, attente supplémentaire (10 secondes)...');
            await page.waitForTimeout(10000);

            const finalCheck = await page.evaluate(() => {
              return document.title.toLowerCase().includes('just a moment');
            });

            if (finalCheck) {
              throw new Error('Site protégé par Cloudflare - impossible de contourner la protection après 20s');
            }
          }
          console.log('   ✓ Challenge Cloudflare résolu');
        } else {
          console.log('   ✓ Pas de challenge Cloudflare détecté');
        }

        // Utilisation du scraper approprié selon le fournisseur
        const productData = await scrapeProduct(page, url);

        console.log(`✅ Données extraites: ${productData.title}`);
        console.log(`   🏭 Fournisseur: ${productData.supplier}`);
        console.log(`   📊 ${productData.variantsCount} variant(s) détecté(s)`);
        console.log(`   🖼️  ${productData.images.length} image(s) trouvée(s)`);

        sendEvent('scraped', {
          current,
          total: urls.length,
          product: {
            title: productData.title,
            supplier: productData.supplier,
            variants: productData.variantsCount,
            images: productData.images.length
          }
        });

        await page.close();

        // Envoi immédiat du produit à Shopify
        console.log(`📤 Envoi du produit "${productData.title}" à Shopify...`);
        sendEvent('sending', {
          current,
          total: urls.length,
          message: `📤 Envoi à Shopify: ${productData.title}`
        });

        try {
          const shopifyResponse = await axios.post(`${API_URL}/api/shopify/import`, {
            products: [productData]
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
          });

          console.log(`✅ Produit envoyé avec succès à Shopify`);

          sendEvent('imported', {
            current,
            total: urls.length,
            product: productData.title,
            shopifyResponse: shopifyResponse.data
          });

          successCount++;

        } catch (apiError) {
          console.error(`❌ Erreur lors de l'envoi à Shopify:`, apiError.message);

          sendEvent('product-error', {
            current,
            total: urls.length,
            url,
            product: productData.title,
            error: apiError.message
          });

          errorCount++;
        }

      } catch (error) {
        console.error(`❌ Erreur lors du scrapping de ${url}:`, error.message);

        sendEvent('product-error', {
          current,
          total: urls.length,
          url,
          error: error.message
        });

        errorCount++;
      }
    }

    await browser.close();
    console.log('\n🎉 Scrapping terminé !');

    // Envoi de l'événement final
    sendEvent('complete', {
      total: urls.length,
      success: successCount,
      errors: errorCount,
      message: `Terminé : ${successCount} importé(s), ${errorCount} erreur(s)`
    });

    res.end();

  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);

    sendEvent('fatal-error', { error: error.message });

    if (browser) {
      await browser.close();
    }

    res.end();
  }
});

/**
 * Endpoint de santé pour vérifier que le serveur fonctionne
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Linksy Scrapper API' });
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Serveur Express démarré sur le port ${PORT}`);
  console.log(`📡 API Symfony: ${API_URL}`);
  console.log(`🔍 Endpoint: POST http://localhost:${PORT}/api/scrap\n`);
});

