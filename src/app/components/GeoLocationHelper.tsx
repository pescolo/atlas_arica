import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, HelpCircle, MapPin, XCircle } from 'lucide-react';

type GpsStatus = 'checking' | 'granted' | 'denied' | 'unavailable' | 'prompt' | 'insecure';

export function GeoLocationHelper() {
  const [status, setStatus] = useState<GpsStatus>('checking');
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const checkGeolocationPermission = async () => {
      if (!window.isSecureContext) {
        setStatus('insecure');
        return;
      }

      if (!navigator.geolocation) {
        setStatus('unavailable');
        return;
      }

      try {
        if (navigator.permissions) {
          const result = await navigator.permissions.query({ name: 'geolocation' });
          setStatus(result.state);

          result.addEventListener('change', () => {
            setStatus(result.state);
          });
          return;
        }

        setStatus('prompt');
      } catch (error) {
        console.error('Error checking geolocation permission:', error);
        setStatus('unavailable');
      }
    };

    checkGeolocationPermission();
  }, []);

  const getStatusIcon = () => {
    switch (status) {
      case 'granted':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'denied':
      case 'insecure':
      case 'unavailable':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'prompt':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return <MapPin className="w-4 h-4 text-gray-400 animate-pulse" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'granted':
        return 'GPS habilitado';
      case 'denied':
        return 'GPS bloqueado';
      case 'insecure':
        return 'GPS no disponible en esta conexión';
      case 'unavailable':
        return 'GPS no disponible';
      case 'prompt':
        return 'Permiso pendiente';
      default:
        return 'Verificando GPS...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'granted':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'denied':
      case 'insecure':
      case 'unavailable':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'prompt':
        return 'bg-yellow-50 border-yellow-200 text-yellow-700';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-700';
    }
  };

  return (
    <div className={`border rounded-lg p-3 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="p-1 hover:bg-white/50 rounded transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>

      {showHelp && (
        <div className="mt-3 pt-3 border-t border-current/20 text-xs space-y-2">
          {status === 'insecure' && (
            <p>
              El GPS del navegador solo funciona en conexiones seguras. En el PC usa
              {' '}<strong>http://localhost:5175</strong>. En celular por WiFi con IP local, usa coordenadas manuales o dibuja el evento en el mapa.
            </p>
          )}

          {status === 'denied' && (
            <>
              <p className="font-medium">Para habilitar la geolocalización:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Haz clic en el icono de candado en la barra de direcciones.</li>
                <li>Busca la opción "Ubicación" o "Location".</li>
                <li>Selecciona "Permitir" o "Allow".</li>
                <li>Recarga la página.</li>
              </ol>
              <p>Si no quieres activar GPS, escribe las coordenadas manualmente o dibuja el evento en el mapa.</p>
            </>
          )}

          {status === 'unavailable' && (
            <p>Tu navegador o dispositivo no entrega geolocalización. Puedes escribir coordenadas manualmente o usar la referencia de Arica.</p>
          )}

          {status === 'prompt' && (
            <p>Cuando hagas clic en "Capturar GPS", tu navegador pedirá permiso. Selecciona <strong>Permitir</strong>.</p>
          )}

          {status === 'granted' && (
            <p>Perfecto. Puedes capturar las coordenadas GPS de los eventos.</p>
          )}
        </div>
      )}
    </div>
  );
}
