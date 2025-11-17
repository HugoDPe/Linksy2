<?php

declare(strict_types=1);

namespace App\Shared\Infrastructure\Shopify;

interface ShopifyClientInterface
{
    public function updateProductPrice(string $productReference, float $price, string $currency): void;

    public function updateProductStock(string $productReference, int $quantity): void;

    public function getProductByReference(string $productReference): ?array;

    public function getProductByTitle(string $title): ?array;
}
