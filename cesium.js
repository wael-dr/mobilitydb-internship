// Cesium helper utilities for Brussels 3D Buildings application

// Global reference to the viewer (will be set by main script)
let cesiumViewer = null;

// Initialize Cesium utilities with the viewer instance from main script
function initCesiumUtils(viewer) {
  cesiumViewer = viewer;
  console.log("Cesium utilities initialized");
  return {
    getTileInfo,
    createBuildingEntity
  };
}

// Get information about the current view/tiles
function getTileInfo() {
  if (!cesiumViewer) return null;
  
  const camera = cesiumViewer.camera;
  const position = camera.positionCartographic;
  return {
    longitude: Cesium.Math.toDegrees(position.longitude),
    latitude: Cesium.Math.toDegrees(position.latitude),
    height: position.height,
    heading: Cesium.Math.toDegrees(camera.heading),
    pitch: Cesium.Math.toDegrees(camera.pitch)
  };
}

// Helper to create a building entity with proper styling
function createBuildingEntity(coordinates, height, color) {
  if (!cesiumViewer) return null;
  
  return cesiumViewer.entities.add({
    polygon: {
      hierarchy: Cesium.Cartesian3.fromDegreesArray(coordinates),
      material: color || Cesium.Color.fromHsl(0.6, 0.6, 0.4).withAlpha(0.8),
      extrudedHeight: height || 10,
      closeTop: true,
      closeBottom: true
    }
  });
}

// Export the utilities
window.CesiumUtils = {
  initCesiumUtils,
  getTileInfo,
  createBuildingEntity
};