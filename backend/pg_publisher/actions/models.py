from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TableRef(_Base):
    schema_name: str
    table_name: str


class PublishOptions(_Base):
    insert: bool = True
    update: bool = True
    delete: bool = True
    truncate: bool = True


class CreatePublication(_Base):
    kind: Literal["create_publication"] = "create_publication"
    name: str
    all_tables: bool = False
    tables: list[TableRef] = []
    publish: PublishOptions = PublishOptions()


class AlterPublicationAddTable(_Base):
    kind: Literal["alter_publication_add_table"] = "alter_publication_add_table"
    name: str
    table: TableRef


class AlterPublicationDropTable(_Base):
    kind: Literal["alter_publication_drop_table"] = "alter_publication_drop_table"
    name: str
    table: TableRef


class DropPublication(_Base):
    kind: Literal["drop_publication"] = "drop_publication"
    name: str


class CreateSubscription(_Base):
    kind: Literal["create_subscription"] = "create_subscription"
    name: str
    publisher_connection_id: UUID
    publications: list[str] = Field(min_length=1)
    enabled: bool = True
    create_slot: bool = True
    copy_data: bool = True
    slot_name: str | None = None
    synchronous_commit: str | None = None


class AlterSubscription(_Base):
    kind: Literal["alter_subscription"] = "alter_subscription"
    name: str
    op: Literal["enable", "disable", "refresh", "set_publication"]
    publications: list[str] | None = None  # only for set_publication


class DropSubscription(_Base):
    kind: Literal["drop_subscription"] = "drop_subscription"
    name: str
    disable_first: bool = True


ActionRequest = Annotated[
    CreatePublication
    | AlterPublicationAddTable
    | AlterPublicationDropTable
    | DropPublication
    | CreateSubscription
    | AlterSubscription
    | DropSubscription,
    Field(discriminator="kind"),
]


class ActionResult(_Base):
    ok: bool
    sql: str
    detail: str | None = None
