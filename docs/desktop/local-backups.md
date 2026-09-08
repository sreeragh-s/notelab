# Local workspace backups

In On this Mac mode, open workspace AI/settings to find Local backups. Back up now saves in the app data folder; Export backup lets you choose another location. Restore backup is also available during initial local setup. Keep an exported copy on another disk: deleting local data removes its automatic backups too.

V1 `.zilobackup` files are **unencrypted**. They contain a logical PostgreSQL dump, attachments, pending transcription chunks and native recording recovery, content keys, installation identity, and local service configuration. They exclude login sessions, database passwords, logs, sockets, caches and external model files. Treat the archive like the workspace itself. V1 uses streaming, uncompressed classic ZIP with a 4 GiB total limit; larger workspaces require a future archive format.

Backup flushes the active editor, ends native recording and stops the API before dumping and copying. Each payload has a SHA-256 checksum; creation extracts and verifies the temporary archive before atomic publication. A failed backup keeps the previous archive. The runtime reopens afterward. The scheduler checks daily while the app is running, defers during recording and retains seven dated daily archives. It currently backs up on elapsed time, including days without content changes.

Restore validates the archive into a separate staging directory, restores through a restricted database role, checks the single-user/workspace shape, applies bundled migrations, and removes disposable sessions. It generates fresh database passwords, preserves required content keys, and returns application ownership to the migration role. Activation renames directories and retains the old installation beside the new one as a recovery copy. A failed validation leaves the existing installation in place. Restored native recording paths are recalculated on this machine.

External Ollama and Whisper installations and their model files are not restored. Install the recorded models independently and configure the local services again if their ports differ.

Validation: `node scripts/desktop/local/backup-smoke.mjs` exercises packaged backup and fresh-install restore. Archive tests cover payload integrity, truncation and unsafe names. Multi-window maintenance acknowledgement, low-disk interruption and clean-machine native dialog testing remain release acceptance work.
