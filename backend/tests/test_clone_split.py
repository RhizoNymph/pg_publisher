from __future__ import annotations

from pg_publisher.clone.executor import _split_statements, _strip_create_schema


def test_splits_simple_statements() -> None:
    sql = "CREATE TABLE t (id int);\nCREATE INDEX i ON t (id);\n"
    assert _split_statements(sql) == [
        "CREATE TABLE t (id int)",
        "CREATE INDEX i ON t (id)",
    ]


def test_keeps_semicolons_inside_dollar_quotes() -> None:
    sql = (
        "CREATE FUNCTION f() RETURNS void AS $$\n"
        "BEGIN\n"
        "  PERFORM 1;\n"
        "END;\n"
        "$$ LANGUAGE plpgsql;\n"
    )
    stmts = _split_statements(sql)
    assert len(stmts) == 1
    assert "PERFORM 1;" in stmts[0]


def test_strips_psql_meta_commands() -> None:
    # pg_dump >= 16.10/17.6 wraps dumps in \restrict/\unrestrict, which are
    # psql meta-commands, not SQL. They must not reach the server.
    sql = (
        "\\restrict abc123XYZ\n"
        "SET statement_timeout = 0;\n"
        "CREATE TABLE public.t (id int);\n"
        "\\unrestrict abc123XYZ\n"
    )
    assert _split_statements(sql) == [
        "SET statement_timeout = 0",
        "CREATE TABLE public.t (id int)",
    ]


def test_drops_comment_only_statements() -> None:
    # The tail of a pg_dump after the final `;` is a comment block (and,
    # post-\unrestrict stripping, nothing else). Executing a comment-only
    # query yields EmptyQueryResponse, which asyncpg mishandles — so it must
    # never be emitted as a statement.
    sql = (
        "CREATE TABLE public.t (id int);\n"
        "\\unrestrict abc123XYZ\n"
        "--\n"
        "-- PostgreSQL database dump complete\n"
        "--\n"
    )
    assert _split_statements(sql) == ["CREATE TABLE public.t (id int)"]


def test_keeps_statements_with_leading_comments() -> None:
    sql = (
        "--\n"
        "-- Name: t; Type: TABLE\n"
        "--\n"
        "CREATE TABLE public.t (id int);\n"
    )
    stmts = _split_statements(sql)
    assert len(stmts) == 1
    assert "CREATE TABLE public.t (id int)" in stmts[0]


def test_semicolons_in_banner_comments_do_not_split() -> None:
    # pg_dump object banners contain semicolons: `-- Name: t; Type: TABLE; ...`.
    # They must not act as statement terminators.
    sql = (
        "SET client_encoding = 'UTF8';\n"
        "--\n"
        "-- Name: t; Type: TABLE; Schema: public; Owner: -\n"
        "--\n"
        "CREATE TABLE public.t (id int);\n"
    )
    stmts = _split_statements(sql)
    assert len(stmts) == 2
    assert stmts[0] == "SET client_encoding = 'UTF8'"
    assert stmts[1].endswith("CREATE TABLE public.t (id int)")
    assert "Type: TABLE" in stmts[1]  # banner stays attached to its statement


def test_semicolons_in_string_literals_do_not_split() -> None:
    sql = "CREATE TABLE t (s text DEFAULT 'a;b', q text DEFAULT 'it''s; ok');\n"
    assert _split_statements(sql) == [
        "CREATE TABLE t (s text DEFAULT 'a;b', q text DEFAULT 'it''s; ok')"
    ]


def test_semicolons_in_quoted_identifiers_do_not_split() -> None:
    sql = 'CREATE TABLE "weird;name" (id int);\n'
    assert _split_statements(sql) == ['CREATE TABLE "weird;name" (id int)']


def test_keeps_backslash_lines_inside_dollar_quotes() -> None:
    sql = (
        "CREATE FUNCTION g() RETURNS text AS $body$\n"
        "\\not a meta-command\n"
        "$body$ LANGUAGE sql;\n"
    )
    stmts = _split_statements(sql)
    assert len(stmts) == 1
    assert "\\not a meta-command" in stmts[0]


def test_strip_create_schema_ignores_leading_comments() -> None:
    stmts = _split_statements(
        "--\n"
        "-- Name: myschema; Type: SCHEMA; Schema: -; Owner: -\n"
        "--\n"
        "CREATE SCHEMA myschema;\n"
        "CREATE TABLE myschema.t (id int);\n"
    )
    assert len(stmts) == 2
    kept = _strip_create_schema(stmts, "myschema")
    assert len(kept) == 1
    assert "CREATE TABLE" in kept[0]
