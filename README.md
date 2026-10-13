# RidePrism

**English** · [简体中文](README.zh-CN.md)

<img src="logo.svg" width="72" height="72" alt="RidePrism logo">

RidePrism is a FIT viewer and sharing tool for outdoor cycling. It processes FIT files and background photos offline in your browser, without uploading them to a server. No account is required, and there are no analytics or trackers.

Review a ride, merge multiple recordings, and create route-based share images—all in your browser. The interface supports Chinese and English, with light, dark, and system themes.

## Features

- **Review rides**: Explore ride statistics, laps, and device information with interactive charts, heart rate zones, gradient breakdowns, and climb analysis. Skip recorded pauses or compress long sampling gaps.
- **Explore routes**: View your ride on a route grid, local map tiles, or an online basemap, with routes colored by speed and optional kilometre, speed and elevation markers. Supports WGS-84 coordinates and GCJ-02 correction.
- **Merge recordings**: Load multiple FIT files, combine them chronologically, and export a merged FIT, per-sample CSV, or full-data CSV with device, event, weather and custom-field data.
- **Create share images**: Combine routes and ride statistics with colors, layouts, backgrounds, titles, and a signature. Export high-resolution PNGs with flat or elevation-based 3D routes, using your own photos or a map background.

When measured power is unavailable, the overview can estimate average cycling power from speed and elevation, with adjustable rider weight and bike settings. This windless estimate is a reference, not a replacement for a power meter; wind, drafting and data quality can substantially affect it.

## Usage and deployment

Open the site and select or drag in FIT files to explore your ride. Choose **Create share image** to make an image.

Deploy directly to any static host; no build step or backend is needed. For local use, serve the project over HTTP.

For translation maintenance and additional languages, see the [language guide](language/README.md).

## Map backgrounds

Online maps use OpenStreetMap and load only when you select them. Activity files are never uploaded, but tile requests reveal the approximate area being viewed, your IP address, and the page referrer to the map provider. The route grid and local basemaps do not make online map requests.

Local basemaps support Web Mercator / XYZ tiles. Online maps retain attribution and must be used in accordance with the [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Limitations

- Common FIT activity fields are supported. Manufacturer-specific fields and pause information may not be fully recognized. A long sampling gap does not necessarily indicate a pause. Automatic climb detection depends on recording quality and may differ from other platforms.
- Merged FIT exports preserve common activity data, but omit device information and developer-defined fields. CSV exports retain original fields, with full CSV also including all data messages. Overlapping records are not automatically deduplicated. Coordinate correction and chart time compression affect display only. Import compatibility depends on the destination platform.
- 3D routes show recorded elevation changes; they do not generate terrain.
- Individual files are limited to 64 MB, with a combined limit of 128 MB.
