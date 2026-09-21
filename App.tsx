import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import TrackerPage from './pages/TrackerPage';
import ReviewSetupPage from './pages/ReviewSetupPage';
import LaunchPage from './pages/LaunchPage';
import { ConfigProvider } from './lib/config/ConfigContext';

// ConfigProvider wraps every route so any component can ask which connector is
// active. It never blocks rendering: children mount immediately and read the
// pre-config fallbacks until /api/public-config settles (or fails).
const App: React.FC = () => {
  return (
    <ConfigProvider>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/review/:reviewId/setup" element={<ReviewSetupPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        {/* Deep link a PLM system opens directly (T5.3). Both vercel.json and
            deploy/nginx/app.conf already fall back to index.html for unknown
            non-/api paths, so this needs no server-side route. */}
        <Route path="/launch" element={<LaunchPage />} />
      </Routes>
    </ConfigProvider>
  );
};

export default App;