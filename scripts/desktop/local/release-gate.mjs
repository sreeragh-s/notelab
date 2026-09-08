import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const acceptanceChecks = ['clean-install-offline', 'core-feature-persistence', 'collaboration-ui-and-api', 'real-local-ai', 'real-transcription', 'network-and-dns-capture', 'quit-crash-sleep-wake', 'profile-isolation', 'backup-restore-interruption', 'upgrade-reinstall-delete', 'hosted-regression', 'signed-notarized-relocation', 'performance'];
function requirePassingEvidence(result, name) {
  if (result?.status !== 'passed' || typeof result.evidence !== 'string' || !result.evidence.trim()) throw Error(`Local release blocked: ${name} requires passing evidence`);
}
export function validateLocalRelease(record, revision) {
  if (record?.format !== 1 || record.sourceRevision !== revision || !/^[a-f0-9]{40}$/.test(revision)) throw Error('Local acceptance must identify the exact source revision');
  for (const architecture of ['arm64', 'x64']) {
    for (const check of acceptanceChecks) {
      requirePassingEvidence(record.architectures?.[architecture]?.[check], `${architecture}/${check}`);
    }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.env.ZILOBASE_LOCAL_ACCEPTANCE;
  if (!filename) throw Error('ZILOBASE_LOCAL_ACCEPTANCE must name the reviewed acceptance record');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  validateLocalRelease(JSON.parse(readFileSync(filename, 'utf8')), revision);
  console.log('Local release acceptance verified for ' + revision);
}
