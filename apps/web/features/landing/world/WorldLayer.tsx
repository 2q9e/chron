"use client";

import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  MathUtils,
  MeshStandardMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Group,
} from "three";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./world.css";

const STORY_PROGRESS_EVENT = "chron:story-progress";
const STORY_PROGRESS_REQUEST_EVENT = "chron:story-progress-request";
const STATIC_PROGRESS = 1;

type WorldState = "initializing" | "ready" | "lost" | "unavailable";

type ProgressRef = { current: number | null };
type AnimatedProgressRef = { current: number };
type FlagRef = { current: boolean };
type MotionPreferenceRef = { current: boolean | null };

type InstrumentResources = {
  geometries: {
    outerRing: TorusGeometry;
    innerRing: TorusGeometry;
    tick: BoxGeometry;
    outerPage: CylinderGeometry;
    middlePage: CylinderGeometry;
    innerPage: CylinderGeometry;
    sourcePath: TubeGeometry;
  };
  materials: {
    rose: MeshStandardMaterial;
    graphite: MeshStandardMaterial;
    outerPaper: MeshStandardMaterial;
    middlePaper: MeshStandardMaterial;
    innerPaper: MeshStandardMaterial;
    sourcePath: MeshStandardMaterial;
  };
};

function createInstrumentResources(): InstrumentResources {
  const sourceCurve = new CatmullRomCurve3([
    new Vector3(-0.84, -0.48, 0),
    new Vector3(-0.62, -0.34, 0),
    new Vector3(-0.35, -0.2, 0),
    new Vector3(-0.04, 0.02, 0),
    new Vector3(0.28, 0.27, 0),
    new Vector3(0.57, 0.46, 0),
    new Vector3(0.82, 0.6, 0),
  ]);

  return {
    geometries: {
      outerRing: new TorusGeometry(1.16, 0.03, 12, 96),
      innerRing: new TorusGeometry(0.71, 0.014, 8, 72),
      tick: new BoxGeometry(0.045, 0.12, 0.035),
      outerPage: new CylinderGeometry(1.08, 1.08, 0.032, 96),
      middlePage: new CylinderGeometry(0.96, 0.96, 0.032, 96),
      innerPage: new CylinderGeometry(0.82, 0.82, 0.032, 96),
      sourcePath: new TubeGeometry(sourceCurve, 72, 0.012, 6, false),
    },
    materials: {
      rose: new MeshStandardMaterial({
        color: "#B95C76",
        roughness: 0.48,
        metalness: 0.08,
      }),
      graphite: new MeshStandardMaterial({
        color: "#39353B",
        roughness: 0.72,
        metalness: 0.16,
      }),
      outerPaper: new MeshStandardMaterial({
        color: "#D2CFD3",
        roughness: 0.9,
      }),
      middlePaper: new MeshStandardMaterial({
        color: "#E1DEE2",
        roughness: 0.88,
      }),
      innerPaper: new MeshStandardMaterial({
        color: "#E7E4E7",
        roughness: 0.86,
      }),
      sourcePath: new MeshStandardMaterial({
        color: "#B95C76",
        roughness: 0.62,
        metalness: 0.02,
        transparent: true,
        opacity: 0.24,
      }),
    },
  };
}

function interpolateTrack(progress: number, values: readonly number[]): number {
  const scaled = progress * (values.length - 1);
  const index = Math.min(Math.floor(scaled), values.length - 2);
  const amount = scaled >= values.length - 1 ? 1 : scaled - index;
  const eased = amount * amount * (3 - 2 * amount);

  return MathUtils.lerp(values[index], values[index + 1], eased);
}

function InvalidationBridge({
  onReady,
}: {
  onReady: (invalidate: (() => void) | null) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    onReady(invalidate);
    invalidate();

    return () => onReady(null);
  }, [invalidate, onReady]);

  return null;
}

