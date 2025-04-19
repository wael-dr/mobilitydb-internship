/**
 * Brussels Mobility Data Handler
 * Implements OGC Moving Features standard for STIB/MIVB public transportation
 */

// Configuration
const MOBILITY_CONFIG = {
  apiUrl: 'https://api.mobilitytwin.brussels/stib/vehicle-position',
  updateInterval: 10000, // 10 seconds
  retryDelay: 3000,      // 3 seconds
  maxRetries: 3,
  vehicleHeightOffset: 1, // meters above ground
  interpolationPoints: 60, // points to generate between positions
  maxVehicles: 200,        // maximum vehicles to display for performance
  defaultVehicleScale: 1.5,
  vehicleColors: {
    bus: Cesium.Color.fromCssColorString('#3498db'),
    tram: Cesium.Color.fromCssColorString('#e74c3c'),
    metro: Cesium.Color.fromCssColorString('#2ecc71')
  },
  historyLength: 10 * 60 * 1000, // 10 minutes of history
  // Simulation settings - disabled by default
  useSimulation: false,   // Use real API data instead of simulation
  preventAutoSwitchToSimulation: true, // Prevent auto-switching to simulation mode
  simulatedVehicles: 30,  // Number of vehicles to simulate (only used if useSimulation is true)
  simulationSpeedFactor: 1.0, // Speed multiplier for simulation
  simulationBounds: {     // Area where vehicles will be simulated
    west: 4.34,
    east: 4.40,
    south: 50.84,
    north: 50.88
  },
  // Real routes storage
  realRoutes: {
    routeData: {},         // Will store API route data
    lastFetch: null,       // Last time routes were fetched
    fetchInterval: 60000   // Fetch routes every minute
  },
  // API authentication - add your token here if needed
  apiToken: "c9ab58bd69b8213fa5cc1d01e73ffb34793da24d88e2ec0d6e773e8bbc0f891576ca308b7e2c4bf581babf30dea68f450d121a1f0ba59a23ad5c88f5f4305443",  // Now properly quoted
  apiHeaders: {            // Headers to send with API requests
    'Accept': 'application/json'
  },
  debugMode: true,          // Enable detailed logging
  // Python server settings
  pythonServerUrl: 'http://localhost:8001/api/vehicles', // Changed from 8000 to 8001
  usePythonServer: true,  // Use Python server by default
  visibleTypes: {         // Visibility flags by vehicle type - Now all default to true
    bus: true,
    tram: true,
    metro: true
  },
};

// State management
let mobData = {
  vehicles: {},           // Current vehicle data
  vehicleHistory: {},     // Historical positions
  dataSource: null,       // Cesium data source for vehicles
  lastUpdate: null,       // Timestamp of last update
  workerActive: false,    // Flag for active data fetching
  selectedVehicle: null,  // Currently selected vehicle
  liveMode: true,         // Live or historical view
  timeOffset: 0,          // Time offset for historical view
  visibleTypes: {         // Visibility flags by vehicle type - All vehicle types are always visible
    bus: true,
    tram: true,
    metro: true
  },
  simulationStartTime: Date.now(), // Reference point for simulation timing
  simulatedVehicles: [],          // Storage for simulated vehicle state
  lastSimulationUpdate: null,     // Last time simulation was updated
  routeCache: {},                  // Cache for derived routes from real data
  apiErrorCount: 0,              // Initialize error count properly
  lastApiError: null,            // Store the last API error for debugging
  lastRawResponse: null          // Store the last raw API response for debugging
};

// Initialize mobility data system
function initMobility(viewer) {
  if (!viewer) {
    console.error("Viewer not provided to initMobility");
    return;
  }

  // Create a dedicated DataSource for vehicles
  mobData.dataSource = new Cesium.CustomDataSource('vehicles');
  viewer.dataSources.add(mobData.dataSource);
  // Set up UI event handlers
  setupMobilityControls(viewer);
  // Start with data fetching immediately
  startVehicleDataUpdates();
  // Set up clock for temporal visualization
  setupTemporalControls(viewer);
  log("Mobility system initialized - Using real API data");
}

// Fetch real route data from the API
function fetchRouteData() {
  log("Fetching real route data from API...");
  document.getElementById('dataStatus').textContent = "Data: Fetching Routes...";
  document.getElementById('dataStatus').style.color = "#ffcc00";
  
  // Prepare headers for authentication
  const headers = { ...MOBILITY_CONFIG.apiHeaders };
  if (MOBILITY_CONFIG.apiToken) {
    headers['Authorization'] = `Bearer ${MOBILITY_CONFIG.apiToken}`;
  }
  
  return fetch(MOBILITY_CONFIG.apiUrl, { headers })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      document.getElementById('dataStatus').textContent = "Data: Routes Loaded";
      document.getElementById('dataStatus').style.color = "#00ff00";
      
      // Process and store the route data
      processRouteData(data);
      
      return data;
    })
    .catch(error => {
      log(`Error fetching route data: ${error.message}`);
      document.getElementById('dataStatus').textContent = "Data: Route Error";
      document.getElementById('dataStatus').style.color = "#ff0000";
      
      // Clear route data if API fails
      MOBILITY_CONFIG.realRoutes.routeData = {};
      mobData.routeCache.patterns = [];
    });
}

// Process route data from API
function processRouteData(data) {
  // Store the time we fetched this data
  MOBILITY_CONFIG.realRoutes.lastFetch = Date.now();
  
  // Create a mapping of routes keyed by line and vehicle type
  const routes = {};
  
  try {
    if (data.features && Array.isArray(data.features)) {
      data.features.forEach(feature => {
        if (feature.geometry && feature.properties) {
          const coords = feature.geometry.coordinates;
          const vehicleType = feature.properties.vehicleType || 'bus';
          const line = feature.properties.line || 'unknown';
          const key = `${vehicleType}_${line}`;
          
          // Initialize route if not exists
          if (!routes[key]) {
            routes[key] = {
              type: vehicleType,
              line: line,
              points: [],
              vehicles: []
            };
          }
          
          // Add vehicle position to the route
          if (coords && coords.length >= 2) {
            routes[key].points.push(coords);
            
            // Also track vehicle IDs for this route
            if (feature.properties.vehicleId) {
              routes[key].vehicles.push(feature.properties.vehicleId);
            }
          }
        }
      });
      
      // Clean up routes with too few points
      Object.keys(routes).forEach(key => {
        if (routes[key].points.length < 2) {
          delete routes[key];
        }
      });
      
      // Store processed route data
      MOBILITY_CONFIG.realRoutes.routeData = routes;
      
      log(`Processed ${Object.keys(routes).length} routes from API data`);
      
      // Update route cache for simulation
      updateRouteCache();
    } else {
      log("Invalid route data format from API");
    }
  } catch (error) {
    log(`Error processing route data: ${error.message}`);
  }
}

