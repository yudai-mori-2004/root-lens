import Foundation
import Network

public final class EgoCaptureDownloader: @unchecked Sendable {
    public typealias ChunkSaved = @Sendable (_ index: UInt32, _ url: URL) -> Void
    public typealias Completion = @Sendable (_ result: Result<UInt32, Error>) -> Void

    private let directory: URL
    private let host: NWEndpoint.Host
    private let port: NWEndpoint.Port
    private let onChunkSaved: ChunkSaved
    private let completion: Completion
    private var currentClient: EgoTCPClient?
    private var keepAlive: EgoCaptureDownloader?
    private var completed = false

    public init(
        directory: URL,
        host: NWEndpoint.Host = EgoTCPClient.defaultHost,
        port: NWEndpoint.Port = EgoTCPClient.defaultPort,
        onChunkSaved: @escaping ChunkSaved = { _, _ in },
        completion: @escaping Completion
    ) {
        self.directory = directory
        self.host = host
        self.port = port
        self.onChunkSaved = onChunkSaved
        self.completion = completion
    }

    public func stopAndDownloadAll() {
        keepAlive = self
        EgoHeadControl.requestGracefulStop(host: host, port: port) { [weak self] error in
            guard let self else { return }
            if let error {
                finish(.failure(error))
            } else {
                requestCatalog()
            }
        }
    }

    public func downloadAllAfterStopped() {
        keepAlive = self
        requestCatalog()
    }

    public func cancel() {
        currentClient?.cancel()
        currentClient = nil
        keepAlive = nil
    }

    private func requestCatalog() {
        EgoChunkCatalog.request(host: host, port: port) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(.empty):
                finish(.success(0))
            case let .success(.highestIndex(highestIndex)):
                download(chunkIndex: 0, through: highestIndex, savedCount: 0)
            case let .failure(error):
                finish(.failure(error))
            }
        }
    }

    private func download(chunkIndex: UInt32, through highestIndex: UInt32, savedCount: UInt32) {
        let finalURL = directory.appendingPathComponent(
            String(format: "%06u.eos2", chunkIndex)
        )
        if FileManager.default.fileExists(atPath: finalURL.path) {
            advance(after: chunkIndex, through: highestIndex, savedCount: savedCount)
            return
        }

        do {
            let writer = try EgoChunkWriter(finalURL: finalURL)
            let client = EgoTCPClient(
                requestedChunkIndex: chunkIndex,
                writer: writer,
                onError: { [weak self] error in
                    guard let self else { return }
                    self.currentClient = nil
                    if error as? EgoTransferError == .chunkMissing {
                        self.advance(after: chunkIndex, through: highestIndex, savedCount: savedCount)
                    } else {
                        self.finish(.failure(error))
                    }
                },
                onComplete: { [weak self] in
                    guard let self else { return }
                    self.currentClient = nil
                    self.onChunkSaved(chunkIndex, finalURL)
                    self.advance(after: chunkIndex, through: highestIndex, savedCount: savedCount + 1)
                }
            )
            currentClient = client
            client.connect(host: host, port: port)
        } catch {
            finish(.failure(error))
        }
    }

    private func advance(after chunkIndex: UInt32, through highestIndex: UInt32, savedCount: UInt32) {
        if chunkIndex >= highestIndex {
            finish(.success(savedCount))
        } else {
            download(chunkIndex: chunkIndex + 1, through: highestIndex, savedCount: savedCount)
        }
    }

    private func finish(_ result: Result<UInt32, Error>) {
        guard !completed else { return }
        completed = true
        completion(result)
        keepAlive = nil
    }
}
