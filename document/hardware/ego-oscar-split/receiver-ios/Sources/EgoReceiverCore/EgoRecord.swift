import Foundation

public enum EgoRecordType: UInt16, Sendable {
    case videoPair = 1
    case imuBatch = 2
    case event = 3
    case chunkEnd = 4
}

public enum EgoFormatError: Error, Equatable, Sendable {
    case badMagicOrVersion
    case badHeaderCRC
    case badPayloadCRC
    case payloadTooLarge
    case unsupportedRecordType(UInt16)
    case malformedPayload
    case nonIncreasingSequence
    case chunkDigestMismatch
    case chunkByteCountMismatch
    case chunkSequenceRangeMismatch
    case recordAfterFinalization
    case truncatedStream
    case missingChunkFooter
}

public struct EgoRecord: Equatable, Sendable {
    public static let headerSize = 40
    public static let maximumPayloadSize = 2 * 1024 * 1024

    public let type: EgoRecordType
    public let flags: UInt32
    public let sequence: UInt64
    public let captureMonotonicMicroseconds: UInt64
    public let payload: Data

    public init(
        type: EgoRecordType,
        flags: UInt32 = 0,
        sequence: UInt64,
        captureMonotonicMicroseconds: UInt64,
        payload: Data
    ) {
        self.type = type
        self.flags = flags
        self.sequence = sequence
        self.captureMonotonicMicroseconds = captureMonotonicMicroseconds
        self.payload = payload
    }

    public func encoded() throws -> Data {
        guard payload.count <= Self.maximumPayloadSize else {
            throw EgoFormatError.payloadTooLarge
        }
        var prefix = Data("EOS2".utf8)
        prefix.appendBigEndian(UInt16(2))
        prefix.appendBigEndian(type.rawValue)
        prefix.appendBigEndian(flags)
        prefix.appendBigEndian(sequence)
        prefix.appendBigEndian(captureMonotonicMicroseconds)
        prefix.appendBigEndian(UInt32(payload.count))
        prefix.appendBigEndian(EgoCRC32.checksum(payload))
        precondition(prefix.count == 36)

        var result = prefix
        result.appendBigEndian(EgoCRC32.checksum(prefix))
        result.append(payload)
        return result
    }

    static func decode(header: Data, payload: Data) throws -> EgoRecord {
        guard header.count == headerSize,
              header.prefix(4) == Data("EOS2".utf8),
              header.readUInt16(at: 4) == 2 else {
            throw EgoFormatError.badMagicOrVersion
        }
        guard EgoCRC32.checksum(header.prefix(36)) == header.readUInt32(at: 36) else {
            throw EgoFormatError.badHeaderCRC
        }
        let payloadLength = Int(header.readUInt32(at: 28))
        guard payloadLength <= maximumPayloadSize else {
            throw EgoFormatError.payloadTooLarge
        }
        guard payload.count == payloadLength,
              EgoCRC32.checksum(payload) == header.readUInt32(at: 32) else {
            throw EgoFormatError.badPayloadCRC
        }
        let rawType = header.readUInt16(at: 6)
        guard let type = EgoRecordType(rawValue: rawType) else {
            throw EgoFormatError.unsupportedRecordType(rawType)
        }
        return EgoRecord(
            type: type,
            flags: header.readUInt32(at: 8),
            sequence: header.readUInt64(at: 12),
            captureMonotonicMicroseconds: header.readUInt64(at: 20),
            payload: payload
        )
    }
}

public struct EgoChunkFooter: Equatable, Sendable {
    public static let size = 60

    public let chunkIndex: UInt32
    public let firstSequence: UInt64
    public let lastSequence: UInt64
    public let dataBytes: UInt64
    public let sha256: Data

    public init(
        chunkIndex: UInt32,
        firstSequence: UInt64,
        lastSequence: UInt64,
        dataBytes: UInt64,
        sha256: Data
    ) {
        self.chunkIndex = chunkIndex
        self.firstSequence = firstSequence
        self.lastSequence = lastSequence
        self.dataBytes = dataBytes
        self.sha256 = sha256
    }

