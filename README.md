# MAFoto-Scout

MAFoto-Scout ist eine statische, mobile Web-App für Foto-Planung.

## Funktionen

- Ortssuche und Koordinateneingabe
- Interaktive OpenStreetMap-Karte
- Standort per Browser-Geolocation
- Sonnenaufgang, Sonnenuntergang, Goldene Stunde und Dämmerung
- Sonnenrichtung und Sonnenhöhe zur gewählten Uhrzeit
- Mondaufgang, Monduntergang, Mondphase und astronomische Nacht
- Wetterdaten über Open-Meteo
- Fotospot-Suche über OpenStreetMap / Overpass
- Favoriten im Browser (localStorage)
- Sternfoto-Rechner nach 500er-Regel
- ND-Filter-Rechner
- Installierbare PWA-Grundstruktur

## Start lokal

Einfach `index.html` über einen kleinen Webserver öffnen, z. B.:

```bash
python -m http.server 8080
```

Dann im Browser `http://localhost:8080` öffnen.

> Einige Browser-Funktionen wie Standort und Service Worker benötigen HTTPS oder `localhost`.

## GitHub Pages

1. Alle Dateien ins Repository-Root hochladen.
2. GitHub → **Settings** → **Pages**.
3. Unter **Build and deployment**: `Deploy from a branch`.
4. Branch `main` und Ordner `/ (root)` auswählen.
5. Speichern.

Danach ist die App über die von GitHub angezeigte Pages-Adresse erreichbar.

## Externe Dienste

Die App verwendet ohne API-Key:
- OpenStreetMap / Nominatim für Ortssuche
- Overpass API für Fotospots in der Nähe
- Open-Meteo für Wetter
- Leaflet für die Karte
- SunCalc für Sonnen- und Monddaten

Die Wetterprognose ist nur innerhalb des verfügbaren Prognosezeitraums sinnvoll. Die „Blaue Stunde“ wird als Näherung aus Dämmerungsphasen dargestellt; die Sternfoto-500er-Regel ist eine Faustregel.
