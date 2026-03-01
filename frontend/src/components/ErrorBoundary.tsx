import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: () => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  errorCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
    this.props.onError?.();
    // Auto-recover after 2 seconds (re-mount the Canvas)
    this.retryTimer = setTimeout(() => {
      this.setState((prev) => ({ hasError: false, errorCount: prev.errorCount + 1 }));
    }, 2000);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="w-full h-full bg-[#020205] flex items-center justify-center">
          <div className="text-white/40 text-sm">Reloading visualization...</div>
        </div>
      );
    }
    return this.props.children;
  }
}
