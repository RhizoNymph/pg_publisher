from __future__ import annotations

import re

from pg_publisher.errors import IdentifierInvalid

_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]{0,62}$")


def validate_identifier(identifier: str) -> str:
    """Validate a SQL identifier; returns the same identifier or raises.

    We intentionally restrict to a portable subset (no quoted identifiers,
    no leading digits) to keep DDL building safe.
    """
    if not _IDENT_RE.match(identifier):
        raise IdentifierInvalid(identifier)
    return identifier


def quote_identifier(identifier: str) -> str:
    return f'"{validate_identifier(identifier)}"'


def quote_qualified(schema: str, table: str) -> str:
    return f"{quote_identifier(schema)}.{quote_identifier(table)}"
