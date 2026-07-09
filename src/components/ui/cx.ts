/** Tiny classname joiner — drops falsy values. Avoids a clsx/tailwind-merge dep
 *  (we author class strings by hand, so there are no conflicts to resolve). */
export function cx(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(' ');
}
