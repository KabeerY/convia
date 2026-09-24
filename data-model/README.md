# Data model

`schema.sql` is the organizer's unmodified 14-table PostgreSQL model. The ordered
`migrations/` files add Convia records and guarded command/query functions; never
edit an applied migration. `seed/canonical/csv/` is imported example data, not
verified real people or live inventory. See [DATA_MODEL.md](DATA_MODEL.md) for
provenance, audit, identity mapping, and known limits.

From the repository root, with the untracked `.env` configured:

```sh
pnpm db:migrate
pnpm db:seed
pnpm test:conformance
```

The migration and seed ledgers reject changed previously-applied inputs. The
conformance command exports the actual database in a read-only transaction and
runs the organizer's original checker against that export.
