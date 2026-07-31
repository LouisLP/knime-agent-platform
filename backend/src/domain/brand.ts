declare const brand: unique symbol

/**
 * Compile-time-only nominal typing. The symbol is never emitted, so branded
 * values are plain strings at runtime and serialise to JSON unchanged.
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B }
