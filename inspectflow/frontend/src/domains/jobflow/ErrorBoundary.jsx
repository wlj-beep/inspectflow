import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(err) {
    console.error("UI Error:", err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem" }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Something went wrong</div>
            </div>
            <div className="card-body">
              <p className="text-muted" style={{ marginBottom: "1rem" }}>
                An unexpected UI error occurred. Try refreshing the page.
              </p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
