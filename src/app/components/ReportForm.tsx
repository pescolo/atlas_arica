import { useState } from 'react';
import { Camera, MapPin, X, Ruler, ArrowRight } from 'lucide-react';
import { GeoLocationHelper } from './GeoLocationHelper';
import type { NewRoadEventInput } from '../../domain/roadEvents';
import { compressPhoto } from '../../utils/images';

interface ReportFormProps {
  onClose: () => void;
  onSubmit: (data: NewRoadEventInput) => void;
  streetOptions?: string[];
}

const fallbackStreetOptions = [
  'Av. Comandante San Martin',
  'Av. 21 de Mayo',
  'Av. General Velasquez',
  'Av. Diego Portales',
  'Av. Santa Maria',
  'Av. Capitan Avalos',
  'Av. Maximo Lira',
  'Av. Arturo Prat',
  'Av. Argentina',
  'Av. Azolas',
  'Av. Alejandro Azolas',
  'Av. Luis Beretta Porcel',
  'Av. Santiago Arata',
  'Av. Tucapel',
  'Av. Las Acacias',
  'Av. Renato Rocca',
  'Calle Sotomayor',
  'Calle Patricio Lynch',
  'Calle Baquedano',
  'Calle Colon',
  'Calle 18 de Septiembre',
  'Calle Yungay',
  'Calle Maipu',
  'Calle San Marcos',
  'Calle Chacabuco',
  'Calle Bolognesi',
  'Calle Blanco Encalada',
  'Calle Juan Noe',
  'Calle Rafael Sotomayor',
];

