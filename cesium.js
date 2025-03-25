// Cesium helper utilities for Brussels 3D Buildings application

// Global reference to the viewer (will be set by main script)
let cesiumViewer = null;

// Initialize Cesium utilities with the viewer instance from main script
function initCesiumUtils(viewer) {
  cesiumViewer = viewer;
  console.log("Cesium utilities initialized");
  return {
    getTileInfo,
    optimizeScene,
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

// Optimize Cesium scene for performance
function optimizeScene() {
  if (!cesiumViewer) return;
  
  // ENSURE GLOBE IS VISIBLE - this is critical
  cesiumViewer.scene.globe.show = true;
  cesiumViewer.scene.globe.baseColor = Cesium.Color.BLUE;
  
  // Enable these features for better globe appearance
  cesiumViewer.scene.globe.enableLighting = true;
  cesiumViewer.scene.skyAtmosphere.show = true;
  cesiumViewer.scene.moon.show = true;
  cesiumViewer.scene.sun.show = true;
  
  // Make sure we're in 3D mode to see the globe
  cesiumViewer.scene.mode = Cesium.SceneMode.SCENE3D;
  
  // Performance settings that won't affect globe visibility
  cesiumViewer.scene.fog.enabled = false;
  cesiumViewer.scene.fog.density = 0.0001;
  cesiumViewer.scene.postProcessStages.fxaa.enabled = false;
  
  // Don't set maximumScreenSpaceError too high as it can make globe disappear
  cesiumViewer.scene.globe.maximumScreenSpaceError = 2;
  
  console.log("Scene optimized with globe enabled");
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
  optimizeScene,
  createBuildingEntity
};