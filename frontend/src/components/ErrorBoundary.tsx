import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.sectionName ? `: ${this.props.sectionName}` : ''}]`, error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '14px',
            padding: '24px',
            margin: '16px 0',
            textAlign: 'center',
            color: '#991b1b',
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⚠️</div>
          <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800 }}>
            {this.props.sectionName ? `${this.props.sectionName} encountered an error` : 'Something went wrong'}
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#7f1d1d' }}>
            {this.state.errorMessage}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              background: '#b91c1c',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            🔄 Retry Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;