# On this Mac

Local support is implemented behind an internal macOS flag and is **not release-qualified yet**. See [release acceptance](local-release-acceptance.md). Cloud and Your server remain available with their existing authentication.

## Try an internal build

Build from this repository with Node dependencies installed:

```sh
npm ci
node scripts/desktop/local/build.mjs arm64
npm run tauri --workspace @zilobase/desktop -- build --bundles app --config src-tauri/tauri.local.arm64.conf.json --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

On Intel use `x64` and `tauri.local.x64.conf.json`. Run the resulting executable with `ZILOBASE_LOCAL_ENABLED=1` in its environment. This is an internal test override, not a release certification. Debug builds keep a separate `local-debug` installation. The database/runtime are bundled; end users do not install Node, PostgreSQL, Docker or Homebrew.

At startup choose **Zilobase Cloud**, **Your server**, or **On this Mac**. Local setup asks for a display name and workspace name; Restore backup is available there too. The Connect another server dialog also offers local setup. Returning to a saved local profile starts its runtime and resolves its current port. Mode switching saves local documents, stops the old local runtime when selecting a remote server, disconnects transports and reloads the UI. There is no transfer or synchronization between workspaces.

Pages, databases, search, tasks, canvas, attachments, personal comments and internal automations use the local backend. Member management, guests, invitations, sharing, public publishing, external integrations and remote AI tools are unavailable. Local teamspaces organize content; internal ownership and editor collaboration still support persistence and multiple windows. Agent settings retain internal triggers and remove access management.

Wi-Fi connectivity does not disable local editing. Runtime failures show service availability separately, retain document recovery data and attempt at most three backend restarts in five minutes. Reload or reopen the app after addressing a persistent startup failure. Closing the window keeps the application and its jobs running; Quit saves open windows and stops owned processes. Jobs do not run after Quit or while the Mac is asleep; durable work is reconciled when the runtime resumes.

[AI and transcription setup](local-ai.md) describes user-managed Ollama and whisper.cpp, loopback ports, offline model imports and disabling Ollama cloud features. Missing services do not prevent ordinary workspace use. Zilobase does not download models or start/stop these services.

[Backup and restore](local-backups.md) explains unencrypted V1 archives, seven daily backups, export, recovery copies and the 4 GiB archive limit. [Data lifecycle](local-data-lifecycle.md) covers pre-upgrade backups, reinstall and explicit data deletion. Deleting the `.app` normally leaves Application Support data intact; exported backups provide protection against disk failure and uninstall cleaners.

Local mode disables updater checks and telemetry, limits backend traffic to its private database socket and configured loopback services, and blocks remote content in the renderer. External links require a user click and open in the system browser. Install local-mode updates from separately obtained signed installers. Independently managed AI services must also be configured offline; the app cannot prove their upstream behaviour from a loopback URL alone.
