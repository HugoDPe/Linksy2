<?php

namespace App\Command;

use App\Shared\Infrastructure\Sellsy\SellsyClient;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
    name: 'app:update-purchase-price-sellsy'
)]
class UpdatePurchasePriceSellsyCommand extends Command
{


    public function __construct(private readonly SellsyClient $sellsyClient)
    {
        parent::__construct();
    }


    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $handle = fopen('var/data/prix_sellsy.csv', 'r');
        $data = [];

        while (($row = fgetcsv($handle, 0, ',')) !== false) {
            $sku = $row[0] ?? null;
            $rawPrice = $row[5] ?? null;

            $price = null;
            if ($rawPrice !== null) {
                $price = $this->parsePrice((string)$rawPrice);
            }

            $data[] = [$sku, $price];
        }

        $sellsyItems = $this->sellsyClient->getAllItem();
        foreach ($sellsyItems as $item) {
            foreach ($data as $datum) {
                if ($datum[0] === $item['reference'] && $datum[1] !== null && $datum[1] !== (float)$item['purchase_amount']) {
                    $output->writeln(sprintf(
                        'Mise à jour du prix d\'achat pour l\'article %s (ID: %s) de %.2f à %.2f',
                        $item['reference'],
                        $item['id'],
                        $item['purchase_amount'],
                        $datum[1]
                    ));
                    $this->sellsyClient->updateItemPurchagePrice($item['id'], $datum[1]);
                }
            }

        }

        return Command::SUCCESS;
    }

    private function parsePrice(string $raw): ?float
    {
        $s = trim($raw);
        $s = str_replace("\xc2\xa0", ' ', $s);

        $s = preg_replace('/[^0-9,\.\-]/u', '', $s);
        if ($s === '' || $s === null) {
            return null;
        }

        if (strpos($s, '.') !== false && strpos($s, ',') !== false) {
            $s = str_replace('.', '', $s); // supprimer séparateurs milliers
            $s = str_replace(',', '.', $s); // convertir décimal en format point
        } elseif (strpos($s, ',') !== false && strpos($s, '.') === false) {
            $s = str_replace(',', '.', $s);
        }
        $float = floatval($s);

        return is_nan($float) ? null : $float;
    }

}