// Update internal route cache for simulation
function updateRouteCache() {
  const routes = MOBILITY_CONFIG.realRoutes.routeData;
  const routePatterns = [];
  
  Object.values(routes).forEach(route => {
    // Simplify route to use fewer points for simulation efficiency
    // Use at most 10 points per route
    let points = route.points;
    if (points.length > 10) {
      const step = Math.floor(points.length / 10);
      points = points.filter((_, index) => index % step === 0).slice(0, 10);
    }
    
    // Ensure we have enough points (at least 2)
    if (points.length >= 2) {
      routePatterns.push({
        type: route.type,
        line: route.line,
        points: points
      });
    }
  });
  
  // If we have route patterns, update the cache
  if (routePatterns.length > 0) {
    mobData.routeCache.patterns = routePatterns;
    log(`Updated route cache with ${routePatterns.length} patterns`);
  } else {
    log("Not enough valid routes found, keeping previous cache");
  }
}

// Get route patterns for simulation
function getRoutePatterns() {
  // If we have cached patterns from real routes, use those
  if (mobData.routeCache && mobData.routeCache.patterns && 
      mobData.routeCache.patterns.length > 0) {
    return mobData.routeCache.patterns;
  }
  
  // No valid routes available
  log("No valid route patterns available");
  return [];
}

// Initialize vehicle simulation
function initializeSimulation() {
  // Create initial simulated vehicles
  mobData.simulationStartTime = Date.now();
  mobData.simulatedVehicles = [];
  
  // Fetch real routes first if we want to use real route patterns
  if (!MOBILITY_CONFIG.useSimulation && !MOBILITY_CONFIG.realRoutes.lastFetch) {
    fetchRouteData()
      .then(() => {
        // Check if we have route patterns before creating vehicles
        const routePatterns = getRoutePatterns();
        if (routePatterns.length > 0) {
          createSimulatedVehicles();
        } else {
          log("No route patterns available after fetching. No vehicles will be created.");
        }
      })
      .catch(() => {
        log("Failed to fetch routes and no default routes available. No vehicles will be created.");
      });
  } else {
    // Check if we have route patterns before creating vehicles
    const routePatterns = getRoutePatterns();
    if (routePatterns.length > 0) {
      createSimulatedVehicles();
    } else {
      log("No route patterns available for simulation. No vehicles will be created.");
    }
  }
}

// Create simulated vehicles
function createSimulatedVehicles() {
  // Clear existing vehicles
  mobData.simulatedVehicles = [];
  
  // Get route patterns and check if any are available
  const routePatterns = getRoutePatterns();
  
  // If no routes are available, don't create any vehicles
  if (routePatterns.length === 0) {
    log("Cannot create vehicles: No route patterns available");
    return;
  }
  
  for (let i = 0; i < MOBILITY_CONFIG.simulatedVehicles; i++) {
    createSimulatedVehicle();
  }
  
  log(`Initialized ${mobData.simulatedVehicles.length} simulated vehicles`);
}

