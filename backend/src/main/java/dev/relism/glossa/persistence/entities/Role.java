package dev.relism.glossa.persistence.entities;

/**
 * §8's collaborator roles, plus the read-only one the public delivery API (§10) issues keys for.
 * Ordered: a role satisfies every requirement its rank covers, so a manager needs no second row
 * to review, and {@code reader} is what a delivery consumer gets.
 */
public enum Role {
    READER, TRANSLATOR, REVIEWER, MANAGER;

    /** True when holding this role is enough for a route that requires {@code required}. */
    public boolean covers(Role required) {
        return ordinal() >= required.ordinal();
    }
}
