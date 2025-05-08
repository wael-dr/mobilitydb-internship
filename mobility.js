/**
 * Brussels Mobility Data Handler
 * Implements OGC Moving Features standard for STIB/MIVB public transportation
 */

// Configuration
const MOBILITY_CONFIG = {
  apiUrl: 'https://api.mobilitytwin.brussels/stib/trips',  // Trips endpoint for moving vehicles
  updateInterval: 3000, // 3 seconds
  maxRetries: 3,
  vehicleHeightOffset: 2, // meters above ground
  maxVehicles: 5000,        // maximum number of vehicles to display for performance
  defaultVehicleScale: 1.5,
  vehicleColors: {
    bus: Cesium.Color.fromCssColorString('#3498db'),
    tram: Cesium.Color.fromCssColorString('#e74c3c'),
    metro: Cesium.Color.fromCssColorString('#2ecc71')
  },
  // API Authentication
  apiHeaders: {            // Headers to send with API requests
    'Accept': 'application/json',
    'Authorization': 'Bearer c9ab58bd69b8213fa5cc1d01e73ffb34793da24d88e2ec0d6e773e8bbc0f891576ca308b7e2c4bf581babf30dea68f450d121a1f0ba59a23ad5c88f5f4305443'
  },
  debugMode: true,          // Enable detailed logging
  // Animation parameters
  animationSpeed: 1,      // Default animation speed
  enableAnimation: true,   // Enable animation by default
  // Terrain sampling configuration
  enableTerrainSampling: true,  // Enable terrain height sampling
  terrainSamplingCache: true,   // Cache terrain heights for performance
  terrainRaycastHeight: 1000,   // Height in meters to start raycasting from
  terrainSampleSpacing: 0.001   // Grid spacing for terrain sampling cache (degrees)
};

// Helper function to determine vehicle type based on line ID
function determineVehicleType(lineId) {
  // Default to bus
  let vehicleType = 'bus'; 
  
  // Metro lines: 1, 2, 5, 6
  const metroLines = ['1', '2', '5', '6'];
  if (metroLines.includes(lineId)) {
    return 'metro';
  }
  
  // Tram lines: 4, 7, 8, 9, 10, 18, 19, 25, 35, 39, 51, 55, 62, 81, 82, 92, 93, 97
  const tramLines = ['4', '7', '8', '9', '10', '18', '19', '25', '35', '39', '51',
                     '55', '62', '81', '82', '92', '93', '97'];
  if (tramLines.includes(lineId)) {
    return 'tram';
  }
  
  return vehicleType;
}

// State management
let mobData = {
  dataSource: null,       // Cesium data source for vehicles
  lastUpdate: null,       // Timestamp of last update
  workerActive: false,    // Flag for active data retrieval
  selectedVehicle: null,  // Currently selected vehicle
  apiErrorCount: 0,              // Initialize error counter
  lastApiError: null,            // Store last API error for debugging
  lastRawResponse: null,         // Store last raw API response for debugging
  temporalSyncDone: false,       // Indicator to track if temporal synchronization has been done
  terrainHeightCache: {}         // Cache for sampled terrain heights
};

// Initialize the mobility data system
function initMobility(viewer) {
  if (!viewer) {
    console.error("Viewer not provided to initMobility");
    return;
  }

  // Store viewer reference globally for other functions
  window.viewer = viewer;

  // Create a dedicated data source for vehicles
  mobData.dataSource = new Cesium.CustomDataSource('vehicles');
  viewer.dataSources.add(mobData.dataSource);

  // Set up clock for animation
  viewer.clock.shouldAnimate = MOBILITY_CONFIG.enableAnimation;
  viewer.clock.multiplier = MOBILITY_CONFIG.animationSpeed;
  viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
  viewer.clock.currentTime = Cesium.JulianDate.now();

  // Set up UI event handlers
  setupMobilityControls(viewer);
  
  // Clear terrain height cache
  mobData.terrainHeightCache = {};
  
  // Start data retrieval immediately
  startVehicleDataUpdates();
  
  log("Mobility system initialized - Using real API data");
}

