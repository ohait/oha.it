// Set your default stop ID here (e.g., '5632' for Gransletta)
const STOP_ID = '5632'; // Change this to any valid stop ID you want
async function getDepartures(stopId) {
    const fullStopId = stopId.startsWith('NSR:StopPlace:') ? stopId : `NSR:StopPlace:${stopId}`;
    console.log('Fetching departures for stop:', fullStopId);
    try {
        const response = await fetch(`https://api.entur.io/journey-planner/v3/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ET-Client-Name': 'oha-oslo-transit-weather',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                query: `{\n  stopPlace(id: \"${fullStopId}\") {\n    name\n    estimatedCalls(timeRange: 72100, numberOfDepartures: 20) {\n      expectedDepartureTime\n      destinationDisplay {\n        frontText\n      }\n      serviceJourney {\n        line {\n          publicCode\n        }\n      }\n    }\n  }\n}`
            })
        });
        const data = await response.json();
        if (data.errors) {
            console.error('API Errors:', data.errors);
            throw new Error(data.errors[0].message);
        }
        if (!data.data || !data.data.stopPlace) {
            throw new Error('Stop not found');
        }
        return data.data.stopPlace;
    } catch (error) {
        console.error('Error fetching departures:', error);
        throw new Error('Failed to fetch departures. Please check the stop ID and try again.');
    }
}

async function getWeather() {
    const lat = 59.91, lon = 10.75;
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'oslo-transit-weather/1.0 oha@users.noreply.github.com'
        }
    });
    if (!response.ok) throw new Error('Failed to fetch weather from met.no');
    return await response.json();
}


// Cache for departures
let cachedDepartures = null;
let cachedStopData = null;

async function fetchAndCacheDepartures() {
    const stopId = STOP_ID;
    const stopData = await getDepartures(stopId);
    cachedStopData = stopData;
    cachedDepartures = Date.now();
    renderDepartures();
}

function renderDepartures() {
    const dir1Div = document.getElementById('departures-dir1');
    const dir2Div = document.getElementById('departures-dir2');
    if (!cachedStopData) {
        dir1Div.innerHTML = 'Loading...';
        dir2Div.innerHTML = '';
        return;
    }

    const stopData = cachedStopData;
    if (!stopData) {
        dir1Div.innerHTML = 'Stop not found. Please verify the stop ID and try again.';
        dir2Div.innerHTML = '';
        return;
    }
    if (!stopData.estimatedCalls || stopData.estimatedCalls.length === 0) {
        dir1Div.innerHTML = `<h3>${stopData.name}</h3>No upcoming departures found for this stop.`;
        dir2Div.innerHTML = '';
        return;
    }
    const now = new Date();
    // Group departures by destination and line, limit to 3 per line
    const grouped = {};
    const destLines = {};
    stopData.estimatedCalls.forEach(call => {
        const dest = call.destinationDisplay.frontText;
        const line = call.serviceJourney.line.publicCode;
        const depTime = new Date(call.expectedDepartureTime);
        const diffMs = depTime - now;
        var diffMin = Math.max(0, Math.round(diffMs / 60000));
        if (!grouped[dest]) grouped[dest] = {};
        if (!grouped[dest][line]) grouped[dest][line] = [];
        if (diffMin > 60) {
            if(grouped[dest][line].length < 1) {
                diffMin = Math.round(diffMin / 60) + 'h';
                grouped[dest][line].push(diffMin);
            }
        }
        else if (diffMin > 0) {
            if (grouped[dest][line].length < 3) {
                diffMin = diffMin + '\'';
                grouped[dest][line].push(diffMin)
            }
        }
        if (!destLines[dest]) destLines[dest] = new Set();
        destLines[dest].add(line);
    });
    const dir2Dests = ["Åsbråten", "Furuset", "Asbråten"];
    const dir2Lines = new Set();
    dir2Dests.forEach(dest => {
        if (destLines[dest]) {
            destLines[dest].forEach(l => dir2Lines.add(l));
        }
    });

    let dir2Html = '';
    dir2Dests.forEach(dest => {
        if (grouped[dest]) {
            const lines = destLines[dest] ? Array.from(destLines[dest]).join(', ') : '';
            let etaHtml = '';
            
            Object.keys(grouped[dest]).forEach(line => {
                const times = grouped[dest][line].join('&nbsp; ');
                etaHtml += `<div>${times}</div>`;
            });
            
            dir2Html += `<div class="card"><span class="line-num">${lines}</span> <span class="dest">${dest}</span> <div class="eta">${etaHtml}</div></div>`;
        }
    });
    dir2Div.innerHTML = dir2Html;
}

