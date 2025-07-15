document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const pauseButton = document.getElementById('pauseButton');
    const saveButton = document.getElementById('saveButton');
    const statusMessages = document.getElementById('statusMessages');
    const deviceInfoDiv = document.getElementById('deviceInfo');
    const deviceNameSpan = document.getElementById('deviceName');
    const deviceIdSpan = document.getElementById('deviceId');
    const chartCanvas = document.getElementById('plotterChart');

    // --- BLE Service & Characteristic UUIDs ---
    const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    const UART_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

    // --- Global State ---
    let bleDevice = null;
    let gattServer = null;
    let uartTxCharacteristic = null;
    let chart = null;
    let incomingDataBuffer = '';
    let sessionData = []; // Stores all data for the session {timestamp, values}
    let isPaused = false;
    const chartColors = ['#4A90E2', '#F5A623', '#50E3C2', '#BD10E0', '#7ED321', '#E0103E'];
    const TIME_WINDOW_MS = 30000; // 30 seconds

    // --- Initialization ---
    initChart();
    connectButton.addEventListener('click', requestDevice);
    disconnectButton.addEventListener('click', disconnectDevice);
    pauseButton.addEventListener('click', togglePause);
    saveButton.addEventListener('click', downloadCSV);

    /**
     * Initializes Chart.js for a time-series plot.
     */
    function initChart() {
        const ctx = chartCanvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'timeseries',
                        time: {
                            unit: 'second',
                            displayFormats: { second: 'HH:mm:ss' }
                        },
                        title: { display: true, text: 'Time' },
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(156, 163, 175, 0.1)' }
                    },
                    y: {
                        title: { display: true, text: 'Value' },
                        ticks: { color: '#9CA3AF' },
                        grid: { color: 'rgba(156, 163, 175, 0.1)' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#D1D5DB' } }
                },
                animation: { duration: 0 } // Disable animation for real-time feel
            }
        });
    }

    /**
     * Scans for BLE devices, connects, and starts UART notifications.
     */
    async function requestDevice() {
        if (!navigator.bluetooth) {
            updateStatus('Web Bluetooth API is not available.', 'error');
            return;
        }
        updateStatus('Scanning for devices...');
        try {
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'Idea' }],
                optionalServices: [UART_SERVICE_UUID]
            });
            bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
            gattServer = await bleDevice.gatt.connect();
            await startUartNotifications(gattServer);
            updateStatus('Listening for data...', 'success');
            updateUIAfterConnection();
        } catch (error) {
            console.error('Connection failed:', error);
            if (error.name === 'NotFoundError') {
                updateStatus('No device selected.');
            } else {
                updateStatus(`Error: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Gets the UART service and starts listening for notifications.
     */
    async function startUartNotifications(server) {
        const service = await server.getPrimaryService(UART_SERVICE_UUID);
        uartTxCharacteristic = await service.getCharacteristic(UART_TX_CHAR_UUID);
        await uartTxCharacteristic.startNotifications();
        uartTxCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
    }

    /**
     * Handles incoming data, buffers it, and processes complete lines.
     */
    function handleNotifications(event) {
        const decoder = new TextDecoder();
        incomingDataBuffer += decoder.decode(event.target.value);

        let newlineIndex;
        while ((newlineIndex = incomingDataBuffer.indexOf('\n')) !== -1) {
            const line = incomingDataBuffer.substring(0, newlineIndex).trim();
            incomingDataBuffer = incomingDataBuffer.substring(newlineIndex + 1);

            if (line) {
                const values = line.split(',').map(v => parseFloat(v.trim()));
                const timestamp = Date.now();
                
                // Store all data for the session
                sessionData.push({ timestamp, values });

                if (!isPaused) {
                    updateChart({ timestamp, values });
                }
            }
        }
    }

    /**
     * Updates the chart with a new data point and removes old ones.
     */
    function updateChart(newDataPoint) {
        const { timestamp, values } = newDataPoint;

        values.forEach((value, index) => {
            if (!chart.data.datasets[index]) {
                const color = chartColors[index % chartColors.length];
                chart.data.datasets[index] = {
                    label: `Series ${index + 1}`,
                    data: [],
                    borderColor: color,
                    backgroundColor: `${color}33`,
                    tension: 0.2
                };
            }
            chart.data.datasets[index].data.push({ x: timestamp, y: value });
        });

        // Set the x-axis min to maintain the 30-second window
        chart.options.scales.x.min = Date.now() - TIME_WINDOW_MS;
        chart.options.scales.x.max = Date.now();

        // Prune data that's outside the window to prevent memory leaks
        const cutoff = Date.now() - TIME_WINDOW_MS * 1.5; // Keep a little extra
        chart.data.datasets.forEach(dataset => {
            dataset.data = dataset.data.filter(d => d.x >= cutoff);
        });

        chart.update('none'); // 'none' prevents animation
    }

    /**
     * Toggles the paused state of the chart.
     */
    function togglePause() {
        isPaused = !isPaused;
        pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
        pauseButton.classList.toggle('bg-yellow-500', !isPaused);
        pauseButton.classList.toggle('hover:bg-yellow-600', !isPaused);
        pauseButton.classList.toggle('bg-cyan-500', isPaused);
        pauseButton.classList.toggle('hover:bg-cyan-600', isPaused);
        updateStatus(isPaused ? 'Chart paused. Data collection continues.' : 'Chart resumed.');
    }

    /**
     * Triggers a download of all session data as a CSV file.
     */
    function downloadCSV() {
        if (sessionData.length === 0) {
            updateStatus('No data to save.', 'error');
            return;
        }

        const maxSeries = Math.max(...sessionData.map(d => d.values.length));
        const headers = ['Timestamp', ...Array.from({ length: maxSeries }, (_, i) => `Series ${i + 1}`)];
        
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + '\n';

        sessionData.forEach(entry => {
            const date = new Date(entry.timestamp).toISOString();
            const row = [date, ...entry.values].join(',');
            csvContent += row + '\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `ble_plotter_data_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        updateStatus('CSV file saved.', 'success');
    }

    /**
     * Disconnects from the BLE device and resets the UI.
     */
    function disconnectDevice() {
        if (bleDevice && bleDevice.gatt.connected) {
            bleDevice.gatt.disconnect();
        }
    }

    /**
     * Handles disconnection events and resets the state.
     */
    function onDisconnected() {
        updateStatus('Device disconnected.');
        if (uartTxCharacteristic) {
            uartTxCharacteristic.removeEventListener('characteristicvaluechanged', handleNotifications);
        }
        bleDevice = null;
        gattServer = null;
        uartTxCharacteristic = null;
        sessionData = [];
        isPaused = false;
        
        updateUIAfterDisconnection();
        resetChart();
    }
    
    function resetChart() {
        chart.data.datasets = [];
        chart.options.scales.x.min = undefined;
        chart.options.scales.x.max = undefined;
        chart.update();
    }
    
    function updateUIAfterConnection() {
        connectButton.style.display = 'none';
        disconnectButton.style.display = 'block';
        pauseButton.disabled = false;
        saveButton.disabled = false;
        deviceNameSpan.textContent = bleDevice.name || 'N/A';
        deviceIdSpan.textContent = bleDevice.id;
        deviceInfoDiv.style.display = 'block';
    }

    function updateUIAfterDisconnection() {
        connectButton.style.display = 'block';
        disconnectButton.style.display = 'none';
        pauseButton.disabled = true;
        saveButton.disabled = true;
        pauseButton.textContent = 'Pause';
        pauseButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
        pauseButton.classList.remove('bg-cyan-500', 'hover:bg-cyan-600');
        deviceInfoDiv.style.display = 'none';
    }

    function updateStatus(message, type = 'info') {
        statusMessages.innerHTML = '';
        const p = document.createElement('p');
        p.textContent = message;
        p.className = 'text-sm';
        switch (type) {
            case 'success': p.classList.add('text-green-500', 'dark:text-green-400'); break;
            case 'error': p.classList.add('text-red-500', 'dark:text-red-400'); break;
            default: p.classList.add('text-gray-600', 'dark:text-gray-300'); break;
        }
        statusMessages.appendChild(p);
    }
});
