<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;

/**
 * Central Command's Postgres enum columns store the enum member's NAME
 * in upper case (e.g. 'ACTIVE') — that's what SQLAlchemy's Enum(PyEnum)
 * type used in the original Python models. The application/API layer,
 * however, always works with the lower-case `.value` (e.g. "active"),
 * because the Python enums were declared as `class X(str, enum.Enum)`.
 * This cast reproduces that translation on the PHP side.
 *
 * @implements CastsAttributes<string, string>
 */
class UppercaseDbEnum implements CastsAttributes
{
    public function get($model, string $key, $value, array $attributes): ?string
    {
        return $value === null ? null : strtolower($value);
    }

    public function set($model, string $key, $value, array $attributes): ?string
    {
        return $value === null ? null : strtoupper($value);
    }
}
