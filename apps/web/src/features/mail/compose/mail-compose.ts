import type { MailAddress, MailMessageRecord, MailComposeAttachment, MailAttachmentMetadata } from "@zilobase/features/mail"

export type MailComposeSeed = {
  draftId?: string
  clientOperationId?: string
  attachments?: MailComposeAttachment[]
  attachmentReferences?: MailAttachmentMetadata[]
  bcc?: MailAddress[]
  bodyText?: string
  cc?: MailAddress[]
  inReplyTo?: string
  references?: string[]
  subject?: string
  threadId?: string
  to?: MailAddress[]
}

export function parseComposerAddresses(value: string): MailAddress[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const match = /^(.*?)\s*<([^<>]+)>$/.exec(entry)
    return {
      address: (match?.[2] ?? entry).trim().toLowerCase(),
      name: match?.[1]?.trim().replace(/^"|"$/g, "") || null,
    }
  })
}

export function formatComposerAddresses(addresses: MailAddress[]) {
  return addresses.map((item) => item.name ? `${item.name} <${item.address}>` : item.address).join(", ")
}

export function replySeed(message: MailMessageRecord, ownEmail: string, replyAll = false): MailComposeSeed {
  const sender = message.replyTo ?? message.from
  const excluded = new Set([ownEmail.toLowerCase(), sender?.address.toLowerCase()].filter(Boolean))
  const cc = replyAll ? dedupe([...message.to, ...message.cc].filter((address) => !excluded.has(address.address.toLowerCase()))) : []
  const references = [...message.references, message.messageIdHeader].filter(Boolean) as string[]
  return {
    cc,
    inReplyTo: message.messageIdHeader ?? undefined,
    references: [...new Set(references)],
    subject: replySubject(message.subject),
    threadId: message.threadId,
    to: sender ? [sender] : [],
  }
}

export function forwardSeed(message: MailMessageRecord): MailComposeSeed {
  const sender = message.from?.name || message.from?.address || "Unknown sender"
  return {
    bodyText: `\n\n---------- Forwarded message ----------\nFrom: ${sender}\nDate: ${message.date ?? new Date(message.internalDate).toLocaleString()}\nSubject: ${message.subject}\nTo: ${formatComposerAddresses(message.to)}\n\n${message.bodyText || message.snippet}`,
    subject: /^(fwd?|fw):/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`,
  }
}

function replySubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`
}

function dedupe(addresses: MailAddress[]) {
  const seen = new Set<string>()
  return addresses.filter((address) => {
    const key = address.address.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function draftSeed(message: MailMessageRecord, draftId: string): MailComposeSeed {
  const operation = /^<zilobase\.([A-Za-z0-9_-]{8,128})@/.exec(message.messageIdHeader ?? "")?.[1]
  return {
    draftId, clientOperationId: operation,
    to: message.to, cc: message.cc, bcc: message.bcc,
    subject: message.subject, bodyText: message.bodyText ?? message.snippet,
    threadId: message.threadId,
    inReplyTo: message.inReplyTo ?? undefined, references: message.references,
    attachmentReferences: message.attachments,
  }
}
