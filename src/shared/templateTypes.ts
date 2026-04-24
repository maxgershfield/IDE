export interface ContentTemplateVariable {
  key: string;
  prompt: string;
  default?: string;
}

export interface ContentTemplateMeta {
  id: string;
  name: string;
  description: string;
  category: 'engine' | 'rp-server' | 'quest-chain' | 'npc-pack' | 'item-drop' | 'content-creator';
  emoji: string;
  variables: ContentTemplateVariable[];
  postInstallPrompt: string;
}