function CalendarInstrument({
  progressRef,
  animatedProgressRef,
  initialProgressReadyRef,
  preferenceReadyRef,
  reducedMotionRef,
  forceStaticFrameRef,
  activeRef,
}: {
  progressRef: ProgressRef;
  animatedProgressRef: AnimatedProgressRef;
  initialProgressReadyRef: FlagRef;
  preferenceReadyRef: FlagRef;
  reducedMotionRef: MotionPreferenceRef;
  forceStaticFrameRef: FlagRef;
  activeRef: FlagRef;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const viewportWidth = useThree((state) => state.size.width);
  const narrow = viewportWidth < 520;
  const tablet = viewportWidth >= 520 && viewportWidth < 960;
  const worldPosition: [number, number, number] = narrow
    ? [0.75, -1.6, 0]
    : tablet
      ? [0.34, 0.05, 0]
      : [1.38, 0.05, 0];
  const worldScale = narrow ? 0.58 : tablet ? 0.86 : 1;
  const resources = useMemo(() => createInstrumentResources(), []);
  const sourcePathMaterialRef = useRef(resources.materials.sourcePath);
  const worldRef = useRef<Group>(null);
  const ringRef = useRef<Group>(null);
  const tickRingRef = useRef<Group>(null);
  const rearPageRef = useRef<Group>(null);
  const middlePageRef = useRef<Group>(null);
  const frontPageRef = useRef<Group>(null);

  useEffect(
    () => () => {
      Object.values(resources.geometries).forEach((geometry) => geometry.dispose());
      Object.values(resources.materials).forEach((material) => material.dispose());
    },
    [resources],
  );

  useFrame((_, delta) => {
    if (
      !worldRef.current ||
      !preferenceReadyRef.current ||
      !initialProgressReadyRef.current
    ) {
      return;
    }

    let progress: number;

    if (forceStaticFrameRef.current) {
      forceStaticFrameRef.current = false;
      animatedProgressRef.current = STATIC_PROGRESS;
      progress = STATIC_PROGRESS;
      if (
        reducedMotionRef.current !== true &&
        progressRef.current !== null &&
        activeRef.current
      ) {
        invalidate();
      }
    } else {
      const scrollProgress = progressRef.current;
      if (
        reducedMotionRef.current === true ||
        scrollProgress === null
      ) {
        animatedProgressRef.current = STATIC_PROGRESS;
      } else if (activeRef.current) {
        const safeDelta = Math.min(delta, 1 / 24);
        const blend = 1 - Math.exp(-7 * safeDelta);
        animatedProgressRef.current = MathUtils.lerp(
          animatedProgressRef.current,
          scrollProgress,
          blend,
        );

        if (Math.abs(scrollProgress - animatedProgressRef.current) < 0.0008) {
          animatedProgressRef.current = scrollProgress;
        } else {
          invalidate();
        }
      } else {
        // Hold the last pose offscreen and resume from it when the world is active.
      }

      progress = animatedProgressRef.current;
    }

    if (ringRef.current) {
      ringRef.current.rotation.set(
        interpolateTrack(progress, [0.02, 0.06, 0.24, 0.31, 0.02]),
        interpolateTrack(progress, [0, 0.1, 0.34, 0.22, 0]),
        interpolateTrack(progress, [0, 0.02, 0.09, -0.05, 0]),
      );
      ringRef.current.scale.setScalar(
        interpolateTrack(progress, [0.94, 1, 1.08, 1.04, 0.98]),
      );
    }

    if (tickRingRef.current) {
      tickRingRef.current.scale.setScalar(
        interpolateTrack(progress, [0.88, 1, 1.06, 1.1, 0.95]),
      );
    }

    const spread = interpolateTrack(progress, [0, 0.015, 0.29, 0.23, 0]);
    const pageTilt = interpolateTrack(progress, [0, 0.01, 0.14, 0.18, 0]);

    if (rearPageRef.current) {
      rearPageRef.current.position.set(-spread * 0.76, spread * 0.26, -0.34);
      rearPageRef.current.rotation.y = -pageTilt;
    }
    if (middlePageRef.current) {
      middlePageRef.current.position.set(spread * 0.08, 0, -0.27);
      middlePageRef.current.rotation.y = pageTilt * 0.5;
    }
    if (frontPageRef.current) {
      frontPageRef.current.position.set(spread * 0.82, -spread * 0.22, -0.2);
      frontPageRef.current.rotation.y = pageTilt;
    }

    sourcePathMaterialRef.current.opacity = interpolateTrack(progress, [
      0.18,
      0.22,
      0.42,
      0.92,
      0.24,
    ]);
  });

  return (
    <>
      <ambientLight color="#E7E4E7" intensity={0.75} />
      <directionalLight color="#FFF9F7" intensity={1.25} position={[3, 4, 6]} />
      <directionalLight color="#B95C76" intensity={0.35} position={[-4, -2, 2]} />
      <group
        ref={worldRef}
        dispose={null}
        position={worldPosition}
        scale={worldScale}
      >
        <group ref={rearPageRef} position={[0, 0, -0.34]}>
          <mesh
            geometry={resources.geometries.outerPage}
            material={resources.materials.outerPaper}
            rotation={[Math.PI / 2, 0, 0]}
          />
        </group>
        <group ref={middlePageRef} position={[0, 0, -0.27]}>
          <mesh
            geometry={resources.geometries.middlePage}
            material={resources.materials.middlePaper}
            rotation={[Math.PI / 2, 0, 0]}
          />
        </group>
        <group ref={frontPageRef} position={[0, 0, -0.2]}>
          <mesh
            geometry={resources.geometries.innerPage}
            material={resources.materials.innerPaper}
            rotation={[Math.PI / 2, 0, 0]}
          />
        </group>

        <mesh
          geometry={resources.geometries.sourcePath}
          material={resources.materials.sourcePath}
          position={[0, 0, -0.08]}
        />

        <group ref={ringRef} position={[0, 0, 0.12]} scale={0.98}>
          <mesh
            geometry={resources.geometries.outerRing}
            material={resources.materials.rose}
          />
          <mesh
            geometry={resources.geometries.innerRing}
            material={resources.materials.graphite}
          />
        </group>

        <group ref={tickRingRef} position={[0, 0, 0.15]} scale={0.95}>
          {Array.from({ length: 7 }, (_, index) => (
            <group key={index} rotation={[0, 0, (index / 7) * Math.PI * 2]}>
              <mesh
                geometry={resources.geometries.tick}
                material={resources.materials.graphite}
                position={[0, 1.16, 0]}
              />
            </group>
          ))}
        </group>
      </group>
    </>
  );
}

class WorldErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onError();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function CssInstrumentFallback() {
  return (
    <div className="chron-world-fallback" aria-hidden="true">
      <div className="chron-world-fallback__instrument">
        <div className="chron-world-fallback__paper chron-world-fallback__paper--rear" />
        <div className="chron-world-fallback__paper chron-world-fallback__paper--middle" />
        <div className="chron-world-fallback__paper chron-world-fallback__paper--front" />
        <div className="chron-world-fallback__ring">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
            <path d="M17 67 C27 58 34 62 43 52 S57 39 65 34 S77 27 84 22" />
          </svg>
        </div>
      </div>
    </div>
  );
}

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

    const syncActivity = () => {
      const nextActive =
        intersectingStops.size > 0 && document.visibilityState === "visible";
      if (activeRef.current === nextActive) return;

      activeRef.current = nextActive;
      if (nextActive) invalidateRef.current?.();
    };

    document.addEventListener("visibilitychange", syncActivity);

    if (storyStops.length === 0) {
      activeRef.current = false;
      return () => document.removeEventListener("visibilitychange", syncActivity);
    }

    if (typeof IntersectionObserver === "undefined") {
      activeRef.current = document.visibilityState === "visible";
      if (activeRef.current) invalidateRef.current?.();

      return () => {
        document.removeEventListener("visibilitychange", syncActivity);
        activeRef.current = false;
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

    return () => {
      observer.disconnect();
      intersectingStops.clear();
      document.removeEventListener("visibilitychange", syncActivity);
      activeRef.current = false;
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
