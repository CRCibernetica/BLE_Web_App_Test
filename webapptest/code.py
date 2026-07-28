# Minimal repro for the ble.connected bug.
#
# Writes a counter to the UART service once per second, unconditionally, and
# prints whether the write succeeded next to what ble.connected claims.
#
# The bug is confirmed when the serial console shows, while the web page is
# receiving numbers:
#
#     write_ok: True | ble.connected: False | connections: 0
#
# It reproduces only when the host already holds a bond for this board:
#
#   - Bond absent (first connect, pairing happens now): flag goes True. Correct.
#   - Bond present (every later connect): data flows, flag stays False. Wrong.
#
# So to see the working case again, remove the device from the host's Bluetooth
# settings first. Restarting code.py alone is not enough — the bond outlives it.
#
# Save as code.py in the root of CIRCUITPY.

import time

from adafruit_ble import BLERadio
from adafruit_ble.advertising.standard import ProvideServicesAdvertisement
from adafruit_ble.services.nordic import UARTService

ble = BLERadio()
ble.name = "Test1"
uart = UARTService()
advertisement = ProvideServicesAdvertisement(uart)

ble.start_advertising(advertisement)
print("Advertising as", ble.name)

n = 0
while True:
    n += 1
    try:
        uart.write("{}\n".format(n).encode("utf-8"))
        write_ok = True
    except Exception:  # noqa: BLE001
        write_ok = False

    # Advertising stops as soon as a central connects, and nothing restarts it
    # on disconnect. Without this the board is unreachable after the first
    # disconnect until you reset it. A failing write is the signal that nobody
    # is listening; ble.connected is not trustworthy, which is the whole point
    # of this test. Re-calling while already advertising just raises.
    if not write_ok:
        try:
            ble.start_advertising(advertisement)
        except Exception:  # noqa: BLE001
            pass

    # Four independent observables, printed side by side. The point is to show
    # which of them disagree:
    #
    #   ble.connected            radio level
    #   len(ble.connections)     0 means no connection object exists at all
    #   connection.connected     per connection
    #   connection.paired        whether the board thinks a bond is in place
    #
    # If connections is non-empty and connection.connected is True while
    # ble.connected is False, the fault is the radio-level property. If
    # connections is 0 while the browser is receiving data, the link was never
    # registered and the fault is deeper.
    print("n:", n,
          "| write_ok:", write_ok,
          "| ble.connected:", ble.connected,
          "| connections:", len(ble.connections))

    for i, connection in enumerate(ble.connections):
        # Guarded individually: these properties are the suspect surface, so a
        # raise here is itself a result worth seeing rather than a crash.
        try:
            conectada = connection.connected
        except Exception as e:  # noqa: BLE001
            conectada = "raised: {}".format(e)
        try:
            emparejada = connection.paired
        except Exception as e:  # noqa: BLE001
            emparejada = "raised: {}".format(e)
        print("    connection", i,
              "| connected:", conectada,
              "| paired:", emparejada)

    time.sleep(1)
