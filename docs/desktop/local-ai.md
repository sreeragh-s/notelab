# Offline AI setup on macOS

Local mode uses an independently installed Ollama service. Zilobase does not install,
start, terminate, or download models for that service. The workspace works without it.

1. Obtain the Ollama installer and a compatible model pack separately. Copy them to
   the offline Mac. Verify their publisher checksums and model license.
2. Disable cloud features before starting Ollama. Set `OLLAMA_NO_CLOUD=1` for the
   process, or merge `"disable_ollama_cloud": true` into `~/.ollama/server.json`.
   Restart Ollama and confirm its log reports cloud disabled. Bind to loopback.
3. Import a local GGUF file using a Modelfile with `FROM /absolute/path/model.gguf`,
   then `ollama create offline-model -f /absolute/path/Modelfile`. Do not use a
   remote model name as the FROM value. See the official
   [offline import instructions](https://docs.ollama.com/import) and
   [cloud-disable configuration](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features).
4. In Zilobase Workspace settings, select Local AI services. Enter the service port
   (default 11434) and exact installed model name. Choose Save and verify.
5. Verification checks text streaming, structured answers, and a tool call with no
   application side effects. Plain chat can work without tool support; agents need
   structured answers and tools. Verification is repeated after backend restart or
   model digest changes. No model is pulled automatically. File inputs are not
   supported by the initial local adapter; attach page context or paste text.

Zilobase uses Ollama's [OpenAI-compatible chat API](https://docs.ollama.com/api/openai-compatibility)
only on 127.0.0.1. Remote redirects and cloud-backed models are rejected. A loopback
address does not prove the external service itself stays offline: disabling its cloud
features and checking network activity remain part of the supported setup validation.
Keep Ollama and its models separately backed up; workspace backups do not contain them.

If service checks fail, start Ollama and retry. Changing a port does not transfer
workspace data. There is no cloud fallback. Local AI acceptance still requires a real
installed model; protocol fixture tests alone do not establish model quality or speed.

## Local meeting transcription

Install `whisper.cpp` separately and obtain a compatible model file offline. Start
`whisper-server --host 127.0.0.1 --port 8080 -m /absolute/path/model.bin`.
Zilobase sends mono 16 kHz WAV requests to `/inference`; `--convert` and ffmpeg are
unnecessary. See the [server interface](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server).
Configure a different loopback port in Local AI services if needed.

Capture is saved in the installation's `recordings` directory before inference.
Transcription arrives in chunks at silence boundaries, capped at 30 seconds. The
meeting displays pending chunks and service failures. Microphone and system audio
are distinct sources; this is not speaker diarization. Closing the window keeps
processing; Quit seals pending audio for the next launch. Summaries require the
backlog to finish and an Ollama model that supports structured answers.

Pending transcription is limited to 512 MiB across the installation, with a
100 MiB free-disk reserve checked before new chunks. A storage failure pauses native
capture with recovery guidance. Free space, start Whisper, and restart Zilobase to
recover saved chunks. Preserve native meeting recovery files as well. External
Whisper shutdown never deletes pending audio. Workspace backups must include these
recordings; deleting the external model prevents inference until it is restored.
