package dev.relism.glossa.service;

import dev.relism.flash.exceptions.HttpException;
import dev.relism.flash.ext.data.core.Data;
import dev.relism.flash.ext.data.core.SpecBuilder;
import dev.relism.flash.ext.security.SecurityIdentity;
import dev.relism.flash.ext.security.form.PasswordEncoder;
import dev.relism.glossa.persistence.entities.AppUser;
import dev.relism.glossa.persistence.entities.Invitation;
import dev.relism.glossa.persistence.entities.LocalCredential;
import dev.relism.glossa.persistence.entities.Project;
import dev.relism.glossa.persistence.entities.ProjectMember;
import dev.relism.glossa.persistence.entities.Role;
import dev.relism.glossa.persistence.entities.UserIdentity;
import dev.relism.glossa.schema.Users.Accepted;
import dev.relism.glossa.schema.Users.AccountView;
import dev.relism.glossa.schema.Users.InviteRequest;
import dev.relism.glossa.schema.Users.InviteView;
import dev.relism.glossa.schema.Users.Invited;
import dev.relism.glossa.schema.Users.Membership;
import dev.relism.glossa.schema.Users.Status;
import lombok.RequiredArgsConstructor;

import java.net.URI;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * §11's accounts: they belong to the installation rather than to a project, so an administrator owns
 * them. Nobody registers themselves — an account starts as an invitation, either a one-time link for
 * a password account or an authorized email for one that signs in through the identity provider.
 */
@RequiredArgsConstructor
public final class UserService {

    private static final SpecBuilder.FieldSpec<Invitation, String> KEY_ID = SpecBuilder.field("keyId");
    private static final SpecBuilder.FieldSpec<Invitation, Instant> ACCEPTED = SpecBuilder.field("acceptedAt");
    private static final SpecBuilder.FieldSpec<AppUser, String> USER_EMAIL = SpecBuilder.field("email");
    private static final SpecBuilder.FieldSpec<ProjectMember, Long> MEMBER_USER = SpecBuilder.field("userId");
    private static final SpecBuilder.FieldSpec<UserIdentity, Long> IDENTITY_USER = SpecBuilder.field("userId");
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final PasswordEncoder ENCODER = PasswordEncoder.pbkdf2();

    private final Data data;

    /** ponytail: three reads joined in memory — an installation's users, not a directory's. */
    public List<AccountView> list() {
        Map<Long, String> projects = data.repository(Project.class).findAll().stream()
                .collect(Collectors.toMap(Project::getId, Project::getName));
        Map<Long, List<String>> sources = data.repository(UserIdentity.class).findAll().stream()
                .collect(Collectors.groupingBy(UserIdentity::getUserId, Collectors.mapping(i -> source(i.getIssuer()), Collectors.toList())));
        Map<Long, List<Membership>> memberships = data.repository(ProjectMember.class).findAll().stream()
                .collect(Collectors.groupingBy(ProjectMember::getUserId, Collectors.mapping(m -> membership(projects, m.getProjectId(), m.getRole(), m.getLocale()), Collectors.toList())));
        Stream<AccountView> accounts = data.repository(AppUser.class).findAll().stream()
                .map(user -> new AccountView(user.getId(), false, user.getName(), user.getEmail(), sources.getOrDefault(user.getId(), List.of()), user.isAdmin(),
                        status(user), user.getPasswordResetAt() != null, user.getCreatedAt(), null, memberships.getOrDefault(user.getId(), List.of())));
        // A reset carries a link like an invitation does, but its account is already in the table above.
        Stream<AccountView> invited = pending().stream().filter(invite -> invite.getUserId() == null)
                .map(invite -> new AccountView(invite.getId(), true, invite.getName(), invite.getEmail(), List.of(invite.isSso() ? "Single sign-on" : "Password"), false,
                        Status.INVITED, false, invite.getCreatedAt(), invite.getExpiresAt(),
                        invite.getProjectId() == null ? List.of() : List.of(membership(projects, invite.getProjectId(), invite.getRole(), invite.getLocale()))));
        return Stream.concat(accounts, invited).sorted(Comparator.comparing(AccountView::status).thenComparing(AccountView::createdAt)).toList();
    }