// Fetch vehicle data from API
function fetchVehicleData() {
  const apiUrl = MOBILITY_CONFIG.apiUrl;
  
  const dataStatus = document.getElementById('dataStatus');
  if (dataStatus) {
    dataStatus.textContent = "Data: Fetching from API...";
    dataStatus.style.color = "#ffcc00";
  }
  
  if (MOBILITY_CONFIG.debugMode) {
    log(`Fetching data from API: ${apiUrl}`);
  }
  
  // Calculate start and end timestamps for the API request
  const currentTime = Math.floor(Date.now() / 1000);  // Current time in seconds
  const startTimestamp = currentTime - 90;  // 90 seconds ago
  const endTimestamp = currentTime + 90;    // 90 seconds in the future
  
  // Build the URL with query parameters
  const fullUrl = `${apiUrl}?start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`;
  
  // Make the API request with authorization
  fetch(fullUrl, {
    method: 'GET',
    headers: MOBILITY_CONFIG.apiHeaders
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      const dataStatus = document.getElementById('dataStatus');
      if (dataStatus) {
        dataStatus.textContent = "Data: Connected";
        dataStatus.style.color = "#00ff00";
      }
      
      mobData.apiErrorCount = 0;
      mobData.lastApiError = null;
      
      // Check if data contains features
      if (!data || !data.features || data.features.length === 0) {
        log("Received empty data (no features), ignoring this update");
        if (dataStatus) {
          dataStatus.textContent = "Data: Empty (Ignored)";
          dataStatus.style.color = "#ffcc00";
        }
        return; // Exit the function without processing empty data
      }
      
      // Process vehicle types for each feature
      data.features.forEach(feature => {
        if (feature.properties) {
          // Map vehicle types based on line information if not already specified
          if (!feature.properties.vehicleType) {
            // Try multiple potential property names for line
            const lineIdRaw = (feature.properties.line || 
                         feature.properties.lineId || 
                         feature.properties.lineName || 
                         feature.properties.routeId || '');
            
            // Normalize the line ID
            const lineId = String(lineIdRaw).trim();
            
            // Determine vehicle type based on line ID using helper function
            feature.properties.vehicleType = determineVehicleType(lineId);
          }
        }
      });
      
      // Store just a sample of the response for debugging
      const sampleFeature = JSON.stringify(data.features[0]);
      mobData.lastRawResponse = `${data.features.length} features. Sample: ${sampleFeature.substring(0, 300)}...`;
      
      if (MOBILITY_CONFIG.debugMode) {
        log(`Received data from API: ${data.features.length} features`);
      }
      
      // Process the data to update Cesium entities
      processVehicleData(data);
      
      // Synchronize Cesium clock with data if not already done
      if (!mobData.temporalSyncDone && data.features.length > 0) {
        syncCesiumClockWithData();
        mobData.temporalSyncDone = true;
      }
    })
    .catch(error => {
      mobData.apiErrorCount++;
      mobData.lastApiError = error.message;
      
      const dataStatus = document.getElementById('dataStatus');
      if (dataStatus) {
        dataStatus.textContent = `Data: Error (${mobData.apiErrorCount})`;
        dataStatus.style.color = "#ff0000";
      }
      
      log(`Error fetching vehicle data from API: ${error.message}`);
      
      // Update debugging information
      updateDebugInfo();
      
      // If we failed multiple times, suggest a refresh
      if (mobData.apiErrorCount > MOBILITY_CONFIG.maxRetries) {
        log(`Exceeded max retries (${MOBILITY_CONFIG.maxRetries}). Consider refreshing the page.`);
      }
    });
}

