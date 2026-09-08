import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/platform/network/api";
export function LocalTranscriptionProgress({ meetingId }: { meetingId: string }) {
  const { data, isError } = useQuery({
    queryKey: ["local-transcription", meetingId],
    queryFn: () => apiFetch<{ bytes: number; chunks: number; serviceError: string | null }>(`/meetings/${encodeURIComponent(meetingId)}/local-transcription`),
    refetchInterval: 2000,
    networkMode: "always",
  });
  return <p role="status" className="px-4 py-2 text-xs text-content-secondary">
    Local transcription updates in chunks. {isError ? "Local runtime unavailable; saved audio will recover on restart." : data?.bytes ? `${data.chunks} audio chunks pending (${(data.bytes / 1024 / 1024).toFixed(1)} MB). ${data.serviceError ?? "Processing on this Mac."}` : "No pending transcription."} Microphone and system sources are labeled separately.
  </p>;
}
