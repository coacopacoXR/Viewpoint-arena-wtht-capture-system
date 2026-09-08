import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import TrackerPage from './pages/TrackerPage';
import ReviewSetupPage from './pages/ReviewSetupPage';
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
      </Routes>
    </ConfigProvider>
  );
};

export default App;