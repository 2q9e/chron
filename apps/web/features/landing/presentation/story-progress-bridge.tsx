"use client";

import { useEffect } from "react";

const PROGRESS_EVENT = "chron:story-progress";
const PROGRESS_REQUEST_EVENT = "chron:story-progress-request";
const LAYOUT_EVENT = "chron:layout";
const STOP_ORDER = ["threshold", "week", "study", "research", "close"] as const;
const SEGMENT_COUNT = STOP_ORDER.length - 1;

// Null tells the scene to return to its static composition when the DOM story is invalid.
type StoryProgress = number | null;

function getStoryStops(root: HTMLElement | null): HTMLElement[] | null {
  if (!root) {
    return null;
  }

  const stops = Array.from(root.querySelectorAll<HTMLElement>("[data-world-stop]"));

  if (stops.length !== STOP_ORDER.length) {
    return null;
  }

  for (const [index, stop] of stops.entries()) {
    if (stop.dataset.worldStop !== STOP_ORDER[index]) {
      return null;
    }
  }

  return stops;
}

function isStrictlyIncreasing(positions: number[]): boolean {
  return positions.every((position, index) => {
    if (!Number.isFinite(position)) {
      return false;
    }

    if (index === 0) {
      return true;
    }

    const previous = positions[index - 1];
    return previous !== undefined && position > previous;
  });
}

function getProgress(scrollY: number, stopPositions: number[]): StoryProgress {
  if (!Number.isFinite(scrollY) || !isStrictlyIncreasing(stopPositions)) {
    return null;
  }

  const first = stopPositions[0];
  const last = stopPositions.at(-1);

  if (first === undefined || last === undefined) {
    return null;
  }

  if (scrollY <= first) {
    return 0;
  }

  if (scrollY >= last) {
    return 1;
  }

  for (let index = 0; index < stopPositions.length - 1; index += 1) {
    const start = stopPositions[index];
    const end = stopPositions[index + 1];

    if (start === undefined || end === undefined || scrollY > end) {
      continue;
    }

    const segmentProgress = (scrollY - start) / (end - start);
    return (index + segmentProgress) / SEGMENT_COUNT;
  }

  return null;
}

function getStoryProgress(root: HTMLElement | null): StoryProgress {
  const stops = getStoryStops(root);

  if (!stops) {
    return null;
  }

  const scrollY = window.scrollY;
  const measuredPositions = stops.map((stop) => scrollY + stop.getBoundingClientRect().top);

  if (!isStrictlyIncreasing(measuredPositions)) {
    return null;
  }

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const positions = [...measuredPositions];
  positions[positions.length - 1] = maxScroll;

  if (!isStrictlyIncreasing(positions)) {
    return null;
  }

  const progress = getProgress(scrollY, positions);
  return progress === null ? null : Math.min(1, Math.max(0, progress));
}

export function StoryProgressBridge() {
  useEffect(() => {
    const storyRoot = document.querySelector<HTMLElement>("main");
    let frame: number | null = null;
    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    const observedStops = new Set<HTMLElement>();

    const dispatchProgress = () => {
      if (!active) {
        return;
      }

      const detail = getStoryProgress(storyRoot);
      window.dispatchEvent(new CustomEvent<StoryProgress>(PROGRESS_EVENT, { detail }));
    };

    const scheduleProgress = () => {
      if (!active || frame !== null) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = null;
        dispatchProgress();
      });
    };

    const refreshStopObserving = () => {
      if (!storyRoot) {
        return;
      }

      const currentStops = new Set(
        Array.from(storyRoot.querySelectorAll<HTMLElement>("[data-world-stop]")),
      );

      for (const stop of observedStops) {
        if (!currentStops.has(stop)) {
          resizeObserver?.unobserve(stop);
          observedStops.delete(stop);
        }
      }

      for (const stop of currentStops) {
        if (!observedStops.has(stop)) {
          resizeObserver?.observe(stop);
          observedStops.add(stop);
        }
      }

      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver.observe(storyRoot, { childList: true, subtree: true });
      }
    };

    const handleStoryMutation = () => {
      refreshStopObserving();
      scheduleProgress();
    };

    const handleProgressRequest = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }

      refreshStopObserving();
      dispatchProgress();
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleProgress);
      resizeObserver.observe(document.documentElement);

      if (storyRoot) {
        resizeObserver.observe(storyRoot);
      }
    }

    if (storyRoot && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(handleStoryMutation);
    }

    refreshStopObserving();

    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    window.addEventListener("popstate", scheduleProgress);
    window.addEventListener("hashchange", scheduleProgress);
    window.addEventListener("pageshow", scheduleProgress);
    window.addEventListener(LAYOUT_EVENT, scheduleProgress);
    window.addEventListener(PROGRESS_REQUEST_EVENT, handleProgressRequest);
    dispatchProgress();

    void document.fonts?.ready.then(scheduleProgress);

    return () => {
      active = false;
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      window.removeEventListener("popstate", scheduleProgress);
      window.removeEventListener("hashchange", scheduleProgress);
      window.removeEventListener("pageshow", scheduleProgress);
      window.removeEventListener(LAYOUT_EVENT, scheduleProgress);
      window.removeEventListener(PROGRESS_REQUEST_EVENT, handleProgressRequest);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      observedStops.clear();

      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  return null;
}
