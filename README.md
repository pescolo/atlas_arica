# ATLAS Arica

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación

```bash
npm run check
```

## Arquitectura

- React + TypeScript + Vite
- Leaflet y OpenStreetMap para cartografía
- Supabase opcional para autenticación, eventos y fotografías
- `localStorage` como modo local

La cartografía de OpenStreetMap se usa únicamente como referencia. Los estados, daños y prioridades pertenecen a eventos viales registrados; no se generan a partir de las calles base.