// Sample terrain height from 3D Tiles using raycasting
function sampleTerrainHeight(longitude, latitude) {
  // Check if height is already in cache
  const cacheKey = getCacheKey(longitude, latitude);
  if (MOBILITY_CONFIG.terrainSamplingCache && mobData.terrainHeightCache[cacheKey] !== undefined) {
    return mobData.terrainHeightCache[cacheKey];
  }
  
  const viewer = window.viewer;
  if (!viewer || !viewer.scene) {
    log("Viewer not available for terrain sampling");
    return 0; // Default height if viewer not available
  }
  
  // If terrain sampling is disabled, return 0
  if (!MOBILITY_CONFIG.enableTerrainSampling) {
    return 0;
  }
  
  try {
    // Create a ray starting above the target point
    const rayHeight = MOBILITY_CONFIG.terrainRaycastHeight;
    const rayStart = Cesium.Cartesian3.fromDegrees(longitude, latitude, rayHeight);
    const rayEnd = Cesium.Cartesian3.fromDegrees(longitude, latitude, 0);
    const direction = Cesium.Cartesian3.subtract(rayEnd, rayStart, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(direction, direction);
    
    const ray = new Cesium.Ray(rayStart, direction);
    const intersection = viewer.scene.pickFromRay(ray, []);
    
    let height = 0;
    
    if (Cesium.defined(intersection) && Cesium.defined(intersection.position)) {
      // Convert the intersection position to cartographic (longitude, latitude, height)
      const cartographic = Cesium.Cartographic.fromCartesian(intersection.position);
      height = cartographic.height;
      
      if (MOBILITY_CONFIG.debugMode && Math.random() < 0.01) { // Log only a sample of heights to avoid flooding
        log(`Sampled terrain height at (${longitude.toFixed(5)}, ${latitude.toFixed(5)}): ${height.toFixed(2)}m`);
      }
    } else {
      // If no intersection is found, try the ellipsoid
      const cartographic = Cesium.Cartographic.fromDegrees(longitude, latitude);
      height = 0; // Ellipsoid height is 0
      
      if (MOBILITY_CONFIG.debugMode && Math.random() < 0.01) {
        log(`No terrain intersection at (${longitude.toFixed(5)}, ${latitude.toFixed(5)}), using ellipsoid height`);
      }
    }
    
    // Cache the result
    if (MOBILITY_CONFIG.terrainSamplingCache) {
      mobData.terrainHeightCache[cacheKey] = height;
    }
    
    return height;
  } catch (error) {
    log(`Error sampling terrain height: ${error.message}`);
    return 0; // Return default height on error
  }
}

// Generate a cache key based on rounded coordinates to reduce duplicate sampling
function getCacheKey(longitude, latitude) {
  // Round to a grid based on terrainSampleSpacing
  const spacing = MOBILITY_CONFIG.terrainSampleSpacing;
  const roundedLon = Math.round(longitude / spacing) * spacing;
  const roundedLat = Math.round(latitude / spacing) * spacing;
  return `${roundedLon.toFixed(6)}_${roundedLat.toFixed(6)}`;
}

// Process vehicle data
function processVehicleData(data) {
  // Use correct viewer reference
  const viewer = window.viewer;
  if (!viewer) {
    log("Viewer not available, cannot process vehicle data");
    return;
  }
  
  const currentTime = Cesium.JulianDate.now();
  let processedCount = 0;
  const currentVehicleIds = new Set(); // Keep track of vehicles in current update

  if (!data || !data.features || !Array.isArray(data.features)) {
      log("Received invalid data format from server.");
      return;
  }

  log(`Processing ${data.features.length} features from data`);

  data.features.forEach(feature => {
    // Limit number of vehicles for performance
    if (processedCount >= MOBILITY_CONFIG.maxVehicles) return;
    
    try {
      // More lenient validation - allow fallbacks when structure is not exactly as expected
      if (!feature.properties) {
        log("Skipping feature without properties");
        return;
      }
      
      // Extract vehicle properties with mapping for trips API structure
      const vehicleId = feature.properties.vehicleId || feature.properties.uuid || 
                      `vehicle_${feature.properties.lineId || 'unknown'}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Determine vehicle type based on lineId if not specified
      let vehicleType = feature.properties.vehicleType || 'bus'; // Default bus
      
      if (!feature.properties.vehicleType && feature.properties.lineId) {
          const lineId = String(feature.properties.lineId).trim();
          vehicleType = determineVehicleType(lineId);
      }
      
      const line = feature.properties.line || feature.properties.lineId || 'unknown';
      
      // Add to current vehicle ids set
      currentVehicleIds.add(vehicleId);
      
      // Find existing entity or prepare to create a new one
      let entity = mobData.dataSource.entities.getById(vehicleId);
      let sampledPosition;

      if (!entity) {
        // Create a new entity
        sampledPosition = new Cesium.SampledPositionProperty();
        entity = new Cesium.Entity({
          id: vehicleId,
          name: `${vehicleType.toUpperCase()} ${line}`,
          availability: new Cesium.TimeIntervalCollection(), // Will be filled later
          position: sampledPosition,
          orientation: new Cesium.VelocityOrientationProperty(sampledPosition), // Automatically orient the model
          entityType: 'vehicle', // Custom property
          properties: { // Store static properties here
              line: line,
              type: vehicleType,
              color: feature.properties.color
          }
        });
        
        // Add vehicle model based on type
        addVehicleModel(entity, vehicleType);
        
        // Add entity to data source
        mobData.dataSource.entities.add(entity);
      } else {
        // Entity exists, get its position property
        sampledPosition = entity.position;
        // Ensure it's a SampledPositionProperty (might be needed if switching from non-temporal)
        if (!(sampledPosition instanceof Cesium.SampledPositionProperty)) {
            sampledPosition = new Cesium.SampledPositionProperty();
            entity.position = sampledPosition;
            entity.orientation = new Cesium.VelocityOrientationProperty(sampledPosition);
        }
        entity.show = true; // Ensure it's visible
      }

      // Add time data points to SampledPositionProperty
      let firstTime = null;
      let lastTime = null;
      
      // Check if we have temporal geometry data
      if (feature.temporalGeometry && Array.isArray(feature.temporalGeometry.coordinates) && 
          Array.isArray(feature.temporalGeometry.datetimes) && 
          feature.temporalGeometry.coordinates.length === feature.temporalGeometry.datetimes.length &&
          feature.temporalGeometry.coordinates.length > 0) { // Ensure there's at least one point
          
          // Clear existing samples if updating an existing entity to avoid accumulating old data
          if (sampledPosition.numberOfSamples > 0) {
              sampledPosition = new Cesium.SampledPositionProperty();
              entity.position = sampledPosition;
              entity.orientation = new Cesium.VelocityOrientationProperty(sampledPosition);
          }

          for (let i = 0; i < feature.temporalGeometry.coordinates.length; i++) {
            const coord = feature.temporalGeometry.coordinates[i];
            const datetime = feature.temporalGeometry.datetimes[i];
            
            // Validate coordinate format
            if (!Array.isArray(coord) || coord.length < 2 || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
                log(`Skipping invalid coordinate ${JSON.stringify(coord)} for vehicle ${vehicleId}`);
                continue;
            }
            
            try {
                const julianDate = Cesium.JulianDate.fromIso8601(datetime);
                
                // Sample terrain height at this coordinate
                const terrainHeight = sampleTerrainHeight(coord[0], coord[1]);
                
                // Use terrain height plus vehicle offset
                const cartesianPosition = Cesium.Cartesian3.fromDegrees(
                    coord[0], 
                    coord[1], 
                    terrainHeight + MOBILITY_CONFIG.vehicleHeightOffset
                );
                
                // Add a sample to the position property
                sampledPosition.addSample(julianDate, cartesianPosition);
    
                // Track time range of samples for availability
                if (!firstTime || Cesium.JulianDate.lessThan(julianDate, firstTime)) {
                    firstTime = julianDate;
                }
                if (!lastTime || Cesium.JulianDate.greaterThan(julianDate, lastTime)) {
                    lastTime = julianDate;
                }
            } catch (dateError) {
                log(`Error parsing date ${datetime} or coordinates ${JSON.stringify(coord)} for vehicle ${vehicleId}: ${dateError}`);
            }
          }
          
          // Set interpolation options for smoother movement
          sampledPosition.interpolationAlgorithm = Cesium.LagrangePolynomialApproximation;
          sampledPosition.interpolationDegree = 5; // Adjust degree as needed
          
      } 
      // Fallback for non-temporal geometry (e.g., if API sometimes returns simple points)
      else if (feature.geometry && feature.geometry.type === 'Point' && 
              Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2 &&
              typeof feature.geometry.coordinates[0] === 'number' && typeof feature.geometry.coordinates[1] === 'number') {
          
          log(`Processing feature ${vehicleId} with simple Point geometry`);
          const coord = feature.geometry.coordinates;
          const timeStr = feature.properties.time || new Date().toISOString(); // Use provided time or now
          let julianDate;
          try {
              julianDate = Cesium.JulianDate.fromIso8601(timeStr);
          } catch (e) {
              log(`Error parsing time ${timeStr} for simple point, using current time.`);
              julianDate = Cesium.JulianDate.now();
          }
          
          // Sample terrain height at this coordinate
          const terrainHeight = sampleTerrainHeight(coord[0], coord[1]);
          
          // Use terrain height plus vehicle offset
          const cartesianPosition = Cesium.Cartesian3.fromDegrees(
              coord[0], 
              coord[1], 
              terrainHeight + MOBILITY_CONFIG.vehicleHeightOffset
          );
          
          // Add a single point for the given time
          sampledPosition.addSample(julianDate, cartesianPosition);
          
          // Set availability for this single point
          firstTime = julianDate;
          lastTime = Cesium.JulianDate.addSeconds(julianDate, 1, new Cesium.JulianDate()); // Give it a short duration
          
          // If bearing is available, apply it directly (orientation may not update correctly with single points)
          if (feature.properties.bearing !== undefined) {
              log(`Bearing property found for simple point, but orientation might not update correctly.`);
          }
      } else {
          log(`Skipping vehicle ${vehicleId} with invalid or missing geometry data`);
          // Remove from currentVehicleIds if it was added before this check
          currentVehicleIds.delete(vehicleId);
          return; // Do not increment processedCount
      }

      // Update entity availability based on time range of samples
      if (firstTime && lastTime) {
          // Create interval with a buffer of 20 seconds into the future
          // to keep entities visible between data fetches
          const bufferSeconds = 20;
          const extendedLastTime = Cesium.JulianDate.clone(lastTime);
          Cesium.JulianDate.addSeconds(lastTime, bufferSeconds, extendedLastTime);
          
          const interval = new Cesium.TimeInterval({ 
              start: firstTime, 
              stop: extendedLastTime 
          });
          
          // Check if interval already exists to avoid duplicates (simple check)
          let exists = false;
          for(let i=0; i < entity.availability.length; i++) {
              if(entity.availability.get(i).start.equals(interval.start) && entity.availability.get(i).stop.equals(interval.stop)) {
                  exists = true;
                  break;
              }
          }
          if (!exists) {
             entity.availability.addInterval(interval);
          }
      }
      
      // Configure position extrapolation to maintain visibility beyond data points
      sampledPosition.forwardExtrapolationType = Cesium.ExtrapolationType.HOLD;
      sampledPosition.forwardExtrapolationDuration = 20; // 20 seconds into the future
      
      // Update label (only if needed, properties may not change often)
      if (!entity.label || entity.label.text !== line) {
          entity.label = new Cesium.LabelGraphics({
            text: line,
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -20), // Adjust offset based on model size
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000)
          });
      }
      
      processedCount++;
    } catch (e) {
      console.error(`Error processing vehicle feature: ${JSON.stringify(feature.properties)}`, e);
    }
  });

  mobData.lastUpdate = Cesium.JulianDate.toDate(currentTime);
  
  // Update log with vehicle count and type stats
  if (typeof log === "function") {
    log(`Updated ${processedCount} vehicles using SampledPositionProperty`);
    logVehicleTypeStats(); // Log stats based on current entities
  }
}

// Function to synchronize Cesium clock with data
function syncCesiumClockWithData() {
  log("Synchronizing Cesium clock with data...");
  
  const viewer = window.viewer;
  if (!viewer) {
    log("Viewer not available for synchronization");
    return false;
  }
  
  const entities = mobData.dataSource.entities.values;
  if (entities.length === 0) {
    log("No entities available for synchronization");
    return false;
  }
  
  // Find time range where entities are available
  let earliestTime = null;
  let latestTime = null;
  
  entities.forEach(entity => {
    if (entity.availability && entity.availability.length > 0) {
      for (let i = 0; i < entity.availability.length; i++) {
        const interval = entity.availability.get(i);
        
        if (!earliestTime || Cesium.JulianDate.lessThan(interval.start, earliestTime)) {
          earliestTime = interval.start;
        }
        
        if (!latestTime || Cesium.JulianDate.greaterThan(interval.stop, latestTime)) {
          latestTime = interval.stop;
        }
      }
    }
  });
  
  if (earliestTime && latestTime) {
    const earliestTimeStr = Cesium.JulianDate.toDate(earliestTime).toISOString();
    const latestTimeStr = Cesium.JulianDate.toDate(latestTime).toISOString();
    log(`Entities availability range: ${earliestTimeStr} to ${latestTimeStr}`);
    
    // Calculate a mid-time in the range
    const midTime = new Cesium.JulianDate();
    Cesium.JulianDate.addSeconds(earliestTime, 
                                Cesium.JulianDate.secondsDifference(latestTime, earliestTime) / 2, 
                                midTime);
    
    // Set Cesium clock to be within availability range
    viewer.clock.currentTime = midTime;
    log(`Cesium clock synchronized to: ${Cesium.JulianDate.toDate(midTime).toISOString()}`);
    
    // Set clock time range
    viewer.clock.startTime = earliestTime;
    viewer.clock.stopTime = latestTime;
    viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
    
    // Enable animation if configured
    viewer.clock.shouldAnimate = MOBILITY_CONFIG.enableAnimation;
    viewer.clock.multiplier = MOBILITY_CONFIG.animationSpeed;
    
    return true;
  } else {
    log("Unable to determine entities availability range");
    return false;
  }
}

// Add appropriate 3D model to vehicle entity
function addVehicleModel(entity, vehicleType) {
  const color = MOBILITY_CONFIG.vehicleColors[vehicleType] || Cesium.Color.YELLOW;
  const scale = MOBILITY_CONFIG.defaultVehicleScale;

  // Use boxes with appropriate dimensions for each vehicle type
  switch(vehicleType) {
    case 'bus':
      entity.box = new Cesium.BoxGraphics({
        dimensions: new Cesium.Cartesian3(12 * scale, 3 * scale, 3 * scale),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      });
      break;
    case 'tram':
      entity.box = new Cesium.BoxGraphics({
        dimensions: new Cesium.Cartesian3(18 * scale, 2.5 * scale, 3.5 * scale),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      });
      break;
    case 'metro':
      entity.box = new Cesium.BoxGraphics({
        dimensions: new Cesium.Cartesian3(20 * scale, 3 * scale, 3.5 * scale),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      });
      break;
    default:
      entity.point = new Cesium.PointGraphics({ pixelSize: 10, color: color });
  }
}

// Set up UI control handlers
function setupMobilityControls(viewer) {
  // Store viewer reference globally for other functions
  window.viewer = viewer;
  
  // Toggle vehicle visibility
  const showVehiclesCheckbox = document.getElementById('showVehicles');
  if (showVehiclesCheckbox) {
    showVehiclesCheckbox.addEventListener('change', function(e) {
      if (mobData.dataSource) {
        mobData.dataSource.show = e.target.checked;
      }
    });
  }
  
  // Update interval selection
  const updateIntervalSelect = document.getElementById('updateIntervalSelect');
  if (updateIntervalSelect) {
    updateIntervalSelect.addEventListener('change', function(e) {
      MOBILITY_CONFIG.updateInterval = parseInt(e.target.value);
      restartVehicleDataUpdates();
    });
  }
  
  // Manual refresh
  const refreshNowButton = document.getElementById('refreshNowButton');
  if (refreshNowButton) {
    refreshNowButton.addEventListener('click', function() {
      fetchVehicleData();
    });
  }
  
  // Vehicle selection
  viewer.screenSpaceEventHandler.setInputAction(function(click) {
    const pickedObject = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.entityType === 'vehicle') {
      selectVehicle(pickedObject.id.id); // Use entity.id
    } else {
      deselectVehicle();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  
  // Close vehicle info panel
  const closeVehicleInfoButton = document.getElementById('closeVehicleInfo');
  if (closeVehicleInfoButton) {
    closeVehicleInfoButton.addEventListener('click', function() {
      deselectVehicle();
    });
  }
  
  // Debug info section
  const controlsDiv = document.getElementById('vehicleControls');
  if (controlsDiv) {
    const debugContainer = document.createElement('div');
    debugContainer.className = 'control-group';
    debugContainer.innerHTML = `
      <label><input type="checkbox" id="showDebugInfo" /> Show API Debug Info</label>
      <div id="apiDebugInfo" style="display:none; margin-top: 10px; padding: 5px; background: #333; color: #eee; max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 11px;">
        <p>Last Error: <span id="lastApiError">None</span></p>
        <p>Raw Response: <span id="lastRawResponse">None</span></p>
      </div>
    `;
    controlsDiv.appendChild(debugContainer);
    
    const showDebugInfoCheckbox = document.getElementById('showDebugInfo');
    if (showDebugInfoCheckbox) {
      showDebugInfoCheckbox.addEventListener('change', function(e) {
        const apiDebugInfo = document.getElementById('apiDebugInfo');
        if (apiDebugInfo) {
          apiDebugInfo.style.display = e.target.checked ? 'block' : 'none';
          updateDebugInfo();
        }
      });
    }
  }
}

// Start/restart data update process
function startVehicleDataUpdates() {
  if (!mobData.workerActive) {
    mobData.workerActive = true;
    fetchVehicleData(); // Initial fetch
    
    // Set up periodic updates
    if (mobData.updateInterval) clearInterval(mobData.updateInterval); // Clear previous interval if any
    mobData.updateInterval = setInterval(() => {
      fetchVehicleData();
    }, MOBILITY_CONFIG.updateInterval);
    log(`Started periodic data updates every ${MOBILITY_CONFIG.updateInterval / 1000}s`);
  }
}

// Stop data updates
function stopVehicleDataUpdates() {
  mobData.workerActive = false;
  if (mobData.updateInterval) {
    clearInterval(mobData.updateInterval);
    mobData.updateInterval = null;
    log("Stopped periodic data updates");
  }
}

// Restart data updates (after configuration change)
function restartVehicleDataUpdates() {
  log("Restarting data updates...");
  stopVehicleDataUpdates();
  // Add a short delay before restarting to ensure cleanup
  setTimeout(startVehicleDataUpdates, 500); 
}

// Select a vehicle
function selectVehicle(vehicleId) {
  deselectVehicle(); // Clear any existing selection
  
  const entity = mobData.dataSource.entities.getById(vehicleId);
  if (!entity) {
      log(`Cannot select vehicle: Entity ${vehicleId} not found.`);
      return;
  }
  
  mobData.selectedVehicle = vehicleId;
  
  // Highlight selected vehicle
  if (entity.box) {
    entity._originalDimensions = entity.box.dimensions ? entity.box.dimensions.getValue(window.viewer.clock.currentTime) : new Cesium.Cartesian3(1,1,1);
    entity._originalMaterial = entity.box.material ? entity.box.material.getValue(window.viewer.clock.currentTime).color : Cesium.Color.WHITE;
    
    entity.box.dimensions = new Cesium.Cartesian3(
      entity._originalDimensions.x * 1.3,
      entity._originalDimensions.y * 1.3,
      entity._originalDimensions.z * 1.3
    );
    entity.box.material = Cesium.Color.YELLOW.withAlpha(0.9);
  } else if (entity.point) {
      entity._originalPixelSize = entity.point.pixelSize.getValue(window.viewer.clock.currentTime);
      entity.point.pixelSize = entity._originalPixelSize * 1.5;
      entity.point.color = Cesium.Color.YELLOW;
  }
  
  // Show info panel
  displayVehicleInfo(entity);
}

// Deselect vehicle
function deselectVehicle() {
  if (!mobData.selectedVehicle) return;
  
  const entity = mobData.dataSource.entities.getById(mobData.selectedVehicle);
  if (entity) {
    // Restore original appearance
    if (entity.box && entity._originalDimensions) {
      entity.box.dimensions = entity._originalDimensions;
      entity.box.material = entity._originalMaterial;
    } else if (entity.point && entity._originalPixelSize) {
        entity.point.pixelSize = entity._originalPixelSize;
        // Restore original color based on type
        const vehicleType = entity.properties.type.getValue();
        entity.point.color = MOBILITY_CONFIG.vehicleColors[vehicleType] || Cesium.Color.YELLOW;
    }
  }
  
  mobData.selectedVehicle = null;
  
  const vehicleInfoDiv = document.getElementById('vehicleInfo');
  if (vehicleInfoDiv) {
    vehicleInfoDiv.style.display = 'none';
  }
}

// Display vehicle info from entity
function displayVehicleInfo(entity) {
  const infoDiv = document.getElementById('vehicleInfo');
  const detailsDiv = document.getElementById('vehicleDetails');
  
  if (!infoDiv || !detailsDiv) {
    log("Vehicle info elements not found in DOM");
    return;
  }
  
  // Get vehicle properties
  const vehicleType = entity.properties.type.getValue();
  const line = entity.properties.line.getValue();
  
  // Build HTML content
  let html = `
    <h3>${vehicleType.toUpperCase()} ${line}</h3>
    <table>
      <tr><td>ID:</td><td>${entity.id}</td></tr>
      <tr><td>Type:</td><td>${vehicleType}</td></tr>
      <tr><td>Line:</td><td>${line}</td></tr>
  `;
  
  // Add other properties if available
  if (entity.properties.color) {
    html += `<tr><td>Color:</td><td>${entity.properties.color.getValue()}</td></tr>`;
  }
  
  html += `</table>`;
  
  // Update content and show panel
  detailsDiv.innerHTML = html;
  infoDiv.style.display = 'block';
}

// Update debug info in UI
function updateDebugInfo() {
  const lastApiErrorSpan = document.getElementById('lastApiError');
  const lastRawResponseSpan = document.getElementById('lastRawResponse');
  
  if (lastApiErrorSpan) {
    lastApiErrorSpan.textContent = mobData.lastApiError || 'None';
  }
  
  if (lastRawResponseSpan) {
    lastRawResponseSpan.textContent = mobData.lastRawResponse || 'None';
  }
}

// Log vehicle type stats
function logVehicleTypeStats() {
  const entities = mobData.dataSource.entities.values;
  const stats = { bus: 0, tram: 0, metro: 0, other: 0 };
  
  entities.forEach(entity => {
    if (entity.properties && entity.properties.type) {
      const type = entity.properties.type.getValue();
      if (stats[type] !== undefined) {
        stats[type]++;
      } else {
        stats.other++;
      }
    } else {
      stats.other++;
    }
  });
  
  log(`Vehicle types: ${stats.bus} buses, ${stats.tram} trams, ${stats.metro} metros, ${stats.other} other`);
}

// Simple logging function
function log(message) {
  if (MOBILITY_CONFIG.debugMode) {
    console.log(`[Mobility] ${message}`);
    
    // Update log element in UI if it exists
    const logElement = document.getElementById('mobilityLog');
    if (logElement) {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = document.createElement('div');
      logEntry.textContent = `${timestamp}: ${message}`;
      logElement.appendChild(logEntry);
      
      // Limit number of log entries
      while (logElement.childElementCount > 100) {
        logElement.removeChild(logElement.firstChild);
      }
      
      // Scroll to bottom
      logElement.scrollTop = logElement.scrollHeight;
    }
  }
}