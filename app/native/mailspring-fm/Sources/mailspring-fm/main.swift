import Foundation
import FoundationModels

// Mailspring's bridge to Apple's on-device model (Foundation Models framework).
//
// Protocol: one JSON object per line on stdin, one JSON reply per line on stdout. Every request
// carries a numeric `id` that its reply echoes.
//
//   {"id":1,"op":"availability"}
//     -> {"id":1,"result":{"available":true,"contextSize":4096,"osBuild":"26A434"}}
//     -> {"id":1,"result":{"available":false,"reason":"appleIntelligenceNotEnabled",...}}
//   {"id":2,"op":"generate","instructions":"...","prompt":"...","schema":{...JSON Schema...},
//    "maxTokens":200}
//     -> {"id":2,"result":{"value":{...},"ms":812}}    (with a schema)
//     -> {"id":2,"result":{"text":"...","ms":812}}     (without one)
//     -> {"id":2,"error":{"code":"refused","message":"..."}}
//   {"id":3,"op":"cancel","target":2}  -> {"id":3,"result":{"cancelled":true}}
//   {"id":4,"op":"warmup"}             -> {"id":4,"result":{}}
//
// Error codes: invalid, unavailable, refused, rateLimited, contextExceeded, unsupportedLanguage,
// cancelled, failed. The helper exits when stdin closes, so it never outlives its parent.
//
// `schema` is the small JSON Schema subset Mailspring's prompt compilers emit (object with
// properties/required; string, boolean, number, integer; nullable via ["string","null"];
// enum with an optional null; arrays with items and maxItems). It becomes a
// DynamicGenerationSchema, so the answer always has the requested shape. Whether the values
// are true is the host's job (normalize.ts), exactly as with the downloadable model.

let maxPromptChars = 60_000
let maxInstructionChars = 8_000
let maxTokensCap = 1_000

struct HelperError: Error {
  let code: String
  let message: String
}

// MARK: - Output

let outputLock = NSLock()

func send(_ object: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object, options: []) else { return }
  outputLock.lock()
  defer { outputLock.unlock() }
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0A]))
}

func reply(_ id: Int, result: [String: Any]) {
  send(["id": id, "result": result])
}

func reply(_ id: Int, error: HelperError) {
  send(["id": id, "error": ["code": error.code, "message": error.message]])
}

// MARK: - Availability

func osBuild() -> String {
  var size = 0
  sysctlbyname("kern.osversion", nil, &size, nil, 0)
  var buffer = [UInt8](repeating: 0, count: max(size, 1))
  sysctlbyname("kern.osversion", &buffer, &size, nil, 0)
  return String(decoding: buffer.prefix { $0 != 0 }, as: UTF8.self)
}

func availability() -> [String: Any] {
  let model = SystemLanguageModel.default
  let version = ProcessInfo.processInfo.operatingSystemVersion
  var result: [String: Any] = [
    "osBuild": osBuild(),
    "osVersion": "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)",
  ]
  switch model.availability {
  case .available:
    result["available"] = true
    result["contextSize"] = model.contextSize
  case .unavailable(let reason):
    result["available"] = false
    switch reason {
    case .deviceNotEligible: result["reason"] = "deviceNotEligible"
    case .appleIntelligenceNotEnabled: result["reason"] = "appleIntelligenceNotEnabled"
    case .modelNotReady: result["reason"] = "modelNotReady"
    @unknown default: result["reason"] = "unknown"
    }
  @unknown default:
    result["available"] = false
    result["reason"] = "unknown"
  }
  return result
}

// MARK: - Schema conversion

final class SchemaBuilder {
  private var counter = 0

  private func nextName(_ hint: String) -> String {
    counter += 1
    return "\(hint)_\(counter)"
  }

  /// Returns the property schema and whether the JSON Schema allows null.
  func build(_ node: [String: Any], hint: String) throws -> (DynamicGenerationSchema, Bool) {
    if let values = node["enum"] as? [Any] {
      let choices = values.compactMap { $0 as? String }
      let nullable = values.contains { $0 is NSNull }
      guard !choices.isEmpty else { throw HelperError(code: "invalid", message: "Empty enum.") }
      return (DynamicGenerationSchema(name: nextName(hint), anyOf: choices), nullable)
    }

    var types: [String] = []
    if let t = node["type"] as? String { types = [t] }
    if let t = node["type"] as? [String] { types = t }
    let nullable = types.contains("null")
    let concrete = types.filter { $0 != "null" }
    guard concrete.count == 1, let type = concrete.first else {
      throw HelperError(code: "invalid", message: "Unsupported schema type for \(hint).")
    }

    switch type {
    case "string":
      return (DynamicGenerationSchema(type: String.self), nullable)
    case "boolean":
      return (DynamicGenerationSchema(type: Bool.self), nullable)
    case "number":
      return (DynamicGenerationSchema(type: Double.self), nullable)
    case "integer":
      return (DynamicGenerationSchema(type: Int.self), nullable)
    case "array":
      guard let items = node["items"] as? [String: Any] else {
        throw HelperError(code: "invalid", message: "Array without items for \(hint).")
      }
      let (itemSchema, _) = try build(items, hint: "\(hint)_item")
      let maxItems = node["maxItems"] as? Int
      return (DynamicGenerationSchema(arrayOf: itemSchema, maximumElements: maxItems), nullable)
    case "object":
      guard let properties = node["properties"] as? [String: Any] else {
        throw HelperError(code: "invalid", message: "Object without properties for \(hint).")
      }
      // JSON object key order isn't preserved by JSONSerialization; `required` carries the
      // compiler's field order, which also becomes the order the model writes fields in.
      let required = node["required"] as? [String] ?? []
      let ordered = required.filter { properties[$0] != nil }
        + properties.keys.filter { !required.contains($0) }.sorted()
      var props: [DynamicGenerationSchema.Property] = []
      for name in ordered {
        guard let child = properties[name] as? [String: Any] else { continue }
        let (schema, childNullable) = try build(child, hint: name)
        props.append(
          DynamicGenerationSchema.Property(name: name, schema: schema, isOptional: childNullable)
        )
      }
      return (DynamicGenerationSchema(name: nextName(hint), properties: props), nullable)
    default:
      throw HelperError(code: "invalid", message: "Unsupported schema type \(type).")
    }
  }

