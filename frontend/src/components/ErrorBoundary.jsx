import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="center" style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ fontFamily: "Fraunces, serif", marginBottom: 12 }}>Something stalled</h1>
        <p className="muted">{this.state.err.message || "The live view hit an error."}</p>
        <button className="btn btn-gold" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
