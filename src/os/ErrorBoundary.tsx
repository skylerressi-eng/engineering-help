import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback (e.g. app name) */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Per-window error boundary. If an app crashes during render, we show a
 * friendly fallback inside the window instead of letting the error propagate
 * up to the desktop and blank the whole tree.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[EngOS ${this.props.label ?? 'window'} crash]`, error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-white/85">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-traffic-red/20 mb-3">
          <AlertTriangle size={22} className="text-traffic-red" />
        </div>
        <div className="text-base font-semibold">Something broke in {this.props.label ?? 'this window'}</div>
        <div className="text-xs text-white/55 mt-1 max-w-xs">
          {this.state.error.message || 'Unknown error.'} — this window has been isolated so the
          rest of EngOS keeps running.
        </div>
        <button
          onClick={this.reset}
          className="mt-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm"
        >
          <RotateCw size={13} /> Try again
        </button>
      </div>
    );
  }
}
