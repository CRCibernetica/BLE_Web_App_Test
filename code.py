# -----------------------------------------------------------------------------
# PLOTTER BLE — estructura de Golpes3
#
# No se usa `ble.connected` como condición para enviar. En esta tarjeta, bajo
# Windows, esa bandera puede quedarse en False aunque exista una conexión real:
# el navegador recibe datos mientras el programa cree que nadie está conectado.
# Un `while not ble.connected` bloquea el ciclo para siempre y no se envía nada.
#
# En su lugar: un solo ciclo que nunca bloquea, escritura siempre protegida por
# try/except (si no hay nadie conectado, la escritura simplemente falla y se
# ignora), y re-anuncio periódico para poder reconectar.
#
# Guardar como code.py en la raíz de CIRCUITPY.
# -----------------------------------------------------------------------------

import time

from adafruit_ble import BLERadio
from adafruit_ble.advertising.standard import ProvideServicesAdvertisement
from adafruit_ble.services.nordic import UARTService

NOMBRE_BLE = "Plot1"
PERIODO_ENVIO = 0.1        # 10 Hz
PERIODO_ANUNCIO = 5.0      # Re-anunciar cada 5 s mientras no haya datos

ble = BLERadio()
ble.name = NOMBRE_BLE
uart = UARTService()
advertisement = ProvideServicesAdvertisement(uart)

print("Nombre BLE:", ble.name)
try:
    ble.start_advertising(advertisement)
    print("Anunciando")
except Exception as e:  # noqa: BLE001
    print("Error al anunciar:", e)

t_inicio = time.monotonic()
t_envio = t_inicio
t_anuncio = t_inicio

contador = 0
enviadas = 0
fallos_seguidos = 0

while True:
    # Red de seguridad: nada puede detener el ciclo.
    try:
        ahora = time.monotonic()

        if ahora - t_envio >= PERIODO_ENVIO:
            t_envio = ahora
            mensaje = "{}\n".format(contador)

            try:
                uart.write(mensaje.encode("utf-8"))
                enviadas += 1
                fallos_seguidos = 0
                if enviadas <= 5 or enviadas % 50 == 0:
                    print("TX #{}: {}".format(enviadas, mensaje.strip()))
            except Exception as e:  # noqa: BLE001
                # Sin nadie conectado la escritura falla: es lo normal, no es
                # un error. Solo se reporta la primera vez para no inundar la
                # consola serie.
                fallos_seguidos += 1
                if fallos_seguidos == 1:
                    print("Sin receptor:", e)

            contador += 1

        # Re-anunciar mientras nadie recibe. No se usa `ble.connected` como
        # condición porque no es confiable en esta combinación de tarjeta y
        # sistema operativo; el indicador real es que las escrituras fallen.
        if fallos_seguidos > 0 and ahora - t_anuncio > PERIODO_ANUNCIO:
            t_anuncio = ahora
            try:
                ble.start_advertising(advertisement)
                print("Re-anunciando")
            except Exception:  # noqa: BLE001
                pass  # Ya estaba anunciando: no es un problema.

        time.sleep(0.01)

    except Exception as e:  # noqa: BLE001
        print("Error en el ciclo:", e)
        time.sleep(0.05)
