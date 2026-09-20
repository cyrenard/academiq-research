import Foundation
import Vision

func recognize(_ data: Data, languages: [String]) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = languages
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(data: data, options: [:]).perform([request])
    return (request.results ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
        .joined(separator: "\n")
}

do {
    guard CommandLine.arguments.count == 3 else {
        throw NSError(domain: "AcademiQVisionOCR", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Expected image path and language"])
    }
    let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
    let requested = CommandLine.arguments[2].lowercased()
    let preferred = requested.contains("tur") ? ["tr-TR", "en-US"] : ["en-US"]
    let text: String
    do {
        text = try recognize(data, languages: preferred)
    } catch {
        // Older supported macOS installations may not expose Turkish in Vision.
        // Retain English recognition rather than disabling PDF OCR completely.
        if preferred == ["en-US"] { throw error }
        text = try recognize(data, languages: ["en-US"])
    }
    let json = try JSONSerialization.data(withJSONObject: ["text": text], options: [])
    FileHandle.standardOutput.write(json)
} catch {
    FileHandle.standardError.write(Data(String(describing: error).utf8))
    exit(1)
}
