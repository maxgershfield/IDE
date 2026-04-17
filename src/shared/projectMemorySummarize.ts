/** System prompt for turning Composer transcript into project memory bullets (local chat:complete). */
export const PROJECT_MEMORY_SUMMARIZE_SYSTEM = `You maintain a durable "project memory" note for an IDE workspace.

You will receive a Composer chat transcript (user and assistant turns). Extract ONLY information that should persist across sessions:
- Decisions, conventions, paths, commands, and constraints the user or assistant stated clearly.
- Things to avoid or invariants (for example, "no fallbacks", "use pnpm").

Rules:
- Output markdown bullet lines only, each starting with "- ".
- At most 20 bullets. At most 4000 characters total.
- Do not paste large code blocks. At most one short inline code span per bullet if essential.
- Skip greetings, filler, failed attempts, and raw tool logs.
- If there is nothing worth remembering from this transcript, reply with exactly this single line:
(nothing to add)
`;

const MAX_MESSAGES = 48;
const MAX_MSG_CHARS = 12_000;

export interface SimpleChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildComposerTranscriptForSummary(messages: SimpleChatMessage[]): string {
  const slice = messages.slice(-MAX_MESSAGES);
  const lines: string[] = [];
  for (const m of slice) {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    let c = (m.content || '').replace(/\r\n/g, '\n').trim();
    if (c.length > MAX_MSG_CHARS) {
      c = `${c.slice(0, MAX_MSG_CHARS)}\n… [truncated]`;
    }
    if (!c) continue;
    lines.push(`### ${role}\n${c}\n`);
  }
  return lines.join('\n');
}

export function isNothingToAddSummary(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === '(nothing to add)' || t === 'nothing to add' || t === '(nothing to add).';
}
