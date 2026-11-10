/*
 * The light and dark switch both pages share. Sketches follow `data-theme` on `html`, or else the
 * system. The choice is kept in this browser only, under the key the playground always used, so
 * it carries over between the pages.
 */
const KEY = 'skeudo-playground:theme';

function saved(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function save(theme: string) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

function apply(theme: string | null) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

/** Applies the saved theme, and makes `button` switch between light and dark. */
export function setUpTheme(button: HTMLElement) {
  apply(saved());
  button.addEventListener('click', () => {
    const dark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    apply(next);
    save(next);
  });
}
