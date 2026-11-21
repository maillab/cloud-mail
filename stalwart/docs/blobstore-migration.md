# Migrate Stalwart v1.1.1 blobs: SQLite `Default` → `FileSystem`

Use this when **Stalwart v1.1.1** was running with the `Default` blob store on
SQLite, the BlobStore was changed to `FileSystem`, and old messages now open
blank. Stalwart does **not** copy blobs when the backend changes; the old bytes
are still in the SQLite database until you remove them.

This is a blob-only repair. Accounts, mailboxes, flags, and all other data stay
in the same SQLite database. It is much smaller than a full
`--export`/`--import` migration.

The path and table layout below were verified against the `v1.1.1` source tag:

- `crates/store/src/backend/fs/mod.rs`
- `crates/store/src/backend/sqlite/blob.rs`
- `crates/store/src/lib.rs` (`Subspace::Blobs = b't'`)
- `encodify 1.0.2` (`STALWART` base32 alphabet)

Do not assume the same internal layout on other versions without rechecking.

## Quick rollback

If you only need the old mail back immediately, set BlobStore back to:

```json
{ "@type": "Default" }
```

restart Stalwart, and the old messages will be readable again. Then follow the
steps below if you still want `FileSystem`.

## Switching the same user/account

There is no per-user BlobStore switch in v1.1.1. `BlobStore` is a single
server-wide configuration object in the data store. Changing it affects every
account on that server.

What stays the same for the user:

- the account id, username, password and mailboxes;
- every message → blob reference in SQLite (a 32-byte content hash);
- client settings, if the public URL is unchanged.

So “the same user’s store” means: keep the same SQLite database and same
account, copy the old blobs into the FileSystem directory, then change the one
global BlobStore object. The user signs in as before after the restart. If only
one account matters, copying all blobs is still the simplest safe option; the
helper does not filter by account.

## Steps

### 1. Stop Stalwart

```bash
sudo systemctl stop stalwart
# or: docker stop stalwart
```

Do not migrate while the server is running.

`BlobStore`, listeners, caches and search concurrency are read at startup. A
BlobStore change in v1.1.1 takes effect only after a restart.

### 2. Back up the SQLite database and config

```bash
sudo cp -a /var/lib/stalwart/data.db /var/lib/stalwart/data.db.bak
sudo cp -a /etc/stalwart/config.json /etc/stalwart/config.json.bak
```

Adjust the paths to your installation. In v1.1.1, `config.json` only selects the
**DataStore**; the BlobStore object lives inside the SQLite data store. Back up
the file anyway, but do not expect to switch BlobStore by editing it.

### 3. Copy the blobs

Use the helper in this repo:

```bash
python3 scripts/migrate-sqlite-blobs-to-filesystem.py \
  --db /var/lib/stalwart/data.db \
  --out /var/lib/stalwart/blobs \
  --depth 2 \
  --verify
```

- `--db` is the SQLite **data store** file, not a dump.
- `--out` is the directory Stalwart will use as the FileSystem blob store.
- `--depth` must exactly match the `depth` you configure below (0–5, default 2).
- The tool opens SQLite read-only and only writes files under `--out`.

To preview paths without writing:

```bash
python3 scripts/migrate-sqlite-blobs-to-filesystem.py \
  --db /var/lib/stalwart/data.db \
  --out /var/lib/stalwart/blobs \
  --depth 2 --dry-run | head
```

If Stalwart runs as a dedicated user, fix ownership:

```bash
sudo chown -R stalwart:stalwart /var/lib/stalwart/blobs
```

### 4. Point BlobStore at the directory

In v1.1.1, do this in the WebUI under **Settings → Storage → Blob Store**, set
the variant to `FileSystem`, and enter:

```text
path:  /var/lib/stalwart/blobs
depth: 2
```

Equivalent object:

```json
{
  "@type": "FileSystem",
  "path": "/var/lib/stalwart/blobs",
  "depth": 2
}
```

If you use `stalwart-cli`, replace the whole singleton variant with `--json`;
do not try to change `@type` alone:

```bash
stalwart-cli update BlobStore --json \
  '{"@type":"FileSystem","path":"/var/lib/stalwart/blobs","depth":2}'
```

The `depth` must be the same value used in step 3. Changing it later makes
Stalwart look in the wrong subdirectories.

If cache swapping is configured, note that a FileSystem blob store cannot hold
cache swap snapshots in v1.1.1. Use `LocalFile` or `InMemory` for the cache swap
backend.

### 5. Start Stalwart and verify

```bash
sudo systemctl start stalwart
# or: docker start stalwart
```

Sign in as the same user. Open several old messages, including ones with
attachments. Also check sent items and any JMAP file-storage files. If bodies
are still blank, the usual cause is a wrong `path` or `depth` — stop the server
and rerun step 3 with the correct values.

Search results may be incomplete until the index is rebuilt. Trigger a
`StoreMaintenance` task of type `reindexAccounts` in the WebUI if needed.

## What the helper does

Stalwart v1.1.1's `Default` blob store keeps blobs in SQLite table `t`:

| Column | Meaning |
| --- | --- |
| `k` | 32-byte blob hash (content address) |
| `v` | stored blob bytes |

The FileSystem backend derives a filename from that same key:

```text
<path>/<hex(byte0)>/<hex(byte1)>/.../<STALWART_BASE32(key)>
```

The helper reproduces that layout exactly, using v1.1.1's lowercase base32
alphabet `abcdefghijklmnopqrstuvwxyz792013` with no padding. Hex levels use
non-padded Rust `{:x}` formatting, so byte `0x05` becomes `5`, not `05`.
Because blob names are content-addressed, rewriting a file with the same key is
safe.

The message → blob references in SQLite do **not** change: they already contain
the 32-byte hash. As long as `--out` and `--depth` match the FileSystem config,
Stalwart resolves those same references to the copied files.

## Cleanup

Leave the old rows in SQLite until you have verified mail for a few days. They
are harmless: Stalwart now reads blobs from the FileSystem store, and blob purge
acts on the configured backend.

Once verified, if you want to reclaim space you may remove the old blob rows
from a stopped server:

```bash
sqlite3 /var/lib/stalwart/data.db 'DELETE FROM t;'
```

Take a fresh backup first. Do **not** do this while Stalwart is running, and do
not do it until every old message has been confirmed readable.

## Docker note

Run the helper where both the SQLite file and the target directory are visible.
For example, from the host with a bind-mounted data directory:

```bash
python3 scripts/migrate-sqlite-blobs-to-filesystem.py \
  --db /srv/stalwart/data.db \
  --out /srv/stalwart/blobs \
  --depth 2 --verify
```

Then set the container's BlobStore `path` to the path as seen **inside** the
container, for example `/var/lib/stalwart/blobs`.
