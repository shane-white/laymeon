/*
 * PROTOTYPE (throwaway): landing options for /prototype/landing?variant=B or D.
 * A copy of ../landing.tsx; the live page at / is untouched.
 */
import Link from "next/link";
import { GuideMap } from "./guide-map";
import { TicketBooth } from "../ticket-booth";
import { Tour } from "./tour";
import { Ride } from "./ride";
import { PrototypeSwitcher } from "./prototype-switcher";
import { VARIANTS, type VariantKey } from "./variants";
import { BRAND_NAME, Wordmark } from "../wordmark";
import styles from "../landing.module.css";

export function Landing({ variant }: { variant: VariantKey }) {
  const v = VARIANTS[variant];
  return (
    <div className={styles.page} data-proto-page>
      <header className={styles.nav}>
        <Link href="/" className={styles.navBrand} aria-label={`${BRAND_NAME} home`}>
          <Wordmark />
        </Link>
        <nav aria-label="Main" className={styles.navLinks}>
          <a href="#tour" className={styles.navLink}>
            How it works
          </a>
          <Link href="/login" className={styles.navLink}>
            Log in
          </Link>
          <Link href="/signup" className={styles.navCta}>
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title" className={styles.heroTitle}>
              Your next job is already in your story.
            </h1>
            <p className={styles.heroLede}>
              {BRAND_NAME}{" "}turns the resumes, cover letters and project write-ups you already
              have into one Career Story, then shows how you fit every job you&apos;re chasing,
              using only what you&apos;ve really done.
            </p>
            <TicketBooth />
          </div>
          <GuideMap layout={v.layout} />
        </section>

        <Ride from={v.layout} />
        <Tour />

        <section className={styles.promise} aria-labelledby="promise-title">
          <h2 id="promise-title" className={styles.promiseTitle}>
            Nothing invented.
          </h2>
          <div className={styles.promiseBody}>
            <p className={styles.promiseLede}>
              Generic AI writers fill a resume with experience that sounds right. {BRAND_NAME}{" "}
              works only from what you&apos;ve actually done.
            </p>
            <ul className={styles.rules}>
              <li>
                <strong>Every claim has a source.</strong> Evidence is quoted word for word from
                your own Documents.
              </li>
              <li>
                <strong>Gaps stay gaps.</strong> When a job asks for something you don&apos;t
                have, you hear it plainly, not a made-up bullet.
              </li>
              <li>
                <strong>You make every Decision.</strong> Nothing reaches your Resume until you
                accept it, and you can undo it.
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.close} aria-labelledby="close-title">
          <h2 id="close-title" className={styles.closeTitle}>
            Tomorrow&apos;s job starts with the one you&apos;re looking at today.
          </h2>
          <TicketBooth />
        </section>
      </main>

      <footer className={styles.footer}>
        <Wordmark />
        <nav aria-label="Footer" className={styles.footerLinks}>
          <Link href="/login">Log in</Link>
          <Link href="/signup">Sign up</Link>
        </nav>
        <p className={styles.footerNote}>
          Examples on this page are samples, not real people or jobs.
        </p>
      </footer>
      <PrototypeSwitcher current={variant} />
    </div>
  );
}
