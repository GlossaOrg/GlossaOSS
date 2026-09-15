-- Fixture for DatabaseLayerTest. Deliberately not under db/migration: a layer's migrations are a
-- separate sequence, and this one must never join the core's.
CREATE TABLE IF NOT EXISTS probe_layer (id int primary key);
