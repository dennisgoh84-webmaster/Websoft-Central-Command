<?php

namespace App\Services;

class PasswordValidator
{
    const MIN_LENGTH = 8;
    const REQUIRE_UPPERCASE = true;
    const REQUIRE_LOWERCASE = true;
    const REQUIRE_NUMBERS = true;
    const REQUIRE_SPECIAL = true;

    private string $password;
    private array $errors = [];

    public static function validate(string $password): array
    {
        $validator = new self($password);
        return $validator->getValidation();
    }

    private function __construct(string $password)
    {
        $this->password = $password;
        $this->check();
    }

    private function check(): void
    {
        // Check minimum length
        if (strlen($this->password) < self::MIN_LENGTH) {
            $this->errors[] = 'Password must be at least ' . self::MIN_LENGTH . ' characters long';
        }

        // Check for uppercase
        if (self::REQUIRE_UPPERCASE && !preg_match('/[A-Z]/', $this->password)) {
            $this->errors[] = 'Password must contain at least one uppercase letter';
        }

        // Check for lowercase
        if (self::REQUIRE_LOWERCASE && !preg_match('/[a-z]/', $this->password)) {
            $this->errors[] = 'Password must contain at least one lowercase letter';
        }

        // Check for numbers
        if (self::REQUIRE_NUMBERS && !preg_match('/[0-9]/', $this->password)) {
            $this->errors[] = 'Password must contain at least one number';
        }

        // Check for special characters
        if (self::REQUIRE_SPECIAL && !preg_match('/[!@#$%^&*()_\-+=\[\]{};:\'",.<>?\/\\|`~]/', $this->password)) {
            $this->errors[] = 'Password must contain at least one special character (!@#$%^&* etc.)';
        }
    }

    private function getValidation(): array
    {
        return [
            'valid' => empty($this->errors),
            'errors' => $this->errors,
        ];
    }
}
