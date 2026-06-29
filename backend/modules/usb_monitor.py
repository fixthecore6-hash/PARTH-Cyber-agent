"""
PARTH USB Monitor
Detects USB device plug/unplug events via /sys/bus/usb/devices
"""

import asyncio
import logging
import os
from datetime import datetime
from core.event_bus import event_bus, Event
from core.risk_scorer import score_event

logger = logging.getLogger("parth.usb_monitor")
POLL_INTERVAL = 10


def _read_usb_devices() -> dict:
    """Return dict of {device_id: {vendor, product, manufacturer}} from sysfs."""
    devices = {}
    base = "/sys/bus/usb/devices"
    if not os.path.isdir(base):
        return devices
    for dev in os.listdir(base):
        dev_path = os.path.join(base, dev)
        try:
            def _r(f):
                fp = os.path.join(dev_path, f)
                return open(fp).read().strip() if os.path.exists(fp) else ""
            vendor = _r("idVendor")
            product = _r("idProduct")
            if not vendor:
                continue
            devices[dev] = {
                "id": dev,
                "vendor_id": vendor,
                "product_id": product,
                "manufacturer": _r("manufacturer"),
                "product_name": _r("product"),
                "serial": _r("serial"),
            }
        except Exception:
            continue
    return devices


class USBMonitor:
    name = "usb_monitor"

    def __init__(self):
        self._running = False
        self._known: dict = {}

    def stop(self):
        self._running = False

    async def run(self):
        self._running = True
        logger.info("USB monitor started")
        self._known = _read_usb_devices()

        while self._running:
            try:
                current = _read_usb_devices()

                # New devices
                for dev_id, info in current.items():
                    if dev_id not in self._known:
                        scoring = score_event("usb_device_connected", {"network_activity": False})
                        await event_bus.publish(Event(
                            source="usb_monitor",
                            event_type="usb_device_connected",
                            severity="medium",
                            data={
                                **info,
                                "action": "connected",
                                "risk_score": scoring["score"],
                                "ai_analyze": True,
                                "timestamp": datetime.utcnow().isoformat(),
                            }
                        ))
                        logger.info(f"USB connected: {info.get('product_name', dev_id)}")

                # Removed devices
                for dev_id, info in self._known.items():
                    if dev_id not in current:
                        await event_bus.publish(Event(
                            source="usb_monitor",
                            event_type="usb_device_removed",
                            severity="low",
                            data={
                                **info,
                                "action": "removed",
                                "timestamp": datetime.utcnow().isoformat(),
                            }
                        ))

                self._known = current
            except Exception as e:
                logger.error(f"usb_monitor error: {e}")
            await asyncio.sleep(POLL_INTERVAL)