// Cache for weather
globalThis.cachedWeather = null;

window.addEventListener('DOMContentLoaded', async () => {
    // Initialize weather display
    const weatherGridDiv = document.getElementById('weather-grid');
    if (!weatherGridDiv) {
        console.error('Weather grid element not found');
        return;
    }
    weatherGridDiv.innerHTML = '<div class="weather-grid-row"></div>';

    try {
        await fetchAndCacheDepartures();
        await updateWeather();
        setInterval(updateWeather, 15*60*1000); // Weather fetch every 15 minutes
        setInterval(renderDepartures, 30 * 1000); // Re-render departures every 30 seconds
        setInterval(fetchAndCacheDepartures, 5 * 60 * 1000); // Fetch new departures every 5 minutes
    } catch (error) {
        console.error('Error initializing app:', error);
    }
});

async function updateWeather() {
    const weatherGridDiv = document.getElementById('weather-grid');
    if (!weatherGridDiv) return;
    
    try {
        const weather = await getWeather();
        if (!weather) {
            weatherGridDiv.innerHTML = '<div class="weather-grid-row"><div class="weather-cell">Error loading weather. Please check the console for details.</div></div>';
            return;
        }
        cachedWeather = weather;
        renderWeather();
    } catch (error) {
        console.error('Error updating weather:', error);
        weatherGridDiv.innerHTML = '<div class="weather-grid-row"><div class="weather-cell">Error loading weather. Please check the console for details.</div></div>';
    }
}

function renderWeather() {
    const weatherGridDiv = document.getElementById('weather-grid');
    if (!cachedWeather || !weatherGridDiv) return;
    
    const timeseries = cachedWeather.properties.timeseries;
    const currentTime = new Date();
    const weatherCells = [];

    let currentIndex = 0;
    for (let i = 0; i < timeseries.length; i++) {
        const entryDate = new Date(timeseries[i].time);
        if (entryDate >= currentTime) {
            currentIndex = i;
            break;
        }
    }

    let minTemp = Infinity;
    let maxTemp = -Infinity;
    // First pass to find min/max

    for (let i = 0; i < 16; i++) {
        const temperature = Math.round(timeseries[i].data?.instant?.details?.air_temperature || 0);
        console.log("Temp:", temperature);
        if (temperature < minTemp) {
            minTemp = temperature;
            console.log("Min temp:", minTemp);
        }
        if (temperature > maxTemp) {
            maxTemp = temperature;
            console.log("Max temp:", maxTemp);
        }
    }

    for (let i = 0; i < 16; i++) {
        const entry = timeseries[i];
        const cell = document.createElement('div');
        cell.className = 'weather-cell';
        
        const symbolCode = entry.data?.next_1_hours?.summary?.symbol_code || 'partlycloudy_day';
        const temperature = Math.round(entry.data?.instant?.details?.air_temperature || 0);
        const entryDate = new Date(entry.time);
        const hours = entryDate.getHours().toString().padStart(2, '0');
        const timeStr = hours%3==0?`${hours}`:`&nbsp;`;
        
        // Determine temperature color
        const tempClass = temperature == maxTemp ? 'temp-max' :
                         temperature == minTemp ? 'temp-min' :
                         'temp-normal';
        console.log("Temp:  ", temperature, "Max:", maxTemp, "Min:", minTemp, "Class:", tempClass);
        
        cell.innerHTML = `
            <div class="weather-cell-time">${timeStr}</div>
            <img src="./weather-icons/${symbolCode}.svg" class="weather-cell-icon" alt="Weather icon">
            <div class="weather-cell-temp ${tempClass}">${temperature}°</div>        `;
        weatherCells.push(cell);
    }
    
    const gridRow = weatherGridDiv.getElementsByClassName('weather-grid-row')[0];
    if (gridRow) {
        gridRow.innerHTML = '';
        weatherCells.forEach(cell => gridRow.appendChild(cell));
    }
}


