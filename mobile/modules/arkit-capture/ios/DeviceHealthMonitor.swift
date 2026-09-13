import Darwin
import Foundation
import UIKit

final class DeviceHealthMonitor {
  private let eventQueue = DispatchQueue(label: "io.rootlens.arkit-capture.device-health", qos: .utility)
  private var thermalObserver: NSObjectProtocol?
  private var thermalEvents: [[String: Any]] = []
  private var batteryStartLevel: Float = -1
  private var cacheTimestamp: Double = -1
  private var cache: [String: Any] = [:]

  func start(onThermalChange: @escaping (String) -> Void) {
    cacheTimestamp = -1
    cache = [:]

    let initial = ProcessInfo.processInfo.thermalState
    eventQueue.sync {
      thermalEvents = [["timestamp_ns": Self.uptimeNs(), "state": Self.thermalStateString(initial)]]
    }
    batteryStartLevel = readBatteryLevel(enablingMonitoring: true)

    thermalObserver = NotificationCenter.default.addObserver(
      forName: ProcessInfo.thermalStateDidChangeNotification,
      object: nil,
      queue: nil
    ) { [weak self] _ in
      guard let self else { return }
      let state = Self.thermalStateString(ProcessInfo.processInfo.thermalState)
      NSLog("[DeviceHealthMonitor] thermal state -> %@", state)
      self.eventQueue.async {
        self.thermalEvents.append(["timestamp_ns": Self.uptimeNs(), "state": state])
      }
      onThermalChange(state)
    }
  }

  func metricsRow(timestamp: Double, timestampNs: Int64, deviceModel: String) -> [String: Any] {
    if timestamp - cacheTimestamp >= 0.5 || cache.isEmpty {
      cacheTimestamp = timestamp
      let device = UIDevice.current
      let thermal = ProcessInfo.processInfo.thermalState
      cache = [
        "battery_level": Double(device.batteryLevel),
        "battery_state": device.batteryState.rawValue,
        "battery_state_str": Self.batteryStateString(device.batteryState),
        "cpu_usage": currentCpuUsage(),
        "memory_used_mb": currentFootprintMB(),
        "memory_available_mb": availableMemoryMB(),
        "thermal_state": thermal.rawValue,
        "thermal_state_str": Self.thermalStateString(thermal),
        "device_model": deviceModel,
      ]
    }
    var row = cache
    row["timestamp_ns"] = timestampNs
    return row
  }

  func finish(mergingInto directory: URL) {
    if let observer = thermalObserver {
      NotificationCenter.default.removeObserver(observer)
      thermalObserver = nil
    }
    var events: [[String: Any]] = []
    eventQueue.sync {
      events = thermalEvents
      thermalEvents = []
    }
    let endLevel = readBatteryLevel()
    let metadataURL = directory.appendingPathComponent("metadata.json")
    guard let data = try? Data(contentsOf: metadataURL),
          var metadata = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
      NSLog("[DeviceHealthMonitor] metadata.json not readable; device health summary was not written")
      return
    }
    if !events.isEmpty { metadata["thermal_events"] = events }
    metadata["battery"] = ["start_level": batteryStartLevel, "end_level": endLevel]
    batteryStartLevel = -1
    do {
      let output = try JSONSerialization.data(withJSONObject: metadata, options: [.prettyPrinted, .sortedKeys])
      try output.write(to: metadataURL, options: .atomic)
    } catch {
      NSLog("[DeviceHealthMonitor] metadata write failed: %@", "\(error)")
    }
  }

  private static func batteryStateString(_ state: UIDevice.BatteryState) -> String {
    switch state {
    case .unplugged: return "unplugged"
    case .charging: return "charging"
    case .full: return "full"
    case .unknown: return "unknown"
    @unknown default: return "unknown"
    }
  }

  static func thermalStateString(_ state: ProcessInfo.ThermalState) -> String {
    switch state {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }

  private static func uptimeNs() -> Int64 {
    Int64(ProcessInfo.processInfo.systemUptime * 1_000_000_000.0)
  }

  private func readBatteryLevel(enablingMonitoring: Bool = false) -> Float {
    let read = {
      if enablingMonitoring { UIDevice.current.isBatteryMonitoringEnabled = true }
      return UIDevice.current.batteryLevel
    }
    return Thread.isMainThread ? read() : DispatchQueue.main.sync(execute: read)
  }

  private func currentCpuUsage() -> Double {
    var threadsList: thread_act_array_t?
    var threadsCount = mach_msg_type_number_t(0)
    guard task_threads(mach_task_self_, &threadsList, &threadsCount) == KERN_SUCCESS,
          let list = threadsList else { return 0 }
    defer {
      vm_deallocate(
        mach_task_self_,
        vm_address_t(UInt(bitPattern: list)),
        vm_size_t(Int(threadsCount) * MemoryLayout<thread_t>.stride)
      )
    }
    var total = 0.0
    for index in 0..<Int(threadsCount) {
      var info = thread_basic_info()
      var count = mach_msg_type_number_t(
        MemoryLayout<thread_basic_info>.size / MemoryLayout<integer_t>.size
      )
      let result = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
          thread_info(list[index], thread_flavor_t(THREAD_BASIC_INFO), $0, &count)
        }
      }
      if result == KERN_SUCCESS, info.flags & TH_FLAGS_IDLE == 0 {
        total += Double(info.cpu_usage) / Double(TH_USAGE_SCALE)
      }
    }
    return total
  }

  private func currentFootprintMB() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    guard result == KERN_SUCCESS else { return 0 }
    return Double(info.phys_footprint) / (1024.0 * 1024.0)
  }

  private func availableMemoryMB() -> Double {
    Double(os_proc_available_memory()) / (1024.0 * 1024.0)
  }
}
