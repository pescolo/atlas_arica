import type { RoadSegment, StreetReference } from '../domain/roadEvents';

interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: {
    name?: string;
  };
}

interface OverpassResponse {
  elements?: Array<OverpassNode | OverpassWay>;
}

let streetCache: StreetReference[] | null = null;

const STORAGE_KEY = 'atlas-arica-events-v1';
const OSM_REQUEST_TIMEOUT_MS = 7000;
const ARICA_BBOX = {
  south: -18.62,
  west: -70.42,
  north: -18.30,
  east: -70.05,
};

const isAricaUrbanCoordinate = ([lat, lng]: [number, number]): boolean => {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= ARICA_BBOX.south &&
    lat <= ARICA_BBOX.north &&
    lng >= ARICA_BBOX.west &&
    lng <= ARICA_BBOX.east;
};

const distanceBetween = (a: [number, number], b: [number, number]) => {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
};

const removeLongJumps = (coordinates: [number, number][]) => {
  return coordinates.filter((coord, index) => {
    if (index === 0) return true;
    return distanceBetween(coordinates[index - 1], coord) < 0.01;
  });
};

export function loadSegmentsFromStorage(): RoadSegment[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((segment) =>
      segment &&
      typeof segment.id === 'string' &&
      !segment.id.startsWith('osm-') &&
      Array.isArray(segment.coordinates) &&
      segment.coordinates.every(isAricaUrbanCoordinate)
    );
  } catch (error) {
    console.error('Error loading segments from storage:', error);
    return [];
  }
}

export function saveSegmentsToStorage(segments: RoadSegment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
  } catch (error) {
    console.error('Error saving segments to storage:', error);
  }
}

export async function fetchStreetReferencesFromOSM(forceRefresh = false): Promise<StreetReference[]> {
  if (streetCache && !forceRefresh) return streetCache;

  try {
    const query = `
      [out:json][timeout:25];
      (
        way["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|primary_link|secondary_link|tertiary_link)$"]["name"](${ARICA_BBOX.south},${ARICA_BBOX.west},${ARICA_BBOX.north},${ARICA_BBOX.east});
      );
      out body;
      >;
      out skel qt;
    `;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), OSM_REQUEST_TIMEOUT_MS);

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    window.clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Overpass error: ${response.status}`);
    }

    const data = await response.json() as OverpassResponse;
    streetCache = processOSMData(data);
    return streetCache;
  } catch (error) {
    console.error('Error fetching streets from OSM:', error);
    streetCache = [];
    return [];
  }
}

function processOSMData(data: OverpassResponse): StreetReference[] {
  const nodesMap = new Map<number, [number, number]>();
  const elements = data.elements ?? [];
  const ways = elements.filter(
    (element): element is OverpassWay => element.type === 'way' && Boolean(element.tags?.name),
  );

  elements
    .filter((element): element is OverpassNode => element.type === 'node')
    .forEach((element) => {
      nodesMap.set(element.id, [element.lat, element.lon]);
    });

  return ways
    .map((way) => {
      const coordinates = removeLongJumps(
        way.nodes
          .map((nodeId: number) => nodesMap.get(nodeId))
          .filter((coordinate): coordinate is [number, number] => Boolean(coordinate))
          .filter(isAricaUrbanCoordinate) as [number, number][]
      );

      if (coordinates.length < 2) return null;

      return {
        id: `osm-${way.id}`,
        street: way.tags?.name ?? 'Calle sin nombre',
        sector: determineSector(coordinates[0]),
        coordinates,
      };
    })
    .filter((street): street is StreetReference => Boolean(street));
}

function determineSector([lat, lng]: [number, number]): string {
  if (lat > -18.475) {
    return lng < -70.31 ? 'SECTOR COSTANERA' : 'SECTOR NORTE';
  }

  if (lat < -18.49) return 'SECTOR SUR';
  return 'SECTOR CENTRO';
}

export function clearStreetCache(): void {
  streetCache = null;
}
