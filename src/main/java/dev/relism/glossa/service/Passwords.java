package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;

/** §11: what a password must be, wherever one is chosen — the screens say the same, this is what decides. */
public final class Passwords {

    private Passwords() {}

    public static void check(String password) {
        if (password == null || password.length() < 8) throw HttpException.badRequest("Use at least 8 characters.");
        if (!password.matches(".*\\p{Lu}.*")) throw HttpException.badRequest("Use at least one capital letter.");
        if (!password.matches(".*\\p{Ll}.*")) throw HttpException.badRequest("Use at least one small letter.");
        if (!password.matches(".*[^\\p{L}\\p{N}].*")) throw HttpException.badRequest("Use at least one special character.");
    }
}
