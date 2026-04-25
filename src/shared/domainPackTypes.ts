export type DomainPackActionMode = 'plan' | 'execute';

export interface DomainPackHolonSchema {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: string[];
  requiredRelationships?: string[];
}

export interface DomainPackRelationship {
  id: string;
  label: string;
  from: string;
  to: string;
  description: string;
}

export interface DomainPackRecipeStep {
  label: string;
  description: string;
  mode: DomainPackActionMode;
}

export interface DomainPackRecipe {
  id: string;
  title: string;
  description: string;
  steps: DomainPackRecipeStep[];
}

export interface DomainPackQuickAction {
  id: string;
  label: string;
  description: string;
  prompt: string;
  mode: DomainPackActionMode;
}

export interface DomainPackDashboardTab {
  id: string;
  label: string;
  description: string;
  holonSchemaIds: string[];
  recipeIds?: string[];
}

export interface DomainPackSafetyRule {
  id: string;
  title: string;
  description: string;
}

export interface DomainPack {
  id: string;
  label: string;
  tagline: string;
  description: string;
  status: 'bundled' | 'workspace' | 'remote';
  docsPath?: string;
  holonSchemas: DomainPackHolonSchema[];
  relationships: DomainPackRelationship[];
  recipes: DomainPackRecipe[];
  quickActions: DomainPackQuickAction[];
  dashboardTabs: DomainPackDashboardTab[];
  safetyRules: DomainPackSafetyRule[];
}
