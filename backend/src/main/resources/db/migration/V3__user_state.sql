-- §11: an account can be suspended or removed without losing what it did — the §8 change log
-- attributes every change to a user row, so neither state deletes it.
alter table app_user
    add column disabled_at timestamptz,
    add column deleted_at  timestamptz;
