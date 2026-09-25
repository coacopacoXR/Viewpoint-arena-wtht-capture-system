// The three models that ship with the app, offered as SAMPLES.
//
// Batch BI. They used to be the default: store.ts held a DEFAULT_BUILT_IN of
// 'headphones', so every room opened on a pair of headphones and every new design
// review was created as one, whether the meeting was about them or not — and every
// screen that names the product named "Sennheiser Momentum 4". A room now starts
// empty and says so.
//
// They are still here, because a room with nothing in it has nothing to point at,
// and a first run or a demo needs something to show. What changed is that a person
// chooses one, and that choosing is the scene operation it always was
// (`setBuiltIn`), so it obeys the room server and the "who may change models"
// permission exactly like an import does.
//
// Kept out of lib/scene/roomScene.ts on purpose: that module is pure and the room
// server imports it into workerd, and the words on a menu button are not something
// a server has any use for.

import type { BuiltInModel } from './roomScene';

/** One sample: the scene's own spelling of it, and what a menu calls it. */
export interface SampleModel {
  builtIn: BuiltInModel;
  label: string;
}

/** Every sample, in the order both places that offer one show them. */
export const SAMPLE_MODELS: SampleModel[] = [
  { builtIn: 'synth', label: 'Synth assembly' },
  { builtIn: 'headphones', label: 'Headphones' },
  { builtIn: 'bicycle', label: 'Bicycle' },
];
