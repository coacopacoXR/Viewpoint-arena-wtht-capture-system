import React from 'react';
import ViewpointCanvas from './components/Scene/ViewpointCanvas';
import Interface from './components/UI/Interface';
import { useStore } from './store';

const App: React.FC = () => {
  const isMeetingEnded = useStore(state => state.isMeetingEnded);

  return (
    <div className="relative w-full h-screen bg-[#F2F2F2] overflow-hidden select-none">
      {/* Logic & Rendering Layer */}
      {!isMeetingEnded && <ViewpointCanvas />}
      
      {/* UI Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <Interface />
      </div>
    </div>
  );
};

export default App;