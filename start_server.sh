#!/bin/bash
# Start the Brussels Mobility data server

# Navigate to the script directory
cd "$(dirname "$0")"

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not found. Please install Python 3."
    exit 1
fi

# Check if required Python packages are installed
python3 -c "import requests" &> /dev/null
if [ $? -ne 0 ]; then
    echo "Installing required Python packages..."
    pip3 install requests
fi

# Run the data server in the background
echo "Starting Brussels Mobility data server on port 8001..."
nohup python3 mobility_server.py > mobility_server_output.log 2>&1 &

# Save the process ID for later use
echo $! > mobility_server.pid
echo "Data server started with PID: $!"
echo "To stop the server, run: kill $(cat mobility_server.pid)"
echo "Or use the stop_server.sh script"
echo "Server logs available in mobility_server.log and mobility_server_output.log"