// Create a single simulated vehicle
function createSimulatedVehicle() {
  // Get route patterns - either real or default
  const routePatterns = getRoutePatterns();
  
  // Skip if no route patterns available
  if (routePatterns.length === 0) {
    return null;
  }
  
  // Pick a random route pattern
  const routeIndex = Math.floor(Math.random() * routePatterns.length);
  const route = routePatterns[routeIndex];
  
  // Create a unique ID for this vehicle
  const vehicleId = `sim_vehicle_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  
  // Determine if this vehicle travels forward or backward along the route
  const direction = Math.random() > 0.5 ? 1 : -1;
  
  // Start at a random position along the route
  const progressRatio = Math.random();
  
  // Calculate speed (km/h converted to degrees/ms)
  // This is a very rough approximation
  const baseSpeed = 5 + Math.random() * 30; // Random speed between 5-35 km/h
  const speedFactor = 0.00001; // Conversion factor to make movement look reasonable on the map
  
  // Store the simulated vehicle
  mobData.simulatedVehicles.push({
    id: vehicleId,
    routeIndex: routeIndex,
    type: route.type,
    line: route.line,
    direction: direction,
    progress: progressRatio,
    speed: baseSpeed * speedFactor,
    lastUpdate: Date.now()
  });
}

// Update simulated vehicle positions
function updateSimulatedVehicles() {
  const currentTime = Date.now();
  const timeFactor = MOBILITY_CONFIG.simulationSpeedFactor;
  
  // Get route patterns - either real or default
  const routePatterns = getRoutePatterns();
  
  // Skip if no route patterns
  if (routePatterns.length === 0) {
    return;
  }
  
  // Update each vehicle's position
  mobData.simulatedVehicles.forEach(vehicle => {
    // Calculate time delta
    const timeDelta = vehicle.lastUpdate ? (currentTime - vehicle.lastUpdate) * timeFactor : 0;
    
    // Get route pattern
    const route = routePatterns[vehicle.routeIndex % routePatterns.length];
    if (!route) return;
    
    // Update progress along route
    vehicle.progress += (vehicle.speed * timeDelta * vehicle.direction);
    
    // Handle reaching end of route
    if (vehicle.progress >= 1) {
      // Either reverse direction or loop back to start
      if (Math.random() > 0.7) {
        vehicle.direction = -1;
        vehicle.progress = 1;
      } else {
        vehicle.progress = 0;
      }
    } else if (vehicle.progress <= 0) {
      // Either reverse direction or loop back to end
      if (Math.random() > 0.7) {
        vehicle.direction = 1;
        vehicle.progress = 0;
      } else {
        vehicle.progress = 1;
      }
    }
    
    // Normalize progress to 0-1 range
    vehicle.progress = Math.max(0, Math.min(1, vehicle.progress));
    
    // Update timestamp
    vehicle.lastUpdate = currentTime;
  });
  
  mobData.lastSimulationUpdate = currentTime;
}

// Generate GeoJSON-like data from simulated vehicles
function generateSimulatedData() {
  // Make sure simulated vehicles are up to date
  updateSimulatedVehicles();
  
  // If we have no vehicles, create an empty features array
  if (mobData.simulatedVehicles.length === 0) {
    return { features: [] };
  }
  
  // Get route patterns - either real or default
  const routePatterns = getRoutePatterns();
  
  // If no route patterns, return empty features
  if (routePatterns.length === 0) {
    return { features: [] };
  }
  
  // Create GeoJSON-like structure
  const features = mobData.simulatedVehicles.map(vehicle => {
    // Get route pattern
    const route = routePatterns[vehicle.routeIndex % routePatterns.length];
    if (!route) return null;
    
    // Calculate position along the route by interpolating between points
    const points = route.points;
    if (points.length < 2) return null;
    
    // Find the specific segment the vehicle is on
    const totalSegments = points.length - 1;
    const segmentIndex = Math.min(Math.floor(vehicle.progress * totalSegments), totalSegments - 1);
    
    // Calculate progress within this segment
    const segmentProgress = (vehicle.progress * totalSegments) - segmentIndex;
    
    // Get segment start and end points
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    
    // Interpolate between start and end
    const lon = start[0] + (end[0] - start[0]) * segmentProgress;
    const lat = start[1] + (end[1] - start[1]) * segmentProgress;
    
    // Calculate bearing (direction) based on segment
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    let bearing = (Math.atan2(dx, dy) * 180 / Math.PI);
    if (vehicle.direction < 0) {
      // Reverse bearing if going backward
      bearing = (bearing + 180) % 360;
    }
    // Normalize bearing to 0-360
    bearing = (bearing + 360) % 360;
    
    // Convert km/h speed for display
    const displaySpeed = vehicle.speed / 0.00001;
    
    // Create feature 
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat]
      },
      properties: {
        vehicleId: vehicle.id,
        vehicleType: vehicle.type,
        line: vehicle.line,
        bearing: bearing,
        speed: displaySpeed,
        time: new Date().toISOString()
      }
    };
  }).filter(Boolean); // Remove any null entries
  
  return { features };
}

// Fetch vehicle data from the API
function fetchVehicleData() {
  // Use simulation if enabled (should be disabled)
  if (MOBILITY_CONFIG.useSimulation) {
    try {
      // Generate simulated data
      const simulatedData = generateSimulatedData();
      
      // Process the data
      document.getElementById('dataStatus').textContent = "Data: Simulated";
      document.getElementById('dataStatus').style.color = "#00ff00";
      processVehicleData(simulatedData);
    } catch (error) {
      console.error("Error generating simulated data:", error);
      document.getElementById('dataStatus').textContent = "Data: Simulation Error";
      document.getElementById('dataStatus').style.color = "#ff0000";
      
      if (typeof log === "function") {
        log(`Simulation error: ${error.message}`);
      }
    }
    return;
  }
  
  // Always use Python server since we removed the toggle option
  fetchVehicleDataFromPythonServer();
}

// Rename the existing API fetch function to avoid conflict
function fetchVehicleDataFromAPI() {
  document.getElementById('dataStatus').textContent = "Data: Fetching from API...";
  document.getElementById('dataStatus').style.color = "#ffcc00";
  
  // Prepare request URL with optional timestamp parameter
  let apiUrl = MOBILITY_CONFIG.apiUrl;
  if (mobData.lastTimestamp) {
    apiUrl += `?timestamp=${Math.floor(mobData.lastTimestamp / 1000)}`; // Convert ms to seconds
  }
  
  // Prepare headers for authentication if needed
  const headers = { ...MOBILITY_CONFIG.apiHeaders };
  if (MOBILITY_CONFIG.apiToken) {
    headers['Authorization'] = `Bearer ${MOBILITY_CONFIG.apiToken}`;
  }
  
  if (MOBILITY_CONFIG.debugMode) {
    log(`Fetching data from API: ${apiUrl}`);
    log(`Using headers: ${JSON.stringify(headers)}`);
  }
  
  // Request real data from API
  fetch(apiUrl, { headers })
    .then(response => {
      if (MOBILITY_CONFIG.debugMode) {
        log(`API response status: ${response.status}`);
        log(`API response headers: ${JSON.stringify([...response.headers.entries()])}`);
      }
      
      // Store the timestamp from the header
      const dataTimestamp = response.headers.get('X-Data-Timestamp');
      if (dataTimestamp) {
        mobData.lastTimestamp = new Date(dataTimestamp).getTime();
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      document.getElementById('dataStatus').textContent = "Data: Connected (Direct API)";
      document.getElementById('dataStatus').style.color = "#00ff00";
      
      // Reset error count since we got successful data
      mobData.apiErrorCount = 0;
      mobData.lastApiError = null;
      
      // Store raw response for debugging
      mobData.lastRawResponse = JSON.stringify(data).substring(0, 500) + '...';
      
      if (MOBILITY_CONFIG.debugMode) {
        log(`Received API data: ${mobData.lastRawResponse}`);
      }
      
      // Data is already in GeoJSON format
      processVehicleData(data);
      
      // Update route data with latest vehicle positions
      updateRouteDataFromVehicles(data);
      
      log(`Received data for ${data.features ? data.features.length : 0} vehicles from API`);
    })
    .catch(error => {
      console.error("Error fetching vehicle data:", error);
      document.getElementById('dataStatus').textContent = "Data: API Error";
      document.getElementById('dataStatus').style.color = "#ff0000";
      
      // Store the last API error
      mobData.lastApiError = error.message;
      
      if (typeof log === "function") {
        log(`Vehicle data error: ${error.message}`);
        
        // Suggest switching to simulation if API fails repeatedly
        if (mobData.apiErrorCount === undefined) mobData.apiErrorCount = 0;
        mobData.apiErrorCount++;
        
        if (mobData.apiErrorCount > 3) {
          log("Multiple API errors detected. Consider enabling simulation mode.");
          
          // Auto-switch to simulation if configured and not prevented
          if (CONFIG && CONFIG.mobilityAutoSwitch && !MOBILITY_CONFIG.preventAutoSwitchToSimulation) {
            log("Auto-switching to simulation mode due to API failures");
            MOBILITY_CONFIG.useSimulation = true;
            // Try again with simulation
            setTimeout(fetchVehicleData, 1000);
          } else {
            log("Auto-switching to simulation is disabled. Please check API connection details.");
          }
        }
      }
    });
}

// Add this new function to fetch data from the Python server
function fetchVehicleDataFromPythonServer() {
  const apiUrl = MOBILITY_CONFIG.pythonServerUrl;
  
  document.getElementById('dataStatus').textContent = "Data: Fetching from Python...";
  document.getElementById('dataStatus').style.color = "#ffcc00";
  
  if (MOBILITY_CONFIG.debugMode) {
    log(`Fetching data from Python server: ${apiUrl}`);
  }
  
  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      document.getElementById('dataStatus').textContent = "Data: Connected (Python)";
      document.getElementById('dataStatus').style.color = "#00ff00";
      
      // Reset error count since we got successful data
      mobData.apiErrorCount = 0;
      mobData.lastApiError = null;
      
      // Store raw response for debugging
      mobData.lastRawResponse = JSON.stringify(data).substring(0, 500) + '...';
      
      if (MOBILITY_CONFIG.debugMode) {
        log(`Received data from Python: ${mobData.lastRawResponse}`);
      }
      
      // Process the data
      processVehicleData(data);
      
      // Update route data with latest vehicle positions
      updateRouteDataFromVehicles(data);
      
      log(`Received data for ${data.features ? data.features.length : 0} vehicles from Python server`);
    })
    .catch(error => {
      log(`Error fetching from Python server: ${error.message}. Falling back to direct API.`);
      document.getElementById('dataStatus').textContent = "Data: Python Error";
      document.getElementById('dataStatus').style.color = "#ffcc00";
      
      // Fall back to direct API
      fetchVehicleDataFromAPI();
    });
}

// Convert API response to GeoJSON format that our system can process
function convertApiResponseToGeoJson(apiData) {
  // Check if the data is already in GeoJSON format with features array
  if (apiData.features && Array.isArray(apiData.features)) {
    // Log raw data for debugging
    if (MOBILITY_CONFIG.debugMode && apiData.features.length > 0) {
      const firstFeature = apiData.features[0];
      log(`First feature from API: ${JSON.stringify(firstFeature.properties).substring(0, 200)}`);
    }
    return apiData;
  }
  
  // Convert the API response to GeoJSON format
  const features = Array.isArray(apiData) ? apiData.map(item => {
    // Extract properties based on API documentation
    const vehicleId = item.properties?.uuid || item.uuid || item.properties?.id || item.id || 
                      `vehicle_${Math.random().toString(36).substring(2, 9)}`;
    
    // Try to get line ID from multiple possible property names
    const lineIdRaw = item.properties?.line || item.properties?.lineId || item.lineId || 
                     item.properties?.lineName || item.properties?.routeId || 'unknown';
    
    const direction = item.properties?.direction || item.direction || 0;
    const timestamp = item.properties?.timestamp || item.timestamp || Date.now();
    
    // First check if vehicle type is explicitly provided in the API response
    let vehicleType = item.properties?.vehicleType || item.vehicleType || item.properties?.type || item.type;
    
    // If no explicit vehicle type, infer from specific line numbers
    if (!vehicleType) {
      // Normalize the line ID - convert to string, trim, and remove prefixes
      let lineIdStr = String(lineIdRaw).trim();
      
      // Log detailed debugging information
      if (MOBILITY_CONFIG.debugMode) {
        log(`Raw lineId: '${lineIdRaw}', Normalized to: '${lineIdStr}'`);
      }
      
      // Define the exact line numbers for metro and tram
      const metroLines = ['1', '2', '5', '6'];
      const tramLines = ['4', '7', '8', '9', '10', '18', '19', '25', '35', '39', '51', 
                        '55', '62', '81', '82', '92', '93', '97'];
      
      // Check if line is a metro line - use exact string matching
      if (metroLines.indexOf(lineIdStr) >= 0) {
        vehicleType = 'metro';
        if (MOBILITY_CONFIG.debugMode) {
          log(`Line ID '${lineIdStr}' matched METRO`);
        }
      }
      // Check if line is a tram line
      else if (tramLines.indexOf(lineIdStr) >= 0) {
        vehicleType = 'tram';
        if (MOBILITY_CONFIG.debugMode) {
          log(`Line ID '${lineIdStr}' matched TRAM`);
        }
      }
      // Otherwise it's a bus
      else {
        vehicleType = 'bus';
        if (MOBILITY_CONFIG.debugMode) {
          log(`Line ID '${lineIdStr}' did not match any known metro/tram line → BUS`);
        }
      }
    }
    
    // Convert to lowercase for consistency
    vehicleType = String(vehicleType).toLowerCase();
    
    // Make sure it's one of our supported types
    if (!['bus', 'tram', 'metro'].includes(vehicleType)) {
      vehicleType = 'bus'; // default fallback
    }
    
    // Extract coordinates - handle various possible structures
    let coordinates;
    if (item.geometry && item.geometry.coordinates) {
      coordinates = item.geometry.coordinates;
    } else if (item.coordinates) {
      coordinates = item.coordinates;
    } else if (item.position) {
      coordinates = [item.position.longitude, item.position.latitude];
    } else {
      // Default coordinates for Brussels center if none available
      coordinates = [4.37, 50.86];
    }
    
    // Make sure coordinates are valid (sometimes API might provide them differently)
    if (Array.isArray(coordinates[0])) {
      // If the first element is an array, the structure might be nested arrays
      coordinates = coordinates[0];
    }
    
    // Ensure coordinates are numbers
    if (typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') {
      coordinates = [4.37, 50.86]; // Default to Brussels center
    }
    
    // Return GeoJSON feature
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: coordinates
      },
      properties: {
        vehicleId: vehicleId,
        vehicleType: vehicleType,
        line: lineIdRaw, // Use raw line ID for display
        lineNormalized: String(lineIdRaw).trim(), // Store normalized version
        bearing: direction,
        speed: item.properties?.speed || item.speed || 0,
        time: new Date(timestamp * 1000).toISOString(), // Convert timestamp to ISO string
        color: item.properties?.color  // Store the color if available
      }
    };
  }) : [];
  
  return { features };
}

// Update route data from latest vehicle positions
function updateRouteDataFromVehicles(data) {
  // Only update route data if we have features
  if (!data.features || !Array.isArray(data.features)) return;
  
  try {
    // Group vehicles by line and type
    const vehicleGroups = {};
    data.features.forEach(feature => {
      if (feature.properties && feature.geometry && feature.geometry.coordinates) {
        const type = feature.properties.vehicleType || 'bus';
        const line = feature.properties.line || 'unknown';
        const vehicleId = feature.properties.vehicleId || 'unknown';
        const key = `${type}_${line}`;
        
        if (!vehicleGroups[key]) {
          vehicleGroups[key] = {};
        }
        
        if (!vehicleGroups[key][vehicleId]) {
          vehicleGroups[key][vehicleId] = [];
        }
        
        // Add position to vehicle's path
        vehicleGroups[key][vehicleId].push(feature.geometry.coordinates);
      }
    });
    
    // Create/update routes from vehicle positions
    Object.entries(vehicleGroups).forEach(([key, vehicles]) => {
      const [type, line] = key.split('_');
      
      // Get existing route or create new one
      if (!MOBILITY_CONFIG.realRoutes.routeData[key]) {
        MOBILITY_CONFIG.realRoutes.routeData[key] = {
          type: type,
          line: line,
          points: [],
          vehicles: []
        };
      }
      
      const route = MOBILITY_CONFIG.realRoutes.routeData[key];
      
      // Update vehicle list
      route.vehicles = Object.keys(vehicles);
      
      // Update points with new positions
      Object.values(vehicles).forEach(positions => {
        if (positions.length > 0) {
          // Add new points that aren't too close to existing ones
          const lastPos = positions[positions.length - 1];
          let isDuplicate = false;
          
          // Check if this position is already in the route
          for (const point of route.points) {
            // Calculate distance (very simple approximation)
            const dx = point[0] - lastPos[0];
            const dy = point[1] - lastPos[1];
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // If too close, mark as duplicate
            if (dist < 0.0001) { // About 10 meters
              isDuplicate = true;
              break;
            }
          }
          
          // Add to route if not duplicate
          if (!isDuplicate) {
            route.points.push(lastPos);
          }
        }
      });
      
      // Limit the number of points per route (max 100)
      if (route.points.length > 100) {
        route.points = route.points.slice(-100);
      }
    });
    
    // Update the last fetch time
    MOBILITY_CONFIG.realRoutes.lastFetch = Date.now();
    
    // Update the route cache for simulation
    updateRouteCache();
    
  } catch (error) {
    log(`Error updating route data: ${error.message}`);
  }
}

// Setup UI control handlers
function setupMobilityControls(viewer) {
  // Toggle vehicle visibility
  document.getElementById('showVehicles').addEventListener('change', function(e) {
    mobData.dataSource.show = e.target.checked;
    
    // Make sure all vehicle types are visible when toggled on
    if (e.target.checked) {
      mobData.visibleTypes.bus = true;
      mobData.visibleTypes.tram = true;
      mobData.visibleTypes.metro = true;
    }
  });
  
  // Remove the individual vehicle type toggle event listeners since we removed them from the HTML
  
  // Update interval selection
  document.getElementById('updateIntervalSelect').addEventListener('change', function(e) {
    MOBILITY_CONFIG.updateInterval = parseInt(e.target.value);
    restartVehicleDataUpdates();
  });
  
  // Manual refresh
  document.getElementById('refreshNowButton').addEventListener('click', function() {
    fetchVehicleData();
  });
  
  // Vehicle selection
  viewer.screenSpaceEventHandler.setInputAction(function(click) {
    const pickedObject = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.entityType === 'vehicle') {
      selectVehicle(pickedObject.id.vehicleId);
    } else {
      deselectVehicle();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  
  // Close vehicle info panel
  document.getElementById('closeVehicleInfo').addEventListener('click', function() {
    deselectVehicle();
  });
  
  // Add API switch control to toggle between real API and simulation
  const controlsDiv = document.getElementById('vehicleControls');
  const apiSwitchContainer = document.createElement('div');
  apiSwitchContainer.className = 'control-group';
  apiSwitchContainer.innerHTML = `
    <label><input type="checkbox" id="useRealApi" ${!MOBILITY_CONFIG.useSimulation ? 'checked' : ''}> Use Real API</label>
  `;
  controlsDiv.insertBefore(apiSwitchContainer, controlsDiv.firstChild);
  
  // Set up event handler for API switch
  document.getElementById('useRealApi').addEventListener('change', function(e) {
    MOBILITY_CONFIG.useSimulation = !e.target.checked;
    log(`Switched to ${MOBILITY_CONFIG.useSimulation ? 'simulation' : 'real API'} mode`);
    // Reinitialize with new setting
    resetSimulation();
    restartVehicleDataUpdates();
  });
  
  // Add debugging info section for API troubleshooting
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
  
  // Set up debug toggle
  document.getElementById('showDebugInfo').addEventListener('change', function(e) {
    document.getElementById('apiDebugInfo').style.display = e.target.checked ? 'block' : 'none';
    updateDebugInfo();
  });
}

// Setup temporal (time-based) controls
function setupTemporalControls(viewer) {
  // Live mode toggle
  document.getElementById('liveMode').addEventListener('change', function(e) {
    mobData.liveMode = e.target.checked;
    document.getElementById('timeSlider').disabled = mobData.liveMode;
    document.getElementById('playPauseButton').textContent = mobData.liveMode ? "Pause" : "Play";
    
    if (mobData.liveMode) {
      // Reset to current time
      mobData.timeOffset = 0;
      updateVehiclePositions();
      document.getElementById('timeDisplay').textContent = "Current Time: Live";
    } else {
      // Switch to historical mode with current time
      document.getElementById('timeDisplay').textContent = "Current Time: " + 
        new Date().toLocaleTimeString();
    }
  });
  
  // Play/Pause button
  document.getElementById('playPauseButton').addEventListener('click', function() {
    if (mobData.liveMode) {
      // Switch to historical mode (paused)
      document.getElementById('liveMode').checked = false;
      mobData.liveMode = false;
      document.getElementById('timeSlider').disabled = false;
      this.textContent = "Play";
    } else {
      // Toggle play/pause in historical mode
      if (this.textContent === "Play") {
        this.textContent = "Pause";
        startHistoricalPlayback();
      } else {
        this.textContent = "Play";
        stopHistoricalPlayback();
      }
    }
  });
  
  // Time slider
  document.getElementById('timeSlider').addEventListener('input', function(e) {
    if (!mobData.liveMode) {
      // Calculate time offset based on slider position
      const sliderValue = parseInt(e.target.value);
      const maxHistory = MOBILITY_CONFIG.historyLength;
      mobData.timeOffset = maxHistory * (100 - sliderValue) / 100;
      updateVehiclePositions();
      
      // Update time display
      const displayTime = new Date(Date.now() - mobData.timeOffset);
      document.getElementById('timeDisplay').textContent = 
        "Current Time: " + displayTime.toLocaleTimeString();
    }
  });
}

// Setup simulation UI controls
function setupSimulationControls() {
  // Add simulation controls to the vehicle control panel
  const controlsDiv = document.getElementById('vehicleControls');
  
  // Create simulation controls section
  const simulationSection = document.createElement('div');
  simulationSection.className = 'control-group';
  simulationSection.innerHTML = `
    <label>Simulation Controls:</label>
    <div style="margin-top: 5px;">
      <label>
        Vehicle Count: 
        <input type="number" id="simVehicleCount" min="5" max="100" value="${MOBILITY_CONFIG.simulatedVehicles}" style="width: 50px;">
      </label>
    </div>
    <div style="margin-top: 5px;">
      <label>
        Speed Factor: 
        <input type="range" id="simSpeedFactor" min="0.1" max="5" step="0.1" value="${MOBILITY_CONFIG.simulationSpeedFactor}" style="width: 100px;">
        <span id="speedFactorValue">${MOBILITY_CONFIG.simulationSpeedFactor}x</span>
      </label>
    </div>
    <div style="margin-top: 5px;">
      <button id="resetSimulation">Reset Simulation</button>
    </div>
  `;
  
  // Add to controls panel
  controlsDiv.appendChild(simulationSection);
  
  // Set up event handlers
  document.getElementById('simVehicleCount').addEventListener('change', function(e) {
    const newCount = parseInt(e.target.value);
    if (!isNaN(newCount) && newCount >= 5 && newCount <= 100) {
      MOBILITY_CONFIG.simulatedVehicles = newCount;
      resetSimulation();
    }
  });
  
  document.getElementById('simSpeedFactor').addEventListener('input', function(e) {
    const newFactor = parseFloat(e.target.value);
    MOBILITY_CONFIG.simulationSpeedFactor = newFactor;
    document.getElementById('speedFactorValue').textContent = `${newFactor.toFixed(1)}x`;
  });
  
  document.getElementById('resetSimulation').addEventListener('click', function() {
    resetSimulation();
  });
}

// Start/restart the data update process
function startVehicleDataUpdates() {
  if (!mobData.workerActive) {
    mobData.workerActive = true;
    fetchVehicleData();
    
    // Set up periodic updates
    mobData.updateInterval = setInterval(() => {
      fetchVehicleData();
    }, MOBILITY_CONFIG.updateInterval);
  }
}

// Stop data updates
function stopVehicleDataUpdates() {
  mobData.workerActive = false;
  if (mobData.updateInterval) {
    clearInterval(mobData.updateInterval);
    mobData.updateInterval = null;
  }
}

// Restart data updates (after config change)
function restartVehicleDataUpdates() {
  stopVehicleDataUpdates();
  startVehicleDataUpdates();
}

// Reset the simulation
function resetSimulation() {
  // Stop updates temporarily
  const wasActive = mobData.workerActive;
  if (wasActive) {
    stopVehicleDataUpdates();
  }
  
  // Clear existing vehicles
  if (mobData.dataSource) {
    mobData.dataSource.entities.removeAll();
  }
  mobData.vehicles = {};
  mobData.vehicleHistory = {};
  
  // Reset simulation
  initializeSimulation();
  
  // Restart updates if they were active
  if (wasActive) {
    startVehicleDataUpdates();
  }
  
  log("Simulation reset with " + MOBILITY_CONFIG.simulatedVehicles + " vehicles");
}

// Process vehicle data into OGC Moving Features format
function processVehicleData(data) {
  const currentTime = Date.now();
  const newVehicles = {};
  let processedCount = 0;
  
  // Convert to OGC Moving Features format and update our vehicle collection
  data.features.forEach(feature => {
    // Limit number of vehicles for performance
    if (processedCount >= MOBILITY_CONFIG.maxVehicles) return;
    
    try {
      // Extract ID from feature
      const vehicleId = feature.properties.vehicleId || 
                         feature.properties.id || 
                         `vehicle_${Math.random().toString(36).substring(2, 9)}`;
      
      // Convert to OGC Moving Feature format
      const ogcFeature = convertToOgcMovingFeature(feature);
      
      // Store in our vehicles collection
      newVehicles[vehicleId] = ogcFeature;
      
      // Add to history
      if (!mobData.vehicleHistory[vehicleId]) {
        mobData.vehicleHistory[vehicleId] = [];
      }
      
      // Add position to history with timestamp
      mobData.vehicleHistory[vehicleId].push({
        position: ogcFeature.geometry.coordinates.slice(),
        time: currentTime,
        bearing: ogcFeature.properties.bearing,
        speed: ogcFeature.properties.speed
      });
      
      // Limit history length
      while (mobData.vehicleHistory[vehicleId].length > 0 && 
             currentTime - mobData.vehicleHistory[vehicleId][0].time > MOBILITY_CONFIG.historyLength) {
        mobData.vehicleHistory[vehicleId].shift();
      }
      
      processedCount++;
    } catch (e) {
      console.error("Error processing vehicle:", e);
    }
  });
  
  // Update or create Cesium entities for the vehicles
  mobData.vehicles = newVehicles;
  mobData.lastUpdate = currentTime;
  
  // Update the visualization
  updateVehicleEntities();
  
  // Update log with vehicle count and type stats
  if (typeof log === "function") {
    log(`Updated ${processedCount} vehicles`);
    // Add vehicle type statistics
    logVehicleTypeStats();
  }
}

// Convert API data to OGC Moving Features format
function convertToOgcMovingFeature(feature) {
  // Handle different possible input formats
  let coordinates, vehicleType, line, bearing, speed;
  
  if (feature.geometry && feature.geometry.coordinates) {
    coordinates = feature.geometry.coordinates;
  } else if (feature.position) {
    coordinates = [feature.position.longitude, feature.position.latitude];
  }
  
  if (feature.properties) {
    vehicleType = feature.properties.vehicleType || 
                 (feature.properties.type ? feature.properties.type.toLowerCase() : 'bus');
    line = feature.properties.line || feature.properties.lineId || 'unknown';
    bearing = feature.properties.bearing || feature.properties.direction || 0;
    speed = feature.properties.speed || 0;
  }
  
  // Create OGC Moving Features compliant object
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: coordinates
    },
    properties: {
      time: feature.properties.time || new Date().toISOString(),
      vehicleId: feature.properties.vehicleId || feature.properties.id,
      vehicleType: vehicleType,
      line: line,
      bearing: bearing,
      speed: speed
    }
  };
}

// Update Cesium entities based on vehicle data
function updateVehicleEntities() {
  // Clear old entities if we're starting fresh
  if (mobData.dataSource.entities.values.length === 0) {
    mobData.dataSource.entities.removeAll();
  }
  
  // Update each vehicle
  Object.entries(mobData.vehicles).forEach(([vehicleId, vehicle]) => {
    const coordinates = vehicle.geometry.coordinates;
    const vehicleType = vehicle.properties.vehicleType;
    const bearing = vehicle.properties.bearing;
    const line = vehicle.properties.line;
    
    // Skip if vehicle type is hidden
    if (!mobData.visibleTypes[vehicleType]) {
      // If entity exists, hide it
      const existingEntity = mobData.dataSource.entities.getById(vehicleId);
      if (existingEntity) {
        existingEntity.show = false;
      }
      return;
    }
    
    // Check if entity already exists
    let entity = mobData.dataSource.entities.getById(vehicleId);
    if (!entity) {
      // Create new entity
      entity = new Cesium.Entity({
        id: vehicleId,
        name: `${vehicleType.toUpperCase()} ${line}`,
        position: Cesium.Cartesian3.fromDegrees(
          coordinates[0], 
          coordinates[1], 
          MOBILITY_CONFIG.vehicleHeightOffset
        ),
        entityType: 'vehicle',
        vehicleId: vehicleId
      });
      
      // Add vehicle model based on type
      addVehicleModel(entity, vehicleType);
      
      // Add the entity to the data source
      mobData.dataSource.entities.add(entity);
    } else {
      // Update position
      entity.position = Cesium.Cartesian3.fromDegrees(
        coordinates[0], 
        coordinates[1], 
        MOBILITY_CONFIG.vehicleHeightOffset
      );
      entity.show = true;
    }
    
    // Update orientation based on bearing
    entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
      entity.position.getValue(),
      new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(bearing),
        0,
        0
      )
    );
    
    // Update label with line number
    if (!entity.label) {
      entity.label = new Cesium.LabelGraphics({
        text: line,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000)
      });
    } else {
      entity.label.text = line;
    }
  });
  
  // Update positions for time-based view
  updateVehiclePositions();
}

// Add appropriate 3D model to vehicle entity
function addVehicleModel(entity, vehicleType) {
  const color = MOBILITY_CONFIG.vehicleColors[vehicleType] || Cesium.Color.YELLOW;
  
  switch(vehicleType) {
    case 'bus':
      entity.box = new Cesium.BoxGraphics({
        dimensions: new Cesium.Cartesian3(12, 3, 3),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      });
      break;
    case 'tram':
      entity.box = new Cesium.BoxGraphics({
        dimensions: new Cesium.Cartesian3(18, 2.5, 3.5),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      });
      break;
    case 'metro':
      entity.box = new Cesium.BoxGraphics({
        dimensions: new Cesium.Cartesian3(20, 3, 3.5),
        material: color,
        outline: true,
        outlineColor: Cesium.Color.BLACK
      });
      break;
    default:
      // Generic vehicle representation
      entity.point = new Cesium.PointGraphics({
        pixelSize: 10,
        color: color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2
      });
  }
}

// Update vehicle positions based on current time setting (live or historical)
function updateVehiclePositions() {
  if (!mobData.dataSource) return;
  
  const currentTime = Date.now();
  const targetTime = currentTime - mobData.timeOffset;
  
  Object.entries(mobData.vehicleHistory).forEach(([vehicleId, history]) => {
    const entity = mobData.dataSource.entities.getById(vehicleId);
    if (!entity) return;
    
    // Find the closest position in history
    let beforeIndex = -1;
    let afterIndex = -1;
    
    for (let i = 0; i < history.length; i++) {
      if (history[i].time <= targetTime) {
        beforeIndex = i;
      } else {
        afterIndex = i;
        break;
      }
    }
    
    // Determine position based on historical data
    if (beforeIndex >= 0 && afterIndex >= 0) {
      // Interpolate between two points
      const before = history[beforeIndex];
      const after = history[afterIndex];
      
      const ratio = (targetTime - before.time) / (after.time - before.time);
      
      // Interpolate coordinates
      const lon = before.position[0] + (after.position[0] - before.position[0]) * ratio;
      const lat = before.position[1] + (after.position[1] - before.position[1]) * ratio;
      
      // Interpolate bearing (handling 0/360 wraparound)
      let bearingDiff = after.bearing - before.bearing;
      if (bearingDiff > 180) bearingDiff -= 360;
      if (bearingDiff < -180) bearingDiff += 360;
      const bearing = before.bearing + bearingDiff * ratio;
      
      // Update position and orientation
      entity.position = Cesium.Cartesian3.fromDegrees(
        lon, lat, MOBILITY_CONFIG.vehicleHeightOffset
      );
      entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        entity.position.getValue(),
        new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(bearing),
          0,
          0
        )
      );
      
    } else if (beforeIndex >= 0) {
      // Only before point exists (use latest historical position)
      const point = history[beforeIndex];
      entity.position = Cesium.Cartesian3.fromDegrees(
        point.position[0], 
        point.position[1], 
        MOBILITY_CONFIG.vehicleHeightOffset
      );
      entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        entity.position.getValue(),
        new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(point.bearing),
          0,
          0
        )
      );
    } else if (afterIndex >= 0) {
      // Only future point exists (unusual case)
      const point = history[afterIndex];
      entity.position = Cesium.Cartesian3.fromDegrees(
        point.position[0], 
        point.position[1], 
        MOBILITY_CONFIG.vehicleHeightOffset
      );
      entity.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        entity.position.getValue(),
        new Cesium.HeadingPitchRoll(
          Cesium.Math.toRadians(point.bearing),
          0,
          0
        )
      );
    }
    // Otherwise no position data exists
  });
}

// Historical playback mode
let playbackInterval = null;

function startHistoricalPlayback() {
  if (playbackInterval) return;
  
  playbackInterval = setInterval(() => {
    // Reduce timeOffset to move forward in time
    mobData.timeOffset = Math.max(0, mobData.timeOffset - 1000); // Move forward 1 second
    
    // Update slider position
    const sliderValue = 100 - (mobData.timeOffset / MOBILITY_CONFIG.historyLength * 100);
    document.getElementById('timeSlider').value = sliderValue;
    
    // Update positions
    updateVehiclePositions();
    
    // Update time display
    const displayTime = new Date(Date.now() - mobData.timeOffset);
    document.getElementById('timeDisplay').textContent = 
      "Current Time: " + displayTime.toLocaleTimeString();
    
    // If we've reached current time, switch back to live mode
    if (mobData.timeOffset <= 0) {
      document.getElementById('liveMode').checked = true;
      document.getElementById('timeSlider').disabled = true;
      document.getElementById('playPauseButton').textContent = "Pause";
      mobData.liveMode = true;
      mobData.timeOffset = 0;
      document.getElementById('timeDisplay').textContent = "Current Time: Live";
      stopHistoricalPlayback();
    }
  }, 100); // Update 10 times per second for smooth playback
}

function stopHistoricalPlayback() {
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
}

// Update visibility of vehicles based on type filters
function updateVehicleVisibility() {
  if (!mobData.dataSource) return;
  
  // Now we only check if dataSource.show is true, all types are always shown
  const showAll = mobData.dataSource.show;
  
  mobData.dataSource.entities.values.forEach(entity => {
    if (entity.entityType === 'vehicle') {
      // All vehicles are visible if the main toggle is checked
      entity.show = showAll;
    }
  });
}

// Select a vehicle
function selectVehicle(vehicleId) {
  deselectVehicle(); // Clear any existing selection
  
  const vehicle = mobData.vehicles[vehicleId];
  if (!vehicle) return;
  
  // Highlight selected vehicle
  const entity = mobData.dataSource.entities.getById(vehicleId);
  if (entity) {
    mobData.selectedVehicle = vehicleId;
    
    // Store original appearance
    if (entity.box) {
      entity._originalDimensions = entity.box.dimensions.getValue();
      entity._originalMaterial = entity.box.material.getValue();
      
      // Highlight
      entity.box.dimensions = new Cesium.Cartesian3(
        entity._originalDimensions.x * 1.2,
        entity._originalDimensions.y * 1.2,
        entity._originalDimensions.z * 1.2
      );
      entity.box.material = Cesium.Color.YELLOW.withAlpha(0.8);
    }
    
    // Show info panel
    displayVehicleInfo(vehicle);
  }
}

// Deselect vehicle
function deselectVehicle() {
  if (!mobData.selectedVehicle) return;
  
  const entity = mobData.dataSource.entities.getById(mobData.selectedVehicle);
  if (entity) {
    // Restore original appearance
    if (entity._originalDimensions && entity.box) {
      entity.box.dimensions = entity._originalDimensions;
      entity.box.material = entity._originalMaterial;
    }
  }
  
  mobData.selectedVehicle = null;
  
  // Hide info panel
  document.getElementById('vehicleInfo').style.display = 'none';
}

// Display vehicle information
function displayVehicleInfo(vehicle) {
  const infoDiv = document.getElementById('vehicleInfo');
  const detailsDiv = document.getElementById('vehicleDetails');
  
  // Format and display vehicle details
  const type = vehicle.properties.vehicleType.toUpperCase();
  const line = vehicle.properties.line;
  const speed = Math.round(vehicle.properties.speed || 0);
  const direction = Math.round(vehicle.properties.bearing);
  
  let html = `
    <p><strong>Type:</strong> ${type}</p>
    <p><strong>Line:</strong> ${line}</p>
    <p><strong>Speed:</strong> ${speed} km/h</p>
    <p><strong>Direction:</strong> ${direction}°</p>
    <p><strong>Last Update:</strong> ${new Date().toLocaleTimeString()}</p>
  `;
  
  // Add position data
  const coords = vehicle.geometry.coordinates;
  html += `<p><strong>Position:</strong> ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}</p>`;
  
  detailsDiv.innerHTML = html;
  infoDiv.style.display = 'block';
}

// Add this diagnostic function to help us understand vehicle types
function logVehicleTypeStats() {
  if (!mobData.vehicles || Object.keys(mobData.vehicles).length === 0) return;
  
  const types = {bus: 0, tram: 0, metro: 0, unknown: 0};
  const linesByType = {bus: [], tram: [], metro: [], unknown: []};
  
  Object.values(mobData.vehicles).forEach(vehicle => {
    const type = vehicle.properties.vehicleType || 'unknown';
    const line = vehicle.properties.line || 'unknown';
    
    types[type] = (types[type] || 0) + 1;
    
    // Track line IDs by vehicle type (limited to 10 per type)
    if (linesByType[type].length < 10 && !linesByType[type].includes(line)) {
      linesByType[type].push(line);
    }
  });
  
  log(`Vehicle type statistics: ${JSON.stringify(types)}`);
  log(`Sample line IDs by type: ${JSON.stringify(linesByType)}`);
}

// Add this new function to update debug information
function updateDebugInfo() {
  if (document.getElementById('apiDebugInfo').style.display === 'none') return;
  
  document.getElementById('lastApiError').textContent = mobData.lastApiError || 'None';
  document.getElementById('lastRawResponse').textContent = mobData.lastRawResponse || 'None';
}