    public Invited invite(InviteRequest request) {
        String email = email(request.email());
        if (data.repository(AppUser.class).findOne(USER_EMAIL.eq(email)).isPresent()) throw HttpException.conflict("That email already has an account.");
        Invitation invite = new Invitation();
        invite.setEmail(email);
        invite.setName(request.name() == null || request.name().isBlank() ? null : request.name().trim());
        invite.setSso(request.sso());
        invite.setProjectId(request.project());
        invite.setRole(request.role());
        invite.setLocale(request.locale() == null || request.locale().isBlank() ? null : request.locale().trim());
        if (request.project() != null && request.role() == null) throw HttpException.badRequest("Choose a role for the project.");
        return open(invite, request.expiresInDays());
    }

    /**
     * Retires the current password and hands out a link for a new one. The account keeps everything it
     * holds; it just cannot use it until it chooses a password, whether through the link or, if it can
     * still sign in, through {@link #changePassword}.
     */
    public Invited resetPassword(long userId, int expiresInDays) {
        AppUser user = data.repository(AppUser.class).findById(userId).orElseThrow(() -> HttpException.notFound("Account"));
        if (!hasPassword(user)) throw HttpException.badRequest("That account signs in with single sign-on.");
        if (user.getDeletedAt() != null) throw HttpException.conflict("That account was deleted.");
        Invitation invite = new Invitation();
        invite.setEmail(user.getEmail());
        invite.setName(user.getName());
        invite.setUserId(user.getId());
        Invited invited = open(invite, expiresInDays);
        user.setPasswordResetAt(Instant.now());
        data.repository(AppUser.class).update(user);
        return invited;
    }

    /** The signed-in account's own change, which is also how a retired password is replaced from inside the app. */
    public void changePassword(String password) {
        AppUser user = SecurityIdentity.current().user(AppUser.class);
        if (!hasPassword(user)) throw HttpException.badRequest("This account signs in with single sign-on.");
        Passwords.check(password);
        LocalCredential credential = data.repository(LocalCredential.class).findById(user.getId()).orElseThrow(() -> HttpException.notFound("Password"));
        if (ENCODER.matches(password, credential.getPasswordHash())) throw HttpException.badRequest("Choose a password you haven't used before.");
        credential.setPasswordHash(ENCODER.encode(password));
        data.write(() -> {
            data.repository(LocalCredential.class).update(credential);
            user.setPasswordResetAt(null);
            data.repository(AppUser.class).update(user);
        });
    }

    public void cancelInvite(long id) {
        data.repository(Invitation.class).findById(id).filter(invite -> invite.getAcceptedAt() == null).ifPresent(invite -> data.repository(Invitation.class).deleteById(id));
    }

    public void disable(long userId, boolean disabled) {
        AppUser user = mine(userId, "disable");
        user.setDisabledAt(disabled ? Instant.now() : null);
        data.repository(AppUser.class).update(user);
    }

    /** A stamp, not a delete: the §8 change log still has to name whoever made each change. */
    public void delete(long userId) {
        AppUser user = mine(userId, "delete");
        data.write(() -> {
            data.repository(ProjectMember.class).deleteAll(MEMBER_USER.eq(userId));
            user.setDeletedAt(Instant.now());
            user.setAdmin(false);
            data.repository(AppUser.class).update(user);
        });
    }

    /** What the invited person sees on the link's page, before they choose a password. */
    public InviteView peek(String token) {
        Invitation invite = valid(token);
        return new InviteView(invite.getEmail(), invite.getName(), invite.getUserId() != null);
    }

