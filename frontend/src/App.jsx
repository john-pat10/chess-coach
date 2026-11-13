import { NavLink, Route, Routes } from "react-router-dom";
import GameReview from "./pages/GameReview.jsx";
import OpponentScout from "./pages/OpponentScout.jsx";
import OpeningsTrainer from "./pages/OpeningsTrainer.jsx";
import AnalysisBoard from "./pages/AnalysisBoard.jsx";
import PunishMistakes from "./pages/PunishMistakes.jsx";

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
          <NavLink to="/analysis" className={({ isActive }) => (isActive ? "active" : "")}>
            Analysis Board
          </NavLink>
          <NavLink to="/scout" className={({ isActive }) => (isActive ? "active" : "")}>
            Opponent Scout
          </NavLink>
          <NavLink to="/trainer" className={({ isActive }) => (isActive ? "active" : "")}>
            Openings Trainer
          </NavLink>
          <NavLink to="/punish" className={({ isActive }) => (isActive ? "active" : "")}>
            Punish Mistakes
          </NavLink>
        </nav>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<GameReview />} />
          <Route path="/analysis" element={<AnalysisBoard />} />
          <Route path="/scout" element={<OpponentScout />} />
          <Route path="/trainer" element={<OpeningsTrainer />} />
          <Route path="/punish" element={<PunishMistakes />} />
        </Routes>
      </main>
    </div>
  );
}
