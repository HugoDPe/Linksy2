<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Shopify;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

final class ShopifyClient implements ShopifyClientInterface
{
    private string $shopifyApiAccessToken;

    private array $variantsCache = [];
    private bool $variantsLoaded = false;
    private ?int $locationId = null;

    public function __construct(
        private HttpClientInterface $httpClient,
        private LoggerInterface $logger,
        private string $shopifyApiUrl,
        string $shopifyApiAccessToken
    ) {
        $this->shopifyApiAccessToken = trim($shopifyApiAccessToken);
        $this->loadAllVariants();
    }

    public function loadAllVariants(): void
    {
        $this->variantsCache = [];
        $sinceId = null;
        do {
            $query = [
                'fields' => 'id,variants',
                'limit' => 250
            ];
            if ($sinceId !== null) {
                $query['since_id'] = $sinceId;
            }
            $url = sprintf('%s/admin/api/2024-10/products.json', $this->shopifyApiUrl);
            $options = [
                'query' => $query,
                'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken]
            ];
            $response = $this->httpClient->request('GET', $url, $options);
            $data = $response->toArray();
            $products = $data['products'] ?? [];
            foreach ($products as $product) {
                foreach ($product['variants'] ?? [] as $variant) {
                    $sku = $variant['sku'] ?? null;
                    if ($sku) {
                        $this->variantsCache[$sku] = $variant;
                    }
                }
            }
            $sinceId = !empty($products) ? end($products)['id'] : null;
        } while (!empty($products));
        $this->variantsLoaded = true;
        $this->logger->info('Shopify variants cache loaded', ['count' => count($this->variantsCache)]);
    }

    public function refreshVariantsCache(): void
    {
        $this->variantsLoaded = false;
        $this->loadAllVariants();
    }

    public function getVariantBySku(string $sku): ?array
    {
        if (!$this->variantsLoaded) {
            $this->loadAllVariants();
        }
        return $this->variantsCache[$sku] ?? null;
    }

