-- §11: an administrator's reset does not change the password, it retires it — the account chooses a
-- new one before it can do anything else.
alter table app_user add column password_reset_at timestamptz;

-- One account per email, whichever way it signs in: an address is the person, not the strategy.
-- Removed accounts keep their row for the §8 change log, and release the address.
create unique index app_user_live_email on app_user (lower(email)) where deleted_at is null;
