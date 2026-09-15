package dev.relism.glossa.auth;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.Principal;
import dev.relism.flash.ext.security.UserResolver;
import dev.relism.flash.ext.security.apikey.ApiKeyPrincipal;
import dev.relism.flash.ext.security.form.PasswordStore;
import dev.relism.flash.ext.security.oidc.OidcPrincipal;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.LocalCredential;
import dev.relism.glossa.persistence.entities.UserIdentity;
import dev.relism.glossa.service.UserService;

/**
 * Every authenticated caller becomes one {@link AppUser} (§11), reached through the
 * {@link UserIdentity} the credential carries. One account may hold several identities, so the
 * same person keeps their account when a second provider starts vouching for them.
 */
public final class Users implements UserResolver<AppUser>, PasswordStore {

    /** A caller who signed in with a Glossa password. */
    public record LocalUser(String name, long id) implements Principal {}

    private static final SpecBuilder.FieldSpec<UserIdentity, String> ISSUER = SpecBuilder.field("issuer");
    private static final SpecBuilder.FieldSpec<UserIdentity, String> SUBJECT = SpecBuilder.field("subject");

    private final Data data;
    private final boolean selfAdministered;
    private final UserService accounts;

    public Users(Data data, boolean selfAdministered, UserService accounts) {
        this.data = data;
        this.selfAdministered = selfAdministered;
        this.accounts = accounts;
    }

    /**
     * The account behind the credential, and the one place that can refuse it: a suspended or removed
     * account holds sessions, keys and tokens that all stop working here, whatever signed them in.
     *
     * <p>Where the installation administers its own accounts, an identity provider vouching for a
     * caller is not enough to make one (§11): the email must have been invited, unless nobody exists
     * yet and this is the install's first user. See {@link #arrive}.
     *
     * <p>Either way a provider's identity only ever joins an existing account on an email the
     * provider says it verified — see {@link UserService#link}.
     */
    @Override
    public AppUser resolve(Principal principal) {
        return allowed(switch (principal) {
            case LocalUser local -> data.repository(AppUser.class).findById(local.id()).orElseThrow();
            case ApiKeyPrincipal<?> key -> data.repository(AppUser.class).findById(((ApiKeys.Grant) key.grant()).issuedBy()).orElseThrow();
            case OidcPrincipal oidc -> {
                AppUser known = find(oidc.issuer(), oidc.name());
                yield known != null ? known : arriveOnce(oidc);
            }
            default -> throw new IllegalStateException("No Glossa user for " + principal.getClass().getName());
        });
    }

    /**
     * Where the installation administers its own accounts, only an invitation makes one — except for
     * the very first, who becomes the administrator. Where it does not, no administrator exists to
     * invite anybody and the gate would be unsatisfiable: the provider's word is what an account is,
     * and what the caller may then do is decided by membership, not by the account existing.
     */
    private AppUser arrive(OidcPrincipal oidc) {
        String name = (String) oidc.claim("name");
        boolean verified = Boolean.TRUE.equals(oidc.claim("email_verified"));
        AppUser known = verified ? accounts.link(oidc.issuer(), oidc.name(), oidc.email()) : null;
        if (known != null) return known;
        if (!selfAdministered) return provision(oidc, name, false);
        if (data.repository(AppUser.class).count() == 0) return provision(oidc, name, true);
        return accounts.claimForSso(oidc.issuer(), oidc.name(), oidc.email(), name, verified);
    }

    private static AppUser allowed(AppUser user) {
        if (user.getDeletedAt() != null) throw HttpException.forbidden("This account was deleted. Ask an admin for a new invitation.");
        if (user.getDisabledAt() != null) throw HttpException.forbidden("This account is disabled. Ask an admin to enable it.");
        return user;
    }

    @Override
    public Account find(String email) {
        AppUser user = find(UserIdentity.LOCAL, email);
        LocalCredential credential = user == null ? null
                : data.repository(LocalCredential.class).findById(user.getId()).orElse(null);
        return credential == null ? null : new Account(new LocalUser(email, user.getId()), credential.getPasswordHash());
    }

    private AppUser find(String issuer, String subject) {
        return data.repository(UserIdentity.class).findOne(ISSUER.eq(issuer).and(SUBJECT.eq(subject)))
                .flatMap(identity -> data.repository(AppUser.class).findById(identity.getUserId())).orElse(null);
    }

    /**
     * A browser's first requests arrive together, and each would create the same account. The unique
     * indexes let one through; the rest find it here instead of failing.
     */
    private AppUser arriveOnce(OidcPrincipal oidc) {
        try {
            return arrive(oidc);
        } catch (RuntimeException race) {
            AppUser winner = find(oidc.issuer(), oidc.name());
            if (winner != null) return winner;
            throw race;
        }
    }

    /** The first user of an install administers it (§11), and the schema allows only one such row. */
    private AppUser provision(OidcPrincipal oidc, String name, boolean admin) {
        try {
            return accounts.provision(oidc.issuer(), oidc.name(), oidc.email(), name, admin);
        } catch (RuntimeException secondAdmin) {
            if (!admin) throw secondAdmin;
            return accounts.provision(oidc.issuer(), oidc.name(), oidc.email(), name, false);   // someone else became the first user
        }
    }

}
