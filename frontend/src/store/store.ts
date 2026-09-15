/**
 * Store setup — spec §8: Redux Toolkit holds the app state, not App.tsx.
 */

import { configureStore } from "@reduxjs/toolkit";
import complaintReducer from "./complaintSlice";

export const store = configureStore({
  reducer: {
    copilot: complaintReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