export function ReportForm({ onClose, onSubmit, streetOptions = [] }: ReportFormProps) {
  const availableStreets = streetOptions.length > 0 ? streetOptions : fallbackStreetOptions;
  const canUseBrowserGps = typeof window !== 'undefined' && window.isSecureContext;
  const [formData, setFormData] = useState({
    street: '',
    sector: 'SECTOR CENTRO',
    damageType: '',
    severity: 'leve',
    description: '',
    photos: [] as string[],
    segmentLength: '',
    segmentWidth: '',
    startReference: '',
    startLat: '',
    startLng: '',
  });
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ start: { lat: number; lng: number } | null }>({ start: null });
  const [captureMode, setCaptureMode] = useState<'start' | null>(null);
  const [useSimulatedGPS, setUseSimulatedGPS] = useState(false);
  const [gpsError, setGpsError] = useState('');

  const handlePhotoCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setIsCompressingPhotos(true);
    try {
      const compressedPhotos = await Promise.all(files.map(compressPhoto));
      const nextPreviews = [...photoPreviews, ...compressedPhotos.map(photo => photo.preview)];
      const nextFiles = [...photoFiles, ...compressedPhotos.map(photo => photo.file)];
      setPhotoPreviews(nextPreviews);
      setPhotoFiles(nextFiles);
      setFormData({ ...formData, photos: nextPreviews });
    } catch (error) {
      console.error('Error compressing photos:', error);
      alert('No se pudieron comprimir las imagenes. Intenta con otro archivo.');
    } finally {
      setIsCompressingPhotos(false);
      event.target.value = '';
    }
  };

  const setReferenceCoordinate = () => {
    setGpsCoords({ start: { lat: -18.4755, lng: -70.3120 } });
    setUseSimulatedGPS(true);
    setGpsError('');
    setCaptureMode(null);
  };

  const handleCaptureLocation = () => {
    if (!canUseBrowserGps) {
      setGpsError('GPS no disponible en esta conexión. Para usar GPS abre la app como localhost en el PC, o ingresa la coordenada manualmente/dibuja el evento en el mapa.');
      setCaptureMode(null);
      return;
    }

    setCaptureMode('start');

    if (!navigator.geolocation) {
      setReferenceCoordinate();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsCoords({
          start: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
        setUseSimulatedGPS(false);
        setGpsError('');
        setCaptureMode(null);
      },
      (error) => {
        console.error('Error getting location:', error);
        const message = error.code === error.PERMISSION_DENIED
          ? 'GPS bloqueado por el navegador. Puedes habilitar ubicación, escribir latitud/longitud o dibujar el evento en el mapa.'
          : 'No se pudo obtener el GPS. Puedes escribir latitud/longitud, usar la referencia de Arica o dibujar el evento en el mapa.';
        setGpsError(message);
        setCaptureMode(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const manualStart = formData.startLat && formData.startLng
      ? { lat: Number(formData.startLat), lng: Number(formData.startLng) }
      : null;
    const start = manualStart ?? gpsCoords.start;

    if (!start || !Number.isFinite(start.lat) || !Number.isFinite(start.lng)) {
      alert('Ingresa latitud/longitud, captura GPS, usa la referencia de Arica o dibuja el evento en el mapa.');
      return;
    }

    onSubmit({
      ...formData,
      photoFiles,
      gpsCoords: {
        start,
        end: null,
      },
      timestamp: new Date().toISOString(),
      segmentType: 'road_section',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-4">
          <h2 className="text-lg font-bold text-gray-900">Nuevo reporte vial</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 font-semibold text-gray-900">
              <MapPin className="h-5 w-5" />
              Ubicacion del evento
            </h3>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Calle referencial</label>
              <input
                type="text"
                value={formData.street}
                onChange={(event) => setFormData({ ...formData, street: event.target.value })}
                placeholder="Escribe para buscar una calle"
                list="arica-streets"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="arica-streets">
                {availableStreets.map((street) => (
                  <option key={street} value={street} />
                ))}
              </datalist>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Ruler className="h-4 w-4" />
                  Medidas y coordenada
                </h4>
                <button
                  type="button"
                  onClick={setReferenceCoordinate}
                  className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                >
                  Usar referencia
                </button>
              </div>
              <p className="mb-3 text-xs text-blue-800">
                Si el navegador bloquea el GPS, puedes escribir latitud/longitud o cerrar este formulario y dibujar el punto o tramo directo en el mapa.
              </p>

              {!useSimulatedGPS && (
                <div className="mb-4">
                  <GeoLocationHelper />
                </div>
              )}

              {gpsError && (
                <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  {gpsError}
                </div>
              )}

              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Largo / diametro del dano (m) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.segmentLength}
                    onChange={(event) => setFormData({ ...formData, segmentLength: event.target.value })}
                    placeholder="Ej: 120"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Ancho del dano (m) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.segmentWidth}
                    onChange={(event) => setFormData({ ...formData, segmentWidth: event.target.value })}
                    placeholder="Ej: 12"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-xs font-medium text-gray-700">Referencia puntual *</label>
                  <input
                    type="text"
                    required
                    value={formData.startReference}
                    onChange={(event) => setFormData({ ...formData, startReference: event.target.value })}
                    placeholder="Ej: frente al Nro. 123, poste AP-45"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    disabled={captureMode === 'start' || !canUseBrowserGps}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-blue-300 px-3 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
                  >
                    <MapPin className="h-3 w-3" />
                    {!canUseBrowserGps ? 'GPS no disponible aquí' : gpsCoords.start ? 'GPS capturado' : captureMode === 'start' ? 'Capturando...' : 'Capturar GPS'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-700">Latitud</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.startLat}
                      onChange={(event) => {
                        setFormData({ ...formData, startLat: event.target.value });
                        setGpsError('');
                      }}
                      placeholder="-18.475500"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-700">Longitud</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.startLng}
                      onChange={(event) => {
                        setFormData({ ...formData, startLng: event.target.value });
                        setGpsError('');
                      }}
                      placeholder="-70.312000"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {gpsCoords.start && (
                  <div className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-xs ${
                    useSimulatedGPS ? 'bg-purple-50 text-purple-700' : 'bg-green-50 text-green-700'
                  }`}>
                    <ArrowRight className="h-4 w-4" />
                    <span>
                      {gpsCoords.start.lat.toFixed(6)}, {gpsCoords.start.lng.toFixed(6)}
                      {useSimulatedGPS && ' (referencia)'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-semibold text-gray-900">Tipo de deterioro</h3>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Tipo de dano *</label>
              <select
                required
                value={formData.damageType}
                onChange={(event) => setFormData({ ...formData, damageType: event.target.value })}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar...</option>
                <option value="Bache profundo">Bache profundo</option>
                <option value="Bache superficial">Bache superficial</option>
                <option value="Grietas longitudinales">Grietas longitudinales</option>
                <option value="Grietas transversales">Grietas transversales</option>
                <option value="Grietas tipo piel de cocodrilo">Grietas tipo piel de cocodrilo</option>
                <option value="Hundimiento">Hundimiento</option>
                <option value="Deformacion">Deformacion</option>
                <option value="Desprendimiento de carpeta">Desprendimiento de carpeta</option>
                <option value="Perdida de material">Perdida de material</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Gravedad *</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'leve', label: 'Leve', color: 'border-green-400 bg-green-50 text-green-800' },
                  { value: 'moderado', label: 'Moderado', color: 'border-yellow-400 bg-yellow-50 text-yellow-800' },
                  { value: 'grave', label: 'Grave', color: 'border-red-400 bg-red-50 text-red-800' },
                ].map((severity) => (
                  <button
                    key={severity.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, severity: severity.value })}
                    className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                      formData.severity === severity.value
                        ? severity.color
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {severity.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Descripcion</label>
              <textarea
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                placeholder="Describe brevemente el deterioro."
                rows={3}
                className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="font-semibold text-gray-900">Evidencia fotografica</h3>

            {photoPreviews.length === 0 ? (
              <label className="block">
                <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} className="hidden" />
                <div className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50">
                  <Camera className="mx-auto mb-2 h-10 w-10 text-gray-400" />
                  <p className="mb-1 text-sm text-gray-600">Tomar fotografia del evento</p>
                  <p className="text-xs text-gray-500">o seleccionar de galeria</p>
                </div>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {photoPreviews.map((photo, index) => (
                    <div key={photo} className="relative">
                      <img src={photo} alt={`Preview ${index + 1}`} className="h-28 w-full rounded-lg object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          const nextPhotos = photoPreviews.filter((_, photoIndex) => photoIndex !== index);
                          const nextFiles = photoFiles.filter((_, photoIndex) => photoIndex !== index);
                          setPhotoPreviews(nextPhotos);
                          setPhotoFiles(nextFiles);
                          setFormData({ ...formData, photos: nextPhotos });
                        }}
                        className="absolute right-1 top-1 rounded bg-red-500 p-1 text-white hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} className="hidden" />
                  <div className="cursor-pointer rounded-lg border border-dashed border-gray-300 p-3 text-center transition-colors hover:border-blue-400 hover:bg-blue-50">
                    <p className="text-xs text-gray-600">{isCompressingPhotos ? 'Comprimiendo imagenes...' : 'Agregar mas fotografias'}</p>
                  </div>
                </label>
              </div>
            )}
          </section>

          <div className="flex gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isCompressingPhotos}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
            >
              {isCompressingPhotos ? 'Preparando imagenes...' : 'Enviar reporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
