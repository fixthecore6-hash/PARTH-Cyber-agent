"""
PARTH Monitor Manager
Orchestrates all background monitoring workers.
"""

import asyncio
import logging
from modules.sys_monitor import SystemMonitor
from modules.net_scanner import NetworkScanner
from modules.file_watcher import FileWatcher
from modules.proc_monitor import ProcessMonitor
from modules.log_ingestor import LogIngestor
from modules.ai_reasoning import AIReasoningEngine
from modules.usb_monitor import USBMonitor
from modules.dns_monitor import DNSMonitor
from modules.rootkit_detector import RootkitDetector
from modules.gpu_monitor import GPUMonitor
from modules.alerter import AlertWebhook
from modules.assistant import ResourceAlerter
from core.event_bus import event_bus

logger = logging.getLogger("parth.monitor_manager")


class MonitorManager:
    def __init__(self):
        self.workers = []
        self._tasks = []

    async def start_all(self):
        logger.info("Starting all monitors...")

        # Start event bus first
        self._tasks.append(asyncio.create_task(event_bus.run(), name="event_bus"))

        # Initialize modules
        modules = [
            SystemMonitor(),
            ProcessMonitor(),
            FileWatcher(),
            NetworkScanner(),
            LogIngestor(),
            AIReasoningEngine(),
            USBMonitor(),
            DNSMonitor(),
            RootkitDetector(),
            GPUMonitor(),
            AlertWebhook(),
            ResourceAlerter(),
        ]

        for i, module in enumerate(modules):
            self.workers.append(module)
            task = asyncio.create_task(module.run(), name=module.name)
            self._tasks.append(task)
            logger.info(f"Started: {module.name}")
            await asyncio.sleep(1)  # stagger startup — prevents all modules hitting at once

    async def stop_all(self):
        logger.info("Stopping all monitors...")
        for worker in self.workers:
            worker.stop()
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        logger.info("All monitors stopped.")
