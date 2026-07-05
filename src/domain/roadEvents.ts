export type RoadSegmentStatus = 'good' | 'warning' | 'critical' | 'repaired';

export interface RoadHistoryEntry {
  date: string;
  action: 'created' | 'updated' | 'repaired' | 'imported';
  label: string;
  status: RoadSegmentStatus;
  priority: number;
}

export interface RoadSegment {
  id: string;
  eventCode?: string;
  street: string;
  sector: string;
  status: RoadSegmentStatus;
  date: string;
  repairedAt?: string;
  priority: number;
  coordinates: [number, number][];
  damageType: string;
  image?: string;
  photos?: string[];
  history?: Array<string | RoadHistoryEntry>;
  attachments?: string[];
  locationReference?: string;
  length: number;
  width: number;
}

export interface StreetReference {
  id: string;
  street: string;
  sector: string;
  coordinates: [number, number][];
}

export interface SegmentAddPayload {
  coordinates: [number, number][];
}

export interface NewRoadEventInput {
  street: string;
  sector: string;
  damageType: string;
  severity: string;
  description: string;
  photos: string[];
  photoFiles: File[];
  segmentLength: string;
  segmentWidth: string;
  startReference: string;
  startLat: string;
  startLng: string;
  gpsCoords: {
    start: { lat: number; lng: number };
    end: null;
  };
  timestamp: string;
  segmentType: 'road_section';
}