    /** Takes the invitation up: the account exists from here on, with the grant the invitation carried. */
    public Accepted accept(String token, String password, String name) {
        Invitation invite = valid(token);
        Passwords.check(password);
        AppUser existing = invite.getUserId() == null ? null : data.repository(AppUser.class).findById(invite.getUserId()).orElse(null);
        if (existing != null && data.repository(LocalCredential.class).findById(existing.getId()).filter(c -> ENCODER.matches(password, c.getPasswordHash())).isPresent()) {
            throw HttpException.badRequest("Choose a password you haven't used before.");
        }
        if (existing == null) unclaimed(invite.getEmail());
        String hash = ENCODER.encode(password);
        data.write(() -> {
            AppUser user = existing != null ? existing : create(UserIdentity.LOCAL, invite.getEmail(), invite.getEmail(),
                    name == null || name.isBlank() ? invite.getName() : name.trim(), false);
            LocalCredential credential = new LocalCredential();
            credential.setUserId(user.getId());
            credential.setPasswordHash(hash);
            if (existing == null) {
                data.repository(LocalCredential.class).save(credential);
            } else {
                data.repository(LocalCredential.class).update(credential);
                user.setPasswordResetAt(null);
                data.repository(AppUser.class).update(user);
            }
            grant(invite, user.getId());
            invite.setAcceptedAt(Instant.now());
            data.repository(Invitation.class).update(invite);
        });
        return new Accepted(invite.getEmail());
    }

    /**
     * The identity provider vouched for this email: if an invitation is open for it, take it up and let
     * the caller in. Anything else is somebody with an account at the provider but none here (§11).
     */
    public AppUser claimForSso(String issuer, String subject, String email, String name, boolean verified) {
        Invitation invite = verified && email != null
                ? pending().stream().filter(i -> i.isSso() && i.getEmail().equalsIgnoreCase(email.trim())).findFirst().orElse(null)
                : null;
        if (invite == null) throw HttpException.forbidden("You haven't been invited. Ask an admin for an invitation.");
        unclaimed(email);
        return data.write(() -> {
            AppUser user = create(issuer, subject, email, name == null ? invite.getName() : name, false);
            grant(invite, user.getId());
            invite.setAcceptedAt(Instant.now());
            data.repository(Invitation.class).update(invite);
            return user;
        });
    }

    /**
     * The account this provider's caller already has, with the new identity attached to it — or null
     * if the email belongs to nobody. Only ever called for an email the provider says it verified
     * (§11): attaching on an unverified address would let anyone claim somebody else's account.
     */
    public AppUser link(String issuer, String subject, String email) {
        if (email == null || email.isBlank()) return null;
        AppUser user = data.repository(AppUser.class).findOne(USER_EMAIL.eq(email.trim()))
                .filter(found -> found.getDeletedAt() == null).orElse(null);
        if (user == null) return null;
        data.write(() -> data.repository(UserIdentity.class).save(UserIdentity.of(user.getId(), issuer, subject)));
        return user;
    }

    /** An account this installation did not administer into existence — the provider's word made it. */
    public AppUser provision(String issuer, String subject, String email, String name, boolean admin) {
        unclaimed(email);
        return data.write(() -> create(issuer, subject, email, name, admin));
    }

    /** An account and the one way in it starts with; every other way is a later {@link #link}. */
    private AppUser create(String issuer, String subject, String email, String name, boolean admin) {
        AppUser user = data.repository(AppUser.class).save(AppUser.of(email, name, admin));
        data.repository(UserIdentity.class).save(UserIdentity.of(user.getId(), issuer, subject));
        return user;
    }

    /**
     * Refuses an address that is already somebody's, before any write opens — a read cannot join one
     * (see {@code HibernateTxManager}), and this is also the cheaper order. Whoever reaches a caller
     * of this had one {@link #link} declined, meaning an identity provider that would not say the
     * address was verified, so the unique index would refuse them anyway — with a 500 instead of a
     * sentence they can act on.
     */
    private void unclaimed(String email) {
        if (email != null && data.repository(AppUser.class).findOne(USER_EMAIL.eq(email.trim()))
                .filter(taken -> taken.getDeletedAt() == null).isPresent()) {
            throw HttpException.forbidden("An account with this email already exists. Sign in the way you did before.");
        }
    }

