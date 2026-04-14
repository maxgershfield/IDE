/**
 * GameBuilderPane — renders a builder inline in the editor tab area.
 * For builders that have a visual canvas (quest, missionArc), a "Visual / Form"
 * toggle pill lets developers switch between the drag-and-drop canvas and the
 * simpler form view. All other builders show the form only.
 */
import React, { useState, useCallback } from 'react';
import { BUILDERS } from './GameBuilderModal';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { QuestGraphPane } from '../GameBuilder/QuestGraphPane';
import { MissionArcPane } from '../GameBuilder/MissionArcPane';

const VISUAL_BUILDERS = ['quest', 'missionArc'];

export interface GameBuilderPaneProps {
  builderId: string | null;
  onClose: () => void;
}

interface RepeatableRow {
  id: string;
  values: Record<string, string>;
}

function RepeatableField({
  field,
  rows,
  onChange
}: {
  field: any;
  rows: RepeatableRow[];
  onChange: (rows: RepeatableRow[]) => void;
}) {
  const addRow = () =>
    onChange([
      ...rows,
      {
        id: `row-${Date.now()}`,
        values: Object.fromEntries((field.subFields || []).map((sf: any) => [sf.key, String(sf.default ?? '')]))
      }
    ]);

  const removeRow = (id: string) => onChange(rows.filter((r) => r.id !== id));

  const updateRow = (id: string, key: string, value: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, values: { ...r.values, [key]: value } } : r)));

  return (
    <div className="gb-repeatable">
      {rows.map((row, idx) => (
        <div key={row.id} className="gb-repeatable-row">
          <span className="gb-repeatable-index">{idx + 1}</span>
          <div className="gb-repeatable-fields">
            {(field.subFields || []).map((sf: any) =>
              sf.type === 'select' ? (
                <select
                  key={sf.key}
                  className="gb-select"
                  value={row.values[sf.key] || String(sf.default || '')}
                  onChange={(e) => updateRow(row.id, sf.key, e.target.value)}
                >
                  {sf.options?.map((o: any) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  key={sf.key}
                  type={sf.type === 'number' ? 'number' : 'text'}
                  className="gb-input"
                  placeholder={sf.placeholder || sf.label}
                  value={row.values[sf.key] || ''}
                  onChange={(e) => updateRow(row.id, sf.key, e.target.value)}
                />
              )
            )}
          </div>
          <button
            type="button"
            className="gb-repeatable-remove"
            onClick={() => removeRow(row.id)}
            aria-label="Remove row"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="gb-repeatable-add" onClick={addRow}>
        + Add {field.label.replace(/s$/, '').toLowerCase()}
      </button>
      {field.hint && <p className="gb-hint">{field.hint}</p>}
    </div>
  );
}

/** Route to visual canvas builders or the generic form builder, with a toggle */
export const GameBuilderPane: React.FC<GameBuilderPaneProps> = ({ builderId, onClose }) => {
  const hasVisual = builderId ? VISUAL_BUILDERS.includes(builderId) : false;
  const [viewMode, setViewMode] = useState<'visual' | 'form'>(hasVisual ? 'visual' : 'form');

  return (
    <div className="gbp-outer">
      {hasVisual && (
        <div className="gbp-view-switcher">
          <span className="gbp-view-label">View:</span>
          <div className="gbp-view-pills">
            <button
              type="button"
              className={`gbp-view-btn${viewMode === 'visual' ? ' is-active' : ''}`}
              onClick={() => setViewMode('visual')}
            >
              Visual
            </button>
            <button
              type="button"
              className={`gbp-view-btn${viewMode === 'form' ? ' is-active' : ''}`}
              onClick={() => setViewMode('form')}
            >
              Form
            </button>
          </div>
        </div>
      )}
      <div className="gbp-view-content">
        {hasVisual && viewMode === 'visual' ? (
          builderId === 'quest'
            ? <QuestGraphPane onClose={onClose} />
            : <MissionArcPane onClose={onClose} />
        ) : (
          <GameBuilderFormPane builderId={builderId} onClose={onClose} />
        )}
      </div>
    </div>
  );
};

/** Form-based builder for all non-canvas builder IDs */
const GameBuilderFormPane: React.FC<GameBuilderPaneProps> = ({
  builderId,
  onClose
}) => {
  const { submitBuilderMessage } = useEditorTab();
  const builder = builderId ? BUILDERS.find((b) => b.id === builderId) ?? null : null;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [repeatableRows, setRepeatableRows] = useState<Record<string, RepeatableRow[]>>({});

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = () => {
    if (!builder) return;
    const merged: Record<string, unknown> = { ...values };
    for (const field of builder.fields) {
      if (field.type === 'repeatable') {
        merged[field.key] = (repeatableRows[field.key] || []).map((r) => r.values);
      }
    }
    for (const field of builder.fields) {
      if (field.type !== 'repeatable' && merged[field.key] === undefined && field.default !== undefined) {
        merged[field.key] = field.default;
      }
    }
    submitBuilderMessage(builder.buildMessage(merged));
  };

  if (!builder) return null;

  return (
    <div className="gbp-container">
      {/* Header */}
      <div className="gbp-header">
        <span className="gb-layer-badge">{builder.oasisLayer}</span>
        <p className="gbp-description">{builder.description}</p>
      </div>

      {/* Fields */}
      <div className="gbp-fields">
        {builder.fields.map((field) => (
          <div key={field.key} className="gb-field">
            <label className="gb-label" htmlFor={`gbp-${field.key}`}>
              {field.label}
              {field.required && <span className="gb-required">*</span>}
            </label>

            {field.type === 'repeatable' ? (
              <RepeatableField
                field={field}
                rows={repeatableRows[field.key] || []}
                onChange={(rows) => setRepeatableRows((prev) => ({ ...prev, [field.key]: rows }))}
              />
            ) : field.type === 'textarea' ? (
              <textarea
                id={`gbp-${field.key}`}
                className="gb-textarea"
                placeholder={field.placeholder}
                rows={3}
                value={String(values[field.key] ?? '')}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <select
                id={`gbp-${field.key}`}
                className="gb-select"
                value={String(values[field.key] ?? field.default ?? '')}
                onChange={(e) => setValue(field.key, e.target.value)}
              >
                {field.options?.map((o: any) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : field.type === 'boolean' ? (
              <label className="gb-toggle-label">
                <div className="gb-toggle-track">
                  <input
                    type="checkbox"
                    className="gb-toggle-input"
                    checked={Boolean(values[field.key] ?? field.default ?? false)}
                    onChange={(e) => setValue(field.key, e.target.checked)}
                  />
                  <div className={`gb-toggle-thumb${Boolean(values[field.key] ?? field.default) ? ' is-on' : ''}`} />
                </div>
                {field.hint && <span className="gb-toggle-hint">{field.hint}</span>}
              </label>
            ) : (
              <input
                id={`gbp-${field.key}`}
                type={field.type === 'number' ? 'number' : 'text'}
                className="gb-input"
                placeholder={field.placeholder}
                value={String(values[field.key] ?? '')}
                onChange={(e) => setValue(field.key, e.target.value)}
              />
            )}

            {field.type !== 'repeatable' && field.hint && (
              <p className="gb-hint">{field.hint}</p>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="gbp-footer">
        <button type="button" className="gb-btn gb-btn--cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="gb-btn gb-btn--submit" onClick={handleSubmit}>
          Create with Agent
        </button>
      </div>
    </div>
  );
};
