/** JSON stored in holon metadata `oasis.ide.memoryJson` (project memory sidebar). */
export interface ProjectMemoryPayload {
  updatedAt: string;
  text: string;
}

/** Max UTF-16 code units for `text` before holon save (keeps metadata payloads bounded). */
export const PROJECT_MEMORY_TEXT_MAX = 60_000;
