import { useState, useEffect } from 'react';
import { Film, LogIn, UserPlus } from 'lucide-react';
import { auth } from '../api';

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'checking'>('checking');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth.check().then(({ hasAccount }) => {
      setMode(hasAccount ? 'login' : 'register');
    }).catch(() => setMode('register'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') await auth.register(username, password);
      else await auth.login(username, password);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Er ging iets mis');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'checking') {
    return (
      <div className="flex h-screen bg-zinc-950 text-white items-center justify-center">
        <div className="animate-pulse text-zinc-400">Laden...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Film className="w-10 h-10 text-blue-500" />
            <h1 className="text-3xl font-bold">Video Producer</h1>
          </div>
          <p className="text-zinc-400">
            {mode === 'register' ? 'Maak je account aan om te beginnen' : 'Log in om verder te gaan'}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="bg-zinc-900 rounded-xl p-8 border border-zinc-800 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Gebruikersnaam</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 text-white"
              required autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Wachtwoord</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 text-white"
              required minLength={6} />
            {mode === 'register' && <p className="text-xs text-zinc-500 mt-1">Minimaal 6 tekens</p>}
          </div>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
            {loading ? (
              <span className="animate-pulse">Even geduld...</span>
            ) : mode === 'register' ? (
              <><UserPlus className="w-5 h-5" /> Account Aanmaken</>
            ) : (
              <><LogIn className="w-5 h-5" /> Inloggen</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
