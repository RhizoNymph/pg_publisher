from __future__ import annotations

TABLES_IN_SCHEMA = """
SELECT n.nspname AS schema_name,
       c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = $1 AND c.relkind IN ('r', 'p')
ORDER BY c.relname
"""

PUBLICATIONS = """
SELECT
    p.oid::bigint                          AS oid,
    p.pubname                              AS name,
    pg_get_userbyid(p.pubowner)            AS owner,
    p.puballtables                         AS all_tables,
    p.pubinsert                            AS insert,
    p.pubupdate                            AS update,
    p.pubdelete                            AS delete,
    p.pubtruncate                          AS truncate
FROM pg_publication p
ORDER BY p.pubname
"""

PUBLICATION_TABLES = """
SELECT
    pt.pubname    AS publication,
    pt.schemaname AS schema_name,
    pt.tablename  AS table_name
FROM pg_publication_tables pt
ORDER BY pt.pubname, pt.schemaname, pt.tablename
"""

REPLICATION_SLOTS = """
SELECT
    slot_name,
    plugin,
    slot_type,
    database,
    active,
    active_pid,
    restart_lsn::text                            AS restart_lsn,
    confirmed_flush_lsn::text                    AS confirmed_flush_lsn,
    wal_status,
    safe_wal_size::bigint                        AS safe_wal_size_bytes
FROM pg_replication_slots
ORDER BY slot_name
"""

REPLICATION_STAT = """
SELECT
    pid,
    usename,
    application_name,
    host(client_addr)                            AS client_addr,
    state,
    sync_state,
    sent_lsn::text                               AS sent_lsn,
    write_lsn::text                              AS write_lsn,
    flush_lsn::text                              AS flush_lsn,
    replay_lsn::text                             AS replay_lsn,
    EXTRACT(EPOCH FROM write_lag)::float8        AS write_lag_seconds,
    EXTRACT(EPOCH FROM flush_lag)::float8        AS flush_lag_seconds,
    EXTRACT(EPOCH FROM replay_lag)::float8       AS replay_lag_seconds,
    backend_start,
    CASE
        WHEN sent_lsn IS NOT NULL AND replay_lsn IS NOT NULL
        THEN pg_wal_lsn_diff(sent_lsn, replay_lsn)::bigint
        ELSE NULL
    END                                          AS sent_to_replay_lag_bytes
FROM pg_stat_replication
ORDER BY pid
"""

SUBSCRIPTIONS = """
SELECT
    s.oid::bigint                                                AS oid,
    s.subname                                                    AS name,
    pg_get_userbyid(s.subowner)                                  AS owner,
    s.subenabled                                                 AS enabled,
    s.subpublications                                            AS publications,
    s.subslotname                                                AS slot_name,
    s.subsynccommit                                              AS synchronous_commit
FROM pg_subscription s
ORDER BY s.subname
"""

SUBSCRIPTION_RELS = """
SELECT
    s.subname                                                    AS subscription,
    n.nspname                                                    AS schema_name,
    c.relname                                                    AS table_name,
    sr.srsubstate                                                AS state,
    sr.srsublsn::text                                            AS lsn
FROM pg_subscription_rel sr
JOIN pg_subscription s ON s.oid = sr.srsubid
JOIN pg_class c ON c.oid = sr.srrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
ORDER BY s.subname, n.nspname, c.relname
"""

# pg_stat_subscription columns vary across versions. We use COALESCE-friendly
# columns common to PG14+; latest_end_lsn / received_lsn are present from 10+.
SUBSCRIPTION_STAT = """
SELECT
    ss.subname                                                   AS subscription_name,
    ss.pid                                                       AS pid,
    ss.received_lsn::text                                        AS received_lsn,
    ss.last_msg_send_time                                        AS last_msg_send_time,
    ss.last_msg_receipt_time                                     AS last_msg_receipt_time,
    ss.latest_end_lsn::text                                      AS latest_end_lsn,
    ss.latest_end_time                                           AS latest_end_time,
    CASE
        WHEN ss.last_msg_send_time IS NOT NULL
         AND ss.last_msg_receipt_time IS NOT NULL
        THEN EXTRACT(
            EPOCH FROM (ss.last_msg_receipt_time - ss.last_msg_send_time)
        )::float8
        ELSE NULL
    END                                                          AS apply_lag_seconds,
    CASE
        WHEN ss.received_lsn IS NOT NULL
         AND ss.latest_end_lsn IS NOT NULL
        THEN pg_wal_lsn_diff(ss.received_lsn, ss.latest_end_lsn)::bigint
        ELSE NULL
    END                                                          AS apply_lag_bytes
FROM pg_stat_subscription ss
ORDER BY ss.subname
"""
