from __future__ import annotations

from pg_publisher.clone.executor import (
    _compute_index_diff,
    _index_name_of,
    _index_signature,
    _inject_if_not_exists,
    _rewrite_indexdef,
)
from pg_publisher.clone.models import IndexDef


def idx(name: str, table: str, indexdef: str, schema: str = "prod_1") -> IndexDef:
    return IndexDef(
        schema_name=schema, table_name=table, index_name=name, indexdef=indexdef
    )


# ---- _index_signature ------------------------------------------------------


def test_signature_ignores_index_name() -> None:
    a = "CREATE INDEX pool_asset_idx ON prod_2.pool USING btree (asset)"
    b = "CREATE INDEX pool_asset_index ON prod_2.pool USING btree (asset)"
    assert _index_signature(a) == _index_signature(b)


def test_signature_ignores_if_not_exists_and_whitespace() -> None:
    a = "CREATE INDEX IF NOT EXISTS i ON s.t USING btree (a)"
    b = "CREATE INDEX i ON s.t\n    USING btree (a)"
    assert _index_signature(a) == _index_signature(b)


def test_signature_distinguishes_unique() -> None:
    a = "CREATE UNIQUE INDEX i ON s.t USING btree (a)"
    b = "CREATE INDEX i ON s.t USING btree (a)"
    assert _index_signature(a) != _index_signature(b)


def test_signature_distinguishes_nulls_ordering() -> None:
    # The real prod_1/prod_2 divergence: DESC vs DESC NULLS LAST are
    # different sort orders and must not be treated as identical.
    a = "CREATE INDEX i ON s.pool USING btree (created_at DESC, address DESC)"
    b = (
        "CREATE INDEX i ON s.pool USING btree "
        "(created_at DESC NULLS LAST, address DESC NULLS LAST)"
    )
    assert _index_signature(a) != _index_signature(b)


def test_signature_handles_quoted_names() -> None:
    a = 'CREATE INDEX "weird name" ON s.t USING btree (a)'
    b = "CREATE INDEX plain ON s.t USING btree (a)"
    assert _index_signature(a) == _index_signature(b)


# ---- _index_name_of --------------------------------------------------------


def test_name_extraction() -> None:
    assert (
        _index_name_of("CREATE UNIQUE INDEX u_pool_idx ON s.m USING btree (pool)", "fb")
        == "u_pool_idx"
    )
    assert _index_name_of('CREATE INDEX "Weird""Name" ON s.t (a)', "fb") == 'Weird"Name'
    assert _index_name_of("not an index statement", "fb") == "fb"


# ---- _rewrite_indexdef -----------------------------------------------------


def test_rewrite_schema() -> None:
    sql = "CREATE INDEX swap_asset_idx ON prod_1.swap USING btree (asset)"
    out = _rewrite_indexdef(sql, "prod_1", "prod_2", None, None)
    assert out == "CREATE INDEX swap_asset_idx ON prod_2.swap USING btree (asset)"


def test_rewrite_schema_noop_when_equal() -> None:
    sql = "CREATE INDEX i ON prod_1.t (a)"
    assert _rewrite_indexdef(sql, "prod_1", "prod_1", None, None) == sql


def test_rewrite_table_only_when_both_given() -> None:
    sql = "CREATE INDEX i ON prod_1.pool (asset)"
    out = _rewrite_indexdef(sql, "prod_1", "prod_2", "pool", "pool_copy")
    assert "prod_2.pool_copy" in out
    unchanged = _rewrite_indexdef(sql, "prod_1", "prod_2", "pool", None)
    assert "prod_2.pool " in unchanged + " "


def test_rewrite_preserves_expression_and_partial_indexes() -> None:
    sql = (
        "CREATE INDEX pool_liquidity_idx ON prod_1.pool USING btree "
        "(dollar_liquidity DESC, created_at DESC) WHERE (dollar_liquidity IS NOT NULL)"
    )
    out = _rewrite_indexdef(sql, "prod_1", "prod_2", None, None)
    assert out.startswith("CREATE INDEX pool_liquidity_idx ON prod_2.pool")
    assert out.endswith("WHERE (dollar_liquidity IS NOT NULL)")


# ---- _inject_if_not_exists -------------------------------------------------


