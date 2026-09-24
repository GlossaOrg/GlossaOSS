package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.glossa.Env;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** AES-GCM for the few columns holding a credential Glossa itself has to read back, under {@link Env#ENCRYPTION_KEY}. */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Secrets {

    private static final int IV = 12;
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Base64 of the nonce and the sealed value, self-contained so nothing else has to be stored. */
    public static String encrypt(String value) {
        byte[] iv = new byte[IV];
        RANDOM.nextBytes(iv);
        try {
            byte[] sealed = cipher(Cipher.ENCRYPT_MODE, iv).doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] out = Arrays.copyOf(iv, IV + sealed.length);
            System.arraycopy(sealed, 0, out, IV, sealed.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (GeneralSecurityException refused) {
            throw HttpException.internal("Could not encrypt the value.");
        }
    }

    public static String decrypt(String sealed) {
        byte[] raw = Base64.getDecoder().decode(sealed);
        try {
            return new String(cipher(Cipher.DECRYPT_MODE, Arrays.copyOf(raw, IV))
                    .doFinal(raw, IV, raw.length - IV), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException refused) {
            // A wrong or rotated key, which no caller can fix: say so rather than answering nonsense.
            throw HttpException.internal("Stored credential cannot be read with the current ENCRYPTION_KEY.");
        }
    }

    private static Cipher cipher(int mode, byte[] iv) throws GeneralSecurityException {
        if (Env.ENCRYPTION_KEY == null) {
            throw HttpException.internal("ENCRYPTION_KEY is unset: it encrypts stored credentials (see .env.example).");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(Base64.getDecoder().decode(Env.ENCRYPTION_KEY), "AES"), new GCMParameterSpec(128, iv));
        return cipher;
    }
}
