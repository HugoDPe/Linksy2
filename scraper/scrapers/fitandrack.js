/**
 * Scraper spécifique pour FitAndRack (Odoo eCommerce)
 * Site: https://www.fitandrack.com
 */

/**
 * Détecte si l'URL correspond à FitAndRack
 */
export function isFitAndRack(url) {
  return url.includes('fitandrack.com');
}

/**
 * Extrait les données d'un produit FitAndRack
 * @param {Page} page - Page Playwright
 * @returns {Object} - Données du produit
 */
export async function scrapeFitAndRack(page) {
  console.log('   🏷️  Scraper: FitAndRack (Odoo)');

  // Extraire d'abord les informations de base
  const baseData = await page.evaluate(() => {
    // Extraction du titre
    const title =
      document.querySelector('h1[itemprop="name"]')?.innerText ||
      document.querySelector('h1')?.innerText ||
      document.title;

    // === Nouvelle logique de description ===
    let description = '';
    const _descDebug = { method: null, counts: {} };

    try {
      const productDetails = document.querySelector('#product_details') || document.querySelector('.product_details');

      // 1) Extraire les <p> de #product_details .oe_structure (si présent)
      if (productDetails) {
        const oe = productDetails.querySelector('.oe_structure');
        if (oe) {
          const paragraphs = Array.from(oe.querySelectorAll('p'));
          _descDebug.counts.oe_p = paragraphs.length;
          if (paragraphs.length > 0) {
            description = paragraphs.map(p => p.outerHTML.trim()).join('\n\n');
            _descDebug.method = 'oe_structure_p';
          }
        }
      }

      // 2) Ajouter le contenu du panneau specifications (pas le bouton/tab)
      let specHtml = '';
      const specPane = document.querySelector('#nav-specification');
      if (specPane) {
        // préférer le bloc structuré interne si présent
        const specContent = specPane.querySelector('#product_specifications') || specPane;
        specHtml = specContent.innerHTML.trim();
      }
      if (specHtml) {
        description = (description ? description + '\n\n' : '') + specHtml;
        _descDebug.method = _descDebug.method ? _descDebug.method + '+spec-pane' : 'spec-pane';
      }

      // 2.5) Ajouter le bloc "Caractéristiques" s'il existe
      try {
        const root = document.querySelector('#product_detail') || document;
        let featuresHtml = '';
        // Chercher un titre Caractéristiques
        const featTitle = Array.from(root.querySelectorAll('h2,h3,h4')).find(el => /caract/i.test((el.textContent || '').normalize('NFKD')));
        if (featTitle) {
          let fragment = featTitle.outerHTML;
          let sib = featTitle.nextElementSibling;
          while (sib && !/^H[1-6]$/i.test(sib.tagName)) {
            fragment += sib.outerHTML || '';
            sib = sib.nextElementSibling;
          }
          featuresHtml = fragment.trim();
        }

        // Si pas trouvé, tenter dans l’onglet description (#nav-description) en détectant un bloc Caractéristiques + puces
        if (!featuresHtml) {
          const navDescPane = document.querySelector('#nav-description');
          if (navDescPane) {
            // 1) S’il y a un titre Caractéristiques
            const h = Array.from(navDescPane.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(el => /caract/i.test((el.textContent || '').normalize('NFKD')));
            if (h) {
              let fragment = h.outerHTML;
              let sib = h.nextElementSibling;
              while (sib && !/^H[1-6]$/i.test(sib.tagName)) {
                fragment += sib.outerHTML || '';
                sib = sib.nextElementSibling;
              }
              featuresHtml = fragment.trim();
            } else {
              // 2) Sinon, prendre le paragraphe contenant "Caractéristiques" puis agréger les <p> qui ressemblent à des puces
              const paragraphs = Array.from(navDescPane.querySelectorAll('p'));
              const idx = paragraphs.findIndex(p => /caract/i.test((p.textContent || '').normalize('NFKD')));
              if (idx >= 0) {
                let fragment = paragraphs[idx].outerHTML;
                for (let i = idx + 1; i < paragraphs.length; i++) {
                  const t = (paragraphs[i].textContent || '').trim();
                  if (/^(?:[-•]|–|—)\s*/.test(t)) {
                    fragment += paragraphs[i].outerHTML;
                  } else {
                    break;
                  }
                }
                featuresHtml = fragment.trim();
              }
            }
          }
        }

        if (featuresHtml) {
          // Eviter les doublons simples
          if (!/caract/i.test(description)) {
            description = (description ? description + '\n\n' : '') + featuresHtml;
            _descDebug.method = _descDebug.method ? _descDebug.method + '+features' : 'features';
            _descDebug.counts.features = (featuresHtml.match(/<li|<p/g) || []).length;
          }
        }
      } catch (e) {
        _descDebug.features_error = e.message;
      }

      // 3) Fallbacks si rien trouvé
      if (!description) {
        const navDesc = document.querySelector('#nav-description') || document.querySelector('.nav-description') || document.querySelector('[itemprop="description"]');
        if (navDesc) {
          // garder le HTML si possible
          description = navDesc.innerHTML?.trim() || navDesc.innerText?.trim() || '';
          _descDebug.method = 'nav-description';
        } else if (document.querySelector('meta[name="description"]')) {
          description = document.querySelector('meta[name="description"]')?.content || '';
          _descDebug.method = 'meta-description';
        }
      }
    } catch (e) {
      // Ne pas planter l'évaluation
      _descDebug.method = _descDebug.method || 'error';
      _descDebug.error = e.message;
    }

    description = (description || '').toString().trim();

    // throw new Error(description)
    // Extraction des images du carousel Odoo
    const carouselImages = Array.from(
      document.querySelectorAll('#o-carousel-product .carousel-item img')
    ).map(img => {
      const zoomSrc = img.getAttribute('data-zoom-image');
      const src = img.src;

      if (zoomSrc) {
        return zoomSrc;
      } else if (src.includes('image_1024')) {
        return src.replace('image_1024', 'image_1920');
      }
      return src;
    });

    const thumbnailImages = Array.from(
      document.querySelectorAll('.o_carousel_product_indicators img')
    ).map(img => img.src.replace('image_128', 'image_1920'));

    const allImages = [...new Set([...carouselImages, ...thumbnailImages])]
      .filter(src => src && !src.includes('data:image'))
      .map(src => {
        if (src.startsWith('/')) {
          return window.location.origin + src;
        }
        return src;
      });

    // Extraction du prix de base (chercher d'abord le prix le plus visible)
    let basePrice = 0;

    // Essayer plusieurs sélecteurs pour le prix
    const priceSelectors = [
      '.product_price .oe_currency_value',
      '#product_details .oe_currency_value',
      '.o_product_price .oe_currency_value',
      '[itemprop="price"]',
      '.oe_currency_value'
    ];

    for (const selector of priceSelectors) {
      const elem = document.querySelector(selector);
      if (elem) {
        const priceText = (elem.content || elem.innerText || '').replace(/[^^\d.,]/g, '').replace(',', '.');
        const price = parseFloat(priceText);
        if (price > 0) {
          basePrice = price;
          break;
        }
      }
    }

    // Extraction du SKU (chercher dans plusieurs endroits)
    let productSku = '';

    // 1. Chercher dans data-product-tracking-info
    const productDetailSection = document.querySelector('#product_detail');
    if (productDetailSection) {
      const trackingInfo = productDetailSection.getAttribute('data-product-tracking-info');
      if (trackingInfo) {
        try {
          const trackingData = JSON.parse(trackingInfo);
          // Extraire depuis item_name qui contient "[BAW-010] ..."
          if (trackingData.item_name) {
            const match = trackingData.item_name.match(/\[([^\]]+)\]/);
            if (match && match[1]) {
              productSku = match[1];
            }
          }
        } catch (e) {
          // Ignorer les erreurs de parsing
        }
      }
    }

    // 2. Chercher dans les éléments visibles
    if (!productSku) {
      const skuElement = document.querySelector('.as_product_sku, [class*="product_sku"], [class*="sku"]');
      if (skuElement) {
        const skuText = skuElement.innerText?.trim() || '';
        productSku = skuText.replace(/^(SKU|Référence|REF)\s*:\s*/i, '').trim();
      }
    }

    // 3. Extraire depuis l'URL de l'image principale (qui contient souvent le SKU)
    if (!productSku && allImages.length > 0) {
      const firstImageUrl = allImages[0];
      const match = firstImageUrl.match(/\[([^\]]+)\]/);
      if (match && match[1]) {
        productSku = match[1];
      }
    }

    const productTemplateId = document.querySelector('input[name="product_template_id"]')?.value;
    const productId = document.querySelector('[data-product-product-id]')?.getAttribute('data-product-product-id');

    return {
      title: title?.trim() || 'Produit sans titre',
      description: description || '',
      _descDebug,
      images: allImages.slice(0, 10),
      basePrice,
      productSku,
      productTemplateId,
      productId
    };
  });

  // Afficher un warn côté Node sur la stratégie de description
  if (baseData && baseData._descDebug) {
    const dbg = baseData._descDebug;
    console.warn(`   ⚠️ Description extraction strategy: ${dbg.method || 'unknown'} (oe_p=${dbg.counts?.oe_p || 0})${dbg.error ? ' - error: ' + dbg.error : ''}`);
  }

  // Récupérer les groupes d'attributs (pour gérer les combinaisons)
  const attributeGroups = await page.evaluate(() => {
    const groups = [];
    const lis = document.querySelectorAll('ul.js_add_cart_variants li.variant_attribute');

    if (lis.length) {
      lis.forEach(li => {
        const attributeName = li.getAttribute('data-attribute_name') || li.querySelector('strong.attribute_name')?.textContent?.trim();
        const inputs = Array.from(li.querySelectorAll('input[type="radio"].js_variant_change'));
        const values = inputs.map(input => {
          const id = input.getAttribute('data-value_id');
          const name = input.getAttribute('data-value_name') || input.closest('label')?.innerText?.trim() || id;
          const selector = `input[type="radio"].js_variant_change[data-value_id="${id}"]`;
          const isChecked = input.hasAttribute('checked');
          return { id, name, selector, isChecked };
        }).filter(v => v.id);
        if (attributeName && values.length) {
          groups.push({ attributeName, values });
        }
      });
    }

    // Fallback: grouper par data-attribute_name
    if (!groups.length) {
      const inputs = Array.from(document.querySelectorAll('input[type="radio"].js_variant_change'));
      const map = new Map();
      inputs.forEach(input => {
        const attr = input.getAttribute('data-attribute_name') || 'Attribut';
        const id = input.getAttribute('data-value_id');
        const name = input.getAttribute('data-value_name') || input.closest('label')?.innerText?.trim() || id;
        const selector = `input[type="radio"].js_variant_change[data-value_id="${id}"]`;
        const isChecked = input.hasAttribute('checked');
        if (!map.has(attr)) map.set(attr, []);
        map.get(attr).push({ id, name, selector, isChecked });
      });
      map.forEach((values, attributeName) => {
        if (values.length) groups.push({ attributeName, values });
      });
    }

    return groups;
  });

  // Fonction pour extraire le SKU actuellement affiché
  const getCurrentSku = async () => {
    return await page.evaluate(() => {
      const extractSkuFromUrl = (url) => {
        if (!url) return '';
        try {
          const decoded = decodeURIComponent(url);
          const m1 = decoded.match(/\[([^\]]+)\]/);
          if (m1 && m1[1]) return m1[1];
        } catch (_) {
          // ignore
        }
        const m2 = url.match(/%5B([^%]+)%5D/i);
        if (m2 && m2[1]) return m2[1];
        return '';
      };

      let foundSku = '';
      let source = '';

      // 1. Préférer data-product-tracking-info (mis à jour dynamiquement par Odoo)
      const productDetailSection = document.querySelector('#product_detail');
      if (productDetailSection && !foundSku) {
        const trackingInfo = productDetailSection.getAttribute('data-product-tracking-info');
        if (trackingInfo) {
          try {
            const trackingData = JSON.parse(trackingInfo);
            if (trackingData.item_name) {
              const m = (trackingData.item_name + '').match(/\[([^\]]+)\]/);
              if (m && m[1]) {
                foundSku = m[1];
                source = 'tracking-item_name';
              }
            }
            if (!foundSku && trackingData.item_id) {
              foundSku = trackingData.item_id + '';
              source = 'tracking-item_id';
            }
          } catch (e) {
            // ignore
          }
        }
      }

      // 2. URL de l'image active
      if (!foundSku) {
        const activeImg = document.querySelector('#o-carousel-product .carousel-item.active img');
        if (activeImg) {
          const imgSrc = activeImg.getAttribute('data-zoom-image') || activeImg.src || '';
          const skuFromImg = extractSkuFromUrl(imgSrc);
          if (skuFromImg) {
            foundSku = skuFromImg;
            source = 'image-active';
          }
        }
      }

      // 3. Première image
      if (!foundSku) {
        const firstImg = document.querySelector('#o-carousel-product .carousel-item img');
        if (firstImg) {
          const imgSrc = firstImg.getAttribute('data-zoom-image') || firstImg.src || '';
          const skuFromImg = extractSkuFromUrl(imgSrc);
          if (skuFromImg) {
            foundSku = skuFromImg;
            source = 'image-first';
          }
        }
      }

      // 4. Élément visible
      if (!foundSku) {
        const skuElement = document.querySelector('.as_product_sku, [class*="product_sku"], [class*="sku"]');
        if (skuElement) {
          const skuText = skuElement.innerText?.trim() || '';
          const cleaned = skuText.replace(/^(SKU|Référence|REF)\s*:\s*/i, '').trim();
          if (cleaned) {
            foundSku = cleaned;
            source = 'element-visible';
          }
        }
      }

      return foundSku;
    });
  };

  // Fonction pour extraire le prix actuellement affiché
  const getCurrentPrice = async () => {
    return await page.evaluate(() => {
      const priceSelectors = [
        '.product_price .oe_currency_value',
        '#product_details .oe_currency_value',
        '.o_product_price .oe_currency_value',
        '[itemprop="price"]',
        '.oe_currency_value'
      ];

      for (const selector of priceSelectors) {
        const elem = document.querySelector(selector);
        if (elem) {
          const priceText = (elem.content || elem.innerText || '').replace(/[^\d.,]/g, '').replace(',', '.');
          const price = parseFloat(priceText);
          if (price > 0) {
            return price;
          }
        }
      }
      return 0;
    });
  };

  // Fonction pour extraire l'image active (retourne une URL absolue ou '')
  const getCurrentImage = async () => {
    return await page.evaluate(() => {
      const getImgSrc = (img) => {
        if (!img) return '';
        // prefer data-zoom-image if present
        let src = img.getAttribute('data-zoom-image') || img.src || img.getAttribute('data-src') || '';
        if (!src) return '';
        // if relative path, make absolute
        if (src.startsWith('/')) {
          return window.location.origin + src;
        }
        return src;
      };

      // 1) active carousel image
      const activeImg = document.querySelector('#o-carousel-product .carousel-item.active img');
      if (activeImg) {
        return getImgSrc(activeImg);
      }

      // 2) first carousel image
      const firstImg = document.querySelector('#o-carousel-product .carousel-item img');
      if (firstImg) {
        return getImgSrc(firstImg);
      }

      // 3) thumbnail indicators
      const thumb = document.querySelector('.o_carousel_product_indicators img');
      if (thumb) return getImgSrc(thumb);

      return '';
    });
  };

  // Générer les combinaisons d'attributs (produit cartésien)
  const cartesian = (arr) => arr.reduce((a, b) => a.flatMap(x => b.values.map(y => ({ ...x, [b.attributeName]: y }))), [{}]);

  const variants = [];
  const variantImages = [];

  if (attributeGroups.length > 0) {
    const combosCount = attributeGroups.reduce((acc, g) => acc * Math.max(1, g.values.length), 1);
    if (combosCount > 60) {
      console.warn(`   ⚠️ Trop de combinaisons (${combosCount}), limitation à 60 premières.`);
    }

    const combos = cartesian(attributeGroups).slice(0, 60);
    const seen = new Set(); // dédup par SKU|productId

    for (const combo of combos) {
      const comboPairs = Object.entries(combo);
      const comboName = comboPairs.map(([_, v]) => `${v.name}`).join(' / ');

      // Cliquer chaque radio de la combinaison
      for (const [_, v] of comboPairs) {
        await page.evaluate((selector) => {
          const input = document.querySelector(selector);
          if (input) {
            input.click();
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, v.selector);
        await page.waitForTimeout(1000);
      }

      // Stabilisation après clics - attendre que Odoo mette à jour le DOM
      await page.waitForTimeout(1200);

      // Extraire les données
      const productId = await page.evaluate(() => document.querySelector('input[name="product_id"]')?.value || '');
      let image = await getCurrentImage();
      if (image && image.includes('image_1024')) image = image.replace('image_1024', 'image_1920');

      // Extraire le SKU - prioriser l'image qui est toujours à jour
      let sku = await page.evaluate((imageUrl) => {
        const extractSkuFromUrl = (url) => {
          if (!url) return '';
          try {
            const decoded = decodeURIComponent(url);
            const m1 = decoded.match(/\[([^\]]+)\]/);
            if (m1 && m1[1]) return m1[1];
          } catch (_) {}
          const m2 = url.match(/%5B([^%]+)%5D/i);
          if (m2 && m2[1]) return m2[1];
          return '';
        };

        // D'abord essayer depuis l'URL de l'image passée en paramètre
        let foundSku = extractSkuFromUrl(imageUrl);
        if (foundSku) return foundSku;

        // Sinon essayer le tracking info
        const productDetailSection = document.querySelector('#product_detail');
        if (productDetailSection) {
          const trackingInfo = productDetailSection.getAttribute('data-product-tracking-info');
          if (trackingInfo) {
            try {
              const trackingData = JSON.parse(trackingInfo);
              if (trackingData.item_name) {
                const m = (trackingData.item_name + '').match(/\[([^\]]+)\]/);
                if (m && m[1]) return m[1];
              }
              if (trackingData.item_id) return trackingData.item_id + '';
            } catch (e) {}
          }
        }
        return '';
      }, image);

      const price = await getCurrentPrice();

      const key = `${sku || ''}|${productId || ''}`;
      if (sku || productId) {
        if (!seen.has(key)) {
          seen.add(key);

          // Générer un fallback SKU si nécessaire
          let finalSku = sku;
          if (!finalSku || finalSku === baseData.productSku) {
            // Essayer de générer depuis le nom pour les poids
            const weightMatch = comboName.match(/^(\d+)KG/i);
            if (weightMatch && baseData.productSku) {
              const weight = parseInt(weightMatch[1]);
              const baseSku = baseData.productSku;
              const skuPrefix = baseSku.replace(/\d+$/, '');
              const weightPadded = weight.toString().padStart(2, '0');
              finalSku = `${skuPrefix}${weightPadded}1`;
            } else {
              finalSku = sku || `FitAndRack-${productId || comboPairs.map(([_, v]) => v.id).join('-')}`;
            }
          }

          variants.push({
            id: comboPairs.map(([_, v]) => v.id).join('-'),
            name: comboName,
            price: price || baseData.basePrice,
            attributeName: attributeGroups.map(g => g.attributeName).join(' / '),
            isDefault: comboPairs.every(([_, v]) => v.isChecked),
            type: 'radio',
            sku: finalSku,
            image: image || null,
            productId: productId || ''
          });
          if (image) variantImages.push(image);
          console.warn(`   🔎 ${comboName} → SKU=${finalSku} PID=${productId || 'N/A'}`);
        }
      }
    }
  } else {
    console.log(`   ℹ️  Aucun groupe d'attributs trouvé`);
  }

  // Si aucun variant trouvé, créer un variant par défaut
  if (variants.length === 0) {
    variants.push({
      name: 'Default',
      price: baseData.basePrice,
      isDefault: true,
      type: 'default',
      sku: baseData.productSku || 'FitAndRack-Default'
    });
  }

  const productData = {
    title: baseData.title,
    description: baseData.description,
    // fusionner images de base et images par variant (unique)
    images: Array.from(new Set([...(baseData.images || []), ...variantImages])).slice(0, 20),
    price: baseData.basePrice,
    variants: variants,
    variantsCount: variants.length,
    sourceUrl: page.url(),
    supplier: 'FitAndRack',
    metadata: {
      odooTemplateId: baseData.productTemplateId,
      odooProductId: baseData.productId,
      platform: 'Odoo eCommerce'
    }
  };

  return productData;
}

