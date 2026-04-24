import React, { useCallback, useState } from 'react';
import { ArrowRightToLine, Loader2, Sparkles } from 'lucide-react';
import type { StarHolonRecord } from '../../services/starApiService';
import { holonTypeNameFromEnum } from '../../services/holonTypeLabels';
import { suggestHolonsForIdea, type HolonSuggestion } from '../../services/starnetHolonSuggest';

export interface StarnetBuildTabProps {
  holonCatalogRows: StarHolonRecord[];
  baseUrl: string;
  holonsLoading: boolean;
  onDraftToComposer: (markdown: string) => void;
}

function buildDraftMarkdown(idea: string, picks: HolonSuggestion[], baseUrl: string): string {
  const ideaBlock =
    idea.trim() ||
    '_(Add a one-line idea in the Match tab, or type a longer spec in the Composer on the right.)_';
  const lines = [
    '## STARNET — holon match (from Match tab)',
    '',
    ideaBlock,
    '',
    '## Selected holons (verify with `star_get_holon` / `mcp_invoke` before publishing)',
    ''
  ];
  for (const s of picks) {
    const h = s.holon;
    const nm = (h.name || h.id).replace(/\*/g, '');
    const type = holonTypeNameFromEnum(h.holonType);
    const match =
      s.matchedTerms.length > 0 ? ` — matched: ${s.matchedTerms.slice(0, 6).join(', ')}` : '';
    lines.push(`- **${nm}** (\`${h.id}\`) — ${type}${match}`);
  }
  lines.push('', `STAR WebAPI (this IDE): \`${baseUrl}\``, '');
  lines.push(
    'Help me plan an OAPP from these components: wiring, gaps, and an `<oasis_holon_diagram>` block if useful.'
  );
  return lines.join('\n');
}

/**
 * Local holon ranking only (no agent, no chat). Drafts a markdown handoff into the right-panel Composer.
 */
export const StarnetBuildTab: React.FC<StarnetBuildTabProps> = ({
  holonCatalogRows,
  baseUrl,
  holonsLoading,
  onDraftToComposer
}) => {
  const [idea, setIdea] = useState('');
  const [suggestions, setSuggestions] = useState<HolonSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const analyze = useCallback(() => {
    const next = suggestHolonsForIdea(idea, holonCatalogRows, { max: 15 });
    setSuggestions(next);
    setSelectedIds(new Set(next.slice(0, Math.min(5, next.length)).map((s) => s.holon.id)));
  }, [idea, holonCatalogRows]);

  const setIncluded = useCallback((id: string, included: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (included) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  const draftToComposer = useCallback(() => {
    const picks = suggestions.filter((s) => selectedIds.has(s.holon.id));
    if (picks.length === 0) return;
    onDraftToComposer(buildDraftMarkdown(idea, picks, baseUrl));
  }, [suggestions, selectedIds, idea, baseUrl, onDraftToComposer]);

  if (holonsLoading && holonCatalogRows.length === 0) {
    return (
      <div className="sn-loading sn-loading--inline sn-build-loading">
        <Loader2 size={14} className="sn-spin" /> Loading holon catalog…
      </div>
    );
  }

  if (holonCatalogRows.length === 0) {
    return (
      <div className="sn-empty sn-empty--sm sn-build-empty">
        <div className="sn-empty-sub">
          No holons loaded yet. Open <strong>Holons</strong> and refresh, or check Settings → STARNET and your
          login — then return here to match templates to a phrase.
        </div>
      </div>
    );
  }

  return (
    <div className="sn-build-panel">
      <div className="sn-build-field-row">
        <label className="sn-build-label" htmlFor="sn-build-idea">
          Phrase to match (local rank only)
        </label>
        <input
          id="sn-build-idea"
          type="text"
          className="sn-build-idea-input"
          placeholder="e.g. geo check-ins, quests, karma"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={400}
          autoComplete="off"
          spellCheck={false}
          aria-label="Short phrase for local holon ranking; not sent until you use the Composer on the right"
        />
      </div>
      <div className="sn-build-actions">
        <button type="button" className="sn-primary-btn" onClick={analyze}>
          <Sparkles size={12} /> Rank holons
        </button>
      </div>

      {suggestions.length > 0 ? (
        <>
          <div className="sn-build-table-wrap">
            <table className="sn-build-table">
              <thead>
                <tr>
                  <th className="sn-build-th sn-build-th--check" scope="col">
                    Use
                  </th>
                  <th className="sn-build-th" scope="col">
                    Holon
                  </th>
                  <th className="sn-build-th" scope="col">
                    Type
                  </th>
                  <th className="sn-build-th sn-build-th--num" scope="col">
                    Score
                  </th>
                  <th className="sn-build-th" scope="col">
                    Matched terms
                  </th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => {
                  const h = s.holon;
                  const id = h.id;
                  const on = selectedIds.has(id);
                  return (
                    <tr key={id} className={on ? 'sn-build-tr--on' : undefined}>
                      <td className="sn-build-td sn-build-td--check">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => setIncluded(id, e.target.checked)}
                          aria-label={`Include ${h.name || id}`}
                        />
                      </td>
                      <td className="sn-build-td sn-build-td--name" title={id}>
                        {h.name || id}
                      </td>
                      <td className="sn-build-td">{holonTypeNameFromEnum(h.holonType)}</td>
                      <td className="sn-build-td sn-build-td--num">{s.score}</td>
                      <td className="sn-build-td sn-build-td--terms">
                        {s.matchedTerms.length > 0 ? s.matchedTerms.slice(0, 6).join(', ') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sn-build-actions sn-build-actions--footer">
            <button
              type="button"
              className="sn-primary-btn"
              disabled={selectedIds.size === 0}
              onClick={draftToComposer}
            >
              <ArrowRightToLine size={12} /> Put selection in Composer
            </button>
          </div>
        </>
      ) : (
        <p className="sn-build-placeholder">
          Run <strong>Rank holons</strong> to score the catalog against your phrase (all processing stays in this
          tab).
        </p>
      )}
    </div>
  );
};
