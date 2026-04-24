import React, { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw } from 'lucide-react';
import { useA2A } from '../../contexts/A2AContext';
import './AgentPanel.css';

interface DiscoveredAgent {
  id?: string;
  agentId?: string;
  name?: string;
  agentName?: string;
  services?: string[];
  capabilities?: string[];
  status?: string;
}

function getAgentId(a: DiscoveredAgent): string {
  return (a.agentId ?? a.id ?? '') as string;
}

function getAgentName(a: DiscoveredAgent): string {
  return (a.name ?? a.agentName ?? getAgentId(a)) as string;
}

function getAgentServices(a: DiscoveredAgent): string[] {
  return a.services ?? a.capabilities ?? [];
}

export const AgentPanel: React.FC = () => {
  const { openComposeToAgent } = useA2A();
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAgents = async () => {
    setLoading(true);
    setError('');
    try {
      if (window.electronAPI) {
        const agentList = await window.electronAPI.discoverAgents();
        setAgents(Array.isArray(agentList) ? agentList : []);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  return (
    <div className="agent-panel panel">
      <div className="panel-header">
        <span>Agents</span>
        <button
          type="button"
          className="agent-panel-refresh"
          onClick={loadAgents}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={13} strokeWidth={1.8} className={loading ? 'agent-spin' : ''} />
        </button>
      </div>
      <div className="panel-content">
        {loading ? (
          <div className="loading">Loading agents...</div>
        ) : error ? (
          <div className="agent-error">
            {error}
            <button type="button" className="agent-error-retry" onClick={loadAgents}>Retry</button>
          </div>
        ) : agents.length === 0 ? (
          <div className="empty-state">No agents discovered</div>
        ) : (
          <div className="agents-list">
            {agents.map((agent, index) => {
              const id = getAgentId(agent);
              const name = getAgentName(agent);
              const services = getAgentServices(agent);
              return (
                <div key={id || index} className="agent-item">
                  <div className="agent-item-header">
                    <div className="agent-name">{name}</div>
                    {id && (
                      <button
                        type="button"
                        className="agent-message-btn"
                        title={`Message ${name}`}
                        onClick={() => openComposeToAgent(id)}
                      >
                        <MessageSquare size={12} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                  {id && <div className="agent-id">{id}</div>}
                  <div className="agent-services">
                    {services.length > 0 ? services.join(', ') : 'No services'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
