<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;
use Psr\Log\LoggerInterface;
use App\Shared\Infrastructure\Shopify\ShopifyClient;

/**
 * Contrôleur pour recevoir les produits scrappés depuis le front
 * et les importer sur Shopify
 */
#[Route('/api/shopify', name: 'api_shopify_')]
class ShopifyImportController extends AbstractController
{
    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly ShopifyClient $shopifyClient
    ) {
    }

    /**
     * Endpoint pour recevoir les produits scrappés et les créer sur Shopify
     *
     * POST /api/shopify/import
     *
     * Body attendu:
     * {
     *   "products": [
     *     {
     *       "title": "Nom du produit",
     *       "description": "Description",
     *       "images": ["url1", "url2"],
     *       "price": 29.99,
     *       "variants": ["S", "M", "L"],
     *       "sourceUrl": "https://..."
     *     }
     *   ]
     * }
     */
    #[Route('/import', name: 'import', methods: ['POST'])]
    public function import(Request $request): JsonResponse
    {
        try {
            // Récupération des données
            $data = json_decode($request->getContent(), true);

            if (!isset($data['products']) || !is_array($data['products'])) {
                return $this->json([
                    'success' => false,
                    'message' => 'Le champ "products" est requis et doit être un tableau'
                ], Response::HTTP_BAD_REQUEST);
            }

            $products = $data['products'];
            $this->logger->info('📦 Réception de ' . count($products) . ' produit(s) à importer');

            $imported = [];
            $errors = [];

            $skipped = [];

            foreach ($products as $index => $productData) {
                try {
                    $this->logger->info("🔄 Import du produit {$index}: {$productData['title']}");

                    // Validation des données
                    $this->validateProductData($productData);

                    // Vérification si le produit existe déjà dans Shopify
                    $existingProduct = $this->shopifyClient->getProductByTitle($productData['title']);

                    if ($existingProduct !== null) {
                        $this->logger->warning("⚠️  Produit déjà existant dans Shopify, import ignoré: {$productData['title']}", [
                            'shopify_id' => $existingProduct['id'] ?? null,
                            'shopify_handle' => $existingProduct['handle'] ?? null
                        ]);

                        $skipped[] = [
                            'title' => $productData['title'],
                            'sourceUrl' => $productData['sourceUrl'] ?? null,
                            'shopifyId' => $existingProduct['id'] ?? null,
                            'shopifyHandle' => $existingProduct['handle'] ?? null,
                            'reason' => 'Le produit existe déjà dans Shopify'
                        ];

                        continue; // Passer au produit suivant
                    }

                    // Enrichissement des données pour Shopify
                    $shopifyData = $this->prepareShopifyData($productData);

                    // Création du produit sur Shopify
                    $shopifyProduct = $this->shopifyClient->createProduct($shopifyData);

                    $shopifyId = $shopifyProduct['id'] ?? null;
                    $shopifyHandle = $shopifyProduct['handle'] ?? null;

                    $imported[] = [
                        'title' => $productData['title'],
                        'sourceUrl' => $productData['sourceUrl'] ?? null,
                        'shopifyId' => $shopifyId,
                        'shopifyHandle' => $shopifyHandle,
                        'variantsCount' => count($productData['variants'] ?? []),
                        'imagesCount' => count($productData['images'] ?? []),
                        'status' => 'created'
                    ];

                    $this->logger->info("✅ Produit importé: {$productData['title']}", [
                        'shopify_id' => $shopifyId,
                        'variants' => count($productData['variants'] ?? [])
                    ]);

                } catch (\Exception $e) {
                    $this->logger->error("❌ Erreur import produit {$index}: {$e->getMessage()}");
                    $errors[] = [
                        'product' => $productData['title'] ?? 'Unknown',
                        'error' => $e->getMessage()
                    ];
                }
            }

            // Réponse finale
            return $this->json([
                'success' => count($imported) > 0,
                'imported' => count($imported),
                'skipped' => count($skipped),
                'errors' => count($errors),
                'details' => [
                    'created' => $imported,
                    'skipped' => $skipped,
                    'failures' => $errors
                ],
                'message' => sprintf(
                    '%d produit(s) importé(s), %d ignoré(s) (doublon), %d erreur(s)',
                    count($imported),
                    count($skipped),
                    count($errors)
                )
            ]);

        } catch (\Exception $e) {
            $this->logger->error('❌ Erreur fatale import Shopify: ' . $e->getMessage());

            return $this->json([
                'success' => false,
                'message' => 'Erreur lors de l\'import des produits',
                'error' => $e->getMessage()
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Valide les données d'un produit
     */
    private function validateProductData(array $data): void
    {
        $required = ['title', 'price'];

        foreach ($required as $field) {
            if (!isset($data[$field]) || empty($data[$field])) {
                throw new \InvalidArgumentException("Le champ '{$field}' est requis");
            }
        }

        if (!is_numeric($data['price']) || $data['price'] < 0) {
            throw new \InvalidArgumentException("Le prix doit être un nombre positif");
        }
    }

    /**
     * Prépare les données du produit pour Shopify
     */
    private function prepareShopifyData(array $productData): array
    {
        $prepared = [
            'title' => $productData['title'],
            'description' => $productData['description'] ?? '',
            'price' => $productData['price'],
            'images' => $productData['images'] ?? [],
            'supplier' => $productData['supplier'] ?? 'Unknown',
            'metadata' => $productData['metadata'] ?? [],
            'variants' => []
        ];

        // Gestion du prix barré (oldPrice)
        if (isset($productData['oldPrice']) && $productData['oldPrice'] > $productData['price']) {
            $prepared['oldPrice'] = $productData['oldPrice'];
        }

        // Préparation des variants
        if (!empty($productData['variants'])) {
            foreach ($productData['variants'] as $variantData) {
                $variant = [
                    'name' => $variantData['name'] ?? 'Default',
                    'price' => $variantData['price'] ?? $productData['price'],
                    'sku' => $variantData['sku'] ?? null,
                    // Pass through image URL if provided by the scraper
                    'image' => $variantData['image'] ?? null,
                ];

                // Ajout du prix barré au niveau du variant si disponible
                if (isset($variantData['oldPrice'])) {
                    $variant['compareAtPrice'] = $variantData['oldPrice'];
                } elseif (isset($prepared['oldPrice'])) {
                    $variant['compareAtPrice'] = $prepared['oldPrice'];
                }

                $prepared['variants'][] = $variant;
            }
        }

        // Tags basés sur le fournisseur et la remise
        $tags = [$prepared['supplier']];

        if (isset($productData['discount']) && $productData['discount'] > 0) {
            $tags[] = 'Promo';
            $tags[] = "-{$productData['discount']}%";
        }

        // Ajout du nombre de variants dans les tags
        if (!empty($prepared['variants'])) {
            $tags[] = count($prepared['variants']) . ' variants';
        }

        $prepared['tags'] = $tags;

        // Type de produit basé sur les métadonnées ou le fournisseur
        $prepared['productType'] = $productData['metadata']['platform'] ?? $prepared['supplier'];

        return $prepared;
    }

    /**
     * Endpoint de test pour vérifier que l'API est accessible
     */
    #[Route('/health', name: 'health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return $this->json([
            'status' => 'ok',
            'service' => 'Shopify Import API',
            'timestamp' => (new \DateTime())->format('Y-m-d H:i:s')
        ]);
    }
}

