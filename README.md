# Brussels 3D Buildings & Public Transport Visualization

Interactive 3D visualization of Brussels buildings with real-time public transport overlay.

![Demo GIF](demo.gif?raw=true "Demo GIF")

## Prerequisites

- Geopackage file named `bxl.gpkg`
- Python 3 with: `requests`, `fiona`, `shapely`, `numpy`, `tqdm`

## Quick Start

1. Prepare data:
   ```bash
   # Convert the Geopackage from EPSG:31370 (Belgian Lambert 72)
   # to EPSG:4326 (WGS 84), the standard system
   ./first.sh
   
   # Set up an isolated Python environment for dependencies
   python3 -m venv venv
   
   # Activate the virtual environment
   source venv/bin/activate
   
   # Extract height (Z) values from 3D geometries
   # and add them as a new field
   python3 second.py

   # Convert to GeoJSON
   ./generate_tiles.sh
   ```

2. Start server and view:
   ```bash
   # Start fetching data from the Brussels Mobility API 
   ./start_server.sh
   
   http-server --cors -p 8000
   ```

3. When finished:
   ```bash
   ./stop_server.sh
   
   ./cleanup.sh  # Optional: removes temp files
   ```
