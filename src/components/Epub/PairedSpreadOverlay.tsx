"use client";

// CLAUDE-ADDED: Visual companion to useShortImageSpread.ts -- renders the two paired "insert" images side by side, absolutely positioned over the navigator's own iframe container (which keeps showing just one of the two resources underneath, unaffected). These plain <img> elements sit outside any iframe and so never receive the navigator's own injected click listeners -- clicking either one opens it in the fullscreen image viewer, same as clicking a solo image inside the reading iframe (see getClickedImage.ts / StatefulReader.tsx's handleImageClick, which takes the same priority over tap-navigation there). Narrow edge strips on top of the images restore mouse page-turning (see StatefulReader.tsx's own handleTap zones, removed from here when image-click-to-open was added) without taking away most of the images' own click-to-open area.
import readerStyles from "./assets/styles/thorium-web.pairedSpreadOverlay.module.css";
import { SpreadPair } from "./Hooks/useShortImageSpread";

import { useNavigator } from "@/core/Navigator/hooks";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { openImageOverlay } from "@/lib/imageOverlayReducer";
import { setUserNavigated } from "@/lib/readerReducer";

export interface PairedSpreadOverlayProps {
  pair: SpreadPair | null;
}

export const PairedSpreadOverlay = ({ pair }: PairedSpreadOverlayProps) => {
  const dispatch = useAppDispatch();
  const reducedMotion = useAppSelector(state => state.theming.prefersReducedMotion);
  const { goLeft, goRight } = useNavigator().visual;

  if (!pair) return null;

  const handleGoLeft = () => {
    goLeft(!reducedMotion, () => dispatch(setUserNavigated(true)));
  };

  const handleGoRight = () => {
    goRight(!reducedMotion, () => dispatch(setUserNavigated(true)));
  };

  return (
    <div
      className={ readerStyles.overlay }
      style={{
        backgroundColor: pair.backgroundColor,
        columnGap: pair.columnGap,
      }}
    >
      <img
        className={ readerStyles.page }
        src={ pair.leftImageUrl }
        alt=""
        onClick={ () => dispatch(openImageOverlay({ src: pair.leftImageUrl })) }
      />
      <img
        className={ readerStyles.page }
        src={ pair.rightImageUrl }
        alt=""
        onClick={ () => dispatch(openImageOverlay({ src: pair.rightImageUrl })) }
      />

      <div className={ readerStyles.edgeZone } style={{ insetInlineStart: 0 }} onClick={ handleGoLeft } />
      <div className={ readerStyles.edgeZone } style={{ insetInlineEnd: 0 }} onClick={ handleGoRight } />
    </div>
  );
};
