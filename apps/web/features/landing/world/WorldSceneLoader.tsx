"use client";

import dynamic from "next/dynamic";

const WorldLayer = dynamic(
  () => import("./WorldLayer").then((module) => module.WorldLayer),
  {
    ssr: false,
    loading: () => null,
  },
);

export function WorldSceneLoader() {
  return <WorldLayer />;
}