    public init(payload: Data) throws {
        guard payload.count == Self.size else { throw EgoFormatError.malformedPayload }
        self.init(
            chunkIndex: payload.readUInt32(at: 0),
            firstSequence: payload.readUInt64(at: 4),
            lastSequence: payload.readUInt64(at: 12),
            dataBytes: payload.readUInt64(at: 20),
            sha256: payload.subdata(in: 28..<60)
        )
    }

    public func encoded() -> Data {
        var data = Data()
        data.appendBigEndian(chunkIndex)
        data.appendBigEndian(firstSequence)
        data.appendBigEndian(lastSequence)
        data.appendBigEndian(dataBytes)
        data.append(sha256)
        return data
    }
}

public struct EgoVideoPair: Equatable, Sendable {
    public let presentationTimestamp90kHz: UInt64
    public let leftH264: Data
    public let rightH264: Data

    public init(payload: Data) throws {
        guard payload.count >= 16 else { throw EgoFormatError.malformedPayload }
        let leftLength = Int(payload.readUInt32(at: 0))
        let rightLength = Int(payload.readUInt32(at: 4))
        guard payload.count == 16 + leftLength + rightLength else {
            throw EgoFormatError.malformedPayload
        }
        presentationTimestamp90kHz = payload.readUInt64(at: 8)
        leftH264 = payload.subdata(in: 16..<(16 + leftLength))
        rightH264 = payload.subdata(in: (16 + leftLength)..<payload.count)
    }
}

public struct EgoStreamDecoder: Sendable {
    private var buffer = Data()

    public init() {}

    public mutating func append(_ data: Data) throws -> [EgoRecord] {
        buffer.append(data)
        var records: [EgoRecord] = []
        while buffer.count >= EgoRecord.headerSize {
            let header = Data(buffer.prefix(EgoRecord.headerSize))
            guard header.prefix(4) == Data("EOS2".utf8), header.readUInt16(at: 4) == 2 else {
                throw EgoFormatError.badMagicOrVersion
            }
            guard EgoCRC32.checksum(header.prefix(36)) == header.readUInt32(at: 36) else {
                throw EgoFormatError.badHeaderCRC
            }
            let payloadLength = Int(header.readUInt32(at: 28))
            guard payloadLength <= EgoRecord.maximumPayloadSize else {
                throw EgoFormatError.payloadTooLarge
            }
            let recordLength = EgoRecord.headerSize + payloadLength
            guard buffer.count >= recordLength else { break }
            let completeRecord = Data(buffer.prefix(recordLength))
            let payload = Data(completeRecord.dropFirst(EgoRecord.headerSize))
            records.append(try EgoRecord.decode(header: header, payload: payload))
            buffer = Data(buffer.dropFirst(recordLength))
        }
        return records
    }

    public func finish() throws {
        if !buffer.isEmpty { throw EgoFormatError.truncatedStream }
    }
}

public enum EgoCRC32 {
    public static func checksum<T: DataProtocol>(_ bytes: T) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in bytes {
            crc ^= UInt32(byte)
            for _ in 0..<8 {
                crc = (crc >> 1) ^ ((crc & 1) == 1 ? 0xEDB8_8320 : 0)
            }
        }
        return crc ^ 0xFFFF_FFFF
    }
}

extension Data {
    mutating func appendBigEndian<T: FixedWidthInteger>(_ value: T) {
        var bigEndian = value.bigEndian
        Swift.withUnsafeBytes(of: &bigEndian) { append(contentsOf: $0) }
    }

    func readUInt16(at offset: Int) -> UInt16 {
        (UInt16(self[offset]) << 8) | UInt16(self[offset + 1])
    }

    func readUInt32(at offset: Int) -> UInt32 {
        (0..<4).reduce(0) { ($0 << 8) | UInt32(self[offset + $1]) }
    }

    func readUInt64(at offset: Int) -> UInt64 {
        (0..<8).reduce(0) { ($0 << 8) | UInt64(self[offset + $1]) }
    }
}
