import { useStore } from '../store';
import { CheckCircle, XCircle, Info, X, Bot } from 'lucide-react';

export default function Toast() {
  const toasts = useStore((state) => state.toasts);
  const removeToast = useStore((state) => state.removeToast);

  const getIcon = (type: 'success' | 'error' | 'info' | 'ai') => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />;
      case 'ai':
        return <Bot className="w-5 h-5 text-purple-500" />;
    }
  };

  const getBorderColor = (type: 'success' | 'error' | 'info' | 'ai') => {
    switch (type) {
      case 'success':
        return 'border-green-500';
      case 'error':
        return 'border-red-500';
      case 'info':
        return 'border-blue-500';
      case 'ai':
        return 'border-purple-500';
    }
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-3">
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          className={`bg-zinc-900 border-l-4 ${getBorderColor(
            toast.type
          )} rounded-lg shadow-lg p-4 flex items-center gap-3 min-w-[300px] max-w-[400px] animate-slide-in`}
          style={{
            animation: `slide-in 0.3s ease-out ${index * 0.1}s both`,
          }}
        >
          {getIcon(toast.type)}
          <p className="flex-1 text-sm text-white">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
