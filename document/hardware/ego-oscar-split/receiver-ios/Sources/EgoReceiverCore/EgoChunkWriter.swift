import CryptoKit
import Foundation

public final class EgoChunkWriter: @unchecked Sendable {
    public let finalURL: URL
    public let partialURL: URL

    private let fileHandle: FileHandle
    private var sha256 = SHA256()
    private var bytesBeforeFooter: UInt64 = 0
    private var firstSequence: UInt64?
    private var lastSequence: UInt64?
    public private(set) var isFinalized = false

    public init(finalURL: URL) throws {
        self.finalURL = finalURL
        self.partialURL = finalURL.appendingPathExtension("partial")
        try FileManager.default.createDirectory(
            at: finalURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        if FileManager.default.fileExists(atPath: partialURL.path) {
            try FileManager.default.removeItem(at: partialURL)
        }
        guard FileManager.default.createFile(atPath: partialURL.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        fileHandle = try FileHandle(forWritingTo: partialURL)
    }

    deinit {
        try? fileHandle.close()
    }

    public func discardPartial() {
        guard !isFinalized else { return }
        try? fileHandle.close()
        try? FileManager.default.removeItem(at: partialURL)
    }

    public func accept(_ record: EgoRecord) throws {
        guard !isFinalized else { throw EgoFormatError.recordAfterFinalization }
        let encoded = try record.encoded()
        if record.type == .chunkEnd {
            try finish(record: record, encoded: encoded)
            return
        }
        if let lastSequence, record.sequence <= lastSequence {
            throw EgoFormatError.nonIncreasingSequence
        }
        if firstSequence == nil { firstSequence = record.sequence }
        lastSequence = record.sequence
        try fileHandle.write(contentsOf: encoded)
        sha256.update(data: encoded)
        bytesBeforeFooter += UInt64(encoded.count)
    }

    private func finish(record: EgoRecord, encoded: Data) throws {
        let footer = try EgoChunkFooter(payload: record.payload)
        guard footer.dataBytes == bytesBeforeFooter else {
            throw EgoFormatError.chunkByteCountMismatch
        }
        guard footer.firstSequence == firstSequence,
              footer.lastSequence == lastSequence else {
            throw EgoFormatError.chunkSequenceRangeMismatch
        }
        guard Data(sha256.finalize()) == footer.sha256 else {
            throw EgoFormatError.chunkDigestMismatch
        }
        try fileHandle.write(contentsOf: encoded)
        try fileHandle.synchronize()
        try fileHandle.close()
        if FileManager.default.fileExists(atPath: finalURL.path) {
            try FileManager.default.removeItem(at: finalURL)
        }
        try FileManager.default.moveItem(at: partialURL, to: finalURL)
        isFinalized = true
    }
}
