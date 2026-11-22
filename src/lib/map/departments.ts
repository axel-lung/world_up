import geometry from './france-departments.json';

// The departments drawn on the map of France (scripts/build_france_map.py):
// the metropolitan ones in place, the five overseas ones as insets. Their
// contours are IGN's Admin Express COG, credited on /credits.

export interface DepartmentShape {
  code: string;
  name: string;
  /** SVG path in the drawing's units. */
  d: string;
  /** West, south, east, north: where "Zoomer" takes the map. */
  bbox: [number, number, number, number];
}

export interface Inset extends DepartmentShape {
  width: number;
  height: number;
}

export const FRANCE = geometry as {
  attribution: string;
  metro: { width: number; height: number; departments: DepartmentShape[] };
  overseas: Inset[];
};

const BY_CODE = new Map<string, DepartmentShape>([...FRANCE.metro.departments, ...FRANCE.overseas].map((d) => [d.code, d]));

/** A department drawn on the map, by its code ("21", "2A", "974"). */
export function departmentShape(code: string): DepartmentShape | null {
  return BY_CODE.get(code) ?? null;
}

// The overseas collectivities have monuments too, but no shape on the map
const COLLECTIVITIES: Record<string, string> = {
  '975': 'Saint-Pierre-et-Miquelon',
  '977': 'Saint-Barthélemy',
  '978': 'Saint-Martin',
  '986': 'Wallis-et-Futuna',
  '987': 'Polynésie française',
  '988': 'Nouvelle-Calédonie',
};

/** The name of a department or overseas collectivity, null when unknown. */
export function departmentName(code: string | null): string | null {
  return code ? (BY_CODE.get(code)?.name ?? COLLECTIVITIES[code] ?? null) : null;
}

/** A department code as the address carries it: two characters (2A, 2B) or three overseas. */
export const DEPARTMENT_CODE = /^(\d{2}|2[AB]|9[78]\d)$/;
