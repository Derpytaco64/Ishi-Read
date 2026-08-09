"use client";

import React, { useCallback, useState, useMemo } from "react";

import audioStyles from "./assets/styles/thorium-web.audioProgressBar.module.css";

import { ThAudioProgress } from "@/core/Components/Audio/ThAudioProgress";

import { useNavigator } from "@/core/Navigator";
import { useAppSelector } from "@/lib";
import { useI18n } from "@/i18n/useI18n";
import { useAudioPreferences } from "@/preferences/hooks/useAudioPreferences";

import classNames from "classnames";

export const StatefulAudioProgressBar = () => {
  const { t } = useI18n();
  const { preferences } = useAudioPreferences();

  const tocEntry = useAppSelector(state => state.publication.unstableTimeline?.toc?.currentEntry);
  const currentChapter = tocEntry?.title;

  const isStalled = useAppSelector(state => state.player.isStalled);
  const isTrackReady = useAppSelector(state => state.player.isTrackReady);
  const seekableRanges = useAppSelector(state => state.player.seekableRanges);
  const playbackRate = useAppSelector(state => state.audioSettings.playbackRate);

  const { currentTime, duration, seek, currentLocator, timeline } = useNavigator().media;

  const current = currentTime();
  const total = duration();

  const [hoverLabel, setHoverLabel] = useState<string | undefined>(undefined);
  // Local display toggle only, not persisted -- seeking always resolves to a whole-book time,
  // this just changes what's rendered and remaps a chapter-relative drag back to that.
  const [chapterViewMode, setChapterViewMode] = useState(false);

  const handleHoverProgression = useCallback((progression: number | null) => {
    if (progression === null) {
      setHoverLabel(undefined);
      return;
    }
    const locator = currentLocator();
    const tl = timeline();
    if (!locator || !tl) return;
    const item = tl.itemAtProgression(locator.href, progression, total);
    setHoverLabel(item?.title);
  }, [currentLocator, timeline, total]);

  // Parse timestamp from fragment href (e.g., "file.mp3#t=123.45")
  const parseTimestamp = (href: string): number => {
    const match = href.match(/#t=(\d+(?:\.\d+)?)$/);
    return match ? parseFloat(match[1]) : 0;
  };

  // Get timeline segments for the chapter tick marks -- always computed, not just for a particular
  // progress-bar theming variant, since there's no user-facing way to change that preference.
  const segments = useMemo(() => {
    const locator = currentLocator();
    const tl = timeline();
    if (!locator || !tl) return [];

    const segments = tl.segmentsForHref(locator.href);
    if (!segments || !Array.isArray(segments)) return [];

    return segments.map((segment) => {
      // Parse timestamp from first reference href (e.g., "track1.mp3#t=60")
      const referenceHref = segment.references?.[0] || "";
      const timestamp = parseTimestamp(referenceHref);

      // Calculate percentage based on timestamp and total duration
      const percentage = total > 0 ? (timestamp / total) * 100 : 0;

      return {
        title: segment.title,
        timestamp,
        percentage
      };
    });
  }, [currentLocator, timeline, total]);

  // This chapter's own start/duration/position within the whole-book timeline -- only meaningful
  // once there's more than one chapter to distinguish "book" from "chapter".
  const chapterProgress = useMemo(() => {
    if (!chapterViewMode || segments.length < 2) return null;

    let activeIndex = 0;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].timestamp <= current) activeIndex = i;
      else break;
    }

    const start = segments[activeIndex].timestamp;
    const end = segments[activeIndex + 1] ? segments[activeIndex + 1].timestamp : total;
    const chapterDuration = Math.max(end - start, 0.001);

    return { start, duration: chapterDuration, position: Math.min(Math.max(current - start, 0), chapterDuration) };
  }, [chapterViewMode, segments, current, total]);

  const handleSeek = useCallback((time: number) => {
    seek(chapterProgress ? chapterProgress.start + time : time);
  }, [seek, chapterProgress]);

  return (
    <ThAudioProgress
      currentTime={ chapterProgress ? chapterProgress.position : current }
      duration={ chapterProgress ? chapterProgress.duration : total }
      playbackRate={ playbackRate }
      onSeek={ handleSeek }
      currentChapter={ currentChapter || "​" } // Zero-width space to prevent shift
      isDisabled={ !isTrackReady || isStalled }
      seekableRanges={ chapterProgress ? [] : seekableRanges }
      hoverLabel={ chapterProgress ? undefined : hoverLabel }
      onHoverProgression={ chapterProgress ? undefined : handleHoverProgression }
      segments={ chapterProgress ? [] : segments }
      modeToggle={ segments.length > 1 &&
        <button
          type="button"
          className={ classNames(audioStyles.chapterToggle, { [audioStyles.chapterToggleActive]: !!chapterProgress }) }
          onClick={ () => setChapterViewMode(mode => !mode) }
        >
          { t(chapterProgress ? "audio.player.progressChapterView" : "audio.player.progressBookView") }
        </button>
      }
      compounds={{
        wrapper: {
          className: audioStyles.wrapper,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Escape") (document.activeElement as HTMLElement)?.blur();
          }
        },
        current: {
          className: audioStyles.current
        },
        slider: {
          className: audioStyles.slider,
          "aria-label": t("audio.player.progress")
        },
        track: {
          className: audioStyles.track
        },
        thumb: {
          className: audioStyles.thumb
        },
        elapsedTime: {
          className: audioStyles.elapsed
        },
        remainingTime: {
          className: audioStyles.remaining
        },
        modeToggle: {
          className: audioStyles.modeToggle
        },
        seekableRange: {
          className: audioStyles.seekableRange
        },
        fragmentTick: {
          className: audioStyles.tick
        },
        tooltip: {
          className: audioStyles.tooltip,
          offset: preferences.theming.icon.tooltipOffset
        }
      }}
    />
  );
};
