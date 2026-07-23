from __future__ import annotations

import pytest
from pg_publisher.actions.identifiers import (
    quote_identifier,
    quote_qualified,
    validate_identifier,
)
from pg_publisher.errors import IdentifierInvalid


@pytest.mark.parametrize("ident", ["pub_foo", "Pub1", "_x", "a$b", "x" * 63])
def test_validate_identifier_accepts(ident: str) -> None:
    assert validate_identifier(ident) == ident


@pytest.mark.parametrize(
    "ident",
    ["", "1abc", "with-dash", "drop pub", "x" * 64, "a;b", '"quoted"'],
)
def test_validate_identifier_rejects(ident: str) -> None:
    with pytest.raises(IdentifierInvalid):
        validate_identifier(ident)


def test_quote_identifier_round_trip() -> None:
    assert quote_identifier("my_pub") == '"my_pub"'


def test_quote_qualified() -> None:
    assert quote_qualified("public", "users") == '"public"."users"'


def test_quote_qualified_rejects_bad() -> None:
    with pytest.raises(IdentifierInvalid):
        quote_qualified("public", "users; DROP TABLE x")
