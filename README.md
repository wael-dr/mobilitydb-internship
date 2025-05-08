# Geopackage to GeoJSON

This conversion isn't used in the current implementation of the project, as we are now using directly the `Google Photorealistic 3D Tiles`.

## Prerequisites

- Geopackage file named `bxl.gpkg`
- Python 3 with: `requests`, `fiona`, `shapely`, `numpy`, `tqdm`

## How to convert

   ### Convert the Geopackage from EPSG:31370 (Belgian Lambert 72) to EPSG:4326 (WGS 84)
   ```bash
   ./first.sh
   ```

   ### Set up an isolated Python environment for dependencies, and activate it
   ```bash
   python3 -m venv venv
   
   source venv/bin/activate
   ```

   ### Extract height (Z) values from 3D geometries and add them as a new field
   ```bash
   python3 second.py
   ```

   ### Convert to GeoJSON
   ```bash
   ./generate_tiles.sh
   ```
