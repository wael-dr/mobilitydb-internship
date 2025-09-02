# Brussels 3D Buildings & Public Transport Visualization

Interactive 3D visualization of Brussels buildings with real-time public transport overlay.

## Demo Animations

   ### Point Cloud Visualization
   The point cloud data provides a highly accurate 3D representation of the building precisely aligning with their real-world positions.
   ![Point Cloud](gif/pointcloud.gif)

   ### OpenStreetMap Buildings
   Buildings are displayed in gray and can be clicked to reveal detailed information about each structure.
   ![OSM Buildings](gif/osm.gif)

   ### Mobility Data Overlay
   Vehicles are dynamically visualized following real-time trip data from the API, with metro lines shown at lower opacity to indicate underground routes.
   ![Mobility Overlay](gif/mobility.gif)

   ### Google Tiles Integration
   The Google Photorealistic 3D Tiles layer is seamlessly integrated, aligning precisely with the map.
   ![Google Tiles](gif/googletiles.gif)


## Quick Start

   ### Start the server
   ```bash
   python -m http.server
   ```
   or
   ```bash
   http-server --cors -p 8000 
   ```