  func generationSchema(_ json: [String: Any]) throws -> GenerationSchema {
    let (root, _) = try build(json, hint: "Answer")
    do {
      return try GenerationSchema(root: root, dependencies: [])
    } catch {
      throw HelperError(code: "invalid", message: "Schema rejected: \(error)")
    }
  }
}

// MARK: - Errors

/// Maps the framework's errors to stable codes. Matching on the description keeps one code path
/// for macOS 26 (LanguageModelSession.GenerationError) and 27 (LanguageModelError), whose enum
/// cases moved but kept their names.
func classify(_ error: Error) -> HelperError {
  if error is CancellationError { return HelperError(code: "cancelled", message: "Cancelled.") }
  if let helper = error as? HelperError { return helper }
  // macOS 27 describes guardrail blocks only in prose ("May contain sensitive content").
  let text = "\(type(of: error)) \(String(reflecting: error)) \(error.localizedDescription)"
  let code: String
  if text.contains("guardrailViolation") || text.contains("refusal")
    || text.localizedCaseInsensitiveContains("sensitive content")
  {
    code = "refused"
  } else if text.contains("rateLimited") || text.contains("concurrentRequests") {
    code = "rateLimited"
  } else if text.contains("exceededContextWindowSize") || text.contains("contextSizeExceeded") {
    code = "contextExceeded"
  } else if text.contains("unsupportedLanguageOrLocale") {
    code = "unsupportedLanguage"
  } else if text.contains("assetsUnavailable") {
    code = "unavailable"
  } else {
    code = "failed"
  }
  return HelperError(code: code, message: String(text.prefix(300)))
}

// MARK: - Generation

func generate(_ request: [String: Any]) async throws -> [String: Any] {
  guard case .available = SystemLanguageModel.default.availability else {
    throw HelperError(code: "unavailable", message: "The system model is not available.")
  }
  guard let prompt = request["prompt"] as? String, !prompt.isEmpty, prompt.count <= maxPromptChars
  else {
    throw HelperError(code: "invalid", message: "A prompt is required.")
  }
  let instructions = (request["instructions"] as? String) ?? ""
  guard instructions.count <= maxInstructionChars else {
    throw HelperError(code: "invalid", message: "Instructions are too long.")
  }
  let maxTokens = min(max((request["maxTokens"] as? Int) ?? 200, 1), maxTokensCap)
  // Extraction wants the most likely answer, not a creative one. The macOS 27 initializer
  // (`samplingMode:`) doesn't exist on 26, so the deprecated one keeps a single build.
  let options = GenerationOptions(sampling: .greedy, maximumResponseTokens: maxTokens)
  // A fresh session per request: answers must not depend on earlier emails.
  let session = LanguageModelSession(instructions: instructions)
  let started = Date()

  if let schemaJSON = request["schema"] as? [String: Any] {
    let schema = try SchemaBuilder().generationSchema(schemaJSON)
    let response = try await session.respond(to: prompt, schema: schema, options: options)
    let json = response.content.jsonString
    let value = try JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed])
    return ["value": value, "ms": Int(Date().timeIntervalSince(started) * 1000)]
  }
  let response = try await session.respond(to: prompt, options: options)
  return ["text": response.content, "ms": Int(Date().timeIntervalSince(started) * 1000)]
}

// MARK: - Request loop

actor Tasks {
  private var running: [Int: Task<Void, Never>] = [:]
  func add(_ id: Int, _ task: Task<Void, Never>) { running[id] = task }
  func remove(_ id: Int) { running[id] = nil }
  func cancel(_ id: Int) -> Bool {
    guard let task = running[id] else { return false }
    task.cancel()
    return true
  }
}

let tasks = Tasks()

func handle(line: String) async {
  guard let data = line.data(using: .utf8),
    let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
    let id = request["id"] as? Int,
    let op = request["op"] as? String
  else {
    send(["id": -1, "error": ["code": "invalid", "message": "Malformed request."]])
    return
  }

  switch op {
  case "availability":
    reply(id, result: availability())
  case "warmup":
    if case .available = SystemLanguageModel.default.availability {
      LanguageModelSession().prewarm()
    }
    reply(id, result: [:])
  case "cancel":
    let target = request["target"] as? Int ?? -1
    reply(id, result: ["cancelled": await tasks.cancel(target)])
  case "generate":
    let task = Task {
      do {
        reply(id, result: try await generate(request))
      } catch {
        reply(id, error: classify(error))
      }
      await tasks.remove(id)
    }
    await tasks.add(id, task)
  default:
    reply(id, error: HelperError(code: "invalid", message: "Unknown op \(op)."))
  }
}

// Requests are split on "\n" bytes only. AsyncLineSequence (`bytes.lines`) also breaks on
// U+2028/U+2029 and NEL, which real email text contains and JSON leaves unescaped, so it cut
// those requests in half.
var pending: [UInt8] = []
for try await byte in FileHandle.standardInput.bytes {
  if byte != 0x0A {
    pending.append(byte)
    continue
  }
  let line = String(decoding: pending, as: UTF8.self)
  pending.removeAll(keepingCapacity: true)
  if !line.isEmpty { await handle(line: line) }
}
exit(0)
