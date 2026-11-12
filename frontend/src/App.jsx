import { Component, useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api.js";
import GameReview from "./pages/GameReview.jsx";
import OpponentScout from "./pages/OpponentScout.jsx";
import OpeningsTrainer from "./pages/OpeningsTrainer.jsx";

/** Keeps one broken page from blanking the whole app. */
class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-box">
        <b>This page hit an unexpected error.</b>
        <div className="mt-1">{String(this.state.error?.message || this.state.error)}</div>
        <button className="btn btn-secondary mt-1" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

/** Polls the backend so problems are explained up front, not after a click fails. */
function useHealth() {
  const [health, setHealth] = useState(undefined); // undefined = checking, null = unreachable

  const check = useCallback(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  // While the backend is down, keep checking so the banner clears by itself.
  useEffect(() => {
    if (health !== null) return;
    const t = setInterval(check, 4000);
    return () => clearInterval(t);
  }, [health, check]);

  return { health, check };
}

function StatusBanner({ health, onRetry }) {
  const { pathname } = useLocation();
  if (health === null) {
    return (
      <div className="banner banner-error" role="alert">
        <div>
          <b>The Chess Coach backend isn't running.</b> Start it with <code>python run.py</code> (or
          double-click <code>start.bat</code>) in the project folder. This page reconnects by itself.
        </div>
        <button className="btn btn-secondary" onClick={onRetry}>Retry now</button>
      </div>
    );
  }
  if (health && !health.stockfish.available && pathname === "/") {
    return (
      <div className="banner banner-warn" role="status">
        <div>
          <b>Stockfish isn't installed, so Game Review can't analyze games yet.</b> Run{" "}
          <code>python run.py</code> again and answer yes when it offers to download it. Opponent
          Scout and the Openings Trainer work without it.
        </div>
        <button className="btn btn-secondary" onClick={onRetry}>Check again</button>
      </div>
    );
  }
  return null;
}

const navClass = ({ isActive }) => (isActive ? "active" : "");

export default function App() {
  const { health, check } = useHealth();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">
          Chess<span>Coach</span>
        </div>
        <nav>
          <NavLink to="/" end className={navClass}>Game Review</NavLink>
          <NavLink to="/scout" className={navClass}>Opponent Scout</NavLink>
          <NavLink to="/trainer" className={navClass}>Openings Trainer</NavLink>
        </nav>
      </header>
      <StatusBanner health={health} onRetry={check} />
      <main className="page">
        <ErrorBoundary resetKey={pathname}>
          <Routes>
            <Route path="/" element={<GameReview />} />
            <Route path="/scout" element={<OpponentScout />} />
            <Route path="/trainer" element={<OpeningsTrainer />} />
            <Route path="*" element={<div className="hint">Page not found. Pick a tool above.</div>} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
