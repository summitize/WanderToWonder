/**
 * Homepage Map Explorer
 * Option 3: Real map (Leaflet)
 * Option 4: Animated globe (Plotly)
 * Option 5: Timeline journey map (Leaflet + step controls)
 */
(function () {
    const DESTINATIONS = [
        {
            name: 'Dubai, UAE',
            shortLabel: 'UAE (Dubai)',
            lat: 25.2048,
            lng: 55.2708,
            when: 'March 2023',
            page: 'dubai.html',
            linkLabel: 'Dubai Journal'
        },
        {
            name: 'Sri Lanka',
            shortLabel: 'Sri Lanka',
            lat: 6.9271,
            lng: 79.8612,
            when: 'January 2024',
            page: 'srilanka.html',
            linkLabel: 'Sri Lanka Journal'
        },
        {
            name: 'Sydney, Australia',
            shortLabel: 'Australia (Sydney)',
            lat: -33.8688,
            lng: 151.2093,
            when: 'May 2025',
            page: 'australia.html',
            linkLabel: 'Australia Journal'
        },
        {
            name: 'Statue of Unity, India',
            shortLabel: 'India (Statue of Unity)',
            lat: 21.8380,
            lng: 73.7191,
            when: 'India Journey',
            page: 'statue-of-unity.html',
            linkLabel: 'Statue of Unity Journal'
        },
        {
            name: 'Dapoli, India',
            shortLabel: 'India (Dapoli)',
            lat: 17.7586,
            lng: 73.1850,
            when: 'India Journey',
            page: 'dapoli.html',
            linkLabel: 'Dapoli Journal'
        },
        {
            name: 'Alibaug, India',
            shortLabel: 'India (Alibaug)',
            lat: 18.6414,
            lng: 72.8722,
            when: 'India Journey',
            page: 'alibaug.html',
            linkLabel: 'Alibaug Journal'
        }
    ];

    let activeOption = 'real';
    let realMap = null;
    let timelineMap = null;
    let timelineMarkersLayer = null;
    let timelineRouteLayer = null;
    let timelineStep = DESTINATIONS.length;
    let timelineTimerId = null;
    let timelineRangeInput = null;
    let timelinePlayButton = null;
    let timelineStepList = null;
    let globeInitialized = false;
    let globeRotationTimerId = null;

    function buildPopup(destination) {
        return `
            <strong>${destination.name}</strong><br>
            ${destination.when}<br>
            <a href="${destination.page}">Open ${destination.linkLabel}</a>
        `;
    }

    function buildPointTooltip(destination) {
        return `<a class="map-point-link" href="${destination.page}">${destination.shortLabel}</a>`;
    }

    function renderFallbackMessage(container, message) {
        if (!container) return;
        container.innerHTML = `<div class="map-fallback">${message}</div>`;
    }

    function initializeRealMap() {
        const container = document.getElementById('journey-real-map');
        if (!container) return;

        if (typeof window.L === 'undefined') {
            renderFallbackMessage(container, 'Interactive map is unavailable right now.');
            return;
        }

        realMap = window.L.map(container, {
            scrollWheelZoom: false,
            worldCopyJump: true
        });

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(realMap);

        const routeCoordinates = [];

        DESTINATIONS.forEach((destination) => {
            const point = [destination.lat, destination.lng];
            routeCoordinates.push(point);
            const marker = window.L.circleMarker(point, {
                radius: 8,
                color: '#ffffff',
                weight: 2,
                fillColor: '#f97316',
                fillOpacity: 0.92
            }).addTo(realMap).bindPopup(buildPopup(destination));

            marker.bindTooltip(buildPointTooltip(destination), {
                permanent: true,
                direction: 'top',
                offset: [0, -12],
                className: 'map-point-tooltip'
            });
        });

        window.L.polyline(routeCoordinates, {
            color: '#22d3ee',
            weight: 2.6,
            opacity: 0.75,
            dashArray: '7 8'
        }).addTo(realMap);

        realMap.fitBounds(routeCoordinates, { padding: [36, 36] });
    }

    function initializeGlobe() {
        const container = document.getElementById('journey-globe-map');
        if (!container) return;

        if (typeof window.Plotly === 'undefined') {
            renderFallbackMessage(container, 'Animated globe is unavailable right now.');
            return;
        }

        const latitudes = DESTINATIONS.map((destination) => destination.lat);
        const longitudes = DESTINATIONS.map((destination) => destination.lng);

        const routeTrace = {
            type: 'scattergeo',
            mode: 'lines',
            lat: latitudes,
            lon: longitudes,
            line: {
                color: '#22d3ee',
                width: 2.2
            },
            opacity: 0.75,
            hoverinfo: 'skip',
            showlegend: false
        };

        const markerTrace = {
            type: 'scattergeo',
            mode: 'markers+text',
            name: 'destinations',
            lat: latitudes,
            lon: longitudes,
            text: DESTINATIONS.map((destination) => destination.shortLabel),
            textposition: [
                'top right',
                'top right',
                'bottom right',
                'top left',
                'top right',
                'bottom right'
            ],
            customdata: DESTINATIONS.map((destination) => destination.page),
            marker: {
                size: 10,
                color: '#f97316',
                line: {
                    color: '#ffffff',
                    width: 1.3
                }
            },
            textfont: {
                family: 'Inter, Segoe UI, Arial, sans-serif',
                size: 13,
                color: '#E2ECF6'
            },
            hovertemplate: '<b>%{text}</b><extra></extra>'
        };

        const layout = {
            margin: { l: 0, r: 0, t: 0, b: 0 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            geo: {
                projection: {
                    type: 'orthographic',
                    rotation: { lon: 78, lat: 12 }
                },
                showland: true,
                landcolor: '#2a4f7a',
                showocean: true,
                oceancolor: '#0b2a56',
                showcountries: false,
                showcoastlines: true,
                coastlinecolor: '#8db0d1',
                coastlinewidth: 0.6,
                bgcolor: 'rgba(0,0,0,0)'
            }
        };

        const config = {
            responsive: true,
            displayModeBar: false,
            scrollZoom: false
        };

        window.Plotly.newPlot(container, [routeTrace, markerTrace], layout, config);

        container.on('plotly_click', (event) => {
            const point = event && event.points && event.points[0];
            if (!point || point.data.name !== 'destinations') return;

            const page = point.customdata;
            if (typeof page === 'string' && page.length > 0) {
                window.location.href = page;
            }
        });

        globeInitialized = true;
    }

    function startGlobeRotation() {
        if (!globeInitialized || globeRotationTimerId !== null) return;

        let longitude = 78;
        globeRotationTimerId = window.setInterval(() => {
            if (activeOption !== 'globe') return;
            if (typeof window.Plotly === 'undefined') return;

            longitude = (longitude + 0.35) % 360;
            window.Plotly.relayout('journey-globe-map', {
                'geo.projection.rotation.lon': longitude
            });
        }, 90);
    }

    function stopGlobeRotation() {
        if (globeRotationTimerId === null) return;
        window.clearInterval(globeRotationTimerId);
        globeRotationTimerId = null;
    }

    function initializeTimeline() {
        timelineRangeInput = document.getElementById('journey-step-range');
        timelinePlayButton = document.getElementById('journey-play-btn');
        timelineStepList = document.getElementById('journey-step-list');
        const mapContainer = document.getElementById('journey-timeline-map');

        if (!timelineRangeInput || !timelinePlayButton || !timelineStepList || !mapContainer) return;

        timelineRangeInput.max = String(DESTINATIONS.length);
        timelineRangeInput.value = String(timelineStep);

        timelineStepList.innerHTML = '';
        DESTINATIONS.forEach((destination, index) => {
            const item = document.createElement('li');
            item.className = 'timeline-item';
            item.dataset.step = String(index + 1);
            item.innerHTML = `
                <span class="timeline-step-index">${index + 1}</span>
                <div class="timeline-step-content">
                    <a href="${destination.page}" class="timeline-step-title">${destination.name}</a>
                    <p class="timeline-step-meta">${destination.when}</p>
                </div>
            `;
            item.addEventListener('click', () => {
                stopTimelinePlayback();
                renderTimeline(index + 1);
            });
            timelineStepList.appendChild(item);
        });

        timelineRangeInput.addEventListener('input', (event) => {
            const target = event.target;
            const step = Number(target.value);
            stopTimelinePlayback();
            renderTimeline(step);
        });

        timelinePlayButton.addEventListener('click', () => {
            if (timelineTimerId !== null) {
                stopTimelinePlayback();
                return;
            }
            startTimelinePlayback();
        });

        if (typeof window.L === 'undefined') {
            renderFallbackMessage(mapContainer, 'Timeline map is unavailable right now.');
            renderTimeline(timelineStep);
            return;
        }

        timelineMap = window.L.map(mapContainer, {
            scrollWheelZoom: false,
            worldCopyJump: true
        });

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(timelineMap);

        timelineMarkersLayer = window.L.layerGroup().addTo(timelineMap);
        renderTimeline(timelineStep);
    }

    function renderTimeline(step) {
        const safeStep = Math.max(1, Math.min(DESTINATIONS.length, Number(step) || 1));
        timelineStep = safeStep;

        if (timelineRangeInput) {
            timelineRangeInput.value = String(safeStep);
        }

        if (timelineStepList) {
            const items = timelineStepList.querySelectorAll('.timeline-item');
            items.forEach((item, index) => {
                item.classList.toggle('active', index < safeStep);
            });
        }

        if (!timelineMap || !timelineMarkersLayer || typeof window.L === 'undefined') {
            return;
        }

        timelineMarkersLayer.clearLayers();

        const routeCoordinates = DESTINATIONS
            .slice(0, safeStep)
            .map((destination) => [destination.lat, destination.lng]);

        DESTINATIONS.slice(0, safeStep).forEach((destination, index) => {
            const isCurrent = index === safeStep - 1;
            window.L.circleMarker([destination.lat, destination.lng], {
                radius: isCurrent ? 9 : 7,
                color: '#ffffff',
                weight: 2,
                fillColor: isCurrent ? '#10b981' : '#f97316',
                fillOpacity: 0.95
            }).bindPopup(buildPopup(destination)).addTo(timelineMarkersLayer);
        });

        if (timelineRouteLayer) {
            timelineMap.removeLayer(timelineRouteLayer);
        }

        if (routeCoordinates.length > 1) {
            timelineRouteLayer = window.L.polyline(routeCoordinates, {
                color: '#10b981',
                weight: 3,
                opacity: 0.88
            }).addTo(timelineMap);
            timelineMap.fitBounds(routeCoordinates, { padding: [30, 30] });
        } else if (routeCoordinates.length === 1) {
            timelineMap.setView(routeCoordinates[0], 4);
        }
    }

    function startTimelinePlayback() {
        if (!timelinePlayButton) return;

        if (timelineStep >= DESTINATIONS.length) {
            renderTimeline(1);
        }

        timelinePlayButton.textContent = 'Pause';
        timelineTimerId = window.setInterval(() => {
            if (timelineStep >= DESTINATIONS.length) {
                stopTimelinePlayback();
                return;
            }
            renderTimeline(timelineStep + 1);
        }, 1200);
    }

    function stopTimelinePlayback() {
        if (timelineTimerId !== null) {
            window.clearInterval(timelineTimerId);
            timelineTimerId = null;
        }

        if (timelinePlayButton) {
            timelinePlayButton.textContent = 'Play Route';
        }
    }

    function resizeGlobe() {
        if (typeof window.Plotly === 'undefined') return;
        const globeElement = document.getElementById('journey-globe-map');
        if (!globeElement) return;
        window.Plotly.Plots.resize(globeElement);
    }

    function activateOption(option) {
        if (activeOption === option) {
            if (option === 'real' && realMap) realMap.invalidateSize();
            if (option === 'timeline' && timelineMap) timelineMap.invalidateSize();
            if (option === 'globe') resizeGlobe();
            return;
        }

        activeOption = option;

        const buttons = document.querySelectorAll('.map-option-btn');
        buttons.forEach((button) => {
            const isActive = button.dataset.mapOption === option;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        const panels = document.querySelectorAll('.map-panel');
        panels.forEach((panel) => {
            const shouldShow = panel.id === `map-panel-${option}`;
            panel.classList.toggle('is-active', shouldShow);
            panel.hidden = !shouldShow;
        });

        if (option !== 'timeline') {
            stopTimelinePlayback();
        }

        if (option === 'real' && realMap) {
            realMap.invalidateSize();
        }

        if (option === 'timeline' && timelineMap) {
            timelineMap.invalidateSize();
            renderTimeline(timelineStep);
        }

        if (option === 'globe') {
            resizeGlobe();
            startGlobeRotation();
        } else {
            stopGlobeRotation();
        }
    }

    function initializeMapOptionTabs() {
        const buttons = document.querySelectorAll('.map-option-btn');
        buttons.forEach((button) => {
            button.addEventListener('click', () => {
                const option = button.dataset.mapOption;
                if (!option) return;
                activateOption(option);
            });
        });
    }

    function initializeMapExplorer() {
        if (!document.getElementById('journey-map-explorer')) return;

        initializeMapOptionTabs();
        initializeRealMap();
        initializeGlobe();
        initializeTimeline();
        activateOption('real');

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopGlobeRotation();
                stopTimelinePlayback();
            } else if (activeOption === 'globe') {
                startGlobeRotation();
            }
        });

        window.addEventListener('resize', () => {
            if (activeOption === 'real' && realMap) realMap.invalidateSize();
            if (activeOption === 'timeline' && timelineMap) timelineMap.invalidateSize();
            if (activeOption === 'globe') resizeGlobe();
        });
    }

    document.addEventListener('DOMContentLoaded', initializeMapExplorer);
})();
