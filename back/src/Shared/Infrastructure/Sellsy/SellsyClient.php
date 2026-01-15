<?php

namespace App\Shared\Infrastructure\Sellsy;

use Symfony\Contracts\HttpClient\HttpClientInterface;

class SellsyClient
{
    private string $accessToken;
    private const PAGE_SIZE = 100;

    public function __construct(
        private HttpClientInterface $httpClient,
        private string $sellsyApiUrl,
        private SellsyAccessTokenClient $sellsyAccessTokenClient
    )
    {
    }

    public function getAccessToken(): string
    {
        if (!isset($this->accessToken)) {
            $this->accessToken = $this->sellsyAccessTokenClient->getAccessToken();
        }

        return $this->accessToken;
    }

    public function getAllItem(): array
    {
        $items = [];
        $offset = 0;
        $limit = self::PAGE_SIZE;

        do {
            $response = $this->httpClient->request('GET', $this->sellsyApiUrl.'/items', [
                'headers' => [
                    'Authorization' => 'Bearer '.$this->getAccessToken()
                ],
                'query' => [
                    'limit' => $limit,
                    'offset' => $offset
                ]
            ]);

            $data = $response->toArray(false);

            if (isset($data['response']['items'])) {
                $batch = $data['response']['items'];
            } elseif (isset($data['items'])) {
                $batch = $data['items'];
            } elseif (isset($data['data'])) {
                $batch = $data['data'];
            } else {
                $batch = [];
            }

            // Garder le nombre total d'items AVANT filtrage pour la pagination
            $totalFetched = count($batch);
            
            // Filtrer uniquement les produits
            $batch = array_values(array_filter($batch, function ($item) {
                return isset($item['type']) && $item['type'] === 'product';
            }));

            $items = array_merge($items, $batch);
            $offset += $totalFetched; // Utiliser le nombre TOTAL d'items, pas seulement les produits
        } while ($totalFetched === $limit && $totalFetched > 0);

        return $items;
    }


    public function updateItemPrice(int $itemId, float $price): void
    {
        $this->httpClient->request('PUT', $this->sellsyApiUrl.'/items/'.$itemId, [
            'headers' => [
                'Authorization' => 'Bearer '.$this->getAccessToken()
            ],
            'json' => [
                'reference_price' => (string)$price
            ]
        ]);
    }

    public function updateItemPurchagePrice(int $itemId, float $price): void
    {
        try {

        $this->httpClient->request('PUT', $this->sellsyApiUrl . '/items/' . $itemId, [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->getAccessToken()
            ],
            'json' => [
                'purchase_amount' => (string)$price
            ]
        ]);
        } catch (\Exception $e) {
            dump($e);die;
        }
    }
}