/**
 * Scraper spécifique pour Titanium Strength
 * Site: https://www.titaniumstrength.fr
 *
 * NOTE: Ce site bloque Playwright/Puppeteer, on utilise donc axios + cheerio
 */

import { gotScraping } from 'got-scraping';
import * as cheerio from 'cheerio';

// --- Fonctions Utilitaires ---

/**
 * Parse une chaîne de prix simple (ex: "2355" ou "1 535,00€") en nombre.
 */
function parsePriceString(s) {
    if (!s && s !== 0) return 0;
    let str = String(s).trim();
    if (!str) return 0;
    // enlever espaces insécables et espaces fins
    str = str.replace(/\u00A0|\u202F|\s/g, '');
    // ne garder que chiffres, points, virgules et signe -
    str = str.replace(/[^0-9.,-]/g, '');
    if (!str) return 0;
    const hasComma = str.indexOf(',') !== -1;
    const hasDot = str.indexOf('.') !== -1;
    if (hasComma && hasDot) {
        // déduire format: si la dernière virgule vient après le dernier point => format EU
        str = (str.lastIndexOf(',') > str.lastIndexOf('.')) ? str.replace(/\./g, '').replace(/,/g, '.') : str.replace(/,/g, '');
    } else if (hasComma) {
        str = str.replace(/,/g, '.');
    }
    const n = parseFloat(str);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Extrait les prix (base et ancien) à partir de la page chargée avec Cheerio.
 * Priorité: lire le bloc Nosto caché si présent (div.notranslate > span.nosto_product).
 * @param {*} $ - instance Cheerio
 * @returns {{basePrice: number|null, oldPrice: number|null}}
 */
function extractPrices($) {
    try {
        // Cherche le bloc Nosto caché
        const nostoBlock = $('div.notranslate').filter((i, el) => $(el).find('span.nosto_product').length > 0).first();
        if (nostoBlock && nostoBlock.length) {
            const product = nostoBlock.find('span.nosto_product').first();
            const rawPrice = product.find('span.price').first().text().trim() || product.find('.price').first().text().trim();
            const rawList = product.find('span.list_price').first().text().trim();
            const base = parsePriceString(rawPrice);
            const old = parsePriceString(rawList);
            console.warn(`extractPrices: trouvé bloc Nosto -> rawPrice='${rawPrice}', rawList='${rawList}', parsed base=${base}, old=${old}`);
            return { basePrice: base > 0 ? base : null, oldPrice: old > 0 ? old : null };
        }
    } catch (e) {
        console.warn('extractPrices: erreur lors de la lecture du bloc Nosto', e && e.message ? e.message : e);
    }

    // Fallback: pas de prix récupéré pour ce fournisseur
    console.warn('extractPrices: aucun bloc Nosto trouvé, prix non récupérés pour ce fournisseur.');
    return { basePrice: null, oldPrice: null };
}

// --- Fin Fonctions Utilitaires ---

/**
 * Extrait les URLs des images du produit.
 * @param {*} $ - l'instance Cheerio (non typée ici)
 * @param {string} html - Le contenu HTML brut.
 * @returns {string[]}
 */
function extractImages($, html) {
    const imageUrls = new Set();
    const baseUrl = 'https://www.titaniumstrength.fr';

    // Stratégie 1: Balises <img>
    $('img').each((i, elem) => {
        const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-lazy');
        if (src) imageUrls.add(src);
    });

    // Stratégie 2: Scripts JSON (Galeries Magento)
    $('script[type="text/x-magento-init"], script').each((i, elem) => {
        const scriptContent = $(elem).html() || '';
        const regex = /"(?:https?:)?\/\/[^"]*\/media\/catalog\/product\/[^"]*\.(?:jpg|jpeg|png|webp)"/gi;
        const matches = scriptContent.match(regex);
        if (matches) matches.forEach(url => imageUrls.add(url.replace(/"/g, '')));
    });

    // Stratégie 3: Regex globale sur le HTML
    const regex = /https?:\/\/[^"'\s]*\/media\/catalog\/product\/[^"'\s]*\.(?:jpg|jpeg|png|webp)/gi;
    const matches = html.match(regex);
    if (matches) matches.forEach(url => imageUrls.add(url));

    return [...imageUrls]
        .map(url => url.startsWith('/') ? baseUrl + url : url)
        .map(url => url.split('?')[0]) // Nettoyer les query params
        .filter(url =>
            !/data:image|logo|placeholder|\.pdf|\/icon\//.test(url) &&
            url.includes('/media/catalog/product/')
        )
        .slice(0, 10);
}

/**
 * Extrait la description du produit.
 * @param {*} $ - l'instance Cheerio
 * @returns {string}
 */
function extractDescription($) {
    const parts = [];
    $('#description, #additional').each((i, el) => {
        const html = $(el).html();
        if (html) parts.push(html);
    });

    if (parts.length === 0) {
        const fallback =
            $('#nav-description').html() ||
            $('.product-description').html() ||
            $('[itemprop="description"]').html() ||
            $('meta[name="description"]').attr('content');
        if (fallback) parts.push(fallback);
    }

    return parts.map((part, index) => {
        const $part = cheerio.load(part);
        // retirer les liens HTML pour garder le texte propre
        $part('a').each((_, el) => $part(el).replaceWith($part(el).text()));
        let cleanHtml = $part.html() || '';

        if (index === 0) { // Ne couper que la description principale
            const stopIndex = cleanHtml.toLowerCase().search(/à propos|produits liés|associés/i);
            if (stopIndex > 0) cleanHtml = cleanHtml.substring(0, stopIndex);
        }
        return cleanHtml;
    }).join('\n\n');
}

/**
 * Extrait le SKU du produit.
 * @param {*} $ - l'instance Cheerio
 * @returns {string}
 */
function extractSku($) {
    const selectors = [
        '.product.attribute.sku .value',
        '.product-attribute.sku .value',
        '[class*="attribute sku"] .value'
    ];
    for (const sel of selectors) {
        const text = $(sel).first().text().trim();
        if (text) return text;
    }
    const bodyText = $.text();
    const skuMatch = bodyText.match(/(?:SKU|Référence|REF)\s*[:\s]*([A-Za-z0-9-_.]+)/i) ||
                     bodyText.match(/\b([A-Z0-9]{1,3}-[A-Z0-9-]{3,})\b/i);
    return skuMatch ? skuMatch[1].trim() : '';
}

/**
 * Extrait le contenu du bloc "product attribute overview" (et variantes de classes)
 * Retourne du HTML (paragraphes) ou une chaîne vide
 * @param {*} $ - Cheerio
 * @returns {string}
 */
function extractAttributesOverview($) {
    // Sélecteurs explicites courants
    const selectors = [
        '.product-attribute-overview',
        '.product-attributes-overview',
        '.product.attribute.overview',
        '.additional-attributes',
        '#product-attribute-specs-table',
    ];

    let found = null;
    for (const sel of selectors) {
        try {
            const el = $(sel).first();
            if (el && el.length) { found = el; break; }
        } catch (e) { /* noop */ }
    }

    // Fallback: chercher un élément dont la class contient les tokens product, attribute, overview
    if (!found) {
        found = $('*[class]').filter((i, el) => {
            const cls = ($(el).attr('class') || '').toLowerCase().trim();
            if (!cls) return false;
            const parts = cls.split(/\s+/);
            return parts.includes('product') && parts.includes('attribute') && parts.includes('overview');
        }).first();
    }

    if (!found || !found.length) return '';

    // Extraire paragraphes si présents
    const paragraphs = [];
    found.find('p').each((i, p) => {
        const txt = $(p).text().trim();
        if (txt) paragraphs.push(txt);
    });

    // Si pas de <p>, prendre le texte direct mais le fractionner proprement
    if (paragraphs.length === 0) {
        const text = found.text().trim();
        if (text) {
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            lines.forEach(line => {
                // ignorer le titre générique s'il existe
                if (/product attribute overview/i.test(line)) return;
                paragraphs.push(line);
            });
        }
    }

    if (paragraphs.length === 0) return '';

    // Construire HTML et retirer l'élément du DOM pour éviter duplication
    const html = paragraphs.map(p => `<p>${p}</p>`).join('\n');
    try { found.remove(); } catch (e) { /* noop */ }

    return `<div class="product-attributes-overview">\n${html}\n</div>`;
}

// --- NOUVELLE LOGIQUE DE PRIX ---

/**
 * Détecte si l'URL correspond à Titanium Strength
 */
export function isTitaniumStrength(url) {
    return url.includes('titaniumstrength.fr');
}

/**
 * Extrait les données d'un produit Titanium Strength
 * @param {object} page - Page Playwright (non utilisée, on fait du HTTP direct)
 * @returns {Object} - Données du produit
 */
export async function scrapeTitaniumStrength(page) {
    console.log('   🏷️  Scraper: Titanium Strength (HTTP + Cheerio)');
    const url = page.url();
    console.log(`   📡 Récupération HTTP de: ${url}`);

    try {
        const response = await gotScraping.get({
            url: url,
            timeout: { request: 30000 },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });
        console.log(`   ✓ HTML récupéré: ${response.body.length} caractères`);

        const $ = cheerio.load(response.body);
        const html = response.body;
        console.log('   🔍 Parsing des données...');

        // --- Extraction des données ---
        let title = $('h1.page-title').text().trim() || $('title').text().split('|')[0].trim();
        const { basePrice, oldPrice } = extractPrices($);
        const sku = extractSku($);
        const allImages = extractImages($, html);

        // Extraire et préfixer le bloc "product attribute overview"
        const attributesOverview = extractAttributesOverview($);

        let description = extractDescription($);
        if (attributesOverview && attributesOverview.length) {
            description = attributesOverview + '\n\n' + description;
        }

        // Remplacements de marque
        const brandRegex = /Titanium\s+Strength/gi;
        title = title.replace(brandRegex, 'RAKK').replace(/Titanium/gi, 'RAKK');
        description = description.replace(brandRegex, 'RAKK').replace(/Titanium/gi, 'RAKK');

        console.log(`   📌 Titre: ${title.substring(0, 50)}`);
        if (basePrice == null) {
            console.log('   💰 Prix: non récupéré pour ce fournisseur');
        } else {
            console.log(`   💰 Prix: ${basePrice}€${oldPrice ? ` (barré: ${oldPrice}€)` : ''}`);
        }
        console.log(`   🏷️  SKU: ${sku || 'NON TROUVÉ'}`);
        console.log(`   🖼️  Images: ${allImages.length} trouvée(s)`);
        console.log(`   📝 Description: ${description.substring(0, 120)}`);

        // --- Assemblage final ---
        const productData = {
            title,
            description,
            images: allImages,
            price: basePrice,
            oldPrice: oldPrice || null,
            discount: null,
            variants: [{
                name: 'Default',
                price: basePrice,
                isDefault: true,
                type: 'default',
                sku: sku || 'TitaniumStrength-Default'
            }],
            variantsCount: 1,
            sourceUrl: url,
            supplier: 'TitaniumStrength',
            metadata: {
                availability: 'En stock',
                oldPrice: oldPrice || null,
                discount: null,
                platform: 'HTTP scraping (Cheerio)',
                sku
            }
        };

        console.log('   ✅ Extraction terminée avec succès');
        return productData;

    } catch (error) {
        console.error(`   ❌ Erreur lors du scraping HTTP: ${error.message}`);
        throw error;
    }
}
