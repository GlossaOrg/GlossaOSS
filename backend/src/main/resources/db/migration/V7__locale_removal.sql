-- §8 keeps localization history immutable. Removing a whole locale is the one deliberate exception:
-- the service opts in for that transaction alone (set_config(..., true) is transaction-local), and
-- only for deletes. Updates stay refused whatever is set.
create or replace function localization_immutable() returns trigger language plpgsql as $$
begin
    if tg_op = 'DELETE' and current_setting('glossa.removing_locale', true) = 'on' then
        return old;
    end if;
    raise exception 'Localization history is immutable';
end;
$$;
