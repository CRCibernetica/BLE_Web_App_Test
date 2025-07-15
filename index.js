document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const statusMessages = document.getElementById('statusMessages');
    const deviceInfoDiv = document.getElementById('deviceInfo');
    const deviceNameSpan = document.getElementById('deviceName');
    const deviceIdSpan = document.getElementById('deviceId');
    const chartCanvas = document.getElementById('plotterChart');

    // --- BLE Service & Characteristic UUIDs ---
    const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    // Characteristic for receiving data from the device (peripheral's TX)
    const UART_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

    // --- Global State ---
    let bleDevice = null;
    let gattServer = null;
    let uartTxCharacteristic = null;
    let chart = null;
    let incomingDataBuffer = ''; // Buffer for incoming BLE data
    const chartColors = ['#4A90E2', '#F5A623', '#50E3C2', '#BD10E0', '#7ED321', '#E0103E'];

    // --- Initialization ---
    initChart();
    connectButton.addEventListener('click', requestDevice);
    disconnectButton.addEventListener('click', disconnectDevice);

    /**
     * Initializes the Chart.js instance with a default configuration.
     */
    function initChart() {
        const ctx = chartCanvas.getContext('2d');
        chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
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
                animation: { duration: 200 }
            }
        });
    }

    /**
     * Scans for BLE devices, connects, and starts UART notifications.
     */
    async function requestDevice() {
        if (!navigator.bluetooth) {
            updateStatus('Web Bluetooth API is not available in this browser.', 'error');
            return;
        }

        updateStatus('Scanning for devices with name starting with "Idea"...');
        try {
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'Idea' }],
                optionalServices: [UART_SERVICE_UUID]
            });

            bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
            updateStatus('Connecting to GATT Server...');
            gattServer = await bleDevice.gatt.connect();

            updateStatus('Connected! Getting UART Service...');
            await startUartNotifications(gattServer);
            
            updateStatus('Listening for data...', 'success');
            updateUIAfterConnection();

        } catch (error) {
            console.error('Connection failed:', error);
            if (error.name === 'NotFoundError') {
                updateStatus('No device selected. Scan cancelled.');
            } else {
                updateStatus(`Error: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Gets the UART service and characteristic, then starts listening for notifications.
     * @param {BluetoothRemoteGATTServer} server
     */
    async function startUartNotifications(server) {
        const service = await server.getPrimaryService(UART_SERVICE_UUID);
        uartTxCharacteristic = await service.getCharacteristic(UART_TX_CHAR_UUID);
        await uartTxCharacteristic.startNotifications();
        uartTxCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
    }

    /**
     * Handles incoming data from the BLE device.
     * @param {Event} event
     */
    function handleNotifications(event) {
        const value = event.target.value;
        const decoder = new TextDecoder();
        const text = decoder.decode(value);

        incomingDataBuffer += text;

        // Process all complete lines (ending in newline) in the buffer
        let newlineIndex;
        while ((newlineIndex = incomingDataBuffer.indexOf('\n')) !== -1) {
            const line = incomingDataBuffer.substring(0, newlineIndex).trim();
            incomingDataBuffer = incomingDataBuffer.substring(newlineIndex + 1);

            if (line) {
                const values = line.split(',').map(v => parseFloat(v.trim()));
                updateChart(values);
            }
        }
    }

    /**
     * Updates the chart with new data points.
     * @param {number[]} values - An array of numerical values for each series.
     */
    function updateChart(values) {
        // Add a new label for the x-axis (e.g., a timestamp or count)
        const newLabel = chart.data.labels.length;
        chart.data.labels.push(newLabel);

        // Limit the number of data points to keep the chart performant
        const maxDataPoints = 100;
        if (chart.data.labels.length > maxDataPoints) {
            chart.data.labels.shift();
        }

        values.forEach((value, index) => {
            // Check if a dataset for this series already exists
            if (!chart.data.datasets[index]) {
                const color = chartColors[index % chartColors.length];
                chart.data.datasets[index] = {
                    label: `Series ${index + 1}`,
                    data: [],
                    borderColor: color,
                    backgroundColor: `${color}33`, // Semi-transparent version for fill
                    fill: false,
                    tension: 0.2
                };
            }
            
            // Add the new data point
            chart.data.datasets[index].data.push(value);
            
            // Remove the oldest data point if we're over the limit
            if (chart.data.datasets[index].data.length > maxDataPoints) {
                chart.data.datasets[index].data.shift();
            }
        });

        chart.update();
    }

    /**
     * Disconnects from the BLE device.
     */
    function disconnectDevice() {
        if (bleDevice && bleDevice.gatt.connected) {
            updateStatus('Disconnecting...');
            bleDevice.gatt.disconnect();
        }
    }

    /**
     * Handles disconnection events and resets the state.
     */
    function onDisconnected() {
        updateStatus('Device has been disconnected.');
        
        // Clean up event listeners
        if (uartTxCharacteristic) {
            uartTxCharacteristic.removeEventListener('characteristicvaluechanged', handleNotifications);
            uartTxCharacteristic = null;
        }
        
        gattServer = null;
        bleDevice = null;
        incomingDataBuffer = '';
        
        updateUIAfterDisconnection();
        resetChart();
    }
    
    /**
     * Resets the chart to its initial empty state.
     */
    function resetChart() {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update();
    }
    
    /**
     * Updates UI elements after a successful connection.
     */
    function updateUIAfterConnection() {
        connectButton.style.display = 'none';
        disconnectButton.style.display = 'block';
        deviceNameSpan.textContent = bleDevice.name || 'N/A';
        deviceIdSpan.textContent = bleDevice.id;
        deviceInfoDiv.style.display = 'block';
    }

    /**
     * Resets UI elements after disconnection.
     */
    function updateUIAfterDisconnection() {
        connectButton.style.display = 'block';
        disconnectButton.style.display = 'none';
        deviceInfoDiv.style.display = 'none';
    }

    /**
     * Updates the status message displayed to the user.
     * @param {string} message - The message to display.
     * @param {string} type - 'info', 'success', or 'error' for styling.
     */
    function updateStatus(message, type = 'info') {
        statusMessages.innerHTML = ''; // Clear previous messages
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
