<?php

namespace App\Command;

use App\Shared\Infrastructure\Sellsy\SellsyClient;
use App\Shared\Infrastructure\Shopify\ShopifyClient;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:product-prices'
)]
class ShopifyProductPriceVsSellsyProductPriceCommand extends Command
{


    public function __construct(private readonly ShopifyClient $shopifyClient, private readonly SellsyClient $sellsyClient)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        
        $io->section('🔄 Récupération des produits Shopify...');
        $shopifyProducts = $this->shopifyClient->getAllProducts();
        $io->success(sprintf('Trouvé %d produits sur Shopify', count($shopifyProducts)));
        $shopifyVariantsPrices = [];
        foreach ($shopifyProducts as $product) {
            foreach ($product['variants'] as $variant) {
                $shopifyVariantsPrices[$variant['sku']] = $variant['price'];
            }
        }


        $io->section('🔄 Récupération des produits Sellsy...');
        $sellsyProducts = $this->sellsyClient->getAllItem();
        $io->success(sprintf('Trouvé %d produits sur Sellsy', count($sellsyProducts)));
        
        $sellsyPrices = [];
        foreach ($sellsyProducts as $product) {
            $sellsyPrices[$product['reference']] = [
                'reference' => $product['reference'],
                'reference_price' => $product['reference_price'],
                'id' => $product['id']
            ];
        }

        $io->section('🔍 Comparaison des prix...');

        // Comparaison des prix entre Shopify et Sellsy
        $priceDifferences = [];
        
        // Parcourir tous les produits Shopify
        foreach ($shopifyVariantsPrices as $sku => $shopifyPrice) {
            // Vérifier si le SKU existe dans Sellsy
            if (isset($sellsyPrices[$sku])) {
                $sellsyPrice = $sellsyPrices[$sku]['reference_price'];
                
                // Comparer les prix (conversion en float pour éviter les problèmes de comparaison)
                if ((float)$shopifyPrice !== (float)$sellsyPrice) {
                    $priceDifferences[] = [
                        'reference' => $sellsyPrices[$sku]['reference'],
                        'itemSellsyId' => $sellsyPrices[$sku]['id'],
                        'ref' => $sku,
                        'shopify_price' => $shopifyPrice,
                        'sellsy_price' => $sellsyPrice,
                        'difference' => (float)$shopifyPrice - (float)$sellsyPrice
                    ];
                }
            } else {
                // SKU existe sur Shopify mais pas sur Sellsy
                $io->warning("SKU '$sku' existe sur Shopify mais pas sur Sellsy");
            }
        }
        
        // Vérifier les produits qui existent sur Sellsy mais pas sur Shopify
        foreach ($sellsyPrices as $ref => $price) {
            if (!isset($shopifyVariantsPrices[$ref])) {
                $io->warning("Référence '$ref' existe sur Sellsy mais pas sur Shopify");
            }
        }
        
        // Affichage des résultats
        if (empty($priceDifferences)) {
            $io->success('Aucune différence de prix détectée entre Shopify et Sellsy !');
        } else {
            $io->warning(sprintf('Trouvé %d produit(s) avec des prix différents :', count($priceDifferences)));
            
            // Affichage formaté en tableau
            $io->table(
                ['Référence', 'Prix Shopify', 'Prix Sellsy', 'Différence', 'idsellsy'],
                array_map(fn($diff) => [
                    $diff['ref'],
                    number_format($diff['shopify_price'], 2, ',', ' ') . ' €',
                    number_format($diff['sellsy_price'], 2, ',', ' ') . ' €',
                    ($diff['difference'] > 0 ? '+' : '') . number_format($diff['difference'], 2, ',', ' ') . ' €',
                    $diff['itemSellsyId']
                ], $priceDifferences)
            );
        }

        foreach ($priceDifferences as $difference) {
            $io->writeln(sprintf("MISE A JOUR DE LA PRIX DE L'ARTICLE %s", $difference['reference']));
            $this->sellsyClient->updateItemPrice($difference['itemSellsyId'], $difference['shopify_price']);
        }
        
        return Command::SUCCESS;
    }


}