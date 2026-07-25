"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./assets/styles/thorium-web.imageOverlay.module.css";

import Close from "./assets/icons/close.svg";
import ZoomIcon from "./assets/icons/zoom.svg";

import { ThModal } from "@/core/Components/Containers/ThModal";
import { ThActionButton } from "@/core/Components/Buttons/ThActionButton";
import { ThSlider } from "@/core/Components/Settings/ThSlider";

import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { closeImageOverlay } from "@/lib/imageOverlayReducer";

import { useI18n } from "@/i18n/useI18n";

const ZOOM_RANGE = [0.5, 4];
const ZOOM_STEP = 0.1;

type Pan = { x: number; y: number };

// CLAUDE-ADDED: Fullscreen viewer opened by clicking an <img> inside the EPUB reading iframe -- see
// getClickedImage.ts / StatefulReader.tsx's click & tap listeners for how src/alt reach imageOverlay
// state. Rendered as a sibling of SelectionPopover, same pattern: a piece of transient Redux state set
// from inside StatefulReader drives a component with no access of its own to the reading iframe.
export const StatefulImageOverlay = () => {
  const { t } = useI18n();

  const dispatch = useAppDispatch();
  const src = useAppSelector(state => state.imageOverlay.src);
  const alt = useAppSelector(state => state.imageOverlay.alt);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragOrigin = useRef<{ startX: number; startY: number; startPan: Pan } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomPanelOpen, setIsZoomPanelOpen] = useState(false);

  const isOpen = src !== null;

  // CLAUDE-ADDED: Keyed on isOpen (not src) so reopening the same image resets zoom/pan instead of
  // carrying over the previous session's state.
  useEffect(() => {
    if (!isOpen) return;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsZoomPanelOpen(false);
  }, [isOpen]);

  const handleZoomChange = useCallback((value: number | number[]) => {
    setZoom(Array.isArray(value) ? value[0]! : value);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLImageElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { startX: event.clientX, startY: event.clientY, startPan: pan };
    setIsDragging(true);
  }, [pan]);

  // CLAUDE-ADDED: Pan is unbounded -- the image can be dragged freely, including entirely off screen,
  // rather than clamped to stay within the stage.
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragOrigin.current) return;
    const { startX, startY, startPan } = dragOrigin.current;
    setPan({
      x: startPan.x + (event.clientX - startX),
      y: startPan.y + (event.clientY - startY)
    });
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLImageElement>) => {
    if (dragOrigin.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragOrigin.current = null;
    setIsDragging(false);
  }, []);

  const close = useCallback(() => {
    dispatch(closeImageOverlay());
  }, [dispatch]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) close();
  }, [close]);

  if (!src) return null;

  return (
    <ThModal
      ref={ overlayRef }
      focusOptions={{
        withinRef: overlayRef,
        trackedState: isOpen,
        action: { type: "focus" }
      }}
      compounds={{
        dialog: {
          className: styles.dialog,
          "aria-label": alt || t("reader.imageViewer.title")
        }
      }}
      isOpen={ isOpen }
      onOpenChange={ handleOpenChange }
      className={ styles.overlay }
    >
      <div className={ styles.toolbar }>
        <ThActionButton
          aria-label={ t("common.actions.close") }
          className={ styles.toolbarButton }
          onPress={ close }
        >
          <Close aria-hidden="true" focusable="false" />
        </ThActionButton>

        <div className={ styles.zoomWrapper }>
          <ThActionButton
            aria-label={ t("reader.imageViewer.zoom") }
            aria-expanded={ isZoomPanelOpen }
            className={ styles.toolbarButton }
            onPress={ () => setIsZoomPanelOpen(open => !open) }
          >
            <ZoomIcon aria-hidden="true" focusable="false" />
          </ThActionButton>

          { isZoomPanelOpen &&
            <div className={ styles.zoomPanel }>
              <ThSlider
                className={ styles.zoomSlider }
                orientation="vertical"
                aria-label={ t("reader.imageViewer.zoomLevel") }
                range={ ZOOM_RANGE }
                step={ ZOOM_STEP }
                value={ zoom }
                onChange={ handleZoomChange }
                formatOptions={{ style: "percent" }}
                compounds={{
                  output: { className: styles.zoomOutput },
                  track: { className: styles.zoomTrack },
                  thumb: { className: styles.zoomThumb }
                }}
              />
            </div>
          }
        </div>
      </div>

      <div className={ styles.stage }>
        <img
          className={ styles.image }
          src={ src }
          alt={ alt ?? "" }
          data-dragging={ isDragging }
          style={{ transform: `translate(${ pan.x }px, ${ pan.y }px) scale(${ zoom })` }}
          onPointerDown={ handlePointerDown }
          onPointerMove={ handlePointerMove }
          onPointerUp={ handlePointerUp }
          onPointerCancel={ handlePointerUp }
        />
      </div>
    </ThModal>
  );
};
