import CryptoKit
import Foundation
import Testing
@testable import EgoReceiverCore

@Test func crc32KnownVector() {
    #expect(EgoCRC32.checksum(Data("123456789".utf8)) == 0xCBF4_3926)
}

@Test func decoderHandlesArbitraryTCPBoundaries() throws {
    let first = EgoRecord(
        type: .videoPair,
        sequence: 1,
        captureMonotonicMicroseconds: 10,
        payload: Data([0, 1, 2, 3])
    )
    let second = EgoRecord(
        type: .imuBatch,
        sequence: 2,
        captureMonotonicMicroseconds: 20,
        payload: Data("G0,1;\n".utf8)
    )
    let stream = try first.encoded() + second.encoded()
    var decoder = EgoStreamDecoder()
    var decoded: [EgoRecord] = []
    for byte in stream {
        decoded += try decoder.append(Data([byte]))
    }
    #expect(decoded == [first, second])
    try decoder.finish()
}

@Test func decoderRejectsTruncatedRecordAtConnectionClose() throws {
    let record = EgoRecord(
        type: .event,
        sequence: 1,
        captureMonotonicMicroseconds: 10,
        payload: Data("{}".utf8)
    )
    var decoder = EgoStreamDecoder()
    _ = try decoder.append(Data(try record.encoded().dropLast()))
    #expect(throws: EgoFormatError.truncatedStream) {
        try decoder.finish()
    }
}

@Test func transferPreambleHandlesSplitStatusAndPayload() throws {
    var preamble = EgoTransferPreamble()
    #expect(try preamble.append(Data("OK".utf8)) == nil)
    #expect(try preamble.append(Data("AYpayload".utf8)) == Data("payload".utf8))
    #expect(try preamble.append(Data("next".utf8)) == Data("next".utf8))
}

@Test func transferPreambleReportsDeviceStates() {
    var busy = EgoTransferPreamble()
    #expect(throws: EgoTransferError.recordingActive) {
        try busy.append(Data("BUSY".utf8))
    }
    var missing = EgoTransferPreamble()
    #expect(throws: EgoTransferError.chunkMissing) {
        try missing.append(Data("MISS".utf8))
    }
    var failed = EgoTransferPreamble()
    #expect(throws: EgoTransferError.deviceFailure) {
        try failed.append(Data("FAIL".utf8))
    }
}

@Test func chunkCatalogParsesEmptyAndHighestIndex() throws {
    #expect(try EgoChunkCatalogResponse(data: Data("EMPT".utf8)) == .empty)
    var listed = Data("LIST".utf8)
    listed.appendBigEndian(UInt32(513))
    #expect(try EgoChunkCatalogResponse(data: listed) == .highestIndex(513))
}

@Test func chunkWriterVerifiesAndAtomicallyRenames() throws {
    let record = EgoRecord(
        type: .imuBatch,
        sequence: 40,
        captureMonotonicMicroseconds: 100,
        payload: Data("G0,40;\n".utf8)
    )
    let body = try record.encoded()
    let footer = EgoChunkFooter(
        chunkIndex: 3,
        firstSequence: 40,
        lastSequence: 40,
        dataBytes: UInt64(body.count),
        sha256: Data(SHA256.hash(data: body))
    )
    let end = EgoRecord(
        type: .chunkEnd,
        sequence: 41,
        captureMonotonicMicroseconds: 110,
        payload: footer.encoded()
    )
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let final = root.appendingPathComponent("000003.eos2")
    let writer = try EgoChunkWriter(finalURL: final)
    try writer.accept(record)
    try writer.accept(end)

    #expect(FileManager.default.fileExists(atPath: final.path))
    #expect(writer.isFinalized)
    #expect(!FileManager.default.fileExists(atPath: writer.partialURL.path))
    #expect(try Data(contentsOf: final) == body + end.encoded())
}

@Test func chunkWriterRejectsWrongDigest() throws {
    let record = EgoRecord(
        type: .event,
        sequence: 9,
        captureMonotonicMicroseconds: 50,
        payload: Data("{}".utf8)
    )
    let body = try record.encoded()
    let footer = EgoChunkFooter(
        chunkIndex: 0,
        firstSequence: 9,
        lastSequence: 9,
        dataBytes: UInt64(body.count),
        sha256: Data(repeating: 0, count: 32)
    )
    let root = FileManager.default.temporaryDirectory
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let writer = try EgoChunkWriter(finalURL: root.appendingPathComponent("bad.eos2"))
    try writer.accept(record)
    #expect(throws: EgoFormatError.chunkDigestMismatch) {
        try writer.accept(
            EgoRecord(
                type: .chunkEnd,
                sequence: 10,
                captureMonotonicMicroseconds: 60,
                payload: footer.encoded()
            )
        )
    }
}
