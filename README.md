# AeroSense – Environmental Intelligence PWA

Real-time weather, AQI, radar maps, and environmental insights. Mobile-first PWA with offline support.

## Features
- Live weather (Open-Meteo) + Air Quality (Open-Meteo AQI)
- Leaflet.js radar map with Rain/Clouds/Wind/AQI/Temp layers
- Chart.js trends (AQI, Temp, Humidity, Wind)
- AeroScore™ + Comfort Score
- Outdoor recommendations & health advisory
- Today vs Normal historical comparison
- Fullscreen weather with dynamic animations
- Active & upcoming alerts with browser notifications
- Light / Dark / System theme
- Unit conversions (°C/°F, km/h/mph, hPa/inHg, km/mi)
- Offline support via Service Worker
- Install to home screen (PWA)

## Tech Stack
HTML5 · CSS3 · Vanilla JS (ES modules) · Open-Meteo · Leaflet.js · Chart.js · Service Worker

## GitHub Pages Deployment

1. Push the entire `Aerosense/` folder contents to the **root** of your GitHub repo (or `docs/` folder).
2. Go to **Settings → Pages → Source → Deploy from branch → main / root**.
3. Your app will be live at `https://<username>.github.io/<repo>/`.

> **Important:** GitHub Pages serves over HTTPS — required for `navigator.geolocation` and Service Workers.

### If deploying to a subdirectory
Update `manifest.json` → `"start_url"` to match your path, e.g. `"/my-repo/index.html"`.
Update `service-worker.js` → `APP_SHELL` array paths to include the subdirectory prefix.

## Local Development
```bash
# Any static server works — Python example:
cd Aerosense
python3 -m http.server 8080
# Open http://localhost:8080
```

> Service Workers require `localhost` or HTTPS. Direct `file://` opening will not register the SW.

## File Structure
```
Aerosense/
├── index.html          # Home page
├── pages/
│   ├── radar.html
│   ├── insights.html
│   ├── alerts.html
│   └── settings.html
├── css/
│   ├── main.css        # Core layout & design tokens
│   ├── dark.css        # Dark theme
│   ├── light.css       # Light theme
│   └── animations.css  # Weather animations
├── js/
│   ├── app.js          # Home page controller
│   ├── weather.js      # Open-Meteo weather API
│   ├── aqi.js          # Open-Meteo AQI API
│   ├── radar.js        # Leaflet map controller
│   ├── insights.js     # Chart.js insights
│   ├── alerts.js       # Alerts controller
│   ├── settings.js     # Settings controller
│   ├── storage.js      # LocalStorage abstraction
│   └── utils.js        # Shared utilities
├── assets/
│   ├── icon-192.png
│   └── icon-512.png
├── manifest.json
├── service-worker.js
└── README.md
```

## APIs Used (all free, no key required)
| API | Purpose |
|-----|---------|
| [Open-Meteo](https://open-meteo.com) | Weather + hourly/daily forecast |
| [Open-Meteo AQI](https://air-quality-api.open-meteo.com) | AQI + pollutants |
| [Open-Meteo Geocoding](https://geocoding-api.open-meteo.com) | City search |
| [Nominatim](https://nominatim.openstreetmap.org) | Reverse geocoding |
| [CartoDB/OSM](https://carto.com) | Map tiles |
| [RainViewer](https://rainviewer.com) | Rain radar tiles |
