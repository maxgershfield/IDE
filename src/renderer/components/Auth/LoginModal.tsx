import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './LoginModal.css';

interface LoginModalProps {
  onClose: () => void;
}

type AuthMode = 'login' | 'signup';

export function LoginModal({ onClose }: LoginModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetSignupFields = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setConfirmPassword('');
    setAcceptTerms(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!acceptTerms) {
      setError('Please confirm you accept the terms to create an account.');
      return;
    }
    setLoading(true);
    try {
      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
        password,
        confirmPassword
      });
      if (result.success) {
        onClose();
      } else {
        setError(result.error ?? 'Could not create account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-modal-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="login-modal-header">
          <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <button type="button" className="login-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="login-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`login-modal-tab ${mode === 'login' ? 'login-modal-tab--active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`login-modal-tab ${mode === 'signup' ? 'login-modal-tab--active' : ''}`}
            onClick={() => {
              setMode('signup');
              setError('');
            }}
          >
            Create account
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="login-modal-form">
            <label>
              Username or email
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                autoFocus
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {error && <div className="login-modal-error">{error}</div>}
            <p className="login-modal-hint">
              Uses your OASIS API account. Set the API URL under Settings if you are not using the default
              host.
            </p>
            <div className="login-modal-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="login-modal-form">
            <div className="login-modal-row">
              <label>
                First name
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                  autoFocus
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </label>
            </div>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password (min. 6 characters)
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>
            <label className="login-modal-checkbox">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span>
                I accept the terms for creating an OASIS avatar (required by the API).
              </span>
            </label>
            {error && <div className="login-modal-error">{error}</div>}
            <p className="login-modal-hint">
              Registration calls your configured OASIS API (Settings → Integrations). If the server sends a
              verification email, complete that before signing in from another device.
            </p>
            <div className="login-modal-actions">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  resetSignupFields();
                  setError('');
                }}
              >
                Back
              </button>
              <button type="submit" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
