package io.rootlens.mentra;

import java.util.function.BooleanSupplier;
import java.util.LinkedHashSet;
import java.util.Set;

/** Keeps an accepted physical command from changing meaning after a service restarts. */
final class CaptureCommandPolicy {
    enum Decision { ACCEPT, DUPLICATE, STOP_WITHOUT_PERSISTENCE, REJECT }

    private static final int RECENT_COMMAND_LIMIT = 64;
    private final Set<String> recentCommandIds = new LinkedHashSet<>();

    synchronized Decision accept(
            String commandId, String persistedCommandId, boolean stopping, BooleanSupplier persist) {
        if (commandId == null) return Decision.ACCEPT;
        if (recentCommandIds.contains(commandId) || commandId.equals(persistedCommandId)) {
            return Decision.DUPLICATE;
        }
        recentCommandIds.add(commandId);
        if (recentCommandIds.size() > RECENT_COMMAND_LIMIT) {
            recentCommandIds.remove(recentCommandIds.iterator().next());
        }
        boolean saved;
        try {
            saved = persist.getAsBoolean();
        } catch (RuntimeException error) {
            saved = false;
        }
        if (saved) return Decision.ACCEPT;
        return stopping ? Decision.STOP_WITHOUT_PERSISTENCE : Decision.REJECT;
    }
}
