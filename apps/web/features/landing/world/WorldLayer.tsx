"use client";

import { MathUtils } from "three";
import { Canvas, type RootState } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarInstrument,
  InvalidationBridge,
  STATIC_PROGRESS,
} from "./CalendarInstrument";
import { CssInstrumentFallback, WorldErrorBoundary } from "./WorldFallback";
import "./world.css";

const STORY_PROGRESS_EVENT = "chron:story-progress";
const STORY_PROGRESS_REQUEST_EVENT = "chron:story-progress-request";

type WorldState = "initializing" | "ready" | "lost" | "unavailable";

export function WorldLayer() {
  const progressRef = useRef<number | null>(null);
  const animatedProgressRef = useRef(STATIC_PROGRESS);
  const initialProgressReadyRef = useRef(false);
  const preferenceReadyRef = useRef(false);
  const reducedMotionRef = useRef<boolean | null>(null);
  const forceStaticFrameRef = useRef(false);
  const activeRef = useRef(false);
  const rendererReadyRef = useRef(false);
  const contextLostRef = useRef(false);
  const rendererFailedRef = useRef(false);
  const worldStateRef = useRef<WorldState>("initializing");
  const invalidateRef = useRef<(() => void) | null>(null);
  const rendererCleanupRef = useRef<(() => void) | null>(null);
  const [worldState, setWorldState] = useState<WorldState>("initializing");

  const transitionWorldState = useCallback((nextState: WorldState) => {
    const changed = worldStateRef.current !== nextState;
    worldStateRef.current = nextState;
    setWorldState((currentState) =>
      currentState === nextState ? currentState : nextState,
    );

    if (changed && nextState === "ready") invalidateRef.current?.();
  }, []);

  const bindInvalidation = useCallback((invalidate: (() => void) | null) => {
    invalidateRef.current = invalidate;
    invalidate?.();
  }, []);

  const syncWorldState = useCallback(() => {
    if (rendererFailedRef.current) {
      transitionWorldState("unavailable");
      return;
    }

    if (contextLostRef.current) {
      transitionWorldState("lost");
      return;
    }

    if (
      rendererReadyRef.current &&
      preferenceReadyRef.current &&
      initialProgressReadyRef.current
    ) {
      transitionWorldState("ready");
      return;
    }

    transitionWorldState("initializing");
  }, [transitionWorldState]);

  const markUnavailable = useCallback(() => {
    rendererFailedRef.current = true;
    syncWorldState();
  }, [syncWorldState]);

  const handleCreated = useCallback(({ gl }: RootState) => {
    rendererCleanupRef.current?.();

    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      contextLostRef.current = true;
      syncWorldState();
    };
    const handleContextRestored = () => {
      contextLostRef.current = false;
      syncWorldState();
      invalidateRef.current?.();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    rendererCleanupRef.current = () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };

    rendererReadyRef.current = true;
    contextLostRef.current = gl.getContext().isContextLost();
    syncWorldState();
  }, [syncWorldState]);

  useEffect(() => {
    const applyPreference = (
      reducedMotion: boolean,
      isPreferenceChange: boolean,
    ) => {
      const isInitialPreference = !preferenceReadyRef.current;
      reducedMotionRef.current = reducedMotion;
      preferenceReadyRef.current = true;

      if (isPreferenceChange && !isInitialPreference) {
        animatedProgressRef.current = STATIC_PROGRESS;
        forceStaticFrameRef.current = true;
      } else if (reducedMotion || progressRef.current === null) {
        animatedProgressRef.current = STATIC_PROGRESS;
        forceStaticFrameRef.current = false;
      } else if (initialProgressReadyRef.current) {
        animatedProgressRef.current = progressRef.current;
        forceStaticFrameRef.current = false;
      }

      syncWorldState();
      invalidateRef.current?.();
    };

    if (typeof window.matchMedia !== "function") {
      applyPreference(true, false);
      return;
    }

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = (event: MediaQueryListEvent) => {
      applyPreference(event.matches, true);
    };

    applyPreference(preference.matches, false);
    preference.addEventListener("change", syncPreference);

    return () => preference.removeEventListener("change", syncPreference);
  }, [syncWorldState]);

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<number | null>).detail;
      const isInitialProgress = !initialProgressReadyRef.current;

      if (typeof detail === "number" && Number.isFinite(detail)) {
        progressRef.current = MathUtils.clamp(detail, 0, 1);
        if (isInitialProgress) {
          animatedProgressRef.current =
            reducedMotionRef.current === false
              ? progressRef.current
              : STATIC_PROGRESS;
          forceStaticFrameRef.current = false;
        }
      } else {
        progressRef.current = null;
        animatedProgressRef.current = STATIC_PROGRESS;
        if (isInitialProgress) forceStaticFrameRef.current = false;
      }

      initialProgressReadyRef.current = true;
      syncWorldState();

      if (progressRef.current === null || activeRef.current) {
        invalidateRef.current?.();
      }
    };

    window.addEventListener(STORY_PROGRESS_EVENT, handleProgress);
    window.dispatchEvent(new Event(STORY_PROGRESS_REQUEST_EVENT));

    return () => window.removeEventListener(STORY_PROGRESS_EVENT, handleProgress);
  }, [syncWorldState]);

  useEffect(() => {
    const storyStops = Array.from(
      document.querySelectorAll<HTMLElement>("[data-world-stop]"),
    );
    const intersectingStops = new Set<Element>();
    const setActive = (nextActive: boolean) => {
      if (activeRef.current === nextActive) return;

      activeRef.current = nextActive;
      if (nextActive) invalidateRef.current?.();
    };

    const syncActivity = () => {
      setActive(
        intersectingStops.size > 0 && document.visibilityState === "visible",
      );
    };

    if (storyStops.length === 0) {
      setActive(false);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      const syncVisibility = () => {
        setActive(document.visibilityState === "visible");
      };

      document.addEventListener("visibilitychange", syncVisibility);
      syncVisibility();

      return () => {
        document.removeEventListener("visibilitychange", syncVisibility);
        setActive(false);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersectingStops.add(entry.target);
          else intersectingStops.delete(entry.target);
        });
        syncActivity();
      },
      { rootMargin: "96px 0px" },
    );

    storyStops.forEach((stop) => observer.observe(stop));
    document.addEventListener("visibilitychange", syncActivity);

    return () => {
      observer.disconnect();
      intersectingStops.clear();
      document.removeEventListener("visibilitychange", syncActivity);
      setActive(false);
    };
  }, []);

  useEffect(
    () => () => {
      rendererCleanupRef.current?.();
      rendererCleanupRef.current = null;
      invalidateRef.current = null;
    },
    [],
  );

  return (
    <div
      className="chron-world-layer"
      data-world-state={worldState}
      aria-hidden="true"
    >
      <CssInstrumentFallback />
      <WorldErrorBoundary onError={markUnavailable}>
        <Canvas
          className="chron-world-canvas"
          frameloop="demand"
          dpr={[1, 1.35]}
          camera={{ position: [0, 0, 7], fov: 33, near: 0.1, far: 18 }}
          gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
          onCreated={handleCreated}
          style={{ pointerEvents: "none" }}
        >
          <InvalidationBridge onReady={bindInvalidation} />
          <CalendarInstrument
            progressRef={progressRef}
            animatedProgressRef={animatedProgressRef}
            initialProgressReadyRef={initialProgressReadyRef}
            preferenceReadyRef={preferenceReadyRef}
            reducedMotionRef={reducedMotionRef}
            forceStaticFrameRef={forceStaticFrameRef}
            activeRef={activeRef}
          />
        </Canvas>
      </WorldErrorBoundary>
    </div>
  );
}