    private boolean hasPassword(AppUser user) {
        return data.repository(LocalCredential.class).findById(user.getId()).isPresent();
    }

    private Invited open(Invitation invite, int expiresInDays) {
        if (!invite.isSso()) {
            String secret = random(24);
            invite.setKeyId(random(9));
            invite.setSecretHash(ENCODER.encode(secret));
            invite.setExpiresAt(expiry(expiresInDays));
            saved(invite);
            return new Invited(invite.getId(), invite.getEmail(), "/invite/" + invite.getKeyId() + "." + secret);
        }
        invite.setExpiresAt(expiry(expiresInDays));
        saved(invite);
        return new Invited(invite.getId(), invite.getEmail(), null);
    }

    private void saved(Invitation invite) {
        invite.setCreatedBy(SecurityIdentity.current().user(AppUser.class).getId());
        try {
            data.repository(Invitation.class).save(invite);
        } catch (RuntimeException taken) {
            throw HttpException.conflict("That email already has a pending invitation.");
        }
    }

    private Invitation valid(String token) {
        int dot = token == null ? -1 : token.indexOf('.');
        Invitation invite = dot < 0 ? null : data.repository(Invitation.class).findOne(KEY_ID.eq(token.substring(0, dot))).orElse(null);
        if (invite == null || invite.getAcceptedAt() != null || invite.getSecretHash() == null || !ENCODER.matches(token.substring(dot + 1), invite.getSecretHash())) {
            throw HttpException.notFound("Invitation");
        }
        if (invite.getExpiresAt() != null && invite.getExpiresAt().isBefore(Instant.now())) throw HttpException.conflict("This invitation has expired.");
        return invite;
    }

    private void grant(Invitation invite, long userId) {
        if (invite.getProjectId() == null) return;
        ProjectMember member = new ProjectMember();
        member.setProjectId(invite.getProjectId());
        member.setUserId(userId);
        member.setRole(invite.getRole());
        member.setLocale(invite.getLocale());
        data.repository(ProjectMember.class).save(member);
    }

    /** Refuses the two changes an administrator must not make to themselves: locking themselves out. */
    private AppUser mine(long userId, String action) {
        AppUser user = data.repository(AppUser.class).findById(userId).orElseThrow(() -> HttpException.notFound("Account"));
        if (user.getId().equals(SecurityIdentity.current().user(AppUser.class).getId())) throw HttpException.badRequest("You can't " + action + " your own account.");
        return user;
    }

    private List<Invitation> pending() {
        return data.repository(Invitation.class).findAll(ACCEPTED.isNull());
    }

    private static Membership membership(Map<Long, String> projects, long project, Role role, String locale) {
        return new Membership(project, projects.get(project), role, locale);
    }

    private static Status status(AppUser user) {
        return user.getDeletedAt() != null ? Status.DELETED : user.getDisabledAt() != null ? Status.DISABLED : Status.ACTIVE;
    }

    private static String source(String issuer) {
        if (UserIdentity.LOCAL.equals(issuer)) return "Password";
        String host = URI.create(issuer).getHost();
        return host == null ? issuer : host;
    }

    private static String email(String email) {
        String trimmed = email == null ? "" : email.trim();
        if (!trimmed.matches("[^\\s@]+@[^\\s@]+")) throw HttpException.badRequest("Enter a valid email.");
        return trimmed;
    }

    private static Instant expiry(int days) {
        return days <= 0 ? null : Instant.now().plus(days, ChronoUnit.DAYS);
    }

    private static String random(int bytes) {
        byte[] value = new byte[bytes];
        RANDOM.nextBytes(value);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

}
