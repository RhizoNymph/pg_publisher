from __future__ import annotations


class PgPublisherError(Exception):
    """Base class for typed application errors."""


class ConnectionNotFound(PgPublisherError):
    def __init__(self, connection_id: str) -> None:
        super().__init__(f"connection {connection_id!r} not found")
        self.connection_id = connection_id


class ConnectionTestFailed(PgPublisherError):
    def __init__(self, connection_id: str, reason: str) -> None:
        super().__init__(f"connection {connection_id!r} test failed: {reason}")
        self.connection_id = connection_id
        self.reason = reason


class IdentifierInvalid(PgPublisherError):
    def __init__(self, identifier: str) -> None:
        super().__init__(f"invalid SQL identifier: {identifier!r}")
        self.identifier = identifier


class SecretNotFound(PgPublisherError):
    def __init__(self, env_var: str) -> None:
        super().__init__(f"secret env var {env_var!r} is not set")
        self.env_var = env_var


class InsufficientPrivilege(PgPublisherError):
    def __init__(self, connection_id: str, what: str) -> None:
        super().__init__(f"connection {connection_id!r} lacks privilege for {what}")
        self.connection_id = connection_id
        self.what = what
