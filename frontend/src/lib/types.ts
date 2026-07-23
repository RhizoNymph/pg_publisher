import { z } from "zod";

export const Role = z.enum(["publisher", "subscriber", "auto"]);
export type Role = z.infer<typeof Role>;

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
export type StructuredConnection = z.infer<typeof StructuredConnection>;

export const DsnConnection = z.object({
  kind: z.literal("dsn"),
  id: z.string().uuid(),
  name: z.string(),
  role: Role,
  dsn_env: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DsnConnection = z.infer<typeof DsnConnection>;

export const Connection = z.discriminatedUnion("kind", [
  StructuredConnection,
  DsnConnection,
]);
export type Connection = z.infer<typeof Connection>;

export type ConnectionCreate =
  | {
      kind: "structured";
      name: string;
      role: Role;
      host: string;
      port: number;
      database: string;
      username: string;
      password_env: string;
      ssl_mode?: string;
    }
  | {
      kind: "dsn";
      name: string;
      role: Role;
      dsn_env: string;
    };

export const StreamKind = z.enum(["publication_slot", "subscription"]);
export type StreamKind = z.infer<typeof StreamKind>;

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
export type MetricSample = z.infer<typeof MetricSample>;

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
export type PublicationRow = z.infer<typeof PublicationRow>;

export const PublicationTableRow = z.object({
  publication: z.string(),
  schema_name: z.string(),
  table_name: z.string(),
});
export type PublicationTableRow = z.infer<typeof PublicationTableRow>;

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
export type ReplicationStatRow = z.infer<typeof ReplicationStatRow>;

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
export type ReplicationSlotRow = z.infer<typeof ReplicationSlotRow>;

export const SubscriptionRow = z.object({
  oid: z.number(),
  name: z.string(),
  owner: z.string(),
  enabled: z.boolean(),
  publications: z.array(z.string()),
  slot_name: z.string().nullable(),
  synchronous_commit: z.string().nullable(),
});
export type SubscriptionRow = z.infer<typeof SubscriptionRow>;

export const SubscriptionRel = z.object({
  subscription: z.string(),
  schema_name: z.string(),
  table_name: z.string(),
  state: z.string(),
  lsn: z.string().nullable(),
});
export type SubscriptionRel = z.infer<typeof SubscriptionRel>;

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
export type SubscriptionStatRow = z.infer<typeof SubscriptionStatRow>;

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
export type SnapshotPayload = z.infer<typeof SnapshotPayload>;

export const TableInfo = z.object({
  schema_name: z.string(),
  table_name: z.string(),
});
export type TableInfo = z.infer<typeof TableInfo>;

export const WSSamplePayload = z.object({
  type: z.literal("sample"),
  connection_id: z.string().uuid(),
  samples: z.array(MetricSample),
});
export type WSSamplePayload = z.infer<typeof WSSamplePayload>;

// ---- Actions -------------------------------------------------------------

export interface TableRef {
  schema_name: string;
  table_name: string;
}

export interface PublishOptions {
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
}

export type ActionRequest =
  | {
      kind: "create_publication";
      name: string;
      all_tables: boolean;
      tables: TableRef[];
      publish: PublishOptions;
    }
  | { kind: "drop_publication"; name: string }
  | { kind: "alter_publication_add_table"; name: string; table: TableRef }
  | { kind: "alter_publication_drop_table"; name: string; table: TableRef }
  | {
      kind: "create_subscription";
      name: string;
      publisher_connection_id: string;
      publications: string[];
      enabled: boolean;
      create_slot: boolean;
      copy_data: boolean;
      slot_name?: string | null;
      synchronous_commit?: string | null;
    }
  | {
      kind: "alter_subscription";
      name: string;
      op: "enable" | "disable" | "refresh" | "set_publication";
      publications?: string[];
    }
  | { kind: "drop_subscription"; name: string; disable_first: boolean };

export const ActionResult = z.object({
  ok: z.boolean(),
  sql: z.string(),
  detail: z.string().nullable().optional(),
});
export type ActionResult = z.infer<typeof ActionResult>;

// ---- Clone (schema dump + index copy) ------------------------------------

export interface CloneSchemaRequest {
  source_connection_id: string;
  source_schema: string;
  target_connection_id: string;
  target_schema: string;
  create_schema_if_missing: boolean;
  dry_run: boolean;
}

export interface CopyIndexesRequest {
  source_connection_id: string;
  source_schema: string;
  source_table?: string | null;
  target_connection_id: string;
  target_schema: string;
  target_table?: string | null;
  if_not_exists: boolean;
  dry_run: boolean;
}

export const CloneResult = z.object({
  ok: z.boolean(),
  statements_run: z.number().int(),
  sql: z.string(),
  detail: z.string().nullable().optional(),
});
export type CloneResult = z.infer<typeof CloneResult>;

export interface DiffIndexesRequest {
  source_connection_id: string;
  source_schema: string;
  source_table?: string | null;
  target_connection_id: string;
  target_schema: string;
  target_table?: string | null;
}

export const IndexCopyStatus = z.enum([
  "missing",
  "created",
  "exists",
  "conflict",
  "failed",
]);
export type IndexCopyStatus = z.infer<typeof IndexCopyStatus>;

export const IndexCopyOutcome = z.object({
  table_name: z.string(),
  index_name: z.string(),
  status: IndexCopyStatus,
  indexdef: z.string(),
  target_indexdef: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type IndexCopyOutcome = z.infer<typeof IndexCopyOutcome>;

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
export type CopyIndexesResult = z.infer<typeof CopyIndexesResult>;

export const IndexDefEntry = z.object({
  schema_name: z.string(),
  table_name: z.string(),
  index_name: z.string(),
  indexdef: z.string(),
});
export type IndexDefEntry = z.infer<typeof IndexDefEntry>;

export const IndexDiffResult = z.object({
  missing: z.array(IndexCopyOutcome),
  conflicts: z.array(IndexCopyOutcome),
  identical: z.array(IndexCopyOutcome),
  target_only: z.array(IndexDefEntry),
});
export type IndexDiffResult = z.infer<typeof IndexDiffResult>;
