# Local release acceptance — incomplete

The `full-local-support` branch contains fifteen implementation-pass commits. The final pass provides packaging, validation and guarded enablement; it does **not** certify a production release. `ZILOBASE_LOCAL_ENABLED=1` is still needed for internal testing. Windows and Linux local mode remain disabled.

## Implemented release gate

`scripts/desktop/local/release-gate.mjs` requires a format-1 acceptance record with the exact 40-character Git `sourceRevision` and an `architectures` object containing `arm64` and `x64`. Every check listed in its exported `acceptanceChecks` must have `{ "status": "passed", "evidence": "a reviewable report or artifact reference" }`. Missing, failed, pending, evidence-free or stale-revision checks fail the build. The gate's test fixtures are synthetic and are not release evidence.

An accepted release sets repository variable `ENABLE_DESKTOP_LOCAL=true` and supplies the reviewed record in `DESKTOP_LOCAL_ACCEPTANCE`. The macOS release workflow checks it, builds architecture-specific resources, requires Developer ID signing, verifies relocation, runs packaged smoke tests and includes the matching resource overlay. The Rust build independently checks `ZILOBASE_LOCAL_RELEASE=1` against `ZILOBASE_LOCAL_ACCEPTANCE` before compiling release enablement. Normal builds preserve hosted defaults. Do not enable the repository variable until the table below is complete.

The resource workflow uses native `macos-15` and `macos-15-intel` runners, as listed in the [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). It validates all manifest hashes, required files, Mach-O architecture and system-only/relative library dependencies. Runtime files are signed before generating final manifest hashes. Tauri's existing release pipeline handles bundle signing and notarization with configured secrets. These CI changes have not been executed on GitHub from this session.

## Evidence from this development machine

- Code-health audit against the preserved starting checkout `487f8bca1b325ead082cf020ff0fd5685884515a` reports no introduced findings; five existing clipper dependency findings are excluded as inherited. The default audit against `origin/main` also includes the five pre-existing commits and their unrelated findings. No health baseline or thresholds were relaxed.
- Server full coverage suite and query-regression suite, web tests/build, package tests/typechecks, Rust tests/Clippy and architecture checks were run; the final server coverage suite passed 1,139 tests (one skipped), the query-regression suite passed 310 tests, and Rust passed 46 tests.
- Bundled arm64 and x64 resources passed checksums, dependency/architecture inspection, relocated execution and PostgreSQL restart persistence. x64 ran under Rosetta on this Apple Silicon machine; this is **not** clean Intel acceptance.
- Packaged runtime tests cover offline bootstrap/session authorization, restart identity, database and object backup/restore with fresh credentials, pre-migration backups, downgrade rejection, interrupted restore activation, backend SIGKILL/watchdog cleanup, and unchanged-data backup skipping.
- The Node network harness blocks disallowed sockets, DNS and redirects. Renderer policy tests inspect CSP and capability behaviour. These are not a WKWebView network/DNS packet capture.
- Ollama and Whisper HTTP protocol fixtures passed. No real model service was available for inference, long-recording throughput or audio-device acceptance.
- A release-mode `.app` was built with arm64 resources (about 182 MiB on disk, not a compressed installer). Developer ID signing, notarization and a signed installer were not verified.
- The benchmark script measures a fresh empty workspace, warm OS caches, 20 authenticated workspace-list requests and summed runtime RSS (which can double-count shared PostgreSQL memory). It does not represent a large production workspace. See [the checked-in benchmark sample](local-benchmark-sample.json) for the measured environment and values.

## Required before enablement

| Acceptance area | Remaining evidence |
| --- | --- |
| Clean installation | Offline first launch on clean Apple Silicon and Intel Macs without developer dependencies |
| Core feature persistence | Native UI exercise of pages, databases, search, tasks, canvas, attachments, comments and automations across restarts |
| Collaboration restrictions | Complete UI/accessibility/command/deep-link audit plus direct API and agent-tool attempts |
| Real local AI | Installed offline Ollama models: streaming, cancellation, structured output and tool compatibility |
| Real transcription | Real Whisper model and microphone/system capture, long/slow recordings, storage limits, restart/deduplication and summaries |
| Network isolation | Startup and inactive-profile WKWebView/native network and DNS capture with internet enabled and disabled; external service cloud features off |
| Lifecycle | Multi-window saves/reloads, close versus Quit, sleep/wake, crash recovery limit and interrupted maintenance |
| Profile isolation | Native local/Cloud/custom-server switching with pending edits and changed local ports |
| Backups | Native file dialogs, low disk, corrupted/truncated archives, fresh-machine restore, recording recovery and exported backup preservation |
| Upgrade and deletion | Prior-release upgrade/failure, Finder deletion/reinstall and typed native data deletion on both architectures |
| Hosted regression | Existing Cloud/self-hosted desktop end-to-end flows on packaged builds |
| Signing and relocation | Developer ID signed, notarized and stapled installer, relocated app and matching-architecture executables on both machines |
| Performance | Installer size, uncached startup, representative database workload, idle memory, larger backups and real transcription processing rate |

V1 limitations: unencrypted archives, classic ZIP total size below 4 GiB, user-managed external services/models, no cross-mode data transfer or sync, no Windows/Linux local runtime, and no promise of speaker diarization. Backup fingerprinting conservatively treats database counter resets as changes. Corrupt recovery files are preserved for diagnosis; corruption-specific native recovery UX still needs acceptance testing.
