import ARKit
import ExpoModulesCore

// MARK: - ExpoArkitFaceModule
//
// Captures ARFaceAnchor geometry + blendShapes via ARFaceTrackingConfiguration.
// Requires iPhone X+ (TrueDepth) or iPad Pro 2020+ (LiDAR). Use `isSupported`
// to gate calls before starting the session.

public class ExpoArkitFaceModule: Module {
  // Re-used across capture() calls so we don't tear down the AR session.
  private var session: ARSession?
  private var sessionDelegate: FaceSessionDelegate?

  public func definition() -> ModuleDefinition {
    Name("ExpoArkitFaceModule")

    AsyncFunction("isSupported") { () -> Bool in
      return ARFaceTrackingConfiguration.isSupported
    }

    AsyncFunction("startTracking") { (promise: Promise) in
      DispatchQueue.main.async {
        guard ARFaceTrackingConfiguration.isSupported else {
          promise.reject("ERR_UNSUPPORTED", "ARFaceTrackingConfiguration is not supported on this device.")
          return
        }
        if self.session == nil {
          let s = ARSession()
          let delegate = FaceSessionDelegate()
          s.delegate = delegate
          self.session = s
          self.sessionDelegate = delegate
        }
        let config = ARFaceTrackingConfiguration()
        config.isLightEstimationEnabled = true
        if #available(iOS 13.0, *) {
          config.maximumNumberOfTrackedFaces = 1
        }
        self.session?.run(config, options: [.resetTracking, .removeExistingAnchors])
        promise.resolve(())
      }
    }

    AsyncFunction("stopTracking") { (promise: Promise) in
      DispatchQueue.main.async {
        self.session?.pause()
        promise.resolve(())
      }
    }

    AsyncFunction("captureFrame") { (promise: Promise) in
      DispatchQueue.main.async {
        guard let delegate = self.sessionDelegate, let anchor = delegate.latestAnchor else {
          promise.resolve(NSNull())
          return
        }
        let geometry = anchor.geometry
        let verts = geometry.vertices.flatMap { [Double($0.x), Double($0.y), Double($0.z)] }

        // ARFaceGeometry.triangleIndices is [Int16] — widen to JS-safe Int.
        let indices = geometry.triangleIndices.map { Int($0) }

        var blend: [String: Double] = [:]
        for (k, v) in anchor.blendShapes {
          blend[k.rawValue] = v.doubleValue
        }

        let transform = anchor.transform
        let transformRowMajor: [Double] = [
          Double(transform.columns.0.x), Double(transform.columns.1.x), Double(transform.columns.2.x), Double(transform.columns.3.x),
          Double(transform.columns.0.y), Double(transform.columns.1.y), Double(transform.columns.2.y), Double(transform.columns.3.y),
          Double(transform.columns.0.z), Double(transform.columns.1.z), Double(transform.columns.2.z), Double(transform.columns.3.z),
          Double(transform.columns.0.w), Double(transform.columns.1.w), Double(transform.columns.2.w), Double(transform.columns.3.w),
        ]

        promise.resolve([
          "vertices": verts,
          "indices": indices,
          "blendShapes": blend,
          "transform": transformRowMajor,
          "timestamp": Date().timeIntervalSince1970 * 1000,
        ])
      }
    }
  }
}

// MARK: - Session delegate that tracks the latest face anchor

private class FaceSessionDelegate: NSObject, ARSessionDelegate {
  fileprivate var latestAnchor: ARFaceAnchor?

  func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
    for anchor in anchors {
      if let face = anchor as? ARFaceAnchor {
        self.latestAnchor = face
      }
    }
  }
}
