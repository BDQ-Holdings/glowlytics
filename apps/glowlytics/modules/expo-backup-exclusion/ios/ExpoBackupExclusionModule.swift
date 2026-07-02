import Foundation
import ExpoModulesCore

// MARK: - ExpoBackupExclusionModule
//
// Sets URLResourceValues.isExcludedFromBackup (NSURLIsExcludedFromBackupKey)
// on a file or directory so it is skipped by iCloud/iTunes device backups.
// Excluding a directory covers everything inside it — current and future
// contents — so callers only need one call per directory.

public class ExpoBackupExclusionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoBackupExclusionModule")

    AsyncFunction("setExcludedFromBackup") { (path: String) -> Bool in
      // Accept both file:// URLs (what expo-file-system hands out) and plain
      // filesystem paths. URL(string:) only yields a file URL for the former;
      // anything else (plain paths, paths with spaces) falls through to
      // URL(fileURLWithPath:).
      var url: URL
      if let parsed = URL(string: path), parsed.isFileURL {
        url = parsed
      } else {
        url = URL(fileURLWithPath: path)
      }

      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      // Throws (→ JS rejection) when the path doesn't exist or isn't writable;
      // the JS wrapper treats any failure as a best-effort `false`.
      try url.setResourceValues(values)
      return true
    }
  }
}
