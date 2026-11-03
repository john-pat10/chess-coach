import { NavLink, Route, Routes } from "react-router-dom";
import GameReview from "./pages/GameReview.jsx";
import OpponentScout from "./pages/OpponentScout.jsx";
import OpeningsTrainer from "./pages/OpeningsTrainer.jsx";

export default function App() {
  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">
          Chess<span>Coach</span>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Game Review
          </NavLink>
          <NavLink to="/scout" className={({ isActive }) => (isActive ? "active" : "")}>
            Opponent Scout
          </NavLink>
          <NavLink to="/trainer" className={({ isActive }) => (isActive ? "active" : "")}>
            Openings Trainer
          </NavLink>
        </nav>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<GameReview />} />
          <Route path="/scout" element={<OpponentScout />} />
          <Route path="/trainer" element={<OpeningsTrainer />} />
        </Routes>
      </main>
    </div>
  );
}
