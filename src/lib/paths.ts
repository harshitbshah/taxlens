import path from "path";

// path.relative-based rather than startsWith(): "/srv/app2" must not count as inside "/srv/app".
export function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
