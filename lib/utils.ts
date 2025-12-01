// Simple class name joiner to match the `cn` helper expected by some UI snippets.
export function cn(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}
