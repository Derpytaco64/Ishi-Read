import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ImageOverlayState {
  src: string | null;
  alt: string | null;
}

const initialState: ImageOverlayState = {
  src: null,
  alt: null
};

export const imageOverlaySlice = createSlice({
  name: "imageOverlay",
  initialState,
  reducers: {
    openImageOverlay: (state, action: PayloadAction<{ src: string; alt?: string }>) => {
      state.src = action.payload.src;
      state.alt = action.payload.alt ?? null;
    },
    closeImageOverlay: (state) => {
      state.src = null;
      state.alt = null;
    }
  }
});

export const { openImageOverlay, closeImageOverlay } = imageOverlaySlice.actions;

export default imageOverlaySlice.reducer;
