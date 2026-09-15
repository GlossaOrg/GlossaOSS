package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.security.form.PasswordEncoder;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.LocalCredential;
import dev.relism.glossa.persistence.entities.UserIdentity;

/** A fresh install: until someone exists, the first account can be created from the sign-in screen and administers the install (§11). */
public final class SetupService {

    public record SetupView(boolean firstUser) {}

    public record FirstAccount(String name, String email, String password) {}

    private final Data data;
    private final boolean localLogin;
    private final boolean selfAdministered;

    public SetupService(Data data, boolean localLogin, boolean selfAdministered) {
        this.data = data;
        this.localLogin = localLogin;
        this.selfAdministered = selfAdministered;
    }

    public SetupView state() {
        return new SetupView(selfAdministered && empty());
    }

    public void createFirstAccount(FirstAccount account) {
        if (!localLogin || !selfAdministered) throw HttpException.notFound("Setup");
        String email = account.email() == null ? "" : account.email().trim();
        if (!email.matches("[^\\s@]+@[^\\s@]+")) throw HttpException.badRequest("Enter a valid email.");
        Passwords.check(account.password());
        if (!empty()) throw HttpException.conflict("The first account already exists.");
        String name = account.name() == null || account.name().isBlank() ? email : account.name().trim();
        try {
            data.write(() -> {
                AppUser admin = data.repository(AppUser.class).save(AppUser.of(email, name, true));
                data.repository(UserIdentity.class).save(UserIdentity.of(admin.getId(), UserIdentity.LOCAL, email));
                LocalCredential credential = new LocalCredential();
                credential.setUserId(admin.getId());
                credential.setPasswordHash(PasswordEncoder.pbkdf2().encode(account.password()));
                data.repository(LocalCredential.class).save(credential);
            });
        } catch (RuntimeException race) {
            if (!empty()) throw HttpException.conflict("The first account already exists.");
            throw race;
        }
    }

    private boolean empty() {
        return data.repository(AppUser.class).count() == 0;
    }
}
