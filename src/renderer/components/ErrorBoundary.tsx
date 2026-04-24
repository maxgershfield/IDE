import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info });
    console.error('[Renderer]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            color: '#f48771',
            background: '#1e1e1e',
            fontFamily: 'system-ui, sans-serif',
            height: '100%',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          <h1 style={{ color: '#fff', marginBottom: 12 }}>OASIS IDE crashed</h1>
          <p style={{ marginBottom: 8 }}>{this.state.error.message}</p>
          <pre style={{ fontSize: 12, opacity: 0.9 }}>{this.state.error.stack}</pre>
          {this.state.info?.componentStack && (
            <pre style={{ fontSize: 11, marginTop: 16, opacity: 0.7 }}>
              {this.state.info.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
