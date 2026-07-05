import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../styles/leaflet-custom.css';

// Fix for default marker icons in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import type { RoadSegment, SegmentAddPayload } from '../../domain/roadEvents';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface AricaMapProps {
  segments: RoadSegment[];
  onSegmentClick: (segment: RoadSegment) => void;
  onSegmentAdd?: (payload: SegmentAddPayload) => void;
  onSegmentDelete?: (segmentId: string) => void;
  selectedSegmentId?: string;
  focusRequest?: { segmentId: string; requestId: number } | null;
  editMode?: boolean;
}

// Función pura para color de estado
const getStatusColor = (status: RoadSegment['status']): string => {
  switch (status) {
    case 'critical': return '#EF4444';
    case 'warning': return '#F59E0B';
    case 'good': return '#10B981';
    case 'repaired': return '#6B7280';
  }
};

// Función pura para texto de estado
const getStatusText = (status: RoadSegment['status']): string => {
  switch (status) {
    case 'critical': return 'Crítico';
    case 'warning': return 'Deterioro Inicial';
    case 'good': return 'Bueno';
    case 'repaired': return 'Reparado';
  }
};

const ARICA_WORK_AREA = {
  south: -18.62,
  west: -70.42,
  north: -18.30,
  east: -70.05,
};

const ARICA_WORK_BOUNDS = L.latLngBounds(
  [ARICA_WORK_AREA.south, ARICA_WORK_AREA.west],
  [ARICA_WORK_AREA.north, ARICA_WORK_AREA.east],
);

const isValidAricaCoordinate = ([lat, lng]: [number, number]): boolean => {
  return !isNaN(lat) && !isNaN(lng) &&
         lat >= ARICA_WORK_AREA.south && lat <= ARICA_WORK_AREA.north &&
         lng >= ARICA_WORK_AREA.west && lng <= ARICA_WORK_AREA.east;
};

const ARICA_CENTER: [number, number] = [-18.4870, -70.2890];
const ARICA_INITIAL_ZOOM = 13;
const MIN_DRAW_PIXELS = 14;
const LONG_PRESS_MS = 380;

const getEventCode = (segment: RoadSegment): string => {
  if (segment.eventCode) return segment.eventCode;
  if (segment.id.startsWith('report-')) return `EV-${segment.id.replace('report-', '').slice(-6)}`;
  if (segment.id.startsWith('import-')) return `EV-IMP-${segment.id.split('-').slice(-1)[0]}`;
  return `EV-${segment.id.slice(-6).toUpperCase()}`;
};

const getEventReference = (segment: RoadSegment): string => {
  return segment.locationReference || segment.street || 'Sin referencia vial';
};

const formatDateKey = (dateKey: string): string => {
  if (!dateKey) return 'Sin fecha';
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('es-CL');
};

const getHistoryPreview = (segment: RoadSegment): string => {
  const entry = segment.history?.[0];
  if (!entry) return 'Sin historial';
  return typeof entry === 'string' ? entry : entry.label;
};

