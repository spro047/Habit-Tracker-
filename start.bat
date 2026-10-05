@echo off
start "HABIT API" cmd /k "cd /d %~dp0server && node --env-file-if-exists=.env index.js"
start "HABIT CLIENT" cmd /k "cd /d %~dp0client && npm run dev"
echo Servers starting... open http://localhost:5173