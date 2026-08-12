import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || '系统发生未知异常' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          id="error-boundary"
          className="min-h-screen w-full flex flex-col items-center justify-center p-6 text-center select-none"
          style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)' }}
        >
          <div className="p-4 rounded-2xl bg-red-500/10 text-red-500 mb-4">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h2 className="text-lg font-extrabold mb-2">页面出错了 (Application Error)</h2>
          <p className="text-xs text-muted max-w-md mb-6 font-mono bg-black/5 dark:bg-white/5 p-3 rounded-xl border border-red-500/20">
            {this.state.errorMessage}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 cursor-pointer text-white shadow-sm"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            <RefreshCw className="w-4 h-4" />
            <span>🔄 刷新页面</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
