import type { LatLon } from '@/lib/map/geo';

/**
 * The phone's maps app on its way to a point: Android's geo: address (the
 * app passes it on too), Apple Plans on an iPhone, OpenStreetMap elsewhere.
 */
export function directionsUrl([lat, lon]: LatLon, name: string): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(agent)) return `geo:0,0?q=${lat},${lon}(${encodeURIComponent(name)})`;
  if (/iPhone|iPad|iPod/i.test(agent)) return `https://maps.apple.com/?daddr=${lat},${lon}`;
  return `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lon}`;
}
