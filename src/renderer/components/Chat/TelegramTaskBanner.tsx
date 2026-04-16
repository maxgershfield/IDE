import React, { useCallback, useEffect, useState } from 'react';
import { Send, X, MessageCircle } from 'lucide-react';
import { useEditorTab } from '../../contexts/EditorTabContext';
import { useIdeChat } from '../../contexts/IdeChatContext';
import { useA2A } from '../../contexts/A2AContext';
import './TelegramTaskBanner.css';

interface TelegramTask {
  taskId: string;
  text: string;
  fromId: number;
  fromUsername?: string;
  fromFirstName?: string;
  chatId: number;
  receivedAt: string;
}

function senderLabel(task: TelegramTask): string {
  if (task.fromUsername) return `@${task.fromUsername}`;
  if (task.fromFirstName) return task.fromFirstName;
  return `User ${task.fromId}`;
}

function timeLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function TelegramTaskBanner() {
  const { setPendingComposerText } = useEditorTab();
  const { createEmptySession, setSessionTitle } = useIdeChat();
  const { setActiveTab } = useA2A();

  const [tasks, setTasks] = useState<TelegramTask[]>([]);

  const addTask = useCallback((task: TelegramTask) => {
    setTasks((prev) => {
      if (prev.some((t) => t.taskId === task.taskId)) return prev;
      return [...prev, task];
    });
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    window.electronAPI?.telegramTaskDone?.(taskId);
  }, []);

  // Load existing tasks on mount (in case IDE was restarted or tasks queued before render)
  useEffect(() => {
    window.electronAPI?.telegramGetTasks?.().then((list: unknown) => {
      if (Array.isArray(list)) {
        setTasks(list as TelegramTask[]);
      }
    });
  }, []);

  // Listen for pushed tasks from main process
  useEffect(() => {
    const off = window.electronAPI?.onTelegramTask?.((rawTask: unknown) => {
      addTask(rawTask as TelegramTask);
    });
    return () => { if (typeof off === 'function') off(); };
  }, [addTask]);

  const handleWorkOnIt = useCallback((task: TelegramTask) => {
    const id = createEmptySession();
    const preview = task.text.slice(0, 48) + (task.text.length > 48 ? '…' : '');
    setSessionTitle(id, `Tg: ${preview}`);
    setActiveTab('composer');
    setPendingComposerText(task.text);
    removeTask(task.taskId);
  }, [createEmptySession, setSessionTitle, setActiveTab, setPendingComposerText, removeTask]);

  if (tasks.length === 0) return null;

  return (
    <div className="tg-task-banner" role="region" aria-label="Telegram tasks">
      {tasks.map((task) => (
        <div key={task.taskId} className="tg-task-item">
          <div className="tg-task-icon">
            <MessageCircle size={14} strokeWidth={1.8} />
          </div>
          <div className="tg-task-body">
            <div className="tg-task-meta">
              <span className="tg-task-sender">{senderLabel(task)}</span>
              {task.receivedAt && (
                <span className="tg-task-time">{timeLabel(task.receivedAt)}</span>
              )}
            </div>
            <div className="tg-task-text">{task.text}</div>
          </div>
          <div className="tg-task-actions">
            <button
              type="button"
              className="tg-task-btn tg-task-btn--primary"
              title="Open a new chat session and send this task to the agent"
              onClick={() => handleWorkOnIt(task)}
            >
              <Send size={11} strokeWidth={2} />
              Work on it
            </button>
            <button
              type="button"
              className="tg-task-btn tg-task-btn--dismiss"
              title="Dismiss"
              onClick={() => removeTask(task.taskId)}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
