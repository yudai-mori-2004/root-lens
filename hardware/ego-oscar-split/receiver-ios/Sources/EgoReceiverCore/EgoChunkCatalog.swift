import Foundation
import Network

public enum EgoChunkCatalogResponse: Equatable, Sendable {
    case highestIndex(UInt32)
    case empty

    public init(data: Data) throws {
        if data == Data("EMPT".utf8) {
            self = .empty
        } else if data.count == 8, data.prefix(4) == Data("LIST".utf8) {
            self = .highestIndex(data.readUInt32(at: 4))
        } else if data == Data("BUSY".utf8) {
            throw EgoTransferError.recordingActive
        } else if data == Data("FAIL".utf8) {
            throw EgoTransferError.deviceFailure
        } else {
            throw EgoTransferError.unexpectedStatus
        }
    }
}

public enum EgoChunkCatalog {
    public static func request(
        host: NWEndpoint.Host = EgoTCPClient.defaultHost,
        port: NWEndpoint.Port = EgoTCPClient.defaultPort,
        completion: @escaping @Sendable (Result<EgoChunkCatalogResponse, Error>) -> Void
    ) {
        EgoChunkCatalogRequest(host: host, port: port, completion: completion).start()
    }
}

private final class EgoChunkCatalogRequest: @unchecked Sendable {
    private let queue = DispatchQueue(label: "jp.rootlens.ego-catalog")
    private let connection: NWConnection
    private let completion: @Sendable (Result<EgoChunkCatalogResponse, Error>) -> Void
    private var response = Data()
    private var finished = false

    init(
        host: NWEndpoint.Host,
        port: NWEndpoint.Port,
        completion: @escaping @Sendable (Result<EgoChunkCatalogResponse, Error>) -> Void
    ) {
        connection = NWConnection(host: host, port: port, using: .tcp)
        self.completion = completion
    }

    func start() {
        connection.stateUpdateHandler = { [self] state in
            switch state {
            case .ready:
                var request = Data("LST2".utf8)
                request.appendBigEndian(UInt32(0))
                connection.send(content: request, completion: .contentProcessed { [self] error in
                    if let error { finish(.failure(error)) }
                })
                receive()
            case let .failed(error):
                finish(.failure(error))
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8) {
            [self] data, _, complete, error in
            if let data { response.append(data) }
            if let error {
                finish(.failure(error))
            } else if complete {
                do {
                    finish(.success(try EgoChunkCatalogResponse(data: response)))
                } catch {
                    finish(.failure(error))
                }
            } else if response.count <= 8 {
                receive()
            } else {
                finish(.failure(EgoTransferError.unexpectedStatus))
            }
        }
    }

    private func finish(_ result: Result<EgoChunkCatalogResponse, Error>) {
        guard !finished else { return }
        finished = true
        connection.stateUpdateHandler = nil
        connection.cancel()
        completion(result)
    }
}
