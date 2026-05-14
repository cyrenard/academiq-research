import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[react-shell]', error, info);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen items-center justify-center bg-aq-paper p-8 text-aq-ink">
          <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-5">
            <h1 className="text-lg font-semibold text-red-800">Arayuz hatası</h1>
            <p className="mt-2 text-sm text-red-700">{this.state.error.message}</p>
            <button className="mt-4 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => this.setState({ error: null })}>Tekrar dene</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
