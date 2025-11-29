<?php

namespace App\Shared\Infrastructure\Sellsy;

use Symfony\Contracts\HttpClient\HttpClientInterface;

class SellsyAccessTokenClient
{
    public function __construct(
        private HttpClientInterface $httpClient,
        private string $sellsyAccessTokenUrl,
        private string $sellsyApiKey,
        private string $sellsyApiSecret
    )
    {
    }

    public function getAccessToken(): string
    {
        try {
            $response = $this->httpClient->request('POST', $this->sellsyAccessTokenUrl, [
                'body' => [
                    'grant_type'    => 'client_credentials',
                    'client_id'     => $this->sellsyApiKey,
                    'client_secret' => $this->sellsyApiSecret,
                ],
            ]);
        } catch (\Exception $e) {
            dump($e->getMessage());die;
        }

        return json_decode($response->getContent())->access_token;
    }
}