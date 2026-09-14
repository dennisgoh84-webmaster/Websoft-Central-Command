"""
Bring Central Command's own database to the latest Alembic schema and
make sure the default admin account exists.

Run:  cd backend && uv run python seed.py
Also runs automatically on every container start (see Dockerfile) — this
is what makes `docker compose up -d --build` an upgrade path, not just a
first-install script.
"""
from pathlib import Path

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from sqlalchemy import inspect, text

from app.core.database import engine, SessionLocal
from app.models.admin import AdminUser
from app.services.auth import hash_password

# The revision every database created by a seed.py from before this
# schema had real migration coverage was left stamped at, via
# Base.metadata.create_all() followed by a blind `alembic stamp head`.
# A database at exactly this revision already has every table the
# baseline migration below would create, so replaying its CREATE TABLE
# statements against it would fail with "relation already exists". See
# the "Legacy database" branch in migrate() below.
_LEGACY_HEAD = "8c24275f88c3"


def _alembic_config() -> AlembicConfig:
    backend_dir = Path(__file__).parent
    cfg = AlembicConfig(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    return cfg


def _current_revision() -> str | None:
    with engine.connect() as conn:
        row = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).fetchone()
        return row[0] if row else None


def migrate() -> None:
    """Bring the database schema to the latest Alembic head.

    Idempotent and safe to run on every container start:
      - a brand-new database gets every migration, in order
      - a database already at head is a no-op
      - a database seeded by the old create_all-based seed.py (every
        table present, but never stamped, or stamped at the old
        single-migration head) is detected and stamped forward instead
        of re-running DDL for tables that already exist
    Anything else just runs `alembic upgrade head` normally.
    """
    cfg = _alembic_config()
    inspector = inspect(engine)
    has_version_table = inspector.has_table("alembic_version")
    has_app_tables = inspector.has_table("admin_users")

    if not has_version_table and has_app_tables:
        alembic_command.stamp(cfg, "head")
        print("Legacy database (tables exist, no Alembic version recorded): stamped at head")
    elif has_version_table and has_app_tables and _current_revision() == _LEGACY_HEAD:
        alembic_command.stamp(cfg, "head")
        print(f"Legacy database at {_LEGACY_HEAD}: stamped forward to head")

    alembic_command.upgrade(cfg, "head")


def seed():
    migrate()
    db = SessionLocal()

    # Default admin (super_admin role)
    existing = db.query(AdminUser).filter(AdminUser.username == "admin").first()
    if not existing:
        db.add(AdminUser(
            username="admin",
            full_name="Dennis Goh",
            email="admin@webmaster.com.sg",
            hashed_password=hash_password("Admin123"),
            role="super_admin",
        ))
        print("Created admin user: admin / Admin123 (super_admin)")
    else:
        # Upgrade existing admin to super_admin if needed
        if existing.role != "super_admin":
            existing.role = "super_admin"
            print("Upgraded admin to super_admin role")
        if not existing.email:
            existing.email = "admin@webmaster.com.sg"
        print("Admin user already exists")

    db.commit()
    db.close()
    print("Central Command seed complete.")


if __name__ == "__main__":
    seed()
