export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string;
  category?: string;
}

export interface ElevenLabsAgentParams {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  voiceId: string;
}

export interface CreatedNPCAgent {
  npcName: string;
  agentId: string;
  voiceId: string;
  voiceName: string;
  role: string;
  createdAt: number;
}
