/**
 * GameBuilderPane — renders a builder inline in the editor tab area.
 *
 * Default view is "Form" (simple, quick). For builders that have a visual
 * canvas (quest, missionArc), a "Form / Visual" toggle is shown.
 *
 * When the user switches to Visual, the current form values are used to
 * pre-seed the canvas — objective rows become Objective nodes, the quest
 * name/description pre-fill the Quest Root node, etc. This means filling
 * the form first and then clicking "Open Visual" gives a ready-to-refine
 * graph rather than a blank canvas.
 */
import React, { useState, useCallback } from 'react';
import { BUILDERS } from './GameBuilderModal';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { QuestGraphPane, type QuestSeed } from '../GameBuilder/QuestGraphPane';
import { MissionArcPane, type MissionSeed } from '../GameBuilder/MissionArcPane';
import { NPCBuilderPane } from '../GameBuilder/NPCBuilderPane';

// Builders with a dedicated visual canvas (Form / Visual toggle)
const VISUAL_BUILDERS = ['quest', 'missionArc'];

export interface GameBuilderPaneProps {
  builderId: string | null;
  onClose: () => void;
}

export interface RepeatableRow {
  id: string;
  values: Record<string, string>;
}

// ── Repeatable field subcomponent ─────────────────────────────────
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

// ── Form pane — receives values as controlled props ───────────────
interface FormPaneProps {
  builderId: string | null;
  onClose: () => void;
  values: Record<string, unknown>;
  onValuesChange: (key: string, value: unknown) => void;
  repeatableRows: Record<string, RepeatableRow[]>;
  onRepeatableRowsChange: (key: string, rows: RepeatableRow[]) => void;
}

const GameBuilderFormPane: React.FC<FormPaneProps> = ({
  builderId,
  onClose,
  values,
  onValuesChange,
  repeatableRows,
  onRepeatableRowsChange,
}) => {
  const { submitBuilderMessage } = useEditorTab();
  const builder = builderId ? BUILDERS.find((b) => b.id === builderId) ?? null : null;

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
      <div className="gbp-header">
        <span className="gb-layer-badge">{builder.oasisLayer}</span>
        <p className="gbp-description">{builder.description}</p>
      </div>

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
                onChange={(rows) => onRepeatableRowsChange(field.key, rows)}
              />
            ) : field.type === 'textarea' ? (
              <textarea
                id={`gbp-${field.key}`}
                className="gb-textarea"
                placeholder={field.placeholder}
                rows={3}
                value={String(values[field.key] ?? '')}
                onChange={(e) => onValuesChange(field.key, e.target.value)}
              />
            ) : field.type === 'select' ? (
              <select
                id={`gbp-${field.key}`}
                className="gb-select"
                value={String(values[field.key] ?? field.default ?? '')}
                onChange={(e) => onValuesChange(field.key, e.target.value)}
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
                    onChange={(e) => onValuesChange(field.key, e.target.checked)}
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
                onChange={(e) => onValuesChange(field.key, e.target.value)}
              />
            )}

            {field.type !== 'repeatable' && field.hint && (
              <p className="gb-hint">{field.hint}</p>
            )}
          </div>
        ))}
      </div>

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

// ── Seed builders — convert form values into canvas seed data ─────
function buildQuestSeed(
  values: Record<string, unknown>,
  repeatableRows: Record<string, RepeatableRow[]>
): QuestSeed {
  const gameSource = typeof values.gameSource === 'string' ? values.gameSource : 'OurWorld';
  return {
    name:        typeof values.name        === 'string' ? values.name        : undefined,
    description: typeof values.description === 'string' ? values.description : undefined,
    gameSource,
    rewardKarma: typeof values.rewardKarma === 'number' ? values.rewardKarma : undefined,
    rewardXP:    typeof values.rewardXP    === 'number' ? values.rewardXP    : undefined,
    objectives: (repeatableRows.objectives || []).map((r) => ({
      title: r.values.name || 'Objective',
      game:  gameSource,
    })),
  };
}

function buildMissionSeed(
  _values: Record<string, unknown>,
  repeatableRows: Record<string, RepeatableRow[]>
): MissionSeed {
  return {
    stages: (repeatableRows.stages || []).map((r) => ({
      title:       r.values.stageName    || r.values.name || 'Stage',
      description: r.values.description || '',
      game:        r.values.game         || 'OurWorld',
    })),
  };
}

// ── Main pane — route to the right builder ───────────────────────
export const GameBuilderPane: React.FC<GameBuilderPaneProps> = ({ builderId, onClose }) => {
  // NPC has its own rich visual builder — skip the Form/Visual toggle
  if (builderId === 'npc') return <NPCBuilderPane onClose={onClose} />;

  const hasVisual = builderId ? VISUAL_BUILDERS.includes(builderId) : false;

  // Default to 'form' — less overwhelming, visual is opt-in
  const [viewMode, setViewMode] = useState<'visual' | 'form'>('form');
  // Increment each time the user opens Visual so canvas re-seeds from latest form values
  const [visualKey, setVisualKey] = useState(0);

  // Lifted form state so we can seed the canvas from it
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [repeatableRows, setRepeatableRows] = useState<Record<string, RepeatableRow[]>>({});

  const handleValueChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleRepeatableChange = useCallback((key: string, rows: RepeatableRow[]) => {
    setRepeatableRows((prev) => ({ ...prev, [key]: rows }));
  }, []);

  const openVisual = useCallback(() => {
    setVisualKey((k) => k + 1); // fresh seed from latest form values
    setViewMode('visual');
  }, []);

  // Build seed for whichever visual canvas is active
  const questSeed   = buildQuestSeed(values, repeatableRows);
  const missionSeed = buildMissionSeed(values, repeatableRows);

  // Label for the Visual button — more descriptive when form has data
  const hasFormData =
    Object.values(values).some((v) => v !== '' && v !== undefined) ||
    Object.values(repeatableRows).some((rows) => rows.length > 0);
  const visualBtnLabel = hasFormData ? 'Open Visual' : 'Visual';

  return (
    <div className="gbp-outer">
      {hasVisual && (
        <div className="gbp-view-switcher">
          <span className="gbp-view-label">View:</span>
          <div className="gbp-view-pills">
            <button
              type="button"
              className={`gbp-view-btn${viewMode === 'form' ? ' is-active' : ''}`}
              onClick={() => setViewMode('form')}
            >
              Form
            </button>
            <button
              type="button"
              className={`gbp-view-btn${viewMode === 'visual' ? ' is-active' : ''}`}
              onClick={openVisual}
              title={hasFormData ? 'Generate a visual graph from your form data' : 'Open drag-and-drop canvas'}
            >
              {visualBtnLabel}
            </button>
          </div>
          {hasFormData && viewMode === 'form' && (
            <span className="gbp-seed-hint">Your form data will pre-populate the canvas</span>
          )}
        </div>
      )}

      <div className="gbp-view-content">
        {hasVisual && viewMode === 'visual' ? (
          builderId === 'quest'
            ? <QuestGraphPane key={`quest-${visualKey}`} onClose={onClose} seed={questSeed} />
            : <MissionArcPane key={`mission-${visualKey}`} onClose={onClose} seed={missionSeed} />
        ) : (
          <GameBuilderFormPane
            builderId={builderId}
            onClose={onClose}
            values={values}
            onValuesChange={handleValueChange}
            repeatableRows={repeatableRows}
            onRepeatableRowsChange={handleRepeatableChange}
          />
        )}
      </div>
    </div>
  );
};
