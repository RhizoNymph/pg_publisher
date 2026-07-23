"""Tests for the SQL builders in `actions.executor` (no DB required)."""

from __future__ import annotations

import pytest
from pg_publisher.actions.executor import (
    _build_alter_add_table,
    _build_alter_drop_table,
    _build_alter_subscription,
    _build_create_publication,
    _build_drop_publication,
    _build_drop_subscription,
)
from pg_publisher.actions.models import (
    AlterPublicationAddTable,
    AlterPublicationDropTable,
    AlterSubscription,
    CreatePublication,
    DropPublication,
    DropSubscription,
    PublishOptions,
    TableRef,
)
from pg_publisher.errors import IdentifierInvalid


def test_create_publication_all_tables() -> None:
    sql = _build_create_publication(
        CreatePublication(name="pub_a", all_tables=True)
    )
    assert sql == 'CREATE PUBLICATION "pub_a" FOR ALL TABLES'
    # default publish ops included
    sql2 = _build_create_publication(
        CreatePublication(
            name="pub_b",
            all_tables=True,
            publish=PublishOptions(insert=True, update=False, delete=False, truncate=False),
        )
    )
    assert sql2.endswith("WITH (publish = 'insert')")


def test_create_publication_with_tables() -> None:
    sql = _build_create_publication(
        CreatePublication(
            name="pub_c",
            tables=[TableRef(schema_name="public", table_name="users")],
        )
    )
    assert sql.startswith('CREATE PUBLICATION "pub_c" FOR TABLE "public"."users"')


def test_create_publication_rejects_both_all_and_tables() -> None:
    with pytest.raises(ValueError):
        _build_create_publication(
            CreatePublication(
                name="pub_d",
                all_tables=True,
                tables=[TableRef(schema_name="public", table_name="users")],
            )
        )


def test_alter_add_drop_table() -> None:
    add = _build_alter_add_table(
        AlterPublicationAddTable(
            name="pub_a", table=TableRef(schema_name="public", table_name="orders")
        )
    )
    assert add == 'ALTER PUBLICATION "pub_a" ADD TABLE "public"."orders"'
    drop = _build_alter_drop_table(
        AlterPublicationDropTable(
            name="pub_a", table=TableRef(schema_name="public", table_name="orders")
        )
    )
    assert drop == 'ALTER PUBLICATION "pub_a" DROP TABLE "public"."orders"'


def test_drop_publication() -> None:
    assert (
        _build_drop_publication(DropPublication(name="pub_a"))
        == 'DROP PUBLICATION "pub_a"'
    )


def test_alter_subscription_ops() -> None:
    assert (
        _build_alter_subscription(AlterSubscription(name="sub_x", op="enable"))
        == 'ALTER SUBSCRIPTION "sub_x" ENABLE'
    )
    assert (
        _build_alter_subscription(AlterSubscription(name="sub_x", op="disable"))
        == 'ALTER SUBSCRIPTION "sub_x" DISABLE'
    )
    assert (
        _build_alter_subscription(AlterSubscription(name="sub_x", op="refresh"))
        == 'ALTER SUBSCRIPTION "sub_x" REFRESH PUBLICATION'
    )
    assert (
        _build_alter_subscription(
            AlterSubscription(name="sub_x", op="set_publication", publications=["a", "b"])
        )
        == 'ALTER SUBSCRIPTION "sub_x" SET PUBLICATION "a", "b"'
    )


def test_alter_subscription_set_publication_requires_pubs() -> None:
    with pytest.raises(ValueError):
        _build_alter_subscription(
            AlterSubscription(name="sub_x", op="set_publication")
        )


def test_drop_subscription_disable_first() -> None:
    stmts = _build_drop_subscription(DropSubscription(name="sub_y"))
    assert stmts == [
        'ALTER SUBSCRIPTION "sub_y" DISABLE',
        'ALTER SUBSCRIPTION "sub_y" SET (slot_name = NONE)',
        'DROP SUBSCRIPTION "sub_y"',
    ]


def test_create_publication_rejects_bad_name() -> None:
    with pytest.raises(IdentifierInvalid):
        _build_create_publication(CreatePublication(name="bad-name", all_tables=True))
