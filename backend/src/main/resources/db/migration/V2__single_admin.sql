-- §11: the first user becomes the install's administrator, and only the first — even when two
-- sign in at once, the second insert fails here instead of making a second administrator.
create unique index app_user_single_admin on app_user (admin) where admin;
