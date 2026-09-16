"""One view of the desktop workflow, including the permitted user actions."""

from dataclasses import dataclass
from enum import Enum


class Phase(Enum):
    SIGNED_OUT = "signed_out"
    AUTHENTICATING = "authenticating"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    COPYING = "copying"
    READY = "ready"
    COPYING_AND_APPROVING = "copying_and_approving"
    APPROVING = "approving"
    DELETING = "deleting"
    SWITCHING = "switching"
    WAITING_TO_DELETE = "waiting_to_delete"
    CLOSING = "closing"


@dataclass(frozen=True)
class ScreenState:
    phase: Phase
    selection: str = "none"
    source_available: bool = False
    problem_accessible: bool = False
    drive_ready: bool = False

    @property
    def can_switch_site(self):
        return self.phase not in {Phase.SIGNED_OUT, Phase.AUTHENTICATING, Phase.CLOSING}

    @property
    def can_connect(self):
        return self.phase in {Phase.DISCONNECTED, Phase.READY}

    @property
    def can_approve(self):
        return (self.phase in {Phase.READY, Phase.COPYING}
                and self.selection == "ready" and self.source_available and self.drive_ready)

    @property
    def can_delete(self):
        return (self.phase in {Phase.READY, Phase.COPYING}
                and ((self.selection == "ready" and self.source_available)
                     or (self.selection == "problem" and self.problem_accessible)))


def screen_phase(*, profile, job, connected, uploading, switching, deleting, closing):
    if closing:
        return Phase.CLOSING
    if profile is None:
        return Phase.AUTHENTICATING if job in {"login", "restore"} else Phase.SIGNED_OUT
    if switching:
        return Phase.SWITCHING
    if deleting:
        return Phase.WAITING_TO_DELETE
    if job == "discard":
        return Phase.DELETING
    if uploading:
        return Phase.COPYING_AND_APPROVING if job == "import" else Phase.APPROVING
    if job == "import":
        return Phase.COPYING if connected else Phase.CONNECTING
    return Phase.READY if connected else Phase.DISCONNECTED
