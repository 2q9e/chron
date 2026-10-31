import { StoryProgressBridge } from "./story-progress-bridge";
import styles from "./landing-story.module.css";

export function LandingStory() {
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
      </a>

      <div className={styles.pageFrame}>
        <header className={styles.siteHeader}>
          <a className={styles.wordmark} href="#threshold" aria-label="Chron, back to the start">
            Chron
          </a>

          <nav className={styles.storyNavigation} aria-label="Story navigation">
            <a href="#week">Week</a>
            <a href="#study">Study</a>
            <a href="#research">Research</a>
            <a href="#close">Close</a>
          </nav>
        </header>

        <main className={styles.story} id="main-content" tabIndex={-1}>
          <section
            className={`${styles.section} ${styles.threshold}`}
            id="threshold"
            data-world-stop="threshold"
            aria-labelledby="threshold-heading"
          >
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Academic workspace · Being built</p>
              <h1 className={styles.heroHeading} id="threshold-heading">
                Make room for learning.
              </h1>
              <p className={styles.lede}>
                Chron is being built as an academic workspace for planning, study materials, and
                research.
              </p>
              <a className={styles.primaryLink} href="#week">
                Explore Chron
                <span aria-hidden="true">↘</span>
              </a>
            </div>

            <figure className={styles.worldStill} data-world-fallback aria-hidden="true">
              <svg className={styles.instrument} viewBox="0 0 520 520" role="presentation">
                <circle className={styles.instrumentOuter} cx="260" cy="260" r="204" />
                <circle className={styles.instrumentMiddle} cx="260" cy="260" r="158" />
                <circle className={styles.instrumentInner} cx="260" cy="260" r="86" />
                <ellipse className={styles.instrumentOrbit} cx="260" cy="260" rx="217" ry="75" />
                <g className={styles.weekMarks}>
                  <path d="M260 29v34" />
                  <path d="M260 29v34" transform="rotate(51.43 260 260)" />
                  <path d="M260 29v34" transform="rotate(102.86 260 260)" />
                  <path d="M260 29v34" transform="rotate(154.29 260 260)" />
                  <path d="M260 29v34" transform="rotate(205.71 260 260)" />
                  <path d="M260 29v34" transform="rotate(257.14 260 260)" />
                  <path d="M260 29v34" transform="rotate(308.57 260 260)" />
                </g>
                <path className={styles.instrumentCut} d="M224 248h72M260 212v96" />
              </svg>
            </figure>
          </section>

          <section
            className={`${styles.section} ${styles.week}`}
            id="week"
            data-world-stop="week"
            aria-labelledby="week-heading"
          >
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>One week · Shared time</p>
              <h2 className={styles.sectionHeading} id="week-heading">
                Start with the week.
              </h2>
              <p className={styles.sectionText}>
                Classes, deadlines, and focused study all depend on the same limited hours. Chron
                is designed around that shared calendar.
              </p>
            </div>
          </section>

          <section
            className={`${styles.section} ${styles.study}`}
            id="study"
            data-world-stop="study"
            aria-labelledby="study-heading"
          >
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Study · Material</p>
              <h2 className={styles.sectionHeading} id="study-heading">
                Keep study connected to its source.
              </h2>
              <p className={styles.sectionText}>
                Notes, questions, and review are part of one learning process. Chron is being built
                to keep that work organized around the material a learner brings.
              </p>
            </div>
          </section>

          <section
            className={`${styles.section} ${styles.research}`}
            id="research"
            data-world-stop="research"
            aria-labelledby="research-heading"
          >
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Research · Context</p>
              <h2 className={styles.sectionHeading} id="research-heading">
                Follow the evidence.
              </h2>
              <p className={styles.sectionText}>
                Research belongs beside the sources and documents that support it. Chron&apos;s
                product direction keeps that context visible.
              </p>
            </div>
          </section>

          <section
            className={`${styles.section} ${styles.close}`}
            id="close"
            data-world-stop="close"
            aria-labelledby="close-heading"
          >
            <div className={styles.sectionCopy}>
              <p className={styles.eyebrow}>Chron · In progress</p>
              <h2 className={styles.sectionHeading} id="close-heading">
                Time, study, and research in one story.
              </h2>
              <p className={styles.sectionText}>
                Chron is being built to bring the parts of academic work into one considered
                workspace.
              </p>
            </div>
          </section>

          <StoryProgressBridge />
        </main>
      </div>
    </>
  );
}
