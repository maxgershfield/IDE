import React, { ReactNode } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import './Layout.css';

interface LayoutProps {
  /** Narrow icon-strip rendered to the left of the horizontal panel group */
  activityBar?: ReactNode;
  /** When set, replaces the explorer + editor horizontal split (full-width center workspace). */
  centerSlot?: ReactNode;
  children: ReactNode;
}

/**
 * OASIS_IDE-style layout:
 *
 *  ┌──────────────────────────────┬──────────────┐
 *  │  ActivityBar │ Explorer      │              │
 *  │              ├───────────────┤  Chat panel  │
 *  │              │    Editor     │  (full height)│
 *  │              ├───────────────┤              │
 *  │              │   Terminal    │              │
 *  └──────────────┴───────────────┴──────────────┘
 *
 * children[0] = Explorer   children[1] = Editor
 * children[2] = RightPanel  children[3] = BottomPanel/Terminal
 */
export const Layout: React.FC<LayoutProps> = ({ activityBar, centerSlot, children }) => {
  const childrenArray = React.Children.toArray(children);

  return (
    <div className="layout">
      {/* Outer: left editor column | right chat column */}
      <PanelGroup direction="horizontal" autoSaveId="oasis-v2-outer">

        {/* ── Left column ── */}
        <Panel defaultSize={70} minSize={40} order={1}>
          <div className="layout-left-col">
            {activityBar}
            <div className="layout-left-panels">
              {/* Inner vertical: editor row on top, terminal on bottom */}
              <PanelGroup direction="vertical" autoSaveId="oasis-v2-vert">

                <Panel defaultSize={70} minSize={25} order={1}>
                  <div className="layout-editor-area">
                    {centerSlot ? (
                      <div className="layout-center-merged">{centerSlot}</div>
                    ) : (
                      <PanelGroup direction="horizontal" autoSaveId="oasis-v2-horiz">
                        <Panel defaultSize={20} minSize={8} maxSize={40} order={1}>
                          {childrenArray[0]}
                        </Panel>
                        <PanelResizeHandle className="layout-resize-handle layout-resize-handle-h" />
                        <Panel defaultSize={80} minSize={30} order={2}>
                          {childrenArray[1]}
                        </Panel>
                      </PanelGroup>
                    )}
                  </div>
                </Panel>

                <PanelResizeHandle className="layout-resize-handle layout-resize-handle-v" />

                <Panel defaultSize={30} minSize={8} maxSize={75} order={2}>
                  <div className="layout-terminal-area">
                    {childrenArray[3]}
                  </div>
                </Panel>

              </PanelGroup>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="layout-resize-handle layout-resize-handle-h" />

        {/* ── Right column: full-height chat panel ── */}
        <Panel defaultSize={30} minSize={18} maxSize={50} order={2}>
          <div className="layout-right-col">
            {childrenArray[2]}
          </div>
        </Panel>

      </PanelGroup>
    </div>
  );
};
