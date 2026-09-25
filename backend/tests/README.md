# Central Command backend tests

```bash
cd backend
php artisan test
```

They need two local PostgreSQL databases, created once, owned by the
same user as in `backend/.env` (`cc_app` in the dev setup):

```bash
sudo -u postgres createdb -O cc_app central_command_test
sudo -u postgres createdb -O cc_app central_command_test_client
```

- `central_command_test` is Central Command's own database. Every test
  rebuilds it from the migrations (`RefreshDatabase`), so never point it
  at real data.
- `central_command_test_client` stands in for a client ERP database.
  `tests/Concerns/UsesClientDatabase.php` recreates just the tables
  Central Command reads and writes there, shaped like the ERP's own
  migrations (see `docs/central-command-schema-contract.md`), so the
  tests exercise the real SQL of pushes, Test Connection and client
  upgrades.

Both names, the upgrade-agent token and the minimum client migration
are set in `phpunit.xml`, overriding `.env`.

| File | Covers |
|---|---|
| `Feature/AuthTest.php` | Password, then one-time code, then token; wrong password / code / reused code; disabled account; token-protected screens |
| `Feature/CcUpgradeAgentTest.php` | The CC Upgrade screen with its host agent: token checks, heartbeat, pickup, live progress, final report, failures, cancel, super-admin only |
| `Feature/ClientDatabaseTest.php` | Against the stand-in client DB: Test Connection, announcement push (one-way `central` rows, upsert), minimum-migration refusal, client upgrade queue, clients without upgrade support |
