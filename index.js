document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');
    const statusMessages = document.getElementById('statusMessages');
    const deviceInfo = document.getElementById('deviceInfo');
    const deviceNameSpan = document.getElementById('deviceName');
    const deviceIdSpan = document.getElementById('deviceId');

    // Global variables to hold device and server instances
    let bleDevice = null;
    let gattServer = null;

    // --- Event Listeners ---
    connectButton.addEventListener('click', requestDevice);
    disconnectButton.addEventListener('click', disconnectDevice);

    /**
     * Checks if Web Bluetooth is available in the browser.
     * @returns {boolean} True if Web Bluetooth is supported.
     */
    function isWebBluetoothSupported() {
        if (!navigator.bluetooth) {
            updateStatus('Web Bluetooth API is not available in this browser. Please try a supported browser like Chrome.');
            return false;
        }
        return true;
    }

    /**
     * Scans for BLE devices and initiates a connection.
     */
    async function requestDevice() {
        if (!isWebBluetoothSupported()) {
            return;
        }

        updateStatus('Scanning for devices with name starting with "Idea"...');

        try {
            // Request a device using a filter. 
            // This filter looks for devices with a name that starts with "Idea".
            // The 'optionalServices' key is needed to get permission for services that are not part of the filter.
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{
                    namePrefix: 'Idea'
                }],
                optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] // Nordic UART Service
            });

            // Add an event listener for when the device gets disconnected
            bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

            updateStatus('Connecting to GATT Server...');
            gattServer = await bleDevice.gatt.connect();

            updateStatus('Connected successfully!', 'success');
            updateUIAfterConnection();

        } catch (error) {
            console.error('Connection failed:', error);
            // Handle cases where no device is selected or connection fails
            if (error.name === 'NotFoundError') {
                updateStatus('No device selected. Scan cancelled.');
            } else {
                updateStatus(`Error: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Disconnects from the currently connected BLE device.
     */
    function disconnectDevice() {
        if (bleDevice && bleDevice.gatt.connected) {
            updateStatus('Disconnecting...');
            bleDevice.gatt.disconnect();
        } else {
            updateStatus('No device connected.', 'error');
        }
    }

    /**
     * Handles the 'gattserverdisconnected' event.
     */
    function onDisconnected() {
        updateStatus('Device has been disconnected.');
        gattServer = null;
        bleDevice = null;
        updateUIAfterDisconnection();
    }

    /**
     * Updates the UI elements after a successful connection.
     */
    function updateUIAfterConnection() {
        connectButton.style.display = 'none';
        disconnectButton.style.display = 'block';

        deviceNameSpan.textContent = bleDevice.name || 'N/A';
        deviceIdSpan.textContent = bleDevice.id;
        deviceInfo.style.display = 'block';
    }

    /**
     * Resets the UI elements after disconnection.
     */
    function updateUIAfterDisconnection() {
        connectButton.style.display = 'block';
        disconnectButton.style.display = 'none';
        deviceInfo.style.display = 'none';
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

        // Reset classes
        p.className = 'text-sm';

        switch (type) {
            case 'success':
                p.classList.add('text-green-600', 'dark:text-green-400');
                break;
            case 'error':
                p.classList.add('text-red-600', 'dark:text-red-400');
                break;
            default:
                p.classList.add('text-gray-600', 'dark:text-gray-300');
                break;
        }
        statusMessages.appendChild(p);
    }
});
