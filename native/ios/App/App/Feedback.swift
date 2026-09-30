import UIKit
import CoreHaptics
import Capacitor

// The app's own haptics. Controls get a crisp light tap, tabs the selection tick of iOS menus,
// a finished lesson the firm double beat of an Apple Pay payment, and the launch a soft hello
// when the mascot lands. Patterns are drawn with Core Haptics; the rest uses UIKit's generators.
@objc(FeedbackPlugin)
public class FeedbackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FeedbackPlugin"
    public let jsName = "Feedback"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise)
    ]

    // A haptic event: transient when duration is 0, otherwise a short continuous buzz.
    private struct Beat {
        let time: TimeInterval
        let intensity: Float
        let sharpness: Float
        var duration: TimeInterval = 0
    }

    private static let patterns: [String: [Beat]] = [
        // Apple Pay «done»: a light tick, then a firm thunk with a short body.
        "pay": [
            Beat(time: 0, intensity: 0.6, sharpness: 0.5),
            Beat(time: 0.11, intensity: 1.0, sharpness: 0.65),
            Beat(time: 0.11, intensity: 0.45, sharpness: 0.15, duration: 0.14)
        ],
        // Launch: two soft beats, like a small «hi».
        "launch": [
            Beat(time: 0, intensity: 0.4, sharpness: 0.2),
            Beat(time: 0.14, intensity: 0.7, sharpness: 0.3)
        ]
    ]

    private var engine: CHHapticEngine?
    private let tap = UIImpactFeedbackGenerator(style: .light)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let selection = UISelectionFeedbackGenerator()
    private let notice = UINotificationFeedbackGenerator()

    override public func load() {
        if CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            engine = try? CHHapticEngine()
            engine?.isAutoShutdownEnabled = true
            engine?.resetHandler = { [weak self] in try? self?.engine?.start() }
        }
        DispatchQueue.main.async {
            self.tap.prepare()
            self.selection.prepare()
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "light"
        DispatchQueue.main.async {
            switch kind {
            case "select":
                self.selection.selectionChanged()
                self.selection.prepare()
            case "know":
                self.rigid.impactOccurred(intensity: 0.9)
            case "success":
                self.notice.notificationOccurred(.success)
            case "error":
                self.notice.notificationOccurred(.error)
            case "pay", "launch":
                self.playPattern(FeedbackPlugin.patterns[kind] ?? []) {
                    self.notice.notificationOccurred(.success)
                }
            default:
                self.tap.impactOccurred(intensity: 0.8)
                self.tap.prepare()
            }
            call.resolve()
        }
    }

    private func playPattern(_ beats: [Beat], fallback: () -> Void) {
        guard let engine else { fallback(); return }
        do {
            let events = beats.map { beat in
                CHHapticEvent(
                    eventType: beat.duration > 0 ? .hapticContinuous : .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: beat.intensity),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: beat.sharpness)
                    ],
                    relativeTime: beat.time,
                    duration: beat.duration
                )
            }
            try engine.start()
            try engine.makePlayer(with: CHHapticPattern(events: events, parameters: [])).start(atTime: CHHapticTimeImmediate)
        } catch {
            fallback()
        }
    }
}
