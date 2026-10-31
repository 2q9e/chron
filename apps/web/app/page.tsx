import { LandingStory } from "../features/landing/presentation/landing-story";
import { WorldSceneLoader } from "../features/landing/world/WorldSceneLoader";

export default function HomePage() {
  return (
    <>
      <WorldSceneLoader />
      <LandingStory />
    </>
  );
}
