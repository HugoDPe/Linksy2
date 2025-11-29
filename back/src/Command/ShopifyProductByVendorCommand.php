<?php

namespace App\Command;

use App\Shared\Infrastructure\Shopify\ShopifyClient;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:product-vendor'
)]
class ShopifyProductByVendorCommand extends Command
{


    public function __construct(private readonly ShopifyClient $shopifyClient)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $vendors = [];
        $products = $this->shopifyClient->getAllProducts();

        foreach ($products as $product) {
            $vendors[$product['vendor']][] = $product['id'];
        }

        dump($vendors);die;
    }


}