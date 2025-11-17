<?php

declare(strict_types=1);

namespace App\Shared\Domain\ValueObject;

final readonly class ProductReference
{
    public function __construct(
        private string $value
    ) {
        if (empty($value)) {
            throw new \InvalidArgumentException('Product reference cannot be empty');
        }
    }

    public function value(): string
    {
        return $this->value;
    }

    public function equals(self $other): bool
    {
        return $this->value === $other->value;
    }
}
