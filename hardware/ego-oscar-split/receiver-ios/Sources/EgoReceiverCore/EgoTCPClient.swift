import Foundation
import Network

public final class EgoTCPClient: @unchecked Sendable {
    public static let defaultHost = NWEndpoint.Host("192.168.4.1")
    public static let defaultPort = NWEndpoint.Port(rawValue: 47_000)!

    private let queue = DispatchQueue(label: "jp.rootlens.ego-receiver")
    private let writer: EgoChunkWriter
    private var preamble = EgoTransferPreamble()
    private var decoder = EgoStreamDecoder()
    private var connection: NWConnection?
    private let requestedChunkIndex: UInt32
    private let onError: @Sendable (Error) -> Void
    private let onComplete: @Sendable () -> Void

    public init(
        requestedChunkIndex: UInt32,
        writer: EgoChunkWriter,
        onError: @escaping @Sendable (Error) -> Void,
        onComplete: @escaping @Sendable () -> Void = {}
    ) {
        self.requestedChunkIndex = requestedChunkIndex
        self.writer = writer
        self.onError = onError
        self.onComplete = onComplete
    }

    public func connect(
        host: NWEndpoint.Host = defaultHost,
        port: NWEndpoint.Port = defaultPort
    ) {
        let connection = NWConnection(host: host, port: port, using: .tcp)
        self.connection = connection
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                var request = Data("GET2".utf8)
                request.appendBigEndian(self.requestedChunkIndex)
                connection.send(content: request, completion: .contentProcessed { error in
                    if let error { self.onError(error) }
                })
            case let .failed(error):
                self.onError(error)
            default:
                break
            }
        }
        connection.start(queue: queue)
        receive(on: connection)
    }

    public func cancel() {
        connection?.cancel()
        connection = nil
    }

    private func receive(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, complete, error in
            guard let self else { return }
            do {
                if let data {
                    if let payload = try preamble.append(data) {
                        for record in try decoder.append(payload) {
                            try writer.accept(record)
                        }
                    }
                }
                if complete {
                    try decoder.finish()
                    guard writer.isFinalized else { throw EgoFormatError.missingChunkFooter }
                    connection.cancel()
                    onComplete()
                    return
                }
            } catch {
                if error is EgoTransferError { writer.discardPartial() }
                onError(error)
                connection.cancel()
                return
            }
            if let error {
                onError(error)
            } else {
                receive(on: connection)
            }
        }
    }
}
