import React from 'react';
import { Routes, Route } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import RoomPage from './pages/RoomPage';
import TrackerPage from './pages/TrackerPage';
import ReviewSetupPage from './pages/ReviewSetupPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<LobbyPage />} />
      <Route path="/room/:roomId" element={<RoomPage />} />
      <Route path="/review/:reviewId/setup" element={<ReviewSetupPage />} />
      <Route path="/tracker" element={<TrackerPage />} />
    </Routes>
  );
};

export default App;