/** Always returns [smaller, larger] by string comparison, so a symmetric
 * relationship (A-B is the same as B-A) can't be stored as two different rows. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
