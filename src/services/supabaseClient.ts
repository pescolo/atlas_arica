import { createClient } from '@supabase/supabase-js';
import type { RoadHistoryEntry, RoadSegment, RoadSegmentStatus } from '../domain/roadEvents';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasSupabaseCredentials = Boolean(supabaseUrl?.trim() && supabaseAnonKey?.trim());

export const isSupabaseConfigured = hasSupabaseCredentials;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

const PHOTO_BUCKET = import.meta.env.VITE_SUPABASE_PHOTO_BUCKET || 'event-photos';

const SUPABASE_TIMEOUT_MS = 8000;

async function withSupabaseTimeout<T>(request: Promise<T>, action: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${action} superó el tiempo máximo de espera.`));
    }, SUPABASE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export type UserRole = 'admin' | 'supervisor' | 'operador' | 'viewer';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

function normalizeUserRole(value: unknown): UserRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'administrador') return 'admin';
  if (role === 'supervisor') return 'supervisor';
  if (role === 'operador' || role === 'operator') return 'operador';
  return 'viewer';
}

export async function signInWithSupabase(email: string, password: string) {
  if (!supabase) throw new Error('Servicio de datos no disponible.');

  const { data, error } = await withSupabaseTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    'El inicio de sesión'
  );
  if (error) throw error;
  return data.session;
}

export async function signUpWithSupabase(email: string, password: string, fullName: string) {
  if (!supabase) throw new Error('Servicio de datos no disponible.');

  const { data, error } = await withSupabaseTimeout(
    supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    }),
    'El registro'
  );

  if (error) throw error;
  return data;
}

export async function signOutFromSupabase(): Promise<void> {
  if (!supabase) return;

  const { error } = await withSupabaseTimeout(
    supabase.auth.signOut(),
    'El cierre de sesión'
  );
  if (error) throw error;
}

export async function getCurrentSupabaseSession() {
  if (!supabase) return null;

  const { data, error } = await withSupabaseTimeout(
    supabase.auth.getSession(),
    'La validación de sesión'
  );
  if (error) throw error;
  return data.session;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  if (!supabase) return null;

  const { data: userData, error: userError } = await withSupabaseTimeout(
    supabase.auth.getUser(),
    'La carga del usuario'
  );
  if (userError) throw userError;
  const user = userData.user;
  if (!user) return null;
  const metadataRole = normalizeUserRole(user.user_metadata?.role || user.app_metadata?.role);

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .single();

  if (error) {
    return {
      id: user.id,
      email: user.email ?? '',
      full_name: null,
      role: metadataRole,
    };
  }

  return {
    ...(data as UserProfile),
    role: normalizeUserRole((data as UserProfile).role),
  };
}

export async function uploadEventPhotos(files: File[], eventId: string): Promise<string[]> {
  if (!supabase || files.length === 0) return [];

  const uploadedUrls = await Promise.all(files.map(async (file, index) => {
    const extension = file.type === 'image/png' ? 'png' : 'jpg';
    const path = `${eventId}/${Date.now()}-${index}.${extension}`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, {
        cacheControl: '31536000',
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (error) throw error;

    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }));

  return uploadedUrls;
}

interface SupabaseRoadEventRow {
  id: string;
  event_code?: string | null;
  street_name?: string | null;
  sector?: string | null;
  severity?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
  repaired_at?: string | null;
  priority_score?: number | string | null;
  point_lat?: number | string | null;
  point_lng?: number | string | null;
  end_lat?: number | string | null;
  end_lng?: number | string | null;
  damage_type?: string | null;
  length_m?: number | string | null;
  width_m?: number | string | null;
  photos?: string[] | null;
  notes?: string | null;
  history?: Array<string | RoadHistoryEntry> | null;
}

const isRoadSegmentStatus = (value: string | null | undefined): value is RoadSegmentStatus => {
  return value === 'good' || value === 'warning' || value === 'critical' || value === 'repaired';
};

const mapSupabaseRowToSegment = (row: SupabaseRoadEventRow): RoadSegment => ({
  id: row.id,
  eventCode: row.event_code ?? undefined,
  street: row.street_name || 'Calle por asociar',
  sector: row.sector || 'SECTOR SIN CLASIFICAR',
  status: isRoadSegmentStatus(row.severity) ? row.severity : 'warning',
  date: String(row.captured_at || row.created_at || new Date().toISOString()).split('T')[0],
  repairedAt: row.repaired_at ? String(row.repaired_at).split('T')[0] : undefined,
  priority: Number(row.priority_score) || 0,
  coordinates: row.end_lat != null && row.end_lng != null
    ? [[Number(row.point_lat), Number(row.point_lng)], [Number(row.end_lat), Number(row.end_lng)]]
    : [[Number(row.point_lat), Number(row.point_lng)]],
  damageType: row.damage_type || 'Evento vial',
  length: Number(row.length_m) || 0,
  width: Number(row.width_m) || 0,
  image: row.photos?.[0],
  photos: row.photos ?? [],
  attachments: row.photos ?? [],
  locationReference: row.notes ?? row.street_name ?? undefined,
  history: row.history ?? [],
});

export async function loadRoadEventsFromSupabase(): Promise<RoadSegment[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('road_events')
    .select('*')
    .order('captured_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as SupabaseRoadEventRow[]).map(mapSupabaseRowToSegment);
}

export async function saveRoadEventToSupabase(segment: RoadSegment): Promise<void> {
  if (!supabase) return;

  const firstPoint = segment.coordinates?.[0];
  const lastPoint = segment.coordinates?.[segment.coordinates.length - 1];
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from('road_events').upsert({
    id: segment.id,
    event_code: segment.eventCode,
    created_by: userData.user?.id ?? null,
    severity: segment.status,
    damage_type: segment.damageType,
    length_m: segment.length,
    width_m: segment.width,
    priority_score: segment.priority,
    status: segment.status === 'repaired' ? 'repaired' : 'open',
    notes: segment.locationReference,
    captured_at: `${segment.date}T12:00:00`,
    repaired_at: segment.repairedAt ? `${segment.repairedAt}T12:00:00` : null,
    point_lat: firstPoint?.[0] ?? null,
    point_lng: firstPoint?.[1] ?? null,
    end_lat: lastPoint && lastPoint !== firstPoint ? lastPoint[0] : null,
    end_lng: lastPoint && lastPoint !== firstPoint ? lastPoint[1] : null,
    street_name: segment.street,
    sector: segment.sector,
    photos: segment.photos ?? [],
    history: segment.history ?? [],
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function deleteRoadEventFromSupabase(segmentId: string): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('road_events')
    .delete()
    .eq('id', segmentId);

  if (error) throw error;
}
