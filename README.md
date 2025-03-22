# Brussels 3D Buildings & Public Transport Visualization

Interactive 3D visualization of Brussels buildings with real-time public transport overlay.

## Prerequisites

- Geopackage file named `bxl.gpkg`
- Python 3 with: `requests`, `fiona`, `shapely`, `numpy`, `tqdm`

## Quick Start

1. Prepare data:
   ```bash
   ./first.sh
   
   # Create a virtual environment
   python3 -m venv venv
   
   # Activate the virtual environment
   source venv/bin/activate
   
   # Now run the Python script in the virtual environment
   python3 second.py
   
   ./generate_tiles.sh
   ```

2. Start server and view:
   ```bash
   ./start_server.sh
   http-server --cors -p 8000
   ```

3. When finished:
   ```bash
   ./stop_server.sh
   ./cleanup.sh  # Optional: removes temp files
   ```
