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

// Auto-retry up to this many times before showing the fallback UI
const MAX_AUTO_RETRIES = 3;

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

    const nextCount = this.state.errorCount + 1;

    if (nextCount >= MAX_AUTO_RETRIES) {
      // Give up auto-recovering — notify parent so it can show fallback UI
      this.props.onError?.();
    } else {
      // Auto-recover silently — don't notify parent (keeps conversation running)
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false, errorCount: nextCount });
      }, 1500);
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.setState({ hasError: false, errorCount: 0 });
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      // Show silent recovery message for first few attempts
      if (this.state.errorCount < MAX_AUTO_RETRIES) {
        return (
          <div className="w-full h-full bg-[#020205] flex items-center justify-center">
            <div className="text-white/30 text-xs">Reloading 3D...</div>
          </div>
        );
      }
      // Exhausted retries — show the full fallback
      return this.props.fallback || (
        <div className="w-full h-full bg-[#020205] flex items-center justify-center">
          <div className="text-white/40 text-sm">Reloading visualization...</div>
        </div>
      );
    }
    return this.props.children;
  }
}
