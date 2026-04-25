import React from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { openOasisOnboardGuide, requestActivityView } from '../../utils/activityViewBridge';
import './FirstRunWelcomeBanner.css';

/**
 * One-time tips for testers and first-time users (dismiss persists in settings JSON).
 */
export function FirstRunWelcomeBanner() {
  const { settings, updateSettings } = useSettings();

  if (settings.welcomeOnboardingDismissed) {
    return null;
  }

  return (
    <div className="first-run-welcome" role="region" aria-label="Getting started">
      <div className="first-run-welcome-inner">
        <div className="first-run-welcome-text">
          <strong>Welcome to OASIS IDE.</strong> Start with the same calm loop every time:
          open a workspace, ask <strong>Composer</strong> to build an OASIS app, then bring in
          STARNET, templates, and tools from the <strong>Build</strong> rocket when you need them.
        </div>
        <div className="first-run-welcome-actions">
          <button
            type="button"
            className="first-run-welcome-templates"
            onClick={() => openOasisOnboardGuide()}
            title="Open Templates and start the step-by-step OASIS API app flow"
          >
            Guided OASIS API app
          </button>
          <button
            type="button"
            className="first-run-welcome-linkish"
            onClick={() => requestActivityView('build')}
          >
            Build
          </button>
          <button
            type="button"
            className="first-run-welcome-dismiss"
            onClick={() => updateSettings({ welcomeOnboardingDismissed: true })}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