export const AricaMap = React.memo(function AricaMap({ 
  segments, 
  onSegmentClick, 
  onSegmentAdd,
  onSegmentDelete,
  selectedSegmentId, 
  focusRequest,
  editMode = false 
}: AricaMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const segmentLayersRef = useRef<Map<string, L.Polyline | L.CircleMarker>>(new Map());
  const draftLineRef = useRef<L.Polyline | null>(null);
  const draftPointRef = useRef<L.CircleMarker | null>(null);
  const drawStartRef = useRef<{ latlng: L.LatLng; point: L.Point; startedAt: number } | null>(null);
  const prevSegmentsRef = useRef<RoadSegment[]>([]);
  const prevSelectedIdRef = useRef<string | undefined>(undefined);
  const isInitialLoadRef = useRef(true);
  const skipNextSelectedFocusRef = useRef(false);
  const lastFocusRequestIdRef = useRef<number | null>(null);

  // Memoizar popup content factory para evitar recrear strings
  const createPopupContent = useCallback((segment: RoadSegment) => {
    return `
      <div style="min-width: 200px;">
        ${segment.image || segment.photos?.[0] ? `<img src="${segment.image ?? segment.photos?.[0]}" alt="Evidencia" style="width: 100%; height: 96px; object-fit: cover; border-radius: 6px; margin-bottom: 8px;" />` : ''}
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${getEventCode(segment)} · ${segment.damageType}</h3>
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #666;">${getEventReference(segment)}</p>
        <p style="margin: 0 0 4px 0; font-size: 11px; color: #777;">Calle referencial: ${segment.street}</p>
        <div style="margin-top: 8px; font-size: 12px;">
          <div style="margin-bottom: 4px;">
            <strong>Estado:</strong> ${getStatusText(segment.status)}
          </div>
          <div style="margin-bottom: 4px;">
            <strong>Tipo:</strong> ${segment.damageType}
          </div>
          <div style="margin-bottom: 4px;">
            <strong>Dimensiones:</strong> ${segment.length}m × ${segment.width}m
          </div>
          <div>
            <strong>Prioridad:</strong> ${segment.priority.toFixed(1)}/10
          </div>
          <div style="margin-top: 4px;">
            <strong>Fecha:</strong> ${formatDateKey(segment.date)}
          </div>
          <div style="margin-top: 4px;">
            <strong>Historial:</strong> ${getHistoryPreview(segment)}
          </div>
          <div style="margin-top: 4px;">
            <strong>Adjuntos:</strong> ${segment.attachments?.length ?? segment.photos?.length ?? 0}
          </div>
        </div>
      </div>
    `;
  }, []);

  const getSegmentStyle = useCallback((segment: RoadSegment, isSelected: boolean) => {
    const color = getStatusColor(segment.status);
    return {
      color,
      weight: isSelected ? 10 : 8,
      opacity: isSelected ? 1 : 0.7,
    };
  }, []);

  const styleSegmentLayer = useCallback((layer: L.Polyline | L.CircleMarker, segment: RoadSegment, isSelected: boolean) => {
    const color = getStatusColor(segment.status);

    if (layer instanceof L.CircleMarker) {
      layer.setRadius(isSelected ? 9 : 7);
      layer.setStyle({
        color,
        weight: isSelected ? 3 : 2,
        opacity: isSelected ? 1 : 0.9,
        fillColor: color,
        fillOpacity: isSelected ? 0.85 : 0.65,
      });
      return;
    }

    layer.setStyle(getSegmentStyle(segment, isSelected));
  }, [getSegmentStyle]);

  const createSegmentLayer = useCallback((segment: RoadSegment, validCoords: [number, number][], isSelected: boolean) => {
    const color = getStatusColor(segment.status);
    const shouldDrawAsLine = validCoords.length > 1;

    if (shouldDrawAsLine) {
      return L.polyline(validCoords, {
        color,
        weight: isSelected ? 8 : 6,
        opacity: isSelected ? 1 : 0.82,
      });
    }

    const eventCoord = validCoords[Math.floor(validCoords.length / 2)];

    return L.circleMarker(eventCoord, {
      radius: isSelected ? 10 : 7,
      color,
      weight: isSelected ? 3 : 2,
      opacity: isSelected ? 1 : 0.9,
      fillColor: color,
      fillOpacity: isSelected ? 0.9 : 0.7,
    });
  }, []);

  const focusSegment = useCallback((map: L.Map, coords: [number, number][]) => {
    const eventCoord = coords[Math.floor(coords.length / 2)];
    if (!eventCoord) return;

    map.flyTo(eventCoord, Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.6,
    });
  }, []);

  const focusClickedPoint = useCallback((map: L.Map, event: L.LeafletMouseEvent) => {
    map.setZoomAround(event.containerPoint, Math.max(map.getZoom(), 17), {
      animate: false,
    });
  }, []);

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
      maxBounds: ARICA_WORK_BOUNDS,
      maxBoundsViscosity: 0.9,
      minZoom: 10,
    }).setView(ARICA_CENTER, ARICA_INITIAL_ZOOM);
    map.setMaxBounds(ARICA_WORK_BOUNDS);

    // Tile layer más detallado y optimizado (CartoDB Voyager)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    window.setTimeout(() => map.invalidateSize(), 250);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Actualizar segmentos en el mapa - optimizado para solo actualizar cambios
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;
    const currentSegments = segments;
    const currentSelectedId = selectedSegmentId;
    const prevSegments = prevSegmentsRef.current;
    const prevSelectedId = prevSelectedIdRef.current;

    segmentLayersRef.current.forEach(layer => layer.remove());
    segmentLayersRef.current.clear();

    currentSegments.forEach((segment) => {
      const validCoords = segment.coordinates.filter(isValidAricaCoordinate);

      if (validCoords.length < 1) return;

      const isSelected = segment.id === currentSelectedId;
      const layer = createSegmentLayer(segment, validCoords, isSelected).addTo(map);

      layer.bindPopup(createPopupContent(segment), {
        autoPan: false,
      });

      layer.on('click', (event) => {
        if (!editMode) {
          skipNextSelectedFocusRef.current = true;
          onSegmentClick(segment);
          focusClickedPoint(map, event);
          layer.openPopup(event.latlng);
        }
      });

      if (editMode) {
        layer.on('contextmenu', (event) => {
          event.originalEvent.preventDefault();
          if (onSegmentDelete && confirm(`¿Eliminar registro en ${segment.street}?`)) {
            onSegmentDelete(segment.id);
          }
        });
      }

      layer.on('mouseover', () => {
        if (layer instanceof L.CircleMarker) {
          layer.setRadius(10);
          layer.setStyle({ opacity: 1, fillOpacity: 0.9 });
        } else {
          layer.setStyle({ weight: 12, opacity: 1 });
        }
      });

      layer.on('mouseout', () => {
        const isNowSelected = segment.id === currentSelectedId;
        styleSegmentLayer(layer, segment, isNowSelected);
      });

      segmentLayersRef.current.set(segment.id, layer);
    });

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      map.setView(ARICA_CENTER, ARICA_INITIAL_ZOOM);
    }

    prevSegmentsRef.current = currentSegments;
    prevSelectedIdRef.current = currentSelectedId;
    return;

    // En la carga inicial, renderizar todo
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevSegmentsRef.current = currentSegments;
      prevSelectedIdRef.current = currentSelectedId;

      // Limpiar capas existentes
      segmentLayersRef.current.forEach(layer => layer.remove());
      segmentLayersRef.current.clear();

      if (currentSegments.length === 0) return;

      // Agregar segmentos al mapa
      currentSegments.forEach((segment) => {
        const validCoords = segment.coordinates.filter(isValidAricaCoordinate);

        if (validCoords.length < 1) return;

        const isSelected = segment.id === currentSelectedId;
        const polyline = createSegmentLayer(segment, validCoords, isSelected).addTo(map);

        polyline.bindPopup(createPopupContent(segment));

      polyline.on('click', (event) => {
        if (!editMode) {
          skipNextSelectedFocusRef.current = true;
          onSegmentClick(segment);
          focusClickedPoint(map, event);
          polyline.openPopup();
        }
      });

      // Click derecho para eliminar en modo edición
      if (editMode) {
        polyline.on('contextmenu', (e) => {
          e.originalEvent.preventDefault();
          if (onSegmentDelete && confirm(`¿Eliminar bache en ${segment.street}?`)) {
            onSegmentDelete(segment.id);
          }
        });
      }

        polyline.on('mouseover', () => {
          if (polyline instanceof L.CircleMarker) {
            polyline.setRadius(10);
            polyline.setStyle({ opacity: 1, fillOpacity: 0.9 });
          } else {
            polyline.setStyle({ weight: 12, opacity: 1 });
          }
        });

        polyline.on('mouseout', () => {
          const isNowSelected = segment.id === currentSelectedId;
          styleSegmentLayer(polyline, segment, isNowSelected);
        });

        segmentLayersRef.current.set(segment.id, polyline);
      });

      // Ajustar vista solo en carga inicial
      const allCoords = currentSegments.flatMap(s => s.coordinates);
      if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [50, 50] });
      }

      return;
    }

    // Actualizaciones subsecuentes: solo actualizar selección y segmentos cambiados
    const prevIds = new Set(prevSegments.map(s => s.id));
    const currentIds = new Set(currentSegments.map(s => s.id));

    // Remover segmentos que ya no existen
    prevIds.forEach(id => {
      if (!currentIds.has(id)) {
        const layer = segmentLayersRef.current.get(id);
        if (layer) {
          layer.remove();
          segmentLayersRef.current.delete(id);
        }
      }
    });

    // Agregar o actualizar segmentos
    currentSegments.forEach((segment) => {
      const existingLayer = segmentLayersRef.current.get(segment.id);
      const validCoords = segment.coordinates.filter(isValidAricaCoordinate);

      if (validCoords.length < 1) {
        if (existingLayer) {
          existingLayer.remove();
          segmentLayersRef.current.delete(segment.id);
        }
        return;
      }

      const isSelected = segment.id === currentSelectedId;

      if (existingLayer) {
        // Actualizar estilo si cambió la selección
        styleSegmentLayer(existingLayer, segment, isSelected);
      } else {
        // Crear nuevo segmento
        const polyline = createSegmentLayer(segment, validCoords, isSelected).addTo(map);

        polyline.bindPopup(createPopupContent(segment));

        polyline.on('click', (event) => {
          skipNextSelectedFocusRef.current = true;
          onSegmentClick(segment);
          focusClickedPoint(map, event);
          polyline.openPopup();
        });

        polyline.on('mouseover', () => {
          if (polyline instanceof L.CircleMarker) {
            polyline.setRadius(10);
            polyline.setStyle({ opacity: 1, fillOpacity: 0.9 });
          } else {
            polyline.setStyle({ weight: 12, opacity: 1 });
          }
        });

        polyline.on('mouseout', () => {
          const isNowSelected = segment.id === currentSelectedId;
          styleSegmentLayer(polyline, segment, isNowSelected);
        });

        segmentLayersRef.current.set(segment.id, polyline);
      }
    });

    // Actualizar referencias
    prevSegmentsRef.current = currentSegments;
    prevSelectedIdRef.current = currentSelectedId;
  }, [segments, selectedSegmentId, onSegmentClick, onSegmentDelete, editMode, createPopupContent, createSegmentLayer, focusClickedPoint, focusSegment, styleSegmentLayer]);

  useEffect(() => {
    if (!mapRef.current || !focusRequest) return;
    if (lastFocusRequestIdRef.current === focusRequest.requestId) return;

    const segment = segments.find(item => item.id === focusRequest.segmentId);
    if (!segment) return;
    lastFocusRequestIdRef.current = focusRequest.requestId;

    const validCoords = segment.coordinates.filter(isValidAricaCoordinate);
    if (validCoords.length === 0) return;

    const map = mapRef.current;
    const popupLatLng = validCoords.length === 1
      ? L.latLng(validCoords[0])
      : L.latLngBounds(validCoords).getCenter();

    focusSegment(map, validCoords);
    window.setTimeout(() => {
      segmentLayersRef.current.get(segment.id)?.openPopup(popupLatLng);
    }, 350);
  }, [focusRequest?.requestId, focusSegment]);

  // Modo edicion: click corto crea punto; arrastrar crea tramo.
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    const clearDraft = () => {
      draftLineRef.current?.remove();
      draftPointRef.current?.remove();
      draftLineRef.current = null;
      draftPointRef.current = null;
      drawStartRef.current = null;
    };

    if (editMode) {
      map.dragging.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.dragging.enable();
      map.getContainer().style.cursor = '';
      clearDraft();
    }

    const handleMouseDown = (event: L.LeafletMouseEvent) => {
      if (!editMode || !onSegmentAdd) return;

      drawStartRef.current = {
        latlng: event.latlng,
        point: event.containerPoint,
        startedAt: Date.now(),
      };

      draftPointRef.current = L.circleMarker(event.latlng, {
        radius: 6,
        color: '#2563EB',
        weight: 2,
        fillColor: '#2563EB',
        fillOpacity: 0.7,
      }).addTo(map);
    };

    const handleMouseMove = (event: L.LeafletMouseEvent) => {
      const start = drawStartRef.current;
      if (!editMode || !start) return;

      const movedEnough = event.containerPoint.distanceTo(start.point) >= MIN_DRAW_PIXELS;
      if (!movedEnough) return;

      const points: [L.LatLng, L.LatLng] = [start.latlng, event.latlng];
      if (!draftLineRef.current) {
        draftLineRef.current = L.polyline(points, {
          color: '#2563EB',
          weight: 5,
          opacity: 0.85,
          dashArray: '6 6',
        }).addTo(map);
      } else {
        draftLineRef.current.setLatLngs(points);
      }
    };

    const handleMouseUp = (event: L.LeafletMouseEvent) => {
      const start = drawStartRef.current;
      if (!editMode || !onSegmentAdd || !start) return;

      const movedPixels = event.containerPoint.distanceTo(start.point);
      const heldMs = Date.now() - start.startedAt;
      const shouldCreateLine = movedPixels >= MIN_DRAW_PIXELS || heldMs >= LONG_PRESS_MS;
      const startCoord: [number, number] = [start.latlng.lat, start.latlng.lng];
      const endCoord: [number, number] = [event.latlng.lat, event.latlng.lng];

      onSegmentAdd({
        coordinates: shouldCreateLine ? [startCoord, endCoord] : [startCoord],
      });

      clearDraft();
    };

    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);

    return () => {
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      clearDraft();
      map.dragging.enable();
    };
  }, [editMode, onSegmentAdd]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full"
      style={{ minHeight: '400px' }}
    />
  );
});
