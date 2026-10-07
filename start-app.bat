@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
	echo Node.js was not found. Install Node.js and try again.
	pause
	exit /b 1
)

set PORT=3000
echo Starting the dashboard on http://localhost:3000
echo Keep this window open while using the dashboard. Press Ctrl+C to stop it.
node server.js

echo The server has stopped. Check the message above for details.
pause
endlocal
