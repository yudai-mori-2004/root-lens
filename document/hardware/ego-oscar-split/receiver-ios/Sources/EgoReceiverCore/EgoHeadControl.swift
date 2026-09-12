import Foundation
import Network

public enum EgoHeadControlError: Error, Equatable, Sendable {
    case invalidAcknowledgement
}

public enum EgoHeadControl {
    public static func requestGracefulStop(
        host: NWEndpoint.Host = EgoTCPClient.defaultHost,
        port: NWEndpoint.Port = EgoTCPClient.defaultPort,
        completion: @escaping @Sendable (Error?) -> Void
    ) {
        let queue = DispatchQueue(label: "jp.rootlens.ego-stop")
        let connection = NWConnection(host: host, port: port, using: .tcp)
        connection.stateUpdateHandler = { state in
            switch state {
            case .ready:
                var request = Data("STP2".utf8)
                request.appendBigEndian(UInt32(0))
                connection.send(content: request, completion: .contentProcessed { error in
                    if let error {
                        connection.cancel()
                        completion(error)
                        return
                    }
                    connection.receive(minimumIncompleteLength: 4, maximumLength: 4) {
                        data, _, _, receiveError in
                        connection.cancel()
                        if let receiveError {
                            completion(receiveError)
                        } else if data == Data("DONE".utf8) {
                            completion(nil)
                        } else {
                            completion(EgoHeadControlError.invalidAcknowledgement)
                        }
                    }
                })
            case let .failed(error):
                connection.cancel()
                completion(error)
            default:
                break
            }
        }
        connection.start(queue: queue)
    }
}
