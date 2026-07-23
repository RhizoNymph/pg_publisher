from __future__ import annotations

from uuid import uuid4

from pg_publisher.actions.executor import (
    _build_create_subscription,
    _redact_conninfo,
    _with_connect_timeout,
)
from pg_publisher.actions.models import CreateSubscription


def _action(**overrides: object) -> CreateSubscription:
    base: dict[str, object] = {
        "name": "sub_a",
        "publisher_connection_id": uuid4(),
        "publications": ["pub_a"],
    }
    base.update(overrides)
    return CreateSubscription.model_validate(base)


def test_create_subscription_defaults() -> None:
    sql = _build_create_subscription(_action(), "host=h port=5432 dbname=d")
    assert sql.startswith('CREATE SUBSCRIPTION "sub_a" ')
    assert "CONNECTION 'host=h port=5432 dbname=d'" in sql
    assert 'PUBLICATION "pub_a"' in sql
    assert "create_slot = true" in sql
    assert "copy_data = true" in sql


def test_create_subscription_same_cluster_form() -> None:
    # The executor rewrites same-cluster requests to create_slot = false with
    # an explicit slot_name (the slot is pre-created on the publisher).
    action = _action().model_copy(
        update={"create_slot": False, "slot_name": "sub_a"}
    )
    sql = _build_create_subscription(action, "host=h dbname=d")
    assert "create_slot = false" in sql
    assert 'slot_name = "sub_a"' in sql


def test_create_subscription_escapes_conninfo() -> None:
    sql = _build_create_subscription(_action(), "host=h password=it's")
    assert "CONNECTION 'host=h password=it''s'" in sql


def test_with_connect_timeout_appends_when_missing() -> None:
    assert (
        _with_connect_timeout("host=h dbname=d")
        == "host=h dbname=d connect_timeout=10"
    )


def test_with_connect_timeout_respects_existing() -> None:
    conninfo = "host=h dbname=d connect_timeout=3"
    assert _with_connect_timeout(conninfo) == conninfo


def test_with_connect_timeout_uri_with_query() -> None:
    assert (
        _with_connect_timeout("postgresql://u:p@h:25060/db?sslmode=require")
        == "postgresql://u:p@h:25060/db?sslmode=require&connect_timeout=10"
    )


def test_with_connect_timeout_uri_without_query() -> None:
    assert (
        _with_connect_timeout("postgresql://u:p@h/db")
        == "postgresql://u:p@h/db?connect_timeout=10"
    )


def test_redact_conninfo_uri_password() -> None:
    assert (
        _redact_conninfo("postgresql://doadmin:sekret@h:25060/db?sslmode=require")
        == "postgresql://doadmin:***@h:25060/db?sslmode=require"
    )


def test_redact_conninfo_keyword_password() -> None:
    out = _redact_conninfo("host=h user=u password='sek ret' sslmode=require")
    assert "sek" not in out
    assert "password=***" in out
    assert out.endswith("sslmode=require")
