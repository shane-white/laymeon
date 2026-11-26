import styles from "./landing.module.css";

/**
 * The product name as the wordmark draws it. Change it here to try
 * "LAYMEON" or "Lay Me On"; every marketing surface reads this constant.
 */
export const BRAND_NAME = "LayMeOn";

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={`${styles.wordmark} ${size === "lg" ? styles.wordmarkLg : ""}`}
    >
      {BRAND_NAME}
    </span>
  );
}
