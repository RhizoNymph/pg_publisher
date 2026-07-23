import { z } from "zod";
export const Role = z.enum(["publisher", "subscriber", "auto"]);
export const StructuredConnection = z.object({
    kind: z.literal("structured"),
    id: z.string().uuid(),
    name: z.string(),
    role: Role,
    host: z.string(),
    port: z.number().int(),
    database: z.string(),
    username: z.string(),
    password_env: z.string(),
    ssl_mode: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const DsnConnection = z.object({
    kind: z.literal("dsn"),
    id: z.string().uuid(),
    name: z.string(),
    role: Role,
    dsn_env: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
});
export const Connection = z.discriminatedUnion("kind", [
    StructuredConnection,
    DsnConnection,
]);
export const StreamKind = z.enum(["publication_slot", "subscription"]);
export const MetricSample = z.object({
    connection_id: z.string().uuid(),
    stream_kind: StreamKind,
    stream_name: z.string(),
    sampled_at: z.string(),
    lag_bytes: z.number().int().nullable().optional(),
    lag_seconds: z.number().nullable().optional(),
    state: z.string().nullable().optional(),
    extra: z.record(z.unknown()).optional(),
});
export const PublicationRow = z.object({
    oid: z.number(),
    name: z.string(),
    owner: z.string(),
    all_tables: z.boolean(),
    insert: z.boolean(),
    update: z.boolean(),
    delete: z.boolean(),
    truncate: z.boolean(),
});
export const PublicationTableRow = z.object({
    publication: z.string(),
    schema_name: z.string(),
    table_name: z.string(),
});
export const ReplicationStatRow = z.object({
    pid: z.number(),
    usename: z.string().nullable(),
    application_name: z.string().nullable(),
    client_addr: z.string().nullable(),
    state: z.string().nullable(),
    sync_state: z.string().nullable(),
    sent_lsn: z.string().nullable(),
    write_lsn: z.string().nullable(),
    flush_lsn: z.string().nullable(),
    replay_lsn: z.string().nullable(),
    write_lag_seconds: z.number().nullable(),
    flush_lag_seconds: z.number().nullable(),
    replay_lag_seconds: z.number().nullable(),
    backend_start: z.string().nullable(),
    sent_to_replay_lag_bytes: z.number().nullable(),
});
export const ReplicationSlotRow = z.object({
    slot_name: z.string(),
    plugin: z.string().nullable(),
    slot_type: z.string(),
    database: z.string().nullable(),
    active: z.boolean(),
    active_pid: z.number().nullable(),
    restart_lsn: z.string().nullable(),
    confirmed_flush_lsn: z.string().nullable(),
    wal_status: z.string().nullable(),
    safe_wal_size_bytes: z.number().nullable(),
});
export const SubscriptionRow = z.object({
    oid: z.number(),
    name: z.string(),
    owner: z.string(),
    enabled: z.boolean(),
    publications: z.array(z.string()),
    slot_name: z.string().nullable(),
    synchronous_commit: z.string().nullable(),
});
export const SubscriptionRel = z.object({
    subscription: z.string(),
    schema_name: z.string(),
    table_name: z.string(),
    state: z.string(),
    lsn: z.string().nullable(),
});
export const SubscriptionStatRow = z.object({
    subscription_name: z.string(),
    pid: z.number().nullable(),
    received_lsn: z.string().nullable(),
    last_msg_send_time: z.string().nullable(),
    last_msg_receipt_time: z.string().nullable(),
    latest_end_lsn: z.string().nullable(),
    latest_end_time: z.string().nullable(),
    apply_lag_seconds: z.number().nullable(),
    apply_lag_bytes: z.number().nullable(),
});
export const SnapshotPayload = z.object({
    connection_id: z.string().uuid(),
    sampled_at: z.string(),
    publications: z.array(PublicationRow),
    publication_tables: z.array(PublicationTableRow),
    replication_slots: z.array(ReplicationSlotRow),
    replication_stats: z.array(ReplicationStatRow),
    subscriptions: z.array(SubscriptionRow),
    subscription_rels: z.array(SubscriptionRel),
    subscription_stats: z.array(SubscriptionStatRow),
    latest_samples: z.array(MetricSample),
});
export const TableInfo = z.object({
    schema_name: z.string(),
    table_name: z.string(),
});
export const WSSamplePayload = z.object({
    type: z.literal("sample"),
    connection_id: z.string().uuid(),
    samples: z.array(MetricSample),
});
export const ActionResult = z.object({
    ok: z.boolean(),
    sql: z.string(),
    detail: z.string().nullable().optional(),
});
export const CloneResult = z.object({
    ok: z.boolean(),
    statements_run: z.number().int(),
    sql: z.string(),
    detail: z.string().nullable().optional(),
});
export const IndexCopyStatus = z.enum([
    "missing",
    "created",
    "exists",
    "conflict",
    "failed",
]);
export const IndexCopyOutcome = z.object({
    table_name: z.string(),
    index_name: z.string(),
    status: IndexCopyStatus,
    indexdef: z.string(),
    target_indexdef: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
});
export const CopyIndexesResult = z.object({
    ok: z.boolean(),
    created: z.number().int(),
    exists: z.number().int(),
    conflicts: z.number().int(),
    failed: z.number().int(),
    sql: z.string(),
    outcomes: z.array(IndexCopyOutcome),
    detail: z.string().nullable().optional(),
});
export const IndexDefEntry = z.object({
    schema_name: z.string(),
    table_name: z.string(),
    index_name: z.string(),
    indexdef: z.string(),
});
export const IndexDiffResult = z.object({
    missing: z.array(IndexCopyOutcome),
    conflicts: z.array(IndexCopyOutcome),
    identical: z.array(IndexCopyOutcome),
    target_only: z.array(IndexDefEntry),
});
