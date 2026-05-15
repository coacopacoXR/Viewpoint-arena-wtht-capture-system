import { createXRStore } from '@react-three/xr';

// Singleton — imported by XRButton (outside canvas) and ViewpointCanvas (inside)
export const xrStore = createXRStore({
  controller: true,
  hand: false,
});
