#!/usr/bin/env python3
"""
Brussels Mobility API Data Fetcher - HTTP Server
This script runs a simple HTTP server that fetches data from the Brussels Mobility API
and serves it to the JavaScript application.
"""

import http.server
import socketserver
import requests
import json
import time
import threading
import urllib.parse
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("mobility_server.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger()

# Configuration
API_URL = "https://api.mobilitytwin.brussels/stib/vehicle-position"
PORT = 8001  # Changed from 8000 to 8001 to avoid conflict
CACHE_FILE = "vehicle_positions.json"
CACHE_TIMEOUT = 10  # seconds
last_fetch_time = 0
cached_data = None
cache_lock = threading.Lock()

class MobilityAPIHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests"""
        # Parse URL path
        parsed_path = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed_path.query)
        
        # Handle different routes
        if parsed_path.path == '/api/vehicles':
            # Return vehicle data
            self.serve_vehicle_data(query.get('token', [None])[0])
        
        elif parsed_path.path == '/api/status':
            # Return status information
            self.serve_status()
        
        else:
            # Serve the help page for any other path
            self.serve_help_page()
    
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')  # 24 hours
        self.end_headers()
    
    def serve_vehicle_data(self, token=None):
        """Fetch and serve vehicle data"""
        global last_fetch_time, cached_data
        
        # Check if we need to refresh the cache
        current_time = time.time()
        fetch_new_data = False
        
        with cache_lock:
            if cached_data is None or (current_time - last_fetch_time) > CACHE_TIMEOUT:
                fetch_new_data = True
        
        if fetch_new_data:
            # Fetch new data
            data = self.fetch_data(token)
            
            if data:
                with cache_lock:
                    cached_data = data
                    last_fetch_time = current_time
                    
                    # Also save to file for backup
                    try:
                        with open(CACHE_FILE, 'w') as f:
                            json.dump(data, f)
                    except Exception as e:
                        logger.error(f"Failed to save cache file: {str(e)}")
            else:
                # Try to load from cache file if API fetch failed
                try:
                    with open(CACHE_FILE, 'r') as f:
                        cached_data = json.load(f)
                        logger.info("Loaded data from cache file")
                except Exception:
                    # If nothing works, return an empty response
                    cached_data = {"features": []}
                    logger.error("No data available")
        
        # Send the response with CORS headers
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(cached_data).encode('utf-8'))
    
    def serve_status(self):
        """Serve status information"""
        global last_fetch_time
        
        status = {
            "server": "Brussels Mobility API Server",
            "version": "1.0",
            "time": datetime.now().isoformat(),
            "last_fetch": datetime.fromtimestamp(last_fetch_time).isoformat() if last_fetch_time > 0 else None,
            "cache_timeout": CACHE_TIMEOUT,
            "api_url": API_URL
        }
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(status).encode('utf-8'))
    
    def serve_help_page(self):
        """Serve a simple HTML help page"""
        help_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Brussels Mobility API Server</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #333; }
                pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>Brussels Mobility API Server</h1>
            <p>This server provides access to the Brussels Mobility API data.</p>
            
            <h2>Available Endpoints:</h2>
            <ul>
                <li><strong>/api/vehicles</strong> - Get real-time vehicle positions</li>
                <li><strong>/api/status</strong> - Get server status information</li>
            </ul>
            
            <h2>Example Usage:</h2>
            <pre>fetch('http://localhost:8001/api/vehicles')
    .then(response => response.json())
    .then(data => console.log(data));</pre>
            
            <p>Server running on port {port}</p>
        </body>
        </html>
        """.format(port=PORT)
        
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(help_html.encode('utf-8'))
    
    def fetch_data(self, token=None):
        """Fetch vehicle position data from the API"""
        api_token = token or "c9ab58bd69b8213fa5cc1d01e73ffb34793da24d88e2ec0d6e773e8bbc0f891576ca308b7e2c4bf581babf30dea68f450d121a1f0ba59a23ad5c88f5f4305443"
        
        headers = {
            "Authorization": f"Bearer {api_token}",
            "Accept": "application/json"
        }
        
        logger.info(f"Fetching data from {API_URL}")
        
        try:
            response = requests.get(API_URL, headers=headers)
            response.raise_for_status()  # Raise exception for HTTP errors
            
            # Save the raw response for debugging
            with open("last_raw_response.json", "w") as f:
                f.write(response.text)
            
            data = response.json()
            vehicle_count = len(data.get('features', []))
            logger.info(f"Received data for {vehicle_count} vehicles")
            return data
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Request failed: {str(e)}")
            return None

def run_server():
    """Run the HTTP server"""
    # Allow the server to reuse the address if it was recently used
    socketserver.TCPServer.allow_reuse_address = True
    handler = MobilityAPIHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        logger.info(f"Server started at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Server stopped by user")
            httpd.server_close()

if __name__ == "__main__":
    try:
        run_server()
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.critical(f"Unexpected error: {str(e)}", exc_info=True)
