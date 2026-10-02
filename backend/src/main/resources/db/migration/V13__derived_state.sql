-- §7/§8's derived state, derived where the data is. Both views are read-only: nothing writes
-- through them, and neither is an @Entity, so Database#CORE_ENTITIES stays as it is.

-- What one locale's copy of a resource is, from the three revision pointers a variant holds.
-- `is distinct from` and not `<>`: a rejected variant has a head and no approved revision, and
-- `<>` against null would answer null and fall through to the wrong branch.
create view variant_state as
select r.project_id,
       l.locale,
       r.id as resource_id,
       case when v.pending_revision_id is not null                              then 'REVIEW'
            when v.head_revision_id is null                                     then 'UNTRANSLATED'
            when v.head_revision_id is distinct from v.approved_revision_id      then 'REJECTED'
            when a.based_on_source_revision_id is not null
             and a.based_on_source_revision_id is distinct from s.approved_revision_id then 'OUTDATED'
            else 'APPROVED'
       end as state
from localized_resource r
join project_locale l on l.project_id = r.project_id
left join content_variant v on v.resource_id = r.id and v.locale = l.locale
left join content_revision a on a.id = v.approved_revision_id
left join project_locale sl on sl.project_id = r.project_id and sl.source
left join content_variant s on s.resource_id = r.id and s.locale = sl.locale
where not r.archived;

-- Which revision a locale actually serves for a resource: the first approved, non-stale one along
-- its fallback chain. A resource with nothing to serve anywhere on the chain is simply absent.
-- The hop ceiling is belt and braces — the application refuses to create a cycle — but a recursive
-- term with no bound is not something to leave to an invariant held one layer up.
create view resolved_entry as
with recursive chain (project_id, locale, hop, at) as (
    select project_id, locale, 0, locale
      from project_locale
    union all
    select c.project_id, c.locale, c.hop + 1, l.fallback_locale
      from chain c
      join project_locale l on l.project_id = c.project_id and l.locale = c.at
     where l.fallback_locale is not null
       and c.hop < 16
)
select distinct on (c.project_id, c.locale, r.id)
       c.project_id,
       c.locale,
       r.id as resource_id,
       r.key,
       c.at as resolved_locale,
       v.approved_revision_id as revision_id
from chain c
join localized_resource r on r.project_id = c.project_id and not r.archived
join content_variant v on v.resource_id = r.id and v.locale = c.at and v.approved_revision_id is not null
join content_revision a on a.id = v.approved_revision_id
left join project_locale sl on sl.project_id = r.project_id and sl.source
left join content_variant s on s.resource_id = r.id and s.locale = sl.locale
where a.based_on_source_revision_id is null
   or a.based_on_source_revision_id = s.approved_revision_id
order by c.project_id, c.locale, r.id, c.hop;
