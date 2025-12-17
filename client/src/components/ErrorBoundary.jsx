import React from 'react';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center text-[var(--text-main)]">
                    <h2 className="text-xl font-bold mb-4 text-red-500">Something went wrong.</h2>
                    <p className="opacity-70 mb-4">The application encountered an unexpected error.</p>
                    <pre className="text-xs bg-black/10 p-4 rounded mb-4 overflow-auto max-w-lg mx-auto text-left">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                    <button
                        className="btn primary"
                        onClick={() => window.location.reload()}
                    >
                        Reload Application
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
