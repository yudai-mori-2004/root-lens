import Foundation

public enum EgoTransferError: Error, Equatable, Sendable {
    case recordingActive
    case chunkMissing
    case deviceFailure
    case unexpectedStatus
}

public struct EgoTransferPreamble: Sendable {
    private var buffer = Data()
    private var accepted = false

    public init() {}

    public mutating func append(_ data: Data) throws -> Data? {
        if accepted { return data }
        buffer.append(data)
        guard buffer.count >= 4 else { return nil }

        let status = Data(buffer.prefix(4))
        let payload = Data(buffer.dropFirst(4))
        buffer.removeAll(keepingCapacity: false)
        switch status {
        case Data("OKAY".utf8):
            accepted = true
            return payload
        case Data("BUSY".utf8):
            throw EgoTransferError.recordingActive
        case Data("MISS".utf8):
            throw EgoTransferError.chunkMissing
        case Data("FAIL".utf8):
            throw EgoTransferError.deviceFailure
        default:
            throw EgoTransferError.unexpectedStatus
        }
    }
}
