/** Put a value in the map, dropping its oldest entry first when full (a Map keeps insertion order),
 *  so a cache keyed by whatever people type cannot grow without bound. */
export function remember<K, V>(map: Map<K, V>, key: K, value: V, max = 200): void {
  if (map.size >= max && !map.has(key)) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}
