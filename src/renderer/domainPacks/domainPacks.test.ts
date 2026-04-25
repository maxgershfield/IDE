import { describe, expect, it } from 'vitest';
import { bundledDomainPacks, getDomainPackById } from './index.js';

describe('bundled domain packs', () => {
  it('registers unique pack ids', () => {
    const ids = bundledDomainPacks.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getDomainPackById('genomic-medicine')?.label).toBe('Genomic Medicine');
    expect(getDomainPackById('adaptive-plants')?.label).toBe('Adaptive Plants');
  });

  it('has internally valid schema, relationship, tab, and recipe references', () => {
    for (const pack of bundledDomainPacks) {
      const schemaIds = new Set(pack.holonSchemas.map((schema) => schema.id));
      const schemaNames = new Set(pack.holonSchemas.map((schema) => schema.name));
      const recipeIds = new Set(pack.recipes.map((recipe) => recipe.id));

      expect(schemaIds.size, `${pack.id}: schema ids should be unique`).toBe(pack.holonSchemas.length);
      expect(recipeIds.size, `${pack.id}: recipe ids should be unique`).toBe(pack.recipes.length);

      for (const schema of pack.holonSchemas) {
        for (const relationshipId of schema.requiredRelationships ?? []) {
          expect(
            pack.relationships.some((relationship) => relationship.id === relationshipId),
            `${pack.id}: ${schema.id} references missing relationship ${relationshipId}`
          ).toBe(true);
        }
      }

      for (const relationship of pack.relationships) {
        expect(schemaNames.has(relationship.from), `${pack.id}: missing relationship source ${relationship.from}`).toBe(true);
        expect(schemaNames.has(relationship.to), `${pack.id}: missing relationship target ${relationship.to}`).toBe(true);
      }

      for (const tab of pack.dashboardTabs) {
        for (const schemaId of tab.holonSchemaIds) {
          expect(schemaIds.has(schemaId), `${pack.id}: ${tab.id} references missing schema ${schemaId}`).toBe(true);
        }
        for (const recipeId of tab.recipeIds ?? []) {
          expect(recipeIds.has(recipeId), `${pack.id}: ${tab.id} references missing recipe ${recipeId}`).toBe(true);
        }
      }
    }
  });
});
