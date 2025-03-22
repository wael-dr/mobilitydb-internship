#!/bin/bash
# Stop the Brussels Mobility data server

# Navigate to the script directory
cd "$(dirname "$0")"

# Check if PID file exists
if [ ! -f "mobility_server.pid" ]; then
    echo "No server seems to be running (PID file not found)"
    exit 1
fi

# Get PID from file
PID=$(cat mobility_server.pid)

# Check if process is running
if ps -p $PID > /dev/null; then
    echo "Stopping server with PID: $PID"
    kill $PID
    rm mobility_server.pid
    echo "Server stopped"
else
    echo "Server process not found (PID: $PID). It may have already been stopped."
    rm mobility_server.pid
fi