def test_inject_if_not_exists() -> None:
    assert _inject_if_not_exists("CREATE INDEX i ON s.t (a)") == (
        "CREATE INDEX IF NOT EXISTS i ON s.t (a)"
    )
    assert _inject_if_not_exists("CREATE UNIQUE INDEX i ON s.t (a)") == (
        "CREATE UNIQUE INDEX IF NOT EXISTS i ON s.t (a)"
    )
    already = "CREATE INDEX IF NOT EXISTS i ON s.t (a)"
    assert _inject_if_not_exists(already) == already


# ---- _compute_index_diff ---------------------------------------------------


def _diff(source: list[IndexDef], target: list[IndexDef]):
    return _compute_index_diff(
        source,
        target,
        source_schema="prod_1",
        target_schema="prod_2",
        source_table=None,
        target_table=None,
    )


def test_diff_missing_on_target() -> None:
    source = [
        idx(
            "swap_timestamp_idx",
            "swap",
            'CREATE INDEX swap_timestamp_idx ON prod_1.swap USING btree ("timestamp")',
        ),
        idx(
            "token_name_trgm",
            "token",
            "CREATE INDEX token_name_trgm ON prod_1.token USING gin (name gin_trgm_ops)",
        ),
    ]
    d = _diff(source, [])
    assert [o.index_name for o in d.missing] == ["swap_timestamp_idx", "token_name_trgm"]
    assert all(o.status == "missing" for o in d.missing)
    assert "prod_2.swap" in d.missing[0].indexdef
    assert not d.conflicts and not d.identical and not d.target_only


def test_diff_identical_definition_different_name_counts_as_exists() -> None:
    source = [
        idx(
            "pool_asset_idx",
            "pool",
            "CREATE INDEX pool_asset_idx ON prod_1.pool USING btree (asset)",
        )
    ]
    target = [
        idx(
            "pool_asset_index",
            "pool",
            "CREATE INDEX pool_asset_index ON prod_2.pool USING btree (asset)",
            "prod_2",
        )
    ]
    d = _diff(source, target)
    assert not d.missing and not d.conflicts
    assert len(d.identical) == 1
    assert d.identical[0].status == "exists"
    assert d.identical[0].target_indexdef is not None
    assert not d.target_only


def test_diff_same_name_different_definition_is_conflict() -> None:
    source = [
        idx(
            "pool_created_idx",
            "pool",
            "CREATE INDEX pool_created_idx ON prod_1.pool "
            "USING btree (created_at DESC, address DESC)",
        )
    ]
    target = [
        idx(
            "pool_created_idx",
            "pool",
            "CREATE INDEX pool_created_idx ON prod_2.pool "
            "USING btree (created_at DESC NULLS LAST, address DESC NULLS LAST)",
            "prod_2",
        )
    ]
    d = _diff(source, target)
    assert not d.missing and not d.identical
    assert len(d.conflicts) == 1
    c = d.conflicts[0]
    assert c.status == "conflict"
    assert "NULLS LAST" in (c.target_indexdef or "")
    assert "NULLS LAST" not in c.indexdef
    # The conflicting target index is accounted for; it is not "target only".
    assert not d.target_only


def test_diff_target_only_reported() -> None:
    target = [
        idx(
            "stock_usd_price_pkey",
            "stock_usd_price",
            "CREATE UNIQUE INDEX stock_usd_price_pkey ON prod_2.stock_usd_price "
            "USING btree (address)",
            "prod_2",
        )
    ]
    d = _diff([], target)
    assert [t.index_name for t in d.target_only] == ["stock_usd_price_pkey"]


def test_diff_uses_rewritten_names_for_matching() -> None:
    # Identical pkey on both sides must match even though the source def
    # references prod_1 and the target def references prod_2.
    source = [
        idx(
            "asset_pkey",
            "asset",
            "CREATE UNIQUE INDEX asset_pkey ON prod_1.asset USING btree (address)",
        )
    ]
    target = [
        idx(
            "asset_pkey",
            "asset",
            "CREATE UNIQUE INDEX asset_pkey ON prod_2.asset USING btree (address)",
            "prod_2",
        )
    ]
    d = _diff(source, target)
    assert len(d.identical) == 1
    assert not d.missing and not d.conflicts and not d.target_only
