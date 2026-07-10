import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RosterPage } from './pages/RosterPage';
import { TeamsPage } from './pages/TeamsPage';

export function App() {
  return (
    <BrowserRouter>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <nav className="mb-6 border-b border-slate-800 pb-3">
          <span className="text-lg font-semibold tracking-tight text-white">
            Franchise Hockey Manager
          </span>
          <span className="ml-3 text-xs text-slate-500">MVP skeleton</span>
        </nav>
        <Routes>
          <Route path="/" element={<TeamsPage />} />
          <Route path="/teams/:id" element={<RosterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