    public function updateProductPrice(string $productReference, float $price, string $currency): void
    {
        try {
            $variant = $this->getVariantBySku($productReference);
            if ($variant === null) {
                $this->logger->warning('Variant not found in Shopify', [
                    'sku' => $productReference
                ]);
                return;
            }
            $variantId = $variant['id'] ?? null;
            if ($variantId === null) {
                $this->logger->error('No variant ID found for SKU', [
                    'sku' => $productReference
                ]);
                return;
            }
            $url = sprintf('%s/admin/api/2024-10/variants/%s.json', $this->shopifyApiUrl, $variantId);
            $options = [
                'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                'json' => [
                    'variant' => [
                        'id' => $variantId,
                        'price' => number_format($price, 2, '.', '')
                    ]
                ]
            ];
            $retry = 0;
            do {
                $response = $this->httpClient->request('PUT', $url, $options);
                if ($response->getStatusCode() === 429) {
                    sleep(3);
                    $retry++;
                    continue;
                }
                $statusCode = $response->getStatusCode();
                if ($statusCode === 422) {
                    $body = $response->getContent(false);
                    $this->logger->error('Shopify 422 error on price update', [
                        'sku' => $productReference,
                        'variant_id' => $variantId,
                        'body' => $body
                    ]);
                    return;
                }
                $this->logger->info('Price updated successfully', [
                    'sku' => $productReference,
                    'price' => $price
                ]);
                break;
            } while ($retry < 3);
        } catch (\Exception $e) {
            $this->logger->error('Failed to update price', [
                'sku' => $productReference,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    private function getLocationId(): ?int
    {
        if ($this->locationId !== null) {
            return $this->locationId;
        }
        $locationsUrl = sprintf('%s/admin/api/2024-10/locations.json', $this->shopifyApiUrl);
        $locationsOptions = [
            'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken]
        ];
        $retry = 0;
        do {
            try {
                $locations = $this->httpClient->request('GET', $locationsUrl, $locationsOptions);
                if ($locations->getStatusCode() === 429) {
                    sleep(3);
                    $retry++;
                    continue;
                }
                $data = $locations->toArray();
                $this->locationId = $data['locations'][0]['id'] ?? null;
                return $this->locationId;
            } catch (\Exception $e) {
                sleep(3);
                $retry++;
            }
        } while ($retry < 3);
        return null;
    }

    public function updateProductStock(string $productReference, int $quantity): void
    {
        try {
            $variant = $this->getVariantBySku($productReference);
            if ($variant === null) {
                $this->logger->warning('Variant not found in Shopify', [
                    'sku' => $productReference
                ]);
                return;
            }
            $inventoryItemId = $variant['inventory_item_id'] ?? null;
            if ($inventoryItemId === null) {
                $this->logger->error('No inventory item found for SKU', [
                    'sku' => $productReference
                ]);
                return;
            }
            $locationId = $this->getLocationId();
            if ($locationId === null) {
                throw new \RuntimeException('No location found in Shopify');
            }
            $inventoryUrl = sprintf('%s/admin/api/2024-10/inventory_levels/set.json', $this->shopifyApiUrl);
            $inventoryOptions = [
                'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                'json' => [
                    'location_id' => $locationId,
                    'inventory_item_id' => $inventoryItemId,
                    'available' => $quantity
                ]
            ];
            try {
                $retry = 0;
                do {
                    $response = $this->httpClient->request('POST', $inventoryUrl, $inventoryOptions);
                    if ($response->getStatusCode() === 429) {
                        sleep(3);
                        $retry++;
                        continue;
                    }
                    $statusCode = $response->getStatusCode();
                    if ($statusCode === 422) {
                        $body = $response->getContent(false);
                        $this->logger->error('Shopify 422 error on inventory update', [
                            'sku' => $productReference,
                            'inventory_item_id' => $inventoryItemId,
                            'location_id' => $locationId,
                            'body' => $body
                        ]);
                        return;
                    }
                    $this->logger->info('Stock updated successfully', [
                        'sku' => $productReference,
                        'quantity' => $quantity
                    ]);
                    break;
                } while ($retry < 3);
            } catch (\Exception $e) {
                $this->logger->error('Failed to update stock', [
                    'sku' => $productReference,
                    'error' => $e->getMessage()
                ]);
                throw $e;
            }
        } catch (\Exception $e) {
            $this->logger->error('Failed to update stock', [
                'sku' => $productReference,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    /**
     * Recherche un produit par son titre exact
     *
     * @param string $title Titre du produit
     * @return array|null Produit trouvé ou null
     */
    public function getProductByTitle(string $title): ?array
    {
        try {
            $url = sprintf('%s/admin/api/2024-10/products.json', $this->shopifyApiUrl);
            $options = [
                'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                'query' => [
                    'title' => $title,
                    'limit' => 1
                ]
            ];

            $response = $this->httpClient->request('GET', $url, $options);
            $data = $response->toArray();

            if (!empty($data['products'])) {
                return $data['products'][0];
            }

            return null;
        } catch (\Exception $e) {
            $this->logger->error('Failed to search product by title', [
                'title' => $title,
                'error' => $e->getMessage()
            ]);
            return null;
        }
    }

    public function getProductByReference(string $productReference): ?array
    {
        try {
            $url = sprintf('%s/admin/api/2024-10/products.json', $this->shopifyApiUrl);
            $options = [
                'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                'query' => [
                    'fields' => 'id,variants',
                    'limit' => 1,
                    // Search by SKU or other reference field
                    'vendor' => $productReference // TODO: Adapter selon votre mapping
                ]
            ];
            $response = $this->httpClient->request('GET', $url, $options);
            $data = $response->toArray();
            return $data['products'][0] ?? null;
        } catch (\Exception $e) {
            $this->logger->error('Failed to get product', [
                'reference' => $productReference,
                'error' => $e->getMessage()
            ]);
            return null;
        }
    }

    /**
     * Retourne un mapping [reference fournisseur => variant Shopify] pour les références présentes sur Shopify.
     * Charge tous les produits Shopify une seule fois, puis fait le mapping avec le tableau des références fournisseur.
     * @param string[] $supplierReferences
     * @return array [reference => variant Shopify]
     */
    public function mapSupplierReferences(array $supplierReferences): array
    {
        if (!$this->variantsLoaded) {
            $this->loadAllVariants();
        }
        // On récupère tous les SKUs Shopify en une seule fois
        $shopifySkus = array_keys($this->variantsCache);
        // On fait le mapping entre les références fournisseur et les variants Shopify
        $mapping = [];
        foreach ($supplierReferences as $ref) {
            if (in_array($ref, $shopifySkus, true)) {
                $variant = $this->variantsCache[$ref];
                // Activation de l'inventory_management si besoin
                if (($variant['inventory_management'] ?? null) !== 'shopify') {
                    $variantId = $variant['id'];
                    $url = sprintf('%s/admin/api/2024-10/variants/%s.json', $this->shopifyApiUrl, $variantId);
                    $options = [
                        'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                        'json' => [
                            'variant' => [
                                'id' => $variantId,
                                'inventory_management' => 'shopify'
                            ]
                        ]
                    ];
                    $retry = 0;
                    do {
                        try {
                            $response = $this->httpClient->request('PUT', $url, $options);
                            if ($response->getStatusCode() === 429) {
                                sleep(3);
                                $retry++;
                                continue;
                            }
                            $data = $response->toArray();
                            if (($data['variant']['inventory_management'] ?? null) === 'shopify') {
                                $variant['inventory_management'] = 'shopify';
                                $this->variantsCache[$ref] = $variant;
                            } else {
                                continue 2;
                            }
                        } catch (\Exception $e) {
                            sleep(3);
                            $retry++;
                        }
                    } while ($retry < 3);
                    usleep(300000); // 300ms entre chaque activation
                }
                $mapping[$ref] = $variant;
            }
        }
        return $mapping;
    }

    /**
     * Crée un nouveau produit sur Shopify
     *
     * @param array $productData Données du produit à créer
     * @return array Produit créé avec son ID Shopify
     */
    public function createProduct(array $productData): array
    {
        try {
            $url = sprintf('%s/admin/api/2024-10/products.json', $this->shopifyApiUrl);

            // Préparation des variants
            $variants = [];
            foreach ($productData['variants'] ?? [] as $variantData) {
                $variant = [
                    'option1' => $variantData['name'] ?? 'Default',
                    'price' => number_format($variantData['price'] ?? $productData['price'], 2, '.', ''),
                    'sku' => $variantData['sku'] ?? null,
                    'inventory_management' => 'shopify',
                    'inventory_policy' => 'deny'
                ];

                // Ajout du prix comparé si prix barré disponible
                if (isset($variantData['compareAtPrice']) || isset($productData['oldPrice'])) {
                    $comparePrice = $variantData['compareAtPrice'] ?? $productData['oldPrice'];
                    $variant['compare_at_price'] = number_format($comparePrice, 2, '.', '');
                }

                $variants[] = $variant;
            }

            // Si aucun variant, créer un variant par défaut
            if (empty($variants)) {
                $variants[] = [
                    'option1' => 'Default',
                    'price' => number_format($productData['price'], 2, '.', ''),
                    'sku' => $productData['metadata']['sku'] ?? null,
                    'inventory_management' => 'shopify',
                    'inventory_policy' => 'deny'
                ];

                if (isset($productData['oldPrice'])) {
                    $variants[0]['compare_at_price'] = number_format($productData['oldPrice'], 2, '.', '');
                }
            }

            // Préparation des images
            $images = [];
            foreach ($productData['images'] ?? [] as $imageUrl) {
                $images[] = ['src' => $imageUrl];
            }

            // Construction du payload
            $payload = [
                'product' => [
                    'title' => $productData['title'],
                    'body_html' => $productData['description'] ?? '',
                    'vendor' => $productData['supplier'] ?? 'Unknown',
                    'product_type' => $productData['productType'] ?? '',
                    'tags' => implode(', ', $productData['tags'] ?? []),
                    'variants' => $variants,
                    'images' => $images,
                    'status' => 'draft' // Créé en brouillon par sécurité
                ]
            ];

            // Ajout des métadonnées si disponibles
            if (!empty($productData['metadata'])) {
                $metafields = [];
                foreach ($productData['metadata'] as $key => $value) {
                    if ($value !== null && $value !== '') {
                        $metafields[] = [
                            'namespace' => 'custom',
                            'key' => $key,
                            'value' => (string)$value,
                            'type' => 'single_line_text_field'
                        ];
                    }
                }
                if (!empty($metafields)) {
                    $payload['product']['metafields'] = $metafields;
                }
            }

            $options = [
                'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                'json' => $payload
            ];

            $retry = 0;
            do {
                $response = $this->httpClient->request('POST', $url, $options);

                if ($response->getStatusCode() === 429) {
                    $this->logger->warning('Shopify rate limit hit, retrying...', ['retry' => $retry]);
                    sleep(3);
                    $retry++;
                    continue;
                }

                $statusCode = $response->getStatusCode();
                $responseData = $response->toArray(false);

                if ($statusCode === 422) {
                    $this->logger->error('Shopify validation error on product creation', [
                        'title' => $productData['title'],
                        'errors' => $responseData['errors'] ?? 'Unknown error',
                        'body' => $responseData
                    ]);
                    throw new \RuntimeException('Shopify validation error: ' . json_encode($responseData['errors'] ?? []));
                }

                if ($statusCode >= 400) {
                    throw new \RuntimeException('Shopify API error: ' . $response->getContent(false));
                }

                $this->logger->info('Product created successfully', [
                    'title' => $productData['title'],
                    'shopify_id' => $responseData['product']['id'] ?? null
                ]);

                // Rafraîchir le cache des variants
                $this->refreshVariantsCache();

                // Associate variant images if scraper provided per-variant 'image' URLs
                try {
                    $createdProduct = $responseData['product'] ?? [];
                    $createdProductId = $createdProduct['id'] ?? null;
                    $createdVariants = $createdProduct['variants'] ?? [];
                    $createdImages = $createdProduct['images'] ?? [];

                    if ($createdProductId && !empty($productData['variants'])) {
                        foreach ($productData['variants'] as $v) {
                            if (empty($v['image']) || empty($v['sku'])) {
                                continue;
                            }
                            // find variant id by sku
                            $variantId = null;
                            foreach ($createdVariants as $cv) {
                                if (!empty($cv['sku']) && $cv['sku'] === $v['sku']) {
                                    $variantId = $cv['id'];
                                    break;
                                }
                            }
                            if (!$variantId) {
                                continue;
                            }

                            // try to find image id by matching src
                            $imageId = null;
                            foreach ($createdImages as $img) {
                                $imgSrc = $img['src'] ?? '';
                                if (!$imgSrc) continue;
                                // match if one contains the other (handles CDN rewriting)
                                if (strpos($imgSrc, $v['image']) !== false || strpos($v['image'], $imgSrc) !== false) {
                                    $imageId = $img['id'] ?? null;
                                    break;
                                }
                            }

                            // If image exists on product, update it to link variant_ids
                            if ($imageId) {
                                $imgUrl = sprintf('%s/admin/api/2024-10/products/%s/images/%s.json', $this->shopifyApiUrl, $createdProductId, $imageId);
                                $imgOptions = [
                                    'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                                    'json' => ['image' => ['id' => $imageId, 'variant_ids' => [$variantId]]]
                                ];
                                try {
                                    $retryImg = 0;
                                    do {
                                        $respImg = $this->httpClient->request('PUT', $imgUrl, $imgOptions);
                                        if ($respImg->getStatusCode() === 429) {
                                            sleep(1);
                                            $retryImg++;
                                            continue;
                                        }
                                        break;
                                    } while ($retryImg < 3);
                                    $this->logger->info('Associated image to variant', ['product_id' => $createdProductId, 'variant_id' => $variantId, 'image_id' => $imageId]);
                                } catch (\Exception $e) {
                                    $this->logger->warning('Failed to associate image to variant', ['error' => $e->getMessage(), 'product_id' => $createdProductId, 'variant_id' => $variantId]);
                                }
                                continue;
                            }

                            // Otherwise, create a new image for this product with variant_ids set
                            try {
                                $createImgUrl = sprintf('%s/admin/api/2024-10/products/%s/images.json', $this->shopifyApiUrl, $createdProductId);
                                $createImgOptions = [
                                    'headers' => ['X-Shopify-Access-Token' => $this->shopifyApiAccessToken],
                                    'json' => ['image' => ['src' => $v['image'], 'variant_ids' => [$variantId]]]
                                ];
                                $retryCreate = 0;
                                do {
                                    $respCreate = $this->httpClient->request('POST', $createImgUrl, $createImgOptions);
                                    if ($respCreate->getStatusCode() === 429) {
                                        sleep(1);
                                        $retryCreate++;
                                        continue;
                                    }
                                    break;
                                } while ($retryCreate < 3);
                                $this->logger->info('Created image for variant', ['product_id' => $createdProductId, 'variant_id' => $variantId]);
                            } catch (\Exception $e) {
                                $this->logger->warning('Failed to create image for variant', ['error' => $e->getMessage(), 'product_id' => $createdProductId, 'variant_id' => $variantId]);
                            }
                        }
                    }
                } catch (\Exception $e) {
                    $this->logger->warning('Error while associating variant images', ['error' => $e->getMessage()]);
                }

                return $responseData['product'] ?? [];

            } while ($retry < 3);

            throw new \RuntimeException('Failed to create product after 3 retries');

        } catch (\Exception $e) {
            $this->logger->error('Failed to create product', [
                'title' => $productData['title'] ?? 'Unknown',
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }
}
