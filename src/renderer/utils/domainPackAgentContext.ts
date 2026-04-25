import type { DomainPack } from '../../shared/domainPackTypes';

export function buildDomainPackContextNote(pack: DomainPack | null): string | null {
  if (!pack) return null;

  const schemaRows = pack.holonSchemas
    .slice(0, 24)
    .map((schema) => `| ${schema.name} | ${schema.category} | ${schema.description} |`)
    .join('\n');

  const relationshipRows = pack.relationships
    .slice(0, 18)
    .map((rel) => `| ${rel.from} | ${rel.label} | ${rel.to} |`)
    .join('\n');

  const safety = pack.safetyRules
    .map((rule) => `- **${rule.title}:** ${rule.description}`)
    .join('\n');

  const recipes = pack.recipes
    .map((recipe) => `- **${recipe.title}:** ${recipe.description}`)
    .join('\n');

  return [
    `## Active domain pack: ${pack.label}`,
    pack.description,
    '',
    'Use this domain pack as Composer background context. The user should not need to inspect the pack manually.',
    '',
    '### Domain safety rules',
    safety,
    '',
    '### Domain Holon schemas',
    '| Holon | Category | Purpose |',
    '|---|---|---|',
    schemaRows,
    '',
    '### Relationship vocabulary',
    '| From | Relation | To |',
    '|---|---|---|',
    relationshipRows,
    '',
    '### Domain recipes',
    recipes,
    '',
    '### Composer behavior',
    '- Prefer plain-language guidance first, then name Holons when useful.',
    '- In Plan mode, draft graphs, fields, and relationships without mutation.',
    '- In Execute mode, create or update Holons only through allowed tools and report real ids from tool output.',
    '- Do not invent Holon ids, clinical claims, or completed integrations.'
  ].join('\n');
}